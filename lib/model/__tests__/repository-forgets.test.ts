import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import {
  forgetEverything,
  modelMark,
  rememberModel,
  rememberVault,
  rememberedModel,
  rememberedVault,
  vaultMark,
} from '@/lib/app/session-memory'
import { DEFAULT_SETTINGS } from '../documents'
import * as repository from '../repository'
import type { UpdateDraft } from '../types'
import { amountEntry, exampleProfile, exampleSnapshot } from './fixtures'

// The store's writes, held open so the test sees what happens while one is under way.
const store = vi.hoisted(() => ({ write: vi.fn() }))
vi.mock('@/lib/vault/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/vault/store')>()),
  saveDocument: store.write,
  saveDocumentIfUnchanged: store.write,
  insertDocument: store.write,
  deleteDocument: store.write,
  deleteDrafts: store.write,
}))

const KEY = {} as CryptoKey
const client = {} as SupabaseClient
const model: Model = {
  profile: null,
  snapshots: [],
  goals: [],
  settings: null,
  draft: null,
  unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
}
const draft: UpdateDraft = {
  schema: 1,
  basedOn: 'snapshot-1',
  values: [amountEntry('livret-a-line', 13_000, '2026-11-07')],
  confirmed: [],
  progress: { boursobank: 'done' },
  contributions: {},
  added: { accounts: [], lines: [] },
  arrivals: {},
  closed: [],
  takenOn: null,
}
const goal = { schema: 1 as const, validFrom: '2026-01-01', shares: { available: 15, secured: 35, markets: 45, gold: 5, rental: 0 } }

const WRITES: Array<[string, () => Promise<unknown>]> = [
  ['saveProfile', () => repository.saveProfile(client, KEY, exampleProfile)],
  ['saveSnapshot', () => repository.saveSnapshot(client, KEY, exampleSnapshot)],
  ['addGoal', () => repository.addGoal(client, KEY, goal)],
  ['saveSettings', () => repository.saveSettings(client, KEY, DEFAULT_SETTINGS)],
  ['saveDraft', () => repository.saveDraft(client, KEY, draft, { id: 'd', versions: ['v'], version: 'w' })],
  ['deleteDraft', () => repository.deleteDraft(client, 'd')],
  ['deleteAllDrafts', () => repository.deleteAllDrafts(client)],
  ['deleteDocumentOf', () => repository.deleteDocumentOf(client, 'snapshot', 's')],
  ['addSnapshot', () => repository.addSnapshot(client, KEY, exampleSnapshot, 's')],
  ['createDraft', () => repository.createDraft(client, KEY, draft, 'd', { versions: ['v'], version: 'w' })],
]

// A write the store has not answered yet, and the means to answer it.
function heldWrite() {
  let answer: (outcome: { fails: boolean }) => void = () => {}
  store.write.mockReset().mockReturnValue(
    new Promise((resolve, reject) => {
      answer = ({ fails }) => (fails ? reject(new Error('offline')) : resolve('id'))
    }),
  )
  return answer
}

function remembered() {
  rememberVault({ userId: 'someone', dataKey: KEY }, vaultMark())
  rememberModel({ userId: 'someone', model, client }, modelMark())
}

beforeEach(forgetEverything)

describe('a write to the stored documents', () => {
  // Whatever its name: every function the repository exports is a write, unless it is one of
  // its readers. A new writer cannot escape the list by being called update… or remove….
  test('every write of the repository is in this list', () => {
    const readers = (name: string) => /^(load|list)/.test(name) || name === 'profileVersion'
    const errors = (value: unknown) => typeof value === 'function' && value.prototype instanceof Error
    const writes = Object.entries(repository)
      .filter(([name, value]) => typeof value === 'function' && !errors(value) && !readers(name))
      .map(([name]) => name)
    expect(writes.sort()).toEqual(WRITES.map(([name]) => name).sort())
  })

  test.each(WRITES)('%s forgets the remembered model as soon as it is called, and keeps the vault', async (_, write) => {
    const answer = heldWrite()
    remembered()

    const writing = write()
    expect(rememberedModel('someone')).toBeNull()
    expect(rememberedVault()).toEqual({ userId: 'someone', dataKey: KEY })

    answer({ fails: false })
    await writing
    expect(store.write).toHaveBeenCalledOnce()
  })

  // What a reading begun during the write holds may be what the write replaces.
  test.each(WRITES)('%s: a reading begun while it was under way is not remembered, even when it fails', async (_, write) => {
    const answer = heldWrite()
    const writing = write()
    const readingBegan = modelMark()

    answer({ fails: true })
    await expect(writing).rejects.toThrow('offline')
    rememberModel({ userId: 'someone', model, client }, readingBegan)
    expect(rememberedModel('someone')).toBeNull()
  })
})

// The profile and the settings (one per person) are written over, never deleted.
test.each(['profile', 'settings', 'draft'])('deleteDocumentOf refuses a %s and deletes nothing', async (kind) => {
  store.write.mockReset()
  await expect(repository.deleteDocumentOf(client, kind as 'snapshot', 'x')).rejects.toThrow()
  expect(store.write).not.toHaveBeenCalled()
})
