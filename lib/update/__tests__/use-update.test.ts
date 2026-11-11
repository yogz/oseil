// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Model, ModelState } from '@/lib/app/use-model'
import { NO_MARKET } from '@/lib/market/live'
import type { Market } from '@/lib/market/types'
import type { MarketState } from '@/lib/market/use-market'
import { parseProfile } from '@/lib/model/documents'
import { exampleProfile, exampleSnapshot } from '@/lib/model/__tests__/fixtures'
import type { Profile, UpdateDraft } from '@/lib/model/types'
import { attachSymbol } from '@/lib/screens/titles'
import { UNREADABLE } from '@/lib/setup/use-first-launch'
import { confirmLine, markStep, setTakenOn, setValue, startDraft } from '../draft'
import { RATE_MISSING_SAVE } from '@/lib/market/words'
import { addAccount, closeLine, putAddedLine } from '../lines'
import { resultView } from '../result'
import { DRAFT_MOVED, DRAFT_RESTART, useUpdate, type UpdateSession, type UpdateState } from '../use-update'

const mocks = vi.hoisted(() => ({
  InvalidDocumentError: class InvalidDocumentError extends Error {},
  DocumentChangedError: class DocumentChangedError extends Error {},
  state: { current: null as unknown },
  calls: [] as string[],
  // The ids the database holds, as listUpdateDocuments reads them: set from the model by ready().
  rows: [] as Array<{ id: string; kind: 'snapshot' | 'draft' }>,
  saveDraft: vi.fn(),
  createDraft: vi.fn(),
  deleteDraft: vi.fn(),
  deleteAllDrafts: vi.fn(),
  saveProfile: vi.fn(),
  addSnapshot: vi.fn(),
  listUpdateDocuments: vi.fn(),
  // The profile row as the database holds it now: set to the model's own by beforeEach.
  profileVersion: vi.fn(),
  // The profile as the database holds it now, read only when its version is not one this tab knows.
  loadProfile: vi.fn(),
  // What useMarket answers: ready with nothing by default, as when no line is attached to its price.
  market: { current: null as unknown as MarketState },
  useMarket: vi.fn(),
  retry: vi.fn(),
  today: '2026-11-07',
}))

vi.mock('@/lib/app/use-model', () => ({ useModel: () => mocks.state.current }))
vi.mock('@/lib/market/use-market', () => ({
  useMarket: (...args: unknown[]) => {
    mocks.useMarket(...args)
    return mocks.market.current
  },
}))
// The day the prices are judged on: a price of the 6th is today's on the 7th.
vi.mock('@/lib/dates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dates')>()),
  todayIso: () => mocks.today,
}))
vi.mock('@/lib/model/repository', () => ({
  InvalidDocumentError: mocks.InvalidDocumentError,
  DocumentChangedError: mocks.DocumentChangedError,
  saveDraft: mocks.saveDraft,
  createDraft: mocks.createDraft,
  deleteDraft: mocks.deleteDraft,
  deleteAllDrafts: mocks.deleteAllDrafts,
  saveProfile: mocks.saveProfile,
  addSnapshot: mocks.addSnapshot,
  listUpdateDocuments: mocks.listUpdateDocuments,
  profileVersion: mocks.profileVersion,
  loadProfile: mocks.loadProfile,
}))

const CLIENT = { tag: 'client' }
const KEY = {} as CryptoKey
const FAILED = 'Ça n’a pas été enregistré. Vérifie ta connexion et réessaie.'
const TODAY = '2026-11-07'
const LATEST = { id: 's1', value: exampleSnapshot, updatedAt: '' }
const PROFILE = { id: 'p1', value: exampleProfile, updatedAt: '' }

function ready(model: Partial<Model> = {}, reload: () => void = () => {}): ModelState {
  const full: Model = {
    profile: PROFILE,
    snapshots: [LATEST],
    goals: [],
    settings: null,
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
    ...model,
  }
  mocks.rows = [
    ...full.snapshots.map((s) => ({ id: s.id, kind: 'snapshot' as const })),
    ...(full.draft ? [{ id: full.draft.id, kind: 'draft' as const }] : []),
  ]
  return { status: 'ready', client: CLIENT, dataKey: KEY, reload, model: full } as unknown as ModelState
}

const LOADED = '2026-11-07T08:00:00.123456+00:00'
const withDraft = (value: UpdateDraft, id = 'd1') => ({ id, value, updatedAt: LOADED })
const session = (state: UpdateState): UpdateSession => {
  if (state.status !== 'ready') throw new Error(`expected ready, got ${state.status}`)
  return state.session
}
const confirmHouse = (d: UpdateDraft) => confirmLine(d, 'current-line')

const marketReady = (market: Market): MarketState => ({ status: 'ready', market, retry: mocks.retry })

beforeEach(() => {
  mocks.state.current = ready()
  mocks.market.current = marketReady({ quotes: {}, rates: null })
  mocks.useMarket.mockReset()
  mocks.retry.mockReset()
  mocks.calls.length = 0
  mocks.saveDraft.mockReset().mockImplementation(async (_c, _k, _d, guard: { id: string }) => {
    mocks.calls.push('saveDraft')
    return guard.id
  })
  mocks.createDraft.mockReset().mockImplementation(async (_c, _k, _d, id: string) => {
    mocks.calls.push('createDraft')
    if (!mocks.rows.some((r) => r.id === id)) mocks.rows.push({ id, kind: 'draft' })
    return id
  })
  mocks.deleteDraft.mockReset().mockImplementation(async () => void mocks.calls.push('deleteDraft'))
  mocks.deleteAllDrafts.mockReset().mockResolvedValue(undefined)
  mocks.saveProfile.mockReset().mockImplementation(async () => (mocks.calls.push('saveProfile'), 'p1'))
  mocks.addSnapshot.mockReset().mockImplementation(async () => (mocks.calls.push('addSnapshot'), 's2'))
  mocks.listUpdateDocuments.mockReset().mockImplementation(async () => {
    mocks.calls.push('listUpdateDocuments')
    return [...mocks.rows]
  })
  mocks.profileVersion.mockReset().mockImplementation(async () => ({ id: PROFILE.id, updatedAt: PROFILE.updatedAt }))
  mocks.loadProfile.mockReset().mockImplementation(async () => ({ profile: PROFILE, unreadable: 0 }))
})
afterEach(cleanup)

test('a model with no draft is ready, unsaved, based on the latest snapshot, and writes nothing', () => {
  const { result } = renderHook(() => useUpdate())
  const s = session(result.current)
  expect(s.saved).toBe(false)
  expect(s.draft.basedOn).toBe('s1')
  expect(s.base).toBe(LATEST)
  expect(mocks.saveDraft).not.toHaveBeenCalled()
  expect(mocks.createDraft).not.toHaveBeenCalled()
})

