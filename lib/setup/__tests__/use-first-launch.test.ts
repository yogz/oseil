// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { ModelState } from '@/lib/app/use-model'
import type { Model } from '@/lib/app/use-model'
import type { Profile, Snapshot } from '@/lib/model/types'
import { chooseWhere, steps } from '../first-launch'
import { INVALID, useFirstLaunch } from '../use-first-launch'

const mocks = vi.hoisted(() => ({
  InvalidDocumentError: class InvalidDocumentError extends Error {},
  state: { current: null as unknown },
  saveProfile: vi.fn(),
  saveSnapshot: vi.fn(),
  deleteDocumentOf: vi.fn(),
  deleteAllDrafts: vi.fn(),
}))

vi.mock('@/lib/app/use-model', () => ({ useModel: () => mocks.state.current }))
vi.mock('@/lib/model/repository', () => ({
  InvalidDocumentError: mocks.InvalidDocumentError,
  saveProfile: mocks.saveProfile,
  saveSnapshot: mocks.saveSnapshot,
  deleteDocumentOf: mocks.deleteDocumentOf,
  deleteAllDrafts: mocks.deleteAllDrafts,
  // The import's own writes: never called by a manual first launch.
  addGoal: vi.fn(),
  addSnapshot: vi.fn(),
  saveSettings: vi.fn(),
}))

const CLIENT = { tag: 'client' }
const KEY = {} as CryptoKey
const FAILED = 'Ça n’a pas été enregistré. Vérifie ta connexion et réessaie.'

function ready(model: Partial<Model> = {}): ModelState {
  return {
    status: 'ready',
    client: CLIENT,
    dataKey: KEY,
    reload: () => {},
    model: {
      profile: null,
      snapshots: [],
      goals: [],
      settings: null,
      draft: null,
      unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
      ...model,
    },
  } as unknown as ModelState
}

const choose = (banks: string[] = ['BoursoBank']) => (draft: Parameters<typeof chooseWhere>[0]) =>
  chooseWhere(draft, { banks: banks.map((name) => ({ name })), outside: [] }, '2026-11-06')

