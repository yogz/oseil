import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import { DEFAULT_SETTINGS, parseProfile } from '@/lib/model/documents'
import type { GoalAllocation, Profile, Settings, Snapshot } from '@/lib/model/types'
import type { ImportedData } from '../import'
import { clearLeftovers, EMPTY_PROFILE, isVaultEmpty, saveImport } from '../save-import'
import { fixtureGoals, fixtureProfile, fixtureSettings, fixtureSnapshots } from './fixtures'

// A database of one person, in memory: what the mocked repository writes and deletes lands
// here, so a test can reload the model from it as the screen would after a failure.
type Row = { kind: 'profile' | 'settings' | 'goals' | 'snapshot'; id: string; value: unknown }
const db = vi.hoisted(() => ({
  rows: [] as Row[],
  drafts: 0,
  calls: [] as string[],
  // A write that fails, by its position among the calls (`addSnapshot#2`), and how often.
  failing: new Map<string, number>(),
  counter: 0,
}))

function attempt(name: string) {
  db.calls.push(name)
  const label = `${name}#${db.calls.filter((call) => call === name).length}`
  const left = db.failing.get(label) ?? 0
  if (left > 0) {
    db.failing.set(label, left - 1)
    throw new Error(`offline at ${label}`)
  }
}

const repository = vi.hoisted(() => ({
  saveProfile: vi.fn(async (_c: unknown, _k: unknown, value: unknown, id?: string) => {
    attempt('saveProfile')
    return save('profile', value, id)
  }),
  saveSettings: vi.fn(async (_c: unknown, _k: unknown, value: unknown, id?: string) => {
    attempt('saveSettings')
    return save('settings', value, id)
  }),
  addGoal: vi.fn(async (_c: unknown, _k: unknown, value: unknown) => {
    attempt('addGoal')
    return save('goals', value)
  }),
  addSnapshot: vi.fn(async (_c: unknown, _k: unknown, value: unknown, id: string) => {
    attempt('addSnapshot')
    if (!db.rows.some((row) => row.kind === 'snapshot' && row.id === id)) db.rows.push({ kind: 'snapshot', id, value })
    return id
  }),
  deleteDocumentOf: vi.fn(async (_c: unknown, kind: string, id: string) => {
    attempt('deleteDocumentOf')
    if (kind !== 'snapshot' && kind !== 'goals') throw new Error(`deleted a ${kind}`)
    db.rows = db.rows.filter((row) => !(row.kind === kind && row.id === id))
  }),
  deleteAllDrafts: vi.fn(async () => {
    attempt('deleteAllDrafts')
    db.drafts = 0
  }),
}))

// Same contract as the store: no id inserts under a new one, an id updates and must exist.
function save(kind: Row['kind'], value: unknown, id?: string): string {
  if (id === undefined) {
    if ((kind === 'profile' || kind === 'settings') && db.rows.some((row) => row.kind === kind)) {
      throw new Error(`a second ${kind} (23505)`)
    }
    const newId = `${kind}-${++db.counter}`
    db.rows.push({ kind, id: newId, value })
    return newId
  }
  const row = db.rows.find((r) => r.kind === kind && r.id === id)
  if (!row) throw new Error(`No ${kind} document ${id} to update`)
  row.value = value
  return id
}

vi.mock('@/lib/model/repository', () => repository)

const client = {} as SupabaseClient
const KEY = {} as CryptoKey

const loaded = <T,>(row: Row) => ({ id: row.id, value: row.value as T, updatedAt: '2026-11-09T10:00:00Z' })

// The model as a reload would read it from the database (rows in storage order).
function reloaded(): Model {
  const profile = db.rows.find((row) => row.kind === 'profile')
  const settings = db.rows.find((row) => row.kind === 'settings')
  return {
    profile: profile ? loaded<Profile>(profile) : null,
    snapshots: db.rows.filter((row) => row.kind === 'snapshot').map((row) => loaded<Snapshot>(row)),
    goals: db.rows.filter((row) => row.kind === 'goals').map((row) => loaded<GoalAllocation>(row)),
    settings: settings ? loaded<Settings>(settings) : null,
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
  }
}

function model(partial: Partial<Model> = {}): Model {
  return { ...reloaded(), ...partial }
}

function imported(): ImportedData {
  const profile = { ...fixtureProfile(), firstLaunch: { planned: [], finished: [], complete: true } }
  return {
    profile,
    snapshots: fixtureSnapshots().map((value, index) => ({ id: `import-snapshot-${index + 1}`, value })),
    goals: fixtureGoals(),
    settings: fixtureSettings(),
  }
}