test('two quick changes: the second waits for the id of the first', async () => {
  const { result } = renderHook(() => useUpdate())
  let both: boolean[] = []
  await act(async () => {
    const s = session(result.current)
    both = await Promise.all([s.change(confirmHouse), s.change((d) => markStep(d, 'home', 'done'))])
  })
  expect(both).toEqual([true, true])
  expect(mocks.createDraft).toHaveBeenCalledTimes(1)
  expect(mocks.saveDraft).toHaveBeenCalledTimes(1)
  const drawn = mocks.createDraft.mock.calls[0][3]
  expect(drawn).toMatch(/^[0-9a-f-]{36}$/)
  expect(mocks.saveDraft.mock.calls[0][3].id).toBe(drawn)
  // Guarded on the version the first write gave the row.
  expect(mocks.saveDraft.mock.calls[0][3].versions[0]).toBe(mocks.createDraft.mock.calls[0][4].version)
  expect(mocks.saveDraft.mock.calls[0][2].confirmed).toEqual(['current-line'])
  expect(session(result.current).saved).toBe(true)
  expect(session(result.current).draft.progress).toEqual({ home: 'done' })
})

test('a draft on the latest snapshot is shown, and the first change updates it by id', async () => {
  mocks.state.current = ready({ draft: withDraft(confirmLine(startDraft('s1'), 'euro-fund')) })
  const { result } = renderHook(() => useUpdate())
  expect(session(result.current).saved).toBe(true)
  expect(session(result.current).draft.confirmed).toEqual(['euro-fund'])
  await act(async () => void (await session(result.current).change(confirmHouse)))
  expect(mocks.saveDraft.mock.calls[0][3]).toMatchObject({ id: 'd1', versions: [LOADED, expect.any(String)] })
})

test('a draft on an older snapshot is replaced by a fresh one, written over its row', async () => {
  mocks.state.current = ready({ draft: withDraft(confirmLine(startDraft('s0'), 'euro-fund')) })
  const { result } = renderHook(() => useUpdate())
  const s = session(result.current)
  expect(s.saved).toBe(false)
  expect(s.draft.basedOn).toBe('s1')
  expect(s.draft.values).toEqual([])
  expect(s.draft.confirmed).toEqual([])
  await act(async () => void (await s.change(confirmHouse)))
  expect(mocks.saveDraft).toHaveBeenCalledTimes(1)
  expect(mocks.createDraft).not.toHaveBeenCalled()
  // Over its row, and only while it is the one this tab loaded.
  expect(mocks.saveDraft.mock.calls[0][3]).toMatchObject({ id: 'd1', versions: [LOADED, expect.any(String)] })
  expect(mocks.saveDraft.mock.calls[0][2].basedOn).toBe('s1')
})

test('the loaded draft is tidied before use', () => {
  const stray = { ...startDraft('s1'), confirmed: ['gone-line'], progress: { gone: 'done' as const } }
  mocks.state.current = ready({ draft: withDraft(stray) })
  const { draft } = session(renderHook(() => useUpdate()).result.current)
  expect(draft.confirmed).toEqual([])
  expect(draft.progress).toEqual({})
})

test('an unreadable draft is its own state, nothing is written, and its copy offers a restart', async () => {
  mocks.state.current = ready({ unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 1 } })
  const { result } = renderHook(() => useUpdate())
  expect(result.current.status).toBe('unreadable')
  if (result.current.status !== 'unreadable') return
  expect(result.current.message).toBe(DRAFT_RESTART)
  expect(DRAFT_RESTART).toBe('Ta mise à jour en cours n’a pas pu être lue sur cet appareil.')
  expect(DRAFT_RESTART).not.toMatch(/Rien n’a été effacé/)
  expect(mocks.saveDraft).not.toHaveBeenCalled()
})

test('« Recommencer » erases the draft rows without an id, reloads, and writes nothing else', async () => {
  const reload = vi.fn()
  mocks.state.current = ready({ unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 1 } }, reload)
  const { result } = renderHook(() => useUpdate())
  const state = result.current
  if (state.status !== 'unreadable') throw new Error('expected unreadable')
  let ok = false
  await act(async () => void (ok = await state.restart()))
  expect(ok).toBe(true)
  expect(mocks.deleteAllDrafts).toHaveBeenCalledWith(CLIENT)
  expect(mocks.deleteDraft).not.toHaveBeenCalled()
  expect(mocks.saveDraft).not.toHaveBeenCalled()
  expect(reload).toHaveBeenCalled()
})

test('« Recommencer » that fails reports false and does not reload', async () => {
  const reload = vi.fn()
  mocks.deleteAllDrafts.mockRejectedValue(new Error('down'))
  mocks.state.current = ready({ unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 1 } }, reload)
  const { result } = renderHook(() => useUpdate())
  let ok = true
  await act(async () => void (ok = result.current.status === 'unreadable' ? await result.current.restart() : true))
  expect(ok).toBe(false)
  expect(reload).not.toHaveBeenCalled()
})

test('an unreadable snapshot or profile is blocked with the shared message', () => {
  mocks.state.current = ready({ unreadable: { profile: 0, snapshots: 1, goals: 0, settings: 0, draft: 0 } })
  const blocked = renderHook(() => useUpdate()).result.current
  expect(blocked.status).toBe('blocked')
  expect(blocked.status === 'blocked' && blocked.message).toBe(UNREADABLE)
  mocks.state.current = ready({ profile: null, unreadable: { profile: 1, snapshots: 0, goals: 0, settings: 0, draft: 0 } })
  expect(renderHook(() => useUpdate()).result.current.status).toBe('blocked')
})

test('no profile, a first launch not complete, or no snapshot is unavailable', () => {
  mocks.state.current = ready({ profile: null })
  expect(renderHook(() => useUpdate()).result.current.status).toBe('unavailable')
  const unfinished = { ...exampleProfile, firstLaunch: { planned: [], finished: [], complete: false } }
  mocks.state.current = ready({ profile: { ...PROFILE, value: unfinished } })
  expect(renderHook(() => useUpdate()).result.current.status).toBe('unavailable')
  mocks.state.current = ready({ snapshots: [] })
  expect(renderHook(() => useUpdate()).result.current.status).toBe('unavailable')
})

test('loading and failed follow the model', () => {
  mocks.state.current = { status: 'loading' }
  expect(renderHook(() => useUpdate()).result.current.status).toBe('loading')
  mocks.state.current = { status: 'failed', retry: () => {} }
  expect(renderHook(() => useUpdate()).result.current.status).toBe('failed')
})

test('save writes the profile, then the snapshot dated today, then deletes the draft row', async () => {
  mocks.state.current = ready({ draft: withDraft(confirmLine(startDraft('s1'), 'euro-fund')) })
  const { result } = renderHook(() => useUpdate())
  let ok = false
  await act(async () => void (ok = await session(result.current).save(TODAY)))
  expect(ok).toBe(true)
  // First the guards (F3): the draft once more over the version this tab holds, then the ids.
  expect(mocks.calls).toEqual(['saveDraft', 'listUpdateDocuments', 'saveProfile', 'addSnapshot', 'deleteDraft'])
  expect(mocks.saveDraft.mock.calls[0][3]).toMatchObject({ id: 'd1', versions: [LOADED, expect.any(String)] })
  expect(mocks.saveProfile.mock.calls[0][3]).toBe('p1')
  expect(mocks.addSnapshot.mock.calls[0][2].takenOn).toBe(TODAY)
  expect(mocks.addSnapshot.mock.calls[0][3]).toMatch(/^[0-9a-f-]{36}$/)
  expect(mocks.deleteDraft).toHaveBeenCalledWith(CLIENT, 'd1')
})