beforeEach(() => {
  mocks.state.current = ready()
  mocks.saveProfile.mockReset().mockResolvedValue('profile-1')
  mocks.saveSnapshot.mockReset().mockResolvedValue('snapshot-1')
  mocks.deleteDocumentOf.mockReset().mockResolvedValue(undefined)
  mocks.deleteAllDrafts.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)

test('loading, failed and ready follow the model', () => {
  mocks.state.current = { status: 'loading' }
  expect(renderHook(() => useFirstLaunch()).result.current.status).toBe('loading')
  mocks.state.current = { status: 'failed', retry: () => {} }
  expect(renderHook(() => useFirstLaunch()).result.current.status).toBe('failed')
  mocks.state.current = ready()
  const { result } = renderHook(() => useFirstLaunch())
  expect(result.current.status).toBe('ready')
  expect(result.current.draft).toBeNull()
})

test('retry exists only when failed or blocked', () => {
  const retry = vi.fn()
  mocks.state.current = { status: 'failed', retry }
  const failed = renderHook(() => useFirstLaunch()).result.current
  expect('retry' in failed && failed.retry).toBe(retry)

  mocks.state.current = ready({ unreadable: { profile: 1, snapshots: 0, goals: 0, settings: 0, draft: 0 } })
  const blocked = renderHook(() => useFirstLaunch()).result.current
  expect(blocked.status).toBe('blocked')
  expect('retry' in blocked && typeof blocked.retry).toBe('function')

  mocks.state.current = ready()
  expect('retry' in renderHook(() => useFirstLaunch()).result.current).toBe(false)
  mocks.state.current = { status: 'loading' }
  expect('retry' in renderHook(() => useFirstLaunch()).result.current).toBe(false)
})

test('apply saves the profile before the snapshot, then updates both with their ids', async () => {
  const order: string[] = []
  mocks.saveProfile.mockImplementation(async () => (order.push('profile'), 'profile-1'))
  mocks.saveSnapshot.mockImplementation(async () => (order.push('snapshot'), 'snapshot-1'))
  const { result } = renderHook(() => useFirstLaunch())

  let ok = false
  await act(async () => {
    ok = await result.current.apply(choose())
  })
  expect(ok).toBe(true)
  expect(order).toEqual(['profile', 'snapshot'])
  expect(mocks.saveProfile.mock.calls[0][3]).toBeUndefined()
  expect(result.current.draft?.profile.establishments[0].name).toBe('BoursoBank')
  expect(result.current.saveError).toBeNull()

  await act(async () => {
    await result.current.apply(choose(['BoursoBank', 'Fortuneo']))
  })
  expect(mocks.saveProfile.mock.calls[1][3]).toBe('profile-1')
  expect(mocks.saveSnapshot.mock.calls[1][3]).toBe('snapshot-1')
})

test('two quick changes never insert two profiles', async () => {
  let release: (id: string) => void = () => {}
  mocks.saveProfile.mockImplementationOnce(() => new Promise<string>((resolve) => (release = resolve)))
  const { result } = renderHook(() => useFirstLaunch())

  let first!: Promise<boolean>
  let second!: Promise<boolean>
  await act(async () => {
    first = result.current.apply(choose())
    second = result.current.apply(choose(['BoursoBank', 'Fortuneo']))
  })
  expect(mocks.saveProfile).toHaveBeenCalledTimes(1)
  await act(async () => {
    release('profile-1')
    await Promise.all([first, second])
  })
  expect(mocks.saveProfile).toHaveBeenCalledTimes(2)
  expect(mocks.saveProfile.mock.calls[1][3]).toBe('profile-1')
  expect(result.current.draft?.profile.establishments.map((e) => e.name)).toEqual(['BoursoBank', 'Fortuneo'])
})

test('a failed profile save skips the snapshot, says so, and keeps the last saved draft', async () => {
  const { result } = renderHook(() => useFirstLaunch())
  await act(async () => {
    await result.current.apply(choose())
  })
  const saved = result.current.draft
  mocks.saveProfile.mockRejectedValueOnce(new Error('network'))
  mocks.saveSnapshot.mockClear()

  let ok = true
  await act(async () => {
    ok = await result.current.apply(choose(['BoursoBank', 'Fortuneo']))
  })
  expect(ok).toBe(false)
  expect(mocks.saveSnapshot).not.toHaveBeenCalled()
  expect(result.current.saveError).toBe(FAILED)
  expect(result.current.draft).toEqual(saved)
})

test('a failed snapshot save is reported too, and the next success clears the error', async () => {
  mocks.saveSnapshot.mockRejectedValueOnce(new Error('network'))
  const { result } = renderHook(() => useFirstLaunch())
  await act(async () => {
    expect(await result.current.apply(choose())).toBe(false)
  })
  expect(result.current.saveError).toBe(FAILED)
  expect(result.current.draft).toBeNull()
  await act(async () => {
    expect(await result.current.apply(choose())).toBe(true)
  })
  expect(result.current.saveError).toBeNull()
  // The profile id learned by the first, half-failed attempt is reused (a second
  // insert would be refused); the snapshot was never created, so it is inserted.
  expect(mocks.saveProfile.mock.calls[1][3]).toBe('profile-1')
  expect(mocks.saveSnapshot.mock.calls[1][3]).toBeUndefined()
})

test('an invalid document is reported as a bug, not as a connection problem', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.saveProfile.mockRejectedValueOnce(new mocks.InvalidDocumentError('bad'))
  const { result } = renderHook(() => useFirstLaunch())
  await act(async () => {
    expect(await result.current.apply(choose())).toBe(false)
  })
  expect(result.current.saveError).toBe(INVALID)
  expect(spy).toHaveBeenCalled()
  expect(mocks.saveSnapshot).not.toHaveBeenCalled()
  spy.mockRestore()
})

test('an error thrown by the change itself is reported the same way and saves nothing', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { result } = renderHook(() => useFirstLaunch())
  await act(async () => {
    expect(
      await result.current.apply(() => {
        throw new Error('unknown account')
      }),
    ).toBe(false)
  })
  expect(result.current.saveError).toBe(INVALID)
  expect(mocks.saveProfile).not.toHaveBeenCalled()
  spy.mockRestore()
})