// Every delete the repository was asked for, as `kind:id`.
const deletes = () => repository.deleteDocumentOf.mock.calls.map(([, kind, id]) => `${kind}:${id}`)

function neverDeletedProfileOrSettings() {
  for (const [, kind] of repository.deleteDocumentOf.mock.calls) expect(['snapshot', 'goals']).toContain(kind)
}

beforeEach(() => {
  db.rows = []
  db.drafts = 0
  db.calls = []
  db.failing = new Map()
  db.counter = 0
  for (const fn of Object.values(repository)) fn.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  neverDeletedProfileOrSettings()
  vi.restoreAllMocks()
})

describe('isVaultEmpty', () => {
  const establishment = { id: 'e', name: 'BoursoBank', kind: 'institution' as const }
  const profileWith = (profile: Partial<Profile>) => ({
    id: 'p',
    value: { ...EMPTY_PROFILE, ...profile },
    updatedAt: 'x',
  })
  const none = { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 }

  test('no profile and nothing unreadable: empty', () => {
    expect(isVaultEmpty(model())).toBe(true)
  })

  test('a profile with no establishment: empty, even with leftovers', () => {
    const leftovers = model({
      profile: profileWith({}),
      snapshots: [{ id: 's', value: fixtureSnapshots()[0], updatedAt: 'x' }],
      goals: [{ id: 'g', value: fixtureGoals()[0], updatedAt: 'x' }],
    })
    expect(isVaultEmpty(leftovers)).toBe(true)
  })

  test('a profile with an establishment: not empty', () => {
    expect(isVaultEmpty(model({ profile: profileWith({ establishments: [establishment] }) }))).toBe(false)
  })

  test('a first launch marked complete: not empty', () => {
    const complete = profileWith({ firstLaunch: { planned: [], finished: [], complete: true } })
    expect(isVaultEmpty(model({ profile: complete }))).toBe(false)
  })

  test('a profile with no firstLaunch and no establishment, with relevés and goals: not empty, nothing deleted', async () => {
    const older: Profile = { schema: 1, establishments: [], accounts: [], lines: [] }
    db.rows = [
      { kind: 'profile', id: 'p', value: older },
      { kind: 'goals', id: 'g1', value: fixtureGoals()[0] },
      { kind: 'snapshot', id: 's1', value: fixtureSnapshots()[0] },
    ]
    const vault = reloaded()
    expect(isVaultEmpty(vault)).toBe(false)
    await expect(clearLeftovers(client, vault)).rejects.toThrow()
    await expect(saveImport(client, KEY, vault, imported())).rejects.toThrow()
    expect(db.calls).toEqual([])
    expect(db.rows.map((row) => row.id)).toEqual(['p', 'g1', 's1'])
  })

  test.each(['profile', 'snapshots', 'goals', 'settings', 'draft'] as const)(
    'an unreadable %s: not empty',
    (kind) => {
      expect(isVaultEmpty(model({ unreadable: { ...none, [kind]: 1 } }))).toBe(false)
      expect(isVaultEmpty(model({ profile: profileWith({}), unreadable: { ...none, [kind]: 1 } }))).toBe(false)
    },
  )
})

describe('clearLeftovers', () => {
  test('deletes every snapshot, goal and draft, one after the other, and nothing else', async () => {
    db.rows = [
      { kind: 'profile', id: 'p', value: EMPTY_PROFILE },
      { kind: 'settings', id: 'st', value: DEFAULT_SETTINGS },
      { kind: 'goals', id: 'g1', value: fixtureGoals()[0] },
      { kind: 'snapshot', id: 's1', value: fixtureSnapshots()[0] },
      { kind: 'snapshot', id: 's2', value: fixtureSnapshots()[1] },
    ]
    db.drafts = 1
    await clearLeftovers(client, reloaded())
    expect(deletes()).toEqual(['snapshot:s1', 'snapshot:s2', 'goals:g1'])
    expect(repository.deleteAllDrafts).toHaveBeenCalledOnce()
    expect(db.rows.map((row) => row.id)).toEqual(['p', 'st'])
    expect(db.drafts).toBe(0)
  })

  test('refuses a vault that is not empty, and deletes nothing', async () => {
    const full = model({ profile: { id: 'p', value: fixtureProfile(), updatedAt: 'x' } })
    await expect(clearLeftovers(client, full)).rejects.toThrow()
    expect(db.calls).toEqual([])
  })
})