test('save deletes a stale draft row too, by its id', async () => {
  mocks.state.current = ready({ draft: withDraft(startDraft('s0'), 'old') })
  const { result } = renderHook(() => useUpdate())
  await act(async () => void (await session(result.current).save(TODAY)))
  expect(mocks.deleteDraft).toHaveBeenCalledWith(CLIENT, 'old')
})

test('save without any draft row writes no draft and deletes nothing', async () => {
  const { result } = renderHook(() => useUpdate())
  await act(async () => void (await session(result.current).save(TODAY)))
  expect(mocks.calls).toEqual(['listUpdateDocuments', 'saveProfile', 'addSnapshot'])
  expect(mocks.deleteDraft).not.toHaveBeenCalled()
})

test('save deletes the row the first change created', async () => {
  const { result } = renderHook(() => useUpdate())
  await act(async () => void (await session(result.current).change(confirmHouse)))
  await act(async () => void (await session(result.current).save(TODAY)))
  expect(mocks.deleteDraft).toHaveBeenCalledWith(CLIENT, mocks.createDraft.mock.calls[0][3])
})

test('save uses the date chosen on the result screen', async () => {
  const { result } = renderHook(() => useUpdate())
  await act(async () => void (await session(result.current).change((d) => setTakenOn(d, '2026-11-03'))))
  await act(async () => void (await session(result.current).save(TODAY)))
  expect(mocks.addSnapshot.mock.calls[0][2].takenOn).toBe('2026-11-03')
})

test('when the profile cannot be saved, no snapshot is written', async () => {
  mocks.saveProfile.mockRejectedValue(new Error('down'))
  const { result } = renderHook(() => useUpdate())
  let ok = true
  await act(async () => void (ok = await session(result.current).save(TODAY)))
  expect(ok).toBe(false)
  expect(mocks.addSnapshot).not.toHaveBeenCalled()
  expect(mocks.deleteDraft).not.toHaveBeenCalled()
  expect(session(result.current).saveError).toBe(FAILED)
})

test('when the snapshot cannot be saved, nothing is deleted', async () => {
  mocks.state.current = ready({ draft: withDraft(startDraft('s1')) })
  mocks.addSnapshot.mockRejectedValue(new Error('down'))
  const { result } = renderHook(() => useUpdate())
  let ok = true
  await act(async () => void (ok = await session(result.current).save(TODAY)))
  expect(ok).toBe(false)
  expect(mocks.deleteDraft).not.toHaveBeenCalled()
  expect(session(result.current).saveError).toBe(FAILED)
})

test('when deleting the draft fails, save is still a success', async () => {
  mocks.state.current = ready({ draft: withDraft(startDraft('s1')) })
  mocks.deleteDraft.mockRejectedValue(new Error('down'))
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { result } = renderHook(() => useUpdate())
  let ok = false
  await act(async () => void (ok = await session(result.current).save(TODAY)))
  expect(ok).toBe(true)
  expect(log).toHaveBeenCalled()
  expect(session(result.current).saveError).toBeNull()
  log.mockRestore()
})

test('a second save after a success writes nothing more', async () => {
  const { result } = renderHook(() => useUpdate())
  await act(async () => void (await session(result.current).save(TODAY)))
  let again = false
  await act(async () => void (again = await session(result.current).save(TODAY)))
  expect(again).toBe(true)
  expect(mocks.addSnapshot).toHaveBeenCalledTimes(1)
})

test('a base dated after today (a clock behind): the save takes the day the result shows, the base’s', async () => {
  const ahead = { ...LATEST, value: { ...exampleSnapshot, takenOn: '2026-11-08' } }
  mocks.state.current = ready({ snapshots: [ahead] })
  const { result } = renderHook(() => useUpdate())
  expect(resultView(exampleProfile, ahead.value, session(result.current).draft, TODAY, NO_MARKET)).toMatchObject({
    date: { value: '2026-11-08' },
  })
  let ok = false
  await act(async () => void (ok = await session(result.current).save(TODAY)))
  expect(ok).toBe(true)
  expect(mocks.addSnapshot.mock.calls[0][2].takenOn).toBe('2026-11-08')
})

test('a date before the base snapshot is refused and nothing is written', async () => {
  const { result } = renderHook(() => useUpdate())
  await act(async () => void (await session(result.current).change((d) => setTakenOn(d, '2026-09-01'))))
  let ok = true
  await act(async () => void (ok = await session(result.current).save(TODAY)))
  expect(ok).toBe(false)
  expect(mocks.saveProfile).not.toHaveBeenCalled()
  expect(session(result.current).saveError).toMatch(/^Choisis une date entre le /)
})

// Review Focus 4: a currency with no rate at all. The snapshot could not be read back, so
// « Enregistrer » refuses on its own: no profile, no snapshot.
test('a line in pounds with no rate known: save refuses, says why, and writes neither profile nor snapshot', async () => {
  const uk = putAddedLine(
    exampleProfile,
    startDraft('s1'),
    {
      accountId: 'pea',
      name: 'UK',
      entry: { kind: 'units', units: 10, unitPrice: 5, averagePrice: null },
      currency: 'GBP',
      arrival: 'existing',
    },
    TODAY,
  ).draft
  mocks.state.current = ready({ draft: withDraft(uk) })
  const { result } = renderHook(() => useUpdate())
  let ok = true
  await act(async () => void (ok = await session(result.current).save(TODAY)))
  expect(ok).toBe(false)
  expect(mocks.saveProfile).not.toHaveBeenCalled()
  expect(mocks.addSnapshot).not.toHaveBeenCalled()
  expect(mocks.deleteDraft).not.toHaveBeenCalled()
  expect(session(result.current).saveError).toBe(RATE_MISSING_SAVE)
})

test('a line in pounds with the base snapshot’s rate: saved, the rate kept in the snapshot', async () => {
  const uk = putAddedLine(
    exampleProfile,
    startDraft('s1'),
    {
      accountId: 'pea',
      name: 'UK',
      entry: { kind: 'units', units: 10, unitPrice: 5, averagePrice: null },
      currency: 'GBP',
      arrival: 'existing',
    },
    TODAY,
  ).draft
  mocks.state.current = ready({ snapshots: [{ ...LATEST, value: { ...exampleSnapshot, fx: { GBP: 1.2 } } }], draft: withDraft(uk) })
  const { result } = renderHook(() => useUpdate())
  let ok = false
  await act(async () => void (ok = await session(result.current).save(TODAY)))
  expect(ok).toBe(true)
  expect(mocks.addSnapshot.mock.calls[0][2].fx).toEqual({ GBP: 1.2 })
})