test('what is saved is tidied first: an entry for a line the profile no longer has never reaches the database', async () => {
  const { result } = renderHook(() => useFirstLaunch())
  await act(async () => {
    await result.current.apply((d) => {
      const draft = choose()(d)
      return {
        ...draft,
        snapshot: {
          ...draft.snapshot,
          entries: [{ lineId: 'gone', kind: 'amount', amount: 5, seenOn: '2026-11-06' }],
          contributions: { 'gone-account': 100 },
          arrivals: { gone: 'opened' },
        },
      }
    })
  })
  const sent = mocks.saveSnapshot.mock.calls[0][2] as Snapshot
  expect(sent.entries).toEqual([])
  expect(sent.contributions).toEqual({})
  expect(sent.arrivals).toEqual({})
  expect(result.current.draft?.snapshot.entries).toEqual([])
})

test('resuming from a profile ahead of its snapshot drops the orphan entries', () => {
  const draft = chooseWhere(null, { banks: [{ name: 'BoursoBank' }], outside: [] }, '2026-11-01')
  const stale: Snapshot = {
    ...draft.snapshot,
    entries: [{ lineId: 'gone', kind: 'amount', amount: 5, seenOn: '2026-11-01' }],
  }
  mocks.state.current = ready({
    profile: { id: 'p9', value: draft.profile, updatedAt: '' },
    snapshots: [{ id: 's2', value: stale, updatedAt: '' }],
  })
  const { result } = renderHook(() => useFirstLaunch())
  expect(result.current.draft?.snapshot.entries).toEqual([])
})

test('starts from the model profile and its latest snapshot, and updates them in place', async () => {
  const draft = chooseWhere(null, { banks: [{ name: 'BoursoBank' }], outside: [] }, '2026-11-01')
  const older: Snapshot = { ...draft.snapshot, takenOn: '2026-10-01' }
  mocks.state.current = ready({
    profile: { id: 'p9', value: draft.profile, updatedAt: '' },
    snapshots: [
      { id: 's1', value: older, updatedAt: '' },
      { id: 's2', value: draft.snapshot, updatedAt: '' },
    ],
  })
  const { result } = renderHook(() => useFirstLaunch())
  expect(result.current.draft).toEqual(draft)
  await act(async () => {
    await result.current.apply((d) => ({ ...d!, profile: { ...d!.profile, firstLaunch: { planned: [], finished: [steps(d!.profile)[0].id], complete: false } } }))
  })
  expect(mocks.saveProfile.mock.calls[0][3]).toBe('p9')
  expect(mocks.saveSnapshot.mock.calls[0][3]).toBe('s2')
})

test('with a profile but no readable snapshot, a new snapshot is created', async () => {
  const draft = chooseWhere(null, { banks: [{ name: 'BoursoBank' }], outside: [] }, '2026-11-01')
  mocks.state.current = ready({ profile: { id: 'p9', value: draft.profile as Profile, updatedAt: '' } })
  const { result } = renderHook(() => useFirstLaunch())
  expect(result.current.draft?.snapshot.entries).toEqual([])
  await act(async () => {
    await result.current.apply((d) => d!)
  })
  expect(mocks.saveSnapshot.mock.calls[0][3]).toBeUndefined()
})

test.each([['snapshots'], ['profile']])('unreadable %s: blocked, nothing is written', async (which) => {
  mocks.state.current = ready({ unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0, [which]: 1 } })
  const { result } = renderHook(() => useFirstLaunch())
  expect(result.current.status).toBe('blocked')
  let ok = true
  await act(async () => {
    ok = await result.current.apply(choose())
  })
  expect(ok).toBe(false)
  expect(mocks.saveProfile).not.toHaveBeenCalled()
  expect(mocks.saveSnapshot).not.toHaveBeenCalled()
})

// What an import cut short leaves behind: the placeholder profile (no bank, first launch not
// complete) and some of the file's relevés and goals, none of them visible.
const PLACEHOLDER: Profile = {
  schema: 1,
  establishments: [],
  accounts: [],
  lines: [],
  firstLaunch: { planned: [], finished: [], complete: false },
}
const LEFTOVER_SNAPSHOT: Snapshot = {
  schema: 1,
  takenOn: '2025-03-31',
  fx: {},
  entries: [{ lineId: 'imported-line', kind: 'amount', amount: 41_200_000, seenOn: '2025-03-31' }],
  contributions: {},
  arrivals: {},
}
const leftovers = () =>
  ready({
    profile: { id: 'placeholder', value: PLACEHOLDER, updatedAt: '' },
    snapshots: [
      { id: 'old-1', value: { ...LEFTOVER_SNAPSHOT, takenOn: '2025-02-28' }, updatedAt: '' },
      { id: 'old-2', value: LEFTOVER_SNAPSHOT, updatedAt: '' },
    ],
    goals: [{ id: 'old-goal', value: { schema: 1, validFrom: '2025-03-31', shares: { available: 0.25, secured: 0.25, invested: 0.25, property: 0.25 } } as never, updatedAt: '' }],
  })