describe('saveImport', () => {
  test('the write order: placeholder profile, settings, goals, snapshots oldest first, the profile last', async () => {
    const data = imported()
    await saveImport(client, KEY, model(), data)

    expect(db.calls).toEqual([
      'deleteAllDrafts',
      'saveProfile',
      'saveSettings',
      'addGoal',
      'addGoal',
      'addSnapshot',
      'addSnapshot',
      'addSnapshot',
      'saveProfile',
    ])
    // The placeholder first, to get the profile's id; the imported profile last, over it.
    const [placeholder, last] = repository.saveProfile.mock.calls
    expect(placeholder[2]).toEqual(EMPTY_PROFILE)
    expect(placeholder[3]).toBeUndefined()
    expect(last[2]).toEqual(data.profile)
    expect(last[3]).toBe('profile-1')
    // Settings inserted (there were none), goals in data order, snapshots under the import's ids.
    expect(repository.saveSettings.mock.calls[0][3]).toBeUndefined()
    expect(repository.addGoal.mock.calls.map((call) => call[2])).toEqual(data.goals)
    expect(repository.addSnapshot.mock.calls.map((call) => call[3])).toEqual([
      'import-snapshot-1',
      'import-snapshot-2',
      'import-snapshot-3',
    ])
    expect(repository.addSnapshot.mock.calls.map((call) => call[2])).toEqual(data.snapshots.map((s) => s.value))

    const after = reloaded()
    expect(after.profile?.value).toEqual(data.profile)
    expect(after.settings?.value).toEqual(data.settings)
    expect(after.goals.map((g) => g.value)).toEqual(data.goals)
    expect(after.snapshots.map((s) => s.id)).toEqual(['import-snapshot-1', 'import-snapshot-2', 'import-snapshot-3'])
  })

  test('the empty placeholder profile is one the loaders accept', () => {
    expect(parseProfile(EMPTY_PROFILE)).toEqual(EMPTY_PROFILE)
  })

  test('two goals of the same day are written in data order, one after the other', async () => {
    const data = imported()
    const first = { schema: 1 as const, validFrom: '2026-10-01', shares: { available: 10, secured: 40, markets: 45, gold: 5, rental: 0 } }
    const second = { schema: 1 as const, validFrom: '2026-10-01', shares: { available: 30, secured: 30, markets: 35, gold: 5, rental: 0 } }
    data.goals = [first, second]

    // The second goal is not asked for before the first one is written.
    let firstWritten = false
    repository.addGoal.mockImplementationOnce(async (_c, _k, value) => {
      await Promise.resolve()
      firstWritten = true
      return save('goals', value)
    })
    repository.addGoal.mockImplementationOnce(async (_c, _k, value) => {
      expect(firstWritten).toBe(true)
      return save('goals', value)
    })
    await saveImport(client, KEY, model(), data)
    expect(reloaded().goals.map((g) => g.value)).toEqual([first, second])
  })

  test('an existing empty profile and settings are written over by their id, never deleted', async () => {
    db.rows = [
      { kind: 'profile', id: 'p-old', value: EMPTY_PROFILE },
      { kind: 'settings', id: 'st-old', value: DEFAULT_SETTINGS },
    ]
    const data = imported()
    await saveImport(client, KEY, reloaded(), data)

    expect(repository.saveProfile).toHaveBeenCalledOnce()
    expect(repository.saveProfile.mock.calls[0][3]).toBe('p-old')
    expect(repository.saveSettings.mock.calls[0][3]).toBe('st-old')
    expect(deletes()).toEqual([])
    expect(reloaded().profile).toMatchObject({ id: 'p-old', value: data.profile })
    expect(reloaded().settings).toMatchObject({ id: 'st-old', value: data.settings })
  })

  test('leftovers (snapshots, goals, drafts) are deleted before anything is written', async () => {
    db.rows = [
      { kind: 'profile', id: 'p', value: EMPTY_PROFILE },
      { kind: 'goals', id: 'old-goal', value: fixtureGoals()[0] },
      { kind: 'snapshot', id: 'old-snapshot', value: fixtureSnapshots()[0] },
    ]
    await saveImport(client, KEY, reloaded(), imported())

    expect(db.calls.slice(0, 3)).toEqual(['deleteDocumentOf', 'deleteDocumentOf', 'deleteAllDrafts'])
    expect(deletes()).toEqual(['snapshot:old-snapshot', 'goals:old-goal'])
    expect(reloaded().snapshots.map((s) => s.id)).toEqual(['import-snapshot-1', 'import-snapshot-2', 'import-snapshot-3'])
    expect(reloaded().goals).toHaveLength(2)
  })

  const none = { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 }
  test.each<[string, () => Model]>([
    ['the profile has an establishment', () => model({ profile: { id: 'p', value: fixtureProfile(), updatedAt: 'x' } })],
    ['the profile cannot be read', () => model({ unreadable: { ...none, profile: 1 } })],
    ['a snapshot cannot be read', () => model({ unreadable: { ...none, snapshots: 1 } })],
    ['a goal cannot be read', () => model({ unreadable: { ...none, goals: 2 } })],
    ['the settings cannot be read', () => model({ unreadable: { ...none, settings: 1 } })],
    ['the draft cannot be read', () => model({ unreadable: { ...none, draft: 1 } })],
    [
      'the first launch is marked complete',
      () =>
        model({
          profile: { id: 'p', value: { ...EMPTY_PROFILE, firstLaunch: { planned: [], finished: [], complete: true } }, updatedAt: 'x' },
        }),
    ],
  ])('refused when %s: nothing is deleted or written', async (_, vault) => {
    await expect(saveImport(client, KEY, vault(), imported())).rejects.toThrow()
    expect(db.calls).toEqual([])
  })

  test('a failure on the second snapshot deletes the goals and the snapshots this call wrote, then rethrows', async () => {
    db.failing.set('addSnapshot#2', 1)
    await expect(saveImport(client, KEY, model(), imported())).rejects.toThrow('offline at addSnapshot#2')

    // The second snapshot is deleted too: its answer may have been lost after it was written.
    expect(deletes()).toEqual(['snapshot:import-snapshot-2', 'snapshot:import-snapshot-1', 'goals:goals-4', 'goals:goals-3'])
    expect(db.rows.filter((row) => row.kind === 'snapshot' || row.kind === 'goals')).toEqual([])
    // The profile was never written over: the placeholder stays, with no establishment.
    expect(repository.saveProfile).toHaveBeenCalledOnce()
    expect(isVaultEmpty(reloaded())).toBe(true)
  })

  test('a clean-up that fails is logged and does not replace the first error', async () => {
    db.failing.set('addSnapshot#2', 1)
    db.failing.set('deleteDocumentOf#1', 1)
    await expect(saveImport(client, KEY, model(), imported())).rejects.toThrow('offline at addSnapshot#2')
    expect(console.error).toHaveBeenCalled()
    // The other clean-ups still ran.
    expect(repository.deleteDocumentOf).toHaveBeenCalledTimes(4)
  })

  test('a failure of the profile write deletes nothing and rethrows', async () => {
    db.failing.set('saveProfile#2', 1)
    await expect(saveImport(client, KEY, model(), imported())).rejects.toThrow('offline at saveProfile#2')
    expect(deletes()).toEqual([])
    expect(reloaded().snapshots).toHaveLength(3)
  })

  test('a second call after a failure, with the reloaded model, succeeds with the same snapshot ids', async () => {
    const data = imported()
    db.failing.set('addSnapshot#3', 1)
    // A clean-up that fails too, so the second call meets real leftovers.
    db.failing.set('deleteDocumentOf#2', 1)
    await expect(saveImport(client, KEY, model(), data)).rejects.toThrow()
    const firstIds = repository.addSnapshot.mock.calls.map((call) => call[3])
    expect(reloaded().snapshots.length).toBeGreaterThan(0)

    repository.addSnapshot.mockClear()
    await saveImport(client, KEY, reloaded(), data)
    const secondIds = repository.addSnapshot.mock.calls.map((call) => call[3])

    expect(firstIds).toEqual(['import-snapshot-1', 'import-snapshot-2', 'import-snapshot-3'])
    expect(secondIds).toEqual(['import-snapshot-1', 'import-snapshot-2', 'import-snapshot-3'])
    const after = reloaded()
    expect(after.profile?.value).toEqual(data.profile)
    expect(after.snapshots.map((s) => s.id)).toEqual(secondIds)
    expect(after.goals.map((g) => g.value)).toEqual(data.goals)
    expect(after.settings?.value).toEqual(data.settings)
    expect(db.rows.filter((row) => row.kind === 'profile')).toHaveLength(1)
    expect(db.rows.filter((row) => row.kind === 'settings')).toHaveLength(1)
  })

  test('a second call after a failed profile write, with the reloaded model, is refused: the import is there', async () => {
    // The write landed but its answer was lost.
    repository.saveProfile.mockImplementationOnce(async (_c, _k, value, id) => {
      attempt('saveProfile')
      return save('profile', value, id)
    })
    repository.saveProfile.mockImplementationOnce(async (_c, _k, value, id) => {
      save('profile', value, id)
      throw new Error('answer lost')
    })
    await expect(saveImport(client, KEY, model(), imported())).rejects.toThrow('answer lost')
    expect(deletes()).toEqual([])
    await expect(saveImport(client, KEY, reloaded(), imported())).rejects.toThrow()
    expect(reloaded().snapshots).toHaveLength(3)
  })
})