test('a change that throws, or a refused draft, is INVALID and the last saved draft stays', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { result } = renderHook(() => useUpdate())
  await act(async () => void (await session(result.current).change(confirmHouse)))
  let ok = true
  await act(async () => void (ok = await session(result.current).change(() => { throw new Error('closed') })))
  expect(ok).toBe(false)
  expect(session(result.current).saveError).toMatch(/pas pu être enregistrée/)
  mocks.saveDraft.mockRejectedValueOnce(new mocks.InvalidDocumentError('x'))
  await act(async () => void (ok = await session(result.current).change((d) => markStep(d, 'home', 'done'))))
  expect(ok).toBe(false)
  expect(session(result.current).saveError).toMatch(/pas pu être enregistrée/)
  expect(session(result.current).draft.confirmed).toEqual(['current-line'])
  expect(session(result.current).draft.progress).toEqual({})
  mocks.saveDraft.mockRejectedValueOnce(new Error('down'))
  await act(async () => void (await session(result.current).change((d) => markStep(d, 'home', 'done'))))
  expect(session(result.current).saveError).toBe(FAILED)
  log.mockRestore()
})

test('abandon deletes the row and resolves true; without a row it deletes nothing', async () => {
  mocks.state.current = ready({ draft: withDraft(startDraft('s1')) })
  const { result } = renderHook(() => useUpdate())
  let ok = false
  await act(async () => void (ok = await session(result.current).abandon()))
  expect(ok).toBe(true)
  expect(mocks.deleteDraft).toHaveBeenCalledWith(CLIENT, 'd1')
  expect(session(result.current).saved).toBe(false)

  cleanup()
  mocks.deleteDraft.mockClear()
  mocks.state.current = ready()
  const fresh = renderHook(() => useUpdate())
  await act(async () => void (await session(fresh.result.current).abandon()))
  expect(mocks.deleteDraft).not.toHaveBeenCalled()
})

test('abandon that fails is SAVE_FAILED and false', async () => {
  mocks.state.current = ready({ draft: withDraft(startDraft('s1')) })
  mocks.deleteDraft.mockRejectedValue(new Error('down'))
  const { result } = renderHook(() => useUpdate())
  let ok = true
  await act(async () => void (ok = await session(result.current).abandon()))
  expect(ok).toBe(false)
  expect(session(result.current).saveError).toBe(FAILED)
})

test('settled resolves only after a draft write in flight has answered', async () => {
  let answer: (id: string) => void = () => {}
  mocks.createDraft.mockImplementation(() => new Promise<string>((resolve) => (answer = resolve)))
  const { result } = renderHook(() => useUpdate())
  const s = session(result.current)
  let changed = false
  let settled = false
  const change = s.change(confirmHouse).then(() => (changed = true))
  const waiting = s.settled().then(() => (settled = true))
  await Promise.resolve()
  expect(settled).toBe(false)
  await act(async () => {
    answer('d9')
    await change
    await waiting
  })
  expect(settled).toBe(true)
  expect(changed).toBe(true)
})

test('settled says whether the last write succeeded', async () => {
  const { result } = renderHook(() => useUpdate())
  mocks.createDraft.mockRejectedValueOnce(new Error('down'))
  await act(async () => void (await session(result.current).change(confirmHouse)))
  let ok: boolean | undefined
  await act(async () => void (ok = await session(result.current).settled()))
  expect(ok).toBe(false)
  await act(async () => void (await session(result.current).change(confirmHouse)))
  await act(async () => void (ok = await session(result.current).settled()))
  expect(ok).toBe(true)
})

test('a lost answer on the snapshot insert: the retry passes the same id, and its own row is no conflict', async () => {
  const stored: string[] = []
  mocks.addSnapshot.mockReset().mockImplementation(async (_c, _k, _s, id) => {
    // The row lands, whatever the answer: the next reading of the ids sees it.
    if (!stored.includes(id)) {
      stored.push(id)
      mocks.rows.push({ id, kind: 'snapshot' })
    }
    if (stored.length === 1 && mocks.addSnapshot.mock.calls.length === 1) throw new Error('Failed to fetch')
    return id
  })
  const { result } = renderHook(() => useUpdate())
  let ok = true
  await act(async () => void (ok = await session(result.current).save(TODAY)))
  expect(ok).toBe(false)
  await act(async () => void (ok = await session(result.current).save(TODAY)))
  expect(ok).toBe(true)
  expect(mocks.addSnapshot.mock.calls[1][3]).toBe(mocks.addSnapshot.mock.calls[0][3])
  expect(stored).toHaveLength(1)
})

test('a lost answer on the first draft insert: the next change passes the same id, a fresh version, and accepts the first', async () => {
  mocks.createDraft.mockRejectedValueOnce(new Error('Failed to fetch'))
  const { result } = renderHook(() => useUpdate())
  let ok = true
  await act(async () => void (ok = await session(result.current).change(confirmHouse)))
  expect(ok).toBe(false)
  await act(async () => void (ok = await session(result.current).change(confirmHouse)))
  expect(ok).toBe(true)
  expect(mocks.createDraft).toHaveBeenCalledTimes(2)
  expect(mocks.createDraft.mock.calls[1][3]).toBe(mocks.createDraft.mock.calls[0][3])
  const [first, retry] = mocks.createDraft.mock.calls.map((c) => c[4])
  expect(first).toEqual({ versions: [first.version], version: expect.any(String) })
  expect(retry.version).not.toBe(first.version)
  expect(retry.versions).toEqual([first.version, retry.version])
  expect(mocks.saveDraft).not.toHaveBeenCalled()
})

test('abandon after a lost first insert deletes the row the lost answer may have left', async () => {
  mocks.createDraft.mockReset().mockRejectedValueOnce(new Error('Failed to fetch'))
  const { result } = renderHook(() => useUpdate())
  await act(async () => void (await session(result.current).change(confirmHouse)))
  const drawn = mocks.createDraft.mock.calls[0][3]
  await act(async () => void (await session(result.current).abandon()))
  expect(mocks.deleteDraft).toHaveBeenCalledWith(CLIENT, drawn)
})

test('a retry after a failed profile save saves the profile again with its id, then one snapshot', async () => {
  mocks.saveProfile.mockReset().mockRejectedValueOnce(new Error('down')).mockImplementation(async () => 'p1')
  const { result } = renderHook(() => useUpdate())
  await act(async () => void (await session(result.current).save(TODAY)))
  expect(mocks.addSnapshot).not.toHaveBeenCalled()
  let ok = false
  await act(async () => void (ok = await session(result.current).save(TODAY)))
  expect(ok).toBe(true)
  expect(mocks.saveProfile).toHaveBeenCalledTimes(2)
  expect(mocks.saveProfile.mock.calls[1][3]).toBe('p1')
  expect(mocks.addSnapshot).toHaveBeenCalledTimes(1)
})