test('leftovers of a cut-short import are deleted before a manual first launch writes anything, and never come back', async () => {
  mocks.state.current = leftovers()
  const order: string[] = []
  mocks.deleteDocumentOf.mockImplementation(async (_client, kind, id) => void order.push(`delete ${kind} ${id}`))
  mocks.deleteAllDrafts.mockImplementation(async () => void order.push('delete drafts'))
  mocks.saveProfile.mockImplementation(async (_c, _k, _v, id) => (order.push('profile'), id ?? 'profile-1'))
  mocks.saveSnapshot.mockImplementation(async () => (order.push('snapshot'), 'snapshot-new'))

  const { result } = renderHook(() => useFirstLaunch())
  // The latest leftover relevé is not the base the first launch starts from.
  expect(result.current.draft?.snapshot.entries).toEqual([])
  expect(result.current.draft?.snapshot.takenOn).not.toBe('2025-03-31')

  await act(async () => {
    expect(await result.current.apply(choose())).toBe(true)
  })
  expect(order).toEqual([
    'delete snapshot old-1',
    'delete snapshot old-2',
    'delete goals old-goal',
    'delete drafts',
    'profile',
    'snapshot',
  ])
  // Over the placeholder's own id; the relevé is a new one, not a leftover's.
  expect(mocks.saveProfile.mock.calls[0][3]).toBe('placeholder')
  expect(mocks.saveSnapshot.mock.calls[0][3]).toBeUndefined()

  // The rest of the launch, up to its end: no second clean-up, and nothing of the leftovers.
  await act(async () => {
    expect(
      await result.current.apply((d) => ({
        ...d!,
        profile: { ...d!.profile, firstLaunch: { planned: [], finished: steps(d!.profile).map((s) => s.id), complete: true } },
      })),
    ).toBe(true)
  })
  expect(mocks.deleteDocumentOf).toHaveBeenCalledTimes(3)
  expect(mocks.deleteAllDrafts).toHaveBeenCalledTimes(1)
  expect(mocks.saveSnapshot.mock.calls[1][3]).toBe('snapshot-new')
  const completed = mocks.saveSnapshot.mock.calls[1][2] as Snapshot
  expect(completed.entries.some((e) => e.lineId === 'imported-line')).toBe(false)
  expect(completed.takenOn).not.toBe('2025-03-31')
  expect((mocks.saveProfile.mock.calls[1][2] as Profile).firstLaunch?.complete).toBe(true)
})

test('a clean-up that fails writes nothing and says so; the next try cleans up again', async () => {
  mocks.state.current = leftovers()
  mocks.deleteDocumentOf.mockRejectedValueOnce(new Error('network'))
  const { result } = renderHook(() => useFirstLaunch())
  await act(async () => {
    expect(await result.current.apply(choose())).toBe(false)
  })
  expect(result.current.saveError).toBe(FAILED)
  expect(mocks.saveProfile).not.toHaveBeenCalled()
  await act(async () => {
    expect(await result.current.apply(choose())).toBe(true)
  })
  expect(mocks.deleteAllDrafts).toHaveBeenCalledTimes(1)
  expect(mocks.saveProfile).toHaveBeenCalledTimes(1)
})

test('a vault that is not empty is never cleaned up', async () => {
  const draft = chooseWhere(null, { banks: [{ name: 'BoursoBank' }], outside: [] }, '2026-11-01')
  mocks.state.current = ready({
    profile: { id: 'p9', value: draft.profile, updatedAt: '' },
    snapshots: [{ id: 's2', value: draft.snapshot, updatedAt: '' }],
  })
  const { result } = renderHook(() => useFirstLaunch())
  await act(async () => {
    await result.current.apply((d) => d!)
  })
  expect(mocks.deleteDocumentOf).not.toHaveBeenCalled()
  expect(mocks.deleteAllDrafts).not.toHaveBeenCalled()
  expect(mocks.saveSnapshot.mock.calls[0][3]).toBe('s2')
})