// F1: a typed figure is never lost silently.
const livretA = (d: UpdateDraft) =>
  setValue(d, exampleSnapshot, 'livret-a-line', { kind: 'amount', amount: 1_300_000 }, TODAY, {})
const addLep = (d: UpdateDraft) =>
  addAccount(exampleProfile, d, { establishmentId: 'boursobank', type: 'lep', name: 'LEP', arrival: 'opened' }).draft

test('a write that fails keeps the change on screen, and the next write carries it with the new one', async () => {
  mocks.createDraft.mockRejectedValueOnce(new Error('Failed to fetch'))
  const { result } = renderHook(() => useUpdate())
  let ok = true
  await act(async () => void (ok = await session(result.current).change(livretA)))
  expect(ok).toBe(false)
  expect(session(result.current).draft.values).toEqual([expect.objectContaining({ lineId: 'livret-a-line', amount: 1_300_000 })])
  expect(session(result.current).saveError).toBe(FAILED)

  await act(async () => void (ok = await session(result.current).change(confirmHouse)))
  expect(ok).toBe(true)
  const written: UpdateDraft = mocks.createDraft.mock.calls[1][2]
  expect(written.values).toEqual([expect.objectContaining({ lineId: 'livret-a-line', amount: 1_300_000 })])
  expect(written.confirmed).toEqual(['current-line'])
  expect(session(result.current).saveError).toBeNull()
})

test('after a failed write, settled stays false until a write succeeds, whatever comes in between', async () => {
  mocks.state.current = ready({ draft: withDraft(startDraft('s1')) })
  mocks.saveDraft.mockRejectedValueOnce(new Error('Failed to fetch'))
  const { result } = renderHook(() => useUpdate())
  await act(async () => void (await session(result.current).change(livretA)))
  let ok: boolean | undefined
  await act(async () => void (ok = await session(result.current).settled()))
  expect(ok).toBe(false)
  // A change refused as invalid is not a write that worked: what was typed is still unsaved.
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  await act(async () => void (await session(result.current).change(() => { throw new Error('refused') })))
  log.mockRestore()
  await act(async () => void (ok = await session(result.current).settled()))
  expect(ok).toBe(false)
  expect(session(result.current).draft.values).toHaveLength(1)
})

test('resave after a failure writes the draft on screen once, and applies nothing again', async () => {
  mocks.createDraft.mockRejectedValueOnce(new Error('Failed to fetch'))
  const { result } = renderHook(() => useUpdate())
  let ok = true
  await act(async () => void (ok = await session(result.current).change(addLep)))
  expect(ok).toBe(false)
  expect(session(result.current).draft.added.accounts).toHaveLength(1)

  await act(async () => void (ok = await session(result.current).resave()))
  expect(ok).toBe(true)
  expect(mocks.createDraft).toHaveBeenCalledTimes(2)
  expect(mocks.createDraft.mock.calls[1][2].added.accounts).toHaveLength(1)
  expect(mocks.createDraft.mock.calls[1][3]).toBe(mocks.createDraft.mock.calls[0][3])
  expect(session(result.current).saveError).toBeNull()
  expect(session(result.current).saved).toBe(true)

  // Nothing waits to be written any more: a second resave sends nothing.
  await act(async () => void (ok = await session(result.current).resave()))
  expect(ok).toBe(true)
  expect(mocks.createDraft).toHaveBeenCalledTimes(2)
  expect(mocks.saveDraft).not.toHaveBeenCalled()
})

test('resave that fails again keeps the draft unsaved and the error on screen', async () => {
  mocks.createDraft.mockReset().mockRejectedValue(new Error('Failed to fetch'))
  const { result } = renderHook(() => useUpdate())
  await act(async () => void (await session(result.current).change(addLep)))
  let ok = true
  await act(async () => void (ok = await session(result.current).resave()))
  expect(ok).toBe(false)
  expect(session(result.current).saveError).toBe(FAILED)
  expect(session(result.current).draft.added.accounts).toHaveLength(1)
  await act(async () => void (ok = await session(result.current).settled()))
  expect(ok).toBe(false)
})

test('a save builds from the draft on screen, unsaved changes included', async () => {
  mocks.createDraft.mockRejectedValueOnce(new Error('Failed to fetch'))
  const { result } = renderHook(() => useUpdate())
  await act(async () => void (await session(result.current).change(livretA)))
  await act(async () => void (await session(result.current).save(TODAY)))
  const entry = mocks.addSnapshot.mock.calls[0][2].entries.find((e: { lineId: string }) => e.lineId === 'livret-a-line')
  expect(entry).toMatchObject({ amount: 1_300_000 })
})

test('queued writes re-check that nothing became unreadable', async () => {
  const { result, rerender } = renderHook(() => useUpdate())
  const s = session(result.current)
  mocks.state.current = ready({ unreadable: { profile: 0, snapshots: 1, goals: 0, settings: 0, draft: 0 } })
  rerender()
  let ok = true
  await act(async () => void (ok = await s.change(confirmHouse)))
  expect(ok).toBe(false)
  await act(async () => void (ok = await s.save(TODAY)))
  expect(ok).toBe(false)
  expect(mocks.createDraft).not.toHaveBeenCalled()
  expect(mocks.saveProfile).not.toHaveBeenCalled()
})

// F3: a stale tab never overwrites newer work.
const conflict = (state: UpdateState) => {
  if (state.status !== 'conflict') throw new Error(`expected conflict, got ${state.status}`)
  return state
}

test('each draft write is guarded on the version this tab last wrote, and writes a new one', async () => {
  mocks.state.current = ready({ draft: withDraft(startDraft('s1')) })
  const { result } = renderHook(() => useUpdate())
  await act(async () => void (await session(result.current).change(confirmHouse)))
  await act(async () => void (await session(result.current).change(livretA)))
  const [first, second] = mocks.saveDraft.mock.calls.map((c) => c[3])
  expect(first.versions).toEqual([LOADED, first.version])
  expect(new Date(first.version).toISOString()).toBe(first.version)
  expect(second.versions).toEqual([first.version, second.version])
})

test('writes whose answer was lost: each next one accepts every version they may have left, and writes a fresh one', async () => {
  mocks.state.current = ready({ draft: withDraft(startDraft('s1')) })
  mocks.saveDraft.mockRejectedValueOnce(new Error('Failed to fetch')).mockRejectedValueOnce(new Error('Failed to fetch'))
  const { result } = renderHook(() => useUpdate())
  await act(async () => void (await session(result.current).change(confirmHouse)))
  await act(async () => void (await session(result.current).change(livretA)))
  await act(async () => void (await session(result.current).change((d) => markStep(d, 'boursobank', 'done'))))
  await act(async () => void (await session(result.current).change((d) => markStep(d, 'linxea', 'done'))))
  const [lost1, lost2, landed, after] = mocks.saveDraft.mock.calls.map((c) => c[3])
  // A device that read the row a lost answer left can never be accepted over newer work:
  // the next write never takes the same version again.
  expect(new Set([lost1.version, lost2.version, landed.version]).size).toBe(3)
  expect(lost2.versions).toEqual([LOADED, lost1.version, lost2.version])
  expect(landed.versions).toEqual([LOADED, lost1.version, lost2.version, landed.version])
  // Once a write works, only its version is known.
  expect(after.versions).toEqual([landed.version, after.version])
  expect(after.version).not.toBe(landed.version)
})

// The clock held still: every write falls in the same millisecond, as on a fast machine,
// whatever the speed of the one running the test.
const holdClock = () => vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-07T09:00:00.000Z'))

test('a long run of failed writes: the latest 20 versions are kept for the next write to accept', async () => {
  const clock = holdClock()
  try {
    mocks.state.current = ready({ draft: withDraft(startDraft('s1')) })
    for (let i = 0; i < 25; i++) mocks.saveDraft.mockRejectedValueOnce(new Error('Failed to fetch'))
    const { result } = renderHook(() => useUpdate())
    for (let i = 0; i < 26; i++) await act(async () => void (await session(result.current).change(confirmHouse)))
    const guards = mocks.saveDraft.mock.calls.map((c) => c[3])
    const last = guards[25]
    expect(last.versions).toEqual([LOADED, ...guards.slice(5, 25).map((g) => g.version), last.version])
    expect(new Set(guards.map((g) => g.version)).size).toBe(26)
  } finally {
    clock.mockRestore()
  }
})

test('a tab never gives a version twice, even once the versions it gave are no longer known', async () => {
  const clock = holdClock()
  try {
    mocks.state.current = ready({ draft: withDraft(startDraft('s1')) })
    mocks.saveDraft.mockRejectedValueOnce(new Error('Failed to fetch'))
    const { result } = renderHook(() => useUpdate())
    for (let i = 0; i < 3; i++) await act(async () => void (await session(result.current).change(confirmHouse)))
    const [lost, landed, after] = mocks.saveDraft.mock.calls.map((c) => c[3].version)
    // Once `landed` worked, `lost` is no longer accepted: it must not come back either.
    expect(new Set([lost, landed, after]).size).toBe(3)
    expect(Date.parse(after)).toBeGreaterThan(Date.parse(landed))
    expect(Date.parse(landed)).toBeGreaterThan(Date.parse(lost))
  } finally {
    clock.mockRestore()
  }
})

test('another device wrote the draft since: the update is in conflict, and writes nothing more', async () => {
  mocks.state.current = ready({ draft: withDraft(startDraft('s1')) })
  mocks.saveDraft.mockRejectedValueOnce(new mocks.DocumentChangedError('draft'))
  const { result } = renderHook(() => useUpdate())
  const s = session(result.current)
  let ok = true
  await act(async () => void (ok = await s.change(livretA)))
  expect(ok).toBe(false)
  expect(conflict(result.current).message).toBe(DRAFT_MOVED)
  expect(DRAFT_MOVED).toBe('Ta mise à jour a avancé sur un autre appareil.')
  // What was already queued, or comes from a screen not yet gone, writes nothing.
  await act(async () => void (ok = await s.change(confirmHouse)))
  expect(ok).toBe(false)
  await act(async () => void (ok = await s.resave()))
  expect(ok).toBe(false)
  await act(async () => void (ok = await s.save(TODAY)))
  expect(ok).toBe(false)
  expect(mocks.saveDraft).toHaveBeenCalledTimes(1)
  expect(mocks.saveProfile).not.toHaveBeenCalled()
})

test('a draft another device started since: the first insert is refused as changed, and it is a conflict', async () => {
  mocks.createDraft.mockReset().mockRejectedValueOnce(new mocks.DocumentChangedError('draft'))
  const { result } = renderHook(() => useUpdate())
  await act(async () => void (await session(result.current).change(confirmHouse)))
  expect(result.current.status).toBe('conflict')
})

test('« Recharger » reloads the model; the new reading is ready, and its writes are guarded on its version', async () => {
  const reload = vi.fn()
  mocks.state.current = ready({ draft: withDraft(startDraft('s1')) }, reload)
  mocks.saveDraft.mockRejectedValueOnce(new mocks.DocumentChangedError('draft'))
  const { result, rerender } = renderHook(() => useUpdate())
  await act(async () => void (await session(result.current).change(livretA)))
  act(() => conflict(result.current).reload())
  expect(reload).toHaveBeenCalledTimes(1)
  // Until the new reading arrives, the conflict stays on screen.
  expect(result.current.status).toBe('conflict')

  const theirs = { id: 'd1', value: confirmLine(startDraft('s1'), 'euro-fund'), updatedAt: '2026-11-07T09:30:00+00:00' }
  mocks.state.current = ready({ draft: theirs }, reload)
  rerender()
  expect(session(result.current).draft.confirmed).toEqual(['euro-fund'])
  expect(session(result.current).draft.values).toEqual([])
  expect(session(result.current).saveError).toBeNull()
  let ok = false
  await act(async () => void (ok = await session(result.current).change(confirmHouse)))
  expect(ok).toBe(true)
  expect(mocks.saveDraft.mock.calls[1][3].versions[0]).toBe(theirs.updatedAt)
})

test('Enregistrer: the draft is written once more under its guard; refused, nothing is saved', async () => {
  mocks.state.current = ready({ draft: withDraft(startDraft('s1')) })
  mocks.saveDraft.mockRejectedValueOnce(new mocks.DocumentChangedError('draft'))
  const { result } = renderHook(() => useUpdate())
  let ok = true
  await act(async () => void (ok = await session(result.current).save(TODAY)))
  expect(ok).toBe(false)
  expect(result.current.status).toBe('conflict')
  expect(mocks.saveProfile).not.toHaveBeenCalled()
  expect(mocks.addSnapshot).not.toHaveBeenCalled()
  expect(mocks.deleteDraft).not.toHaveBeenCalled()
})

test('Enregistrer: a snapshot saved elsewhere since this tab loaded is a conflict, and no profile is written', async () => {
  const { result } = renderHook(() => useUpdate())
  mocks.rows.push({ id: 's9', kind: 'snapshot' })
  let ok = true
  await act(async () => void (ok = await session(result.current).save(TODAY)))
  expect(ok).toBe(false)
  expect(result.current.status).toBe('conflict')
  expect(mocks.saveProfile).not.toHaveBeenCalled()
})

test('Enregistrer: a draft another device started, when this tab has none, is a conflict', async () => {
  const { result } = renderHook(() => useUpdate())
  mocks.rows.push({ id: 'theirs', kind: 'draft' })
  let ok = true
  await act(async () => void (ok = await session(result.current).save(TODAY)))
  expect(ok).toBe(false)
  expect(result.current.status).toBe('conflict')
  expect(mocks.saveProfile).not.toHaveBeenCalled()
})

test('Enregistrer: this tab’s draft row gone (saved or abandoned elsewhere) is a conflict', async () => {
  mocks.state.current = ready({ draft: withDraft(startDraft('s1')) })
  const { result } = renderHook(() => useUpdate())
  mocks.rows = mocks.rows.filter((r) => r.kind !== 'draft')
  let ok = true
  await act(async () => void (ok = await session(result.current).save(TODAY)))
  expect(ok).toBe(false)
  expect(result.current.status).toBe('conflict')
  expect(mocks.saveProfile).not.toHaveBeenCalled()
})

test('Enregistrer: the ids cannot be read: nothing is saved, and it can be tried again', async () => {
  mocks.listUpdateDocuments.mockRejectedValueOnce(new Error('Failed to fetch'))
  const { result } = renderHook(() => useUpdate())
  let ok = true
  await act(async () => void (ok = await session(result.current).save(TODAY)))
  expect(ok).toBe(false)
  expect(session(result.current).saveError).toBe(FAILED)
  expect(mocks.saveProfile).not.toHaveBeenCalled()
  await act(async () => void (ok = await session(result.current).save(TODAY)))
  expect(ok).toBe(true)
})

// Lot 4b, decisions 7 and 11: the update reads the market once, when it opens, and the
// bank screens, the result and the save all use what it read (R18).
describe('the market', () => {
  const RATES = { on: '2026-11-06', perEuro: { USD: 1.1165 } }
  const quoted = {
    ...PROFILE,
    value: { ...exampleProfile, lines: exampleProfile.lines.map((l) => (l.id === 'etf' ? { ...l, quoteSymbol: 'CW8.PA' } : l)) },
  }
  const at = (price: number, currency: 'EUR' | 'USD' = 'EUR') => ({ price, currency, asOf: '2026-11-06' })
  // A current account in dollars, opened since: 200 $.
  const withDollars = () => {
    const added = addAccount(exampleProfile, startDraft('s1'), {
      establishmentId: 'boursobank',
      type: 'current',
      name: 'Compte US',
      arrival: 'opened',
    })
    return putAddedLine(
      exampleProfile,
      added.draft,
      { accountId: added.accountId, name: 'Compte US', entry: { kind: 'amount', amount: 20_000 }, currency: 'USD' },
      TODAY,
    ).draft
  }

  test('it asks the quoted symbols of the base and today’s rates, then, the prices taken, only the rates', () => {
    mocks.state.current = ready({ profile: quoted })
    mocks.market.current = { status: 'loading' }
    const { rerender } = renderHook(() => useUpdate())
    expect(mocks.useMarket).toHaveBeenLastCalledWith(['CW8.PA'], { rates: true })
    mocks.market.current = marketReady({ quotes: { 'CW8.PA': at(260) }, rates: RATES })
    rerender()
    // « Réessayer » then asks for the rates alone: the prices are those of the opening (decision 7).
    expect(mocks.useMarket).toHaveBeenLastCalledWith([], { rates: true })
  })

  test('the update stays loading while the market is', () => {
    mocks.state.current = ready({ profile: quoted })
    mocks.market.current = { status: 'loading' }
    const { result, rerender } = renderHook(() => useUpdate())
    expect(result.current.status).toBe('loading')
    mocks.market.current = marketReady({ quotes: { 'CW8.PA': at(260) }, rates: RATES })
    rerender()
    expect(session(result.current).market.prices).toEqual({ etf: 260 })
  })

  test('once ready: today’s prices, the rates, the lines whose price failed, and a way to ask again', () => {
    mocks.state.current = ready({ profile: quoted })
    mocks.market.current = marketReady({ quotes: { 'CW8.PA': at(260) }, rates: RATES })
    const { result } = renderHook(() => useUpdate())
    expect(session(result.current).market).toEqual({ prices: { etf: 260 }, rates: RATES })
    expect(session(result.current).failedPrices).toEqual([])
    session(result.current).retryMarket()
    expect(mocks.retry).toHaveBeenCalledTimes(1)
  })

  test('a price that could not be fetched: no price for the line, and the line among the failed', () => {
    mocks.state.current = ready({ profile: quoted })
    mocks.market.current = marketReady({ quotes: { 'CW8.PA': null }, rates: RATES })
    const { result } = renderHook(() => useUpdate())
    expect(session(result.current).market.prices).toEqual({})
    expect(session(result.current).failedPrices).toEqual(['etf'])
  })

  // Review Focus 4: the ECB unreachable, and no rate in the base for a line in dollars.
  test('a line in dollars, no rate today and none in the base: save refuses on its own, and writes nothing', async () => {
    mocks.state.current = ready({ draft: withDraft(withDollars()) })
    mocks.market.current = marketReady({ quotes: {}, rates: null })
    const { result } = renderHook(() => useUpdate())
    let ok = true
    await act(async () => void (ok = await session(result.current).save(TODAY)))
    expect(ok).toBe(false)
    expect(session(result.current).saveError).toBe(RATE_MISSING_SAVE)
    expect(mocks.saveProfile).not.toHaveBeenCalled()
    expect(mocks.addSnapshot).not.toHaveBeenCalled()
  })

  test('with today’s rates and prices: the snapshot keeps the ECB’s rate, and the ETF at today’s price', async () => {
    mocks.state.current = ready({ profile: quoted, draft: withDraft(withDollars()) })
    mocks.market.current = marketReady({ quotes: { 'CW8.PA': at(260) }, rates: RATES })
    const { result } = renderHook(() => useUpdate())
    let ok = false
    await act(async () => void (ok = await session(result.current).save(TODAY)))
    expect(ok).toBe(true)
    const snapshot = mocks.addSnapshot.mock.calls[0][2]
    expect(snapshot.fx.USD).toBeCloseTo(0.895656, 6)
    expect(snapshot.entries.find((e: { lineId: string }) => e.lineId === 'etf')).toMatchObject({ unitPrice: 260 })
  })

  // The rates asked again (« Réessayer »): the update loads, and a save already under way
  // writes nothing from a market no screen shows any more.
  test('the market asked again: « Enregistrer » refuses, and writes neither profile nor snapshot', async () => {
    mocks.state.current = ready({ profile: quoted, draft: withDraft(withDollars()) })
    mocks.market.current = marketReady({ quotes: { 'CW8.PA': at(260) }, rates: RATES })
    const { result, rerender } = renderHook(() => useUpdate())
    const opened = session(result.current)
    mocks.market.current = { status: 'loading' }
    rerender()
    expect(result.current.status).toBe('loading')
    let ok = true
    await act(async () => void (ok = await opened.save(TODAY)))
    expect(ok).toBe(false)
    expect(mocks.saveProfile).not.toHaveBeenCalled()
    expect(mocks.addSnapshot).not.toHaveBeenCalled()
    // Refused before anything is tried: no draft written, nothing read.
    expect(mocks.calls).toEqual([])
    // The rates back, the update is as it was, with no error to show.
    mocks.market.current = marketReady({ quotes: {}, rates: RATES })
    rerender()
    expect(session(result.current).saveError).toBeNull()
  })

  // Task 2's rule: a converted price keeps 4 decimals, and the box shows that very price.
  test('a price converted from dollars: the untouched box saves the 4 decimals it showed', async () => {
    mocks.state.current = ready({ profile: quoted })
    mocks.market.current = marketReady({ quotes: { 'CW8.PA': at(290, 'USD') }, rates: RATES })
    const { result } = renderHook(() => useUpdate())
    // 290 $ ÷ 1,1165: 259,74025…, kept at 259,7403.
    expect(session(result.current).market.prices).toEqual({ etf: 259.7403 })
    await act(async () => void (await session(result.current).save(TODAY)))
    const etf = mocks.addSnapshot.mock.calls[0][2].entries.find((e: { lineId: string }) => e.lineId === 'etf')
    expect(etf).toMatchObject({ unitPrice: 259.7403, units: 100 })
  })
})

test('the profile was saved elsewhere since the update opened: conflict, and nothing is written', async () => {
  mocks.profileVersion.mockResolvedValue({ id: 'p1', updatedAt: '2026-11-07T10:00:00.000Z' })
  // A title attached in another tab: not the profile this update builds.
  mocks.loadProfile.mockResolvedValue({
    profile: { id: 'p1', value: attachSymbol(exampleProfile, 'etf', 'CW8.PA'), updatedAt: '2026-11-07T10:00:00.000Z' },
    unreadable: 0,
  })
  const { result } = renderHook(() => useUpdate())
  let ok = true
  await act(async () => void (ok = await session(result.current).save(TODAY)))
  expect(ok).toBe(false)
  expect(conflict(result.current).message).toBe(DRAFT_MOVED)
  expect(mocks.saveProfile).not.toHaveBeenCalled()
  expect(mocks.addSnapshot).not.toHaveBeenCalled()
})

test('a profile row that is gone is a conflict too', async () => {
  mocks.profileVersion.mockResolvedValue(null)
  const { result } = renderHook(() => useUpdate())
  await act(async () => void (await session(result.current).save(TODAY)))
  expect(conflict(result.current).message).toBe(DRAFT_MOVED)
  expect(mocks.saveProfile).not.toHaveBeenCalled()
})

// Final wave F1: this tab's own profile write is never taken for another device's.
describe('a save that half landed', () => {
  // The profile row as the database holds it. Each write that lands stamps a version the way
  // PostgREST writes it back (never the toISOString() of this tab), and stores what JSON keeps,
  // read back through the real parser.
  type Row = { id: string; updatedAt: string; value: Profile; land: (profile: Profile) => void }
  function database(): Row {
    let stamps = 0
    const row: Row = {
      id: PROFILE.id,
      updatedAt: '2026-11-07T08:00:00.5+00:00',
      value: exampleProfile,
      land: (profile) => {
        stamps += 1
        row.value = parseProfile(JSON.parse(JSON.stringify(profile)))!
        row.updatedAt = `2026-11-07T09:00:0${stamps}.25+00:00`
      },
    }
    mocks.state.current = ready({ profile: { ...PROFILE, updatedAt: row.updatedAt }, draft: withDraft(closeLine(startDraft('s1'), 'gold-line')) })
    mocks.profileVersion.mockImplementation(async () => ({ id: row.id, updatedAt: row.updatedAt }))
    mocks.loadProfile.mockImplementation(async () => ({
      profile: { id: row.id, value: row.value, updatedAt: row.updatedAt },
      unreadable: 0,
    }))
    mocks.saveProfile.mockImplementation(async (_c, _k, profile: Profile, id: string) => {
      mocks.calls.push('saveProfile')
      row.land(profile)
      return id
    })
    return row
  }
  const stored: string[] = []
  beforeEach(() => {
    stored.length = 0
    mocks.addSnapshot.mockImplementation(async (_c, _k, _s, id: string) => {
      if (!stored.includes(id)) stored.push(id)
      return id
    })
  })

  test('the snapshot failed after the profile landed: the next « Enregistrer » saves, with one snapshot', async () => {
    const row = database()
    mocks.addSnapshot.mockRejectedValueOnce(new Error('Failed to fetch'))
    const { result } = renderHook(() => useUpdate())
    let ok = true
    await act(async () => void (ok = await session(result.current).save(TODAY)))
    expect(ok).toBe(false)
    expect(row.value.lines.find((l) => l.id === 'gold-line')?.closedOn).toBe(TODAY)
    await act(async () => void (ok = await session(result.current).save(TODAY)))
    expect(ok).toBe(true)
    expect(result.current.status).toBe('ready')
    expect(mocks.saveProfile).toHaveBeenCalledTimes(2)
    expect(stored).toHaveLength(1)
    // Its own version, kept as the database stamped it: no need to read the profile again.
    expect(mocks.loadProfile).not.toHaveBeenCalled()
  })

  test('the profile landed but its answer was lost: the row holds this tab’s profile, and the retry saves', async () => {
    const row = database()
    mocks.saveProfile.mockImplementationOnce(async (_c, _k, profile: Profile) => {
      row.land(profile)
      throw new Error('Failed to fetch')
    })
    const { result } = renderHook(() => useUpdate())
    let ok = true
    await act(async () => void (ok = await session(result.current).save(TODAY)))
    expect(ok).toBe(false)
    expect(mocks.addSnapshot).not.toHaveBeenCalled()
    await act(async () => void (ok = await session(result.current).save(TODAY)))
    expect(ok).toBe(true)
    expect(result.current.status).toBe('ready')
    expect(stored).toHaveLength(1)
  })

  test('another device wrote the profile after this tab’s own write: still a conflict, and nothing more is written', async () => {
    const row = database()
    mocks.addSnapshot.mockRejectedValueOnce(new Error('Failed to fetch'))
    const { result } = renderHook(() => useUpdate())
    await act(async () => void (await session(result.current).save(TODAY)))
    // A title attached in another tab, over this tab's write.
    row.value = attachSymbol(row.value, 'etf', 'CW8.PA')
    row.updatedAt = '2026-11-07T10:00:00+00:00'
    let ok = true
    await act(async () => void (ok = await session(result.current).save(TODAY)))
    expect(ok).toBe(false)
    expect(conflict(result.current).message).toBe(DRAFT_MOVED)
    expect(mocks.saveProfile).toHaveBeenCalledTimes(1)
    expect(stored).toHaveLength(0)
  })

  test('a lost answer, then another device’s write: a conflict too', async () => {
    const row = database()
    mocks.saveProfile.mockImplementationOnce(async (_c, _k, profile: Profile) => {
      row.land(profile)
      throw new Error('Failed to fetch')
    })
    const { result } = renderHook(() => useUpdate())
    await act(async () => void (await session(result.current).save(TODAY)))
    row.value = attachSymbol(row.value, 'etf', 'CW8.PA')
    row.updatedAt = '2026-11-07T10:00:00+00:00'
    await act(async () => void (await session(result.current).save(TODAY)))
    expect(conflict(result.current).message).toBe(DRAFT_MOVED)
    expect(mocks.saveProfile).toHaveBeenCalledTimes(1)
    expect(mocks.addSnapshot).not.toHaveBeenCalled()
  })
})
