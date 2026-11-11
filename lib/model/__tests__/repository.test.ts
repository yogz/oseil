import { describe, expect, test } from 'vitest'
import { signIn, signUp } from '@/lib/auth/account'
import { memoryKeyStore } from '@/lib/vault/device'
import { saveDocument } from '@/lib/vault/store'
import { fakeSupabase } from '@/lib/vault/__tests__/fake-supabase'
import { DEFAULT_SETTINGS } from '../documents'
import {
  DocumentChangedError,
  InvalidDocumentError,
  addGoal,
  createDraft,
  deleteDraft,
  listUpdateDocuments,
  loadDraft,
  loadGoals,
  loadModelDocuments,
  loadProfile,
  loadSettings,
  loadSnapshots,
  saveDraft,
  saveProfile,
  saveSettings,
  saveSnapshot,
} from '../repository'
import { amountEntry, exampleProfile, exampleSnapshot } from './fixtures'
import type { UpdateDraft } from '../types'

async function signedIn() {
  const server = fakeSupabase()
  const client = server.client()
  const keys = memoryKeyStore()
  await signUp(client, { email: 'a@b.fr', password: 'correct horse battery', redirectTo: 'http://x' })
  await signIn(client, keys, { email: 'a@b.fr', password: 'correct horse battery' })
  const dataKey = (await keys.get(server.user!.id))!
  return { server, client, dataKey }
}

const goal = { schema: 1 as const, validFrom: '2026-01-01', shares: { available: 15, secured: 35, markets: 45, gold: 5, rental: 0 } }

describe('loading the whole model', () => {
  test('asks the server who is signed in once, not once per kind of document', async () => {
    const { server, client, dataKey } = await signedIn()
    await saveProfile(client, dataKey, exampleProfile)
    await addGoal(client, dataKey, goal)
    const before = server.recorded.length

    const read = await loadModelDocuments(client, dataKey)

    const asked = server.recorded.slice(before)
    expect(asked.filter((request) => request.path.startsWith('/auth/v1/user'))).toHaveLength(1)
    expect(asked.filter((request) => request.path.startsWith('/rest/v1/documents'))).toHaveLength(5)
    expect(read.profile).toEqual(await loadProfile(client, dataKey))
    expect(read.snapshots).toEqual(await loadSnapshots(client, dataKey))
    expect(read.goals).toEqual(await loadGoals(client, dataKey))
    expect(read.settings).toEqual(await loadSettings(client, dataKey))
    expect(read.draft).toEqual(await loadDraft(client, dataKey))
  })

  test('reads nothing without a signed-in person', async () => {
    const { server, dataKey } = await signedIn()
    await expect(loadModelDocuments(server.client(), dataKey)).rejects.toThrow()
  })
})

describe('repository', () => {
  test('a saved profile reads back identical, and saving again updates it', async () => {
    const { client, dataKey } = await signedIn()
    expect(await loadProfile(client, dataKey)).toEqual({ profile: null, unreadable: 0 })

    const id = await saveProfile(client, dataKey, exampleProfile)
    const { profile, unreadable } = await loadProfile(client, dataKey)
    expect(unreadable).toBe(0)
    expect(profile).toEqual({ id, value: exampleProfile, updatedAt: expect.any(String), createdAt: expect.any(String) })

    expect(await saveProfile(client, dataKey, exampleProfile, id)).toBe(id)
    expect((await loadProfile(client, dataKey)).profile?.id).toBe(id)
  })

  test('settings are saved and read back', async () => {
    const { client, dataKey } = await signedIn()
    expect(await loadSettings(client, dataKey)).toEqual({ settings: null, unreadable: 0 })
    const settings = { ...DEFAULT_SETTINGS, hideAmounts: true }
    const id = await saveSettings(client, dataKey, settings)
    expect((await loadSettings(client, dataKey)).settings).toEqual({
      id, value: settings, updatedAt: expect.any(String), createdAt: expect.any(String),
    })
  })

  test('an unreadable profile is reported, not mistaken for no profile', async () => {
    const { server, client, dataKey } = await signedIn()
    await saveProfile(client, dataKey, exampleProfile)
    server.tables.documents[0].ciphertext = 'AAAA'
    expect(await loadProfile(client, dataKey)).toEqual({ profile: null, unreadable: 1 })

    await saveSettings(client, dataKey, DEFAULT_SETTINGS)
    server.tables.documents[1].ciphertext = 'AAAA'
    expect(await loadSettings(client, dataKey)).toEqual({ settings: null, unreadable: 1 })
  })

  test('snapshots come back by date, and an unreadable or malformed one does not hide the others', async () => {
    const { server, client, dataKey } = await signedIn()
    const later = await saveSnapshot(client, dataKey, { ...exampleSnapshot, takenOn: '2026-10-31' })
    const earlier = await saveSnapshot(client, dataKey, exampleSnapshot)
    const broken = await saveSnapshot(client, dataKey, exampleSnapshot)
    await saveDocument(client, dataKey, { kind: 'snapshot', value: { schema: 2 } })
    server.tables.documents.find((row) => row.id === broken)!.ciphertext = 'AAAA'

    const { snapshots, unreadable } = await loadSnapshots(client, dataKey)
    expect(unreadable).toBe(2)
    expect(snapshots.map((s) => [s.id, s.value.takenOn])).toEqual([
      [earlier, '2026-09-30'],
      [later, '2026-10-31'],
    ])

    expect(await saveSnapshot(client, dataKey, { ...exampleSnapshot, takenOn: '2026-08-31' }, earlier)).toBe(earlier)
    expect((await loadSnapshots(client, dataKey)).snapshots[0].value.takenOn).toBe('2026-08-31')
  })

  test('adding a goal twice keeps two allocations', async () => {
    const { client, dataKey } = await signedIn()
    const first = await addGoal(client, dataKey, goal)
    const second = await addGoal(client, dataKey, { ...goal, validFrom: '2026-06-01' })
    expect(second).not.toBe(first)
    const { goals, unreadable } = await loadGoals(client, dataKey)
    expect(unreadable).toBe(0)
    expect(goals.map((g) => g.value.validFrom)).toEqual(['2026-01-01', '2026-06-01'])
  })

  test('nothing describing the situation leaves the device in clear', async () => {
    const { server, client, dataKey } = await signedIn()
    await saveProfile(client, dataKey, exampleProfile)
    await saveSnapshot(client, dataKey, exampleSnapshot)
    const sent = server.recorded.map((r) => [r.path, JSON.stringify(r.headers), r.body ?? ''].join('\n')).join('\n')
    expect(sent).toContain('ciphertext')
    // Not the bare 8000: it can occur in the hex of a UUID.
    for (const clear of ['BoursoBank', 'Livret A', 'Linxea', '800000']) expect(sent).not.toContain(clear)
  })

  test('a value the loaders would refuse is not saved, and nothing is sent', async () => {
    const { server, client, dataKey } = await signedIn()
    const before = server.recorded.length
    const badProfile = { ...exampleProfile, lines: [{ ...exampleProfile.lines[0], accountId: 'nowhere' }] }
    const badSnapshot = { ...exampleSnapshot, takenOn: '2026-9-1' }
    const badGoal = { ...goal, shares: { ...goal.shares, gold: 4 } }
    const badSettings = { ...DEFAULT_SETTINGS, budget: { basis: 'salary' as const, monthly: 28.999999999999996 } }

    await expect(saveProfile(client, dataKey, badProfile)).rejects.toBeInstanceOf(InvalidDocumentError)
    await expect(saveSnapshot(client, dataKey, badSnapshot)).rejects.toBeInstanceOf(InvalidDocumentError)
    await expect(addGoal(client, dataKey, badGoal)).rejects.toBeInstanceOf(InvalidDocumentError)
    await expect(saveSettings(client, dataKey, badSettings)).rejects.toBeInstanceOf(InvalidDocumentError)
    expect(server.recorded.length).toBe(before)
    expect(server.tables.documents).toHaveLength(0)
  })

  describe('the update draft', () => {
    const draft: UpdateDraft = {
      schema: 1,
      basedOn: 'snapshot-1',
      values: [amountEntry('livret-a-line', 13_000, '2026-11-07')],
      confirmed: [],
      progress: { boursobank: 'done' },
      contributions: {},
      added: {
        accounts: [],
        lines: [{ id: 'quartier', accountId: 'livret-a', name: 'Livret du quartier', kind: 'amount', currency: 'EUR' }],
      },
      arrivals: {},
      closed: [],
      takenOn: null,
    }

    const V1 = '2026-11-08T10:00:00.000Z'
    const V2 = '2026-11-08T11:00:00.000Z'
    const V3 = '2026-11-08T12:00:00.000Z'

    test('a created draft reads back identical with its version, and saving it updates the same row', async () => {
      const { server, client, dataKey } = await signedIn()
      expect(await loadDraft(client, dataKey)).toEqual({ draft: null, unreadable: 0 })

      const id = crypto.randomUUID()
      expect(await createDraft(client, dataKey, draft, id, { versions: [V1], version: V1 })).toBe(id)
      expect((await loadDraft(client, dataKey)).draft).toEqual({ id, value: draft, updatedAt: V1, createdAt: expect.any(String) })

      const changed = { ...draft, confirmed: ['current-line'] }
      expect(await saveDraft(client, dataKey, changed, { id, versions: [V1], version: V2 })).toBe(id)
      expect(server.tables.documents).toHaveLength(1)
      expect((await loadDraft(client, dataKey)).draft).toEqual({ id, value: changed, updatedAt: V2, createdAt: expect.any(String) })
    })

    test('a draft saved on a version another device has replaced is refused, and the newer one stays', async () => {
      const { client, dataKey } = await signedIn()
      const id = crypto.randomUUID()
      await createDraft(client, dataKey, draft, id, { versions: [V1], version: V1 })
      // The other device read V1, then wrote V2.
      const theirs = { ...draft, confirmed: ['current-line'] }
      await saveDraft(client, dataKey, theirs, { id, versions: [V1], version: V2 })
      // This tab still holds V1.
      await expect(
        saveDraft(client, dataKey, { ...draft, progress: {} }, { id, versions: [V1], version: V3 }),
      ).rejects.toBeInstanceOf(DocumentChangedError)
      expect((await loadDraft(client, dataKey)).draft).toEqual({ id, value: theirs, updatedAt: V2, createdAt: expect.any(String) })
    })

    test('the ids of the snapshots and of the draft, and of nothing else', async () => {
      const { client, dataKey } = await signedIn()
      await saveProfile(client, dataKey, exampleProfile)
      const snapshot = await saveSnapshot(client, dataKey, exampleSnapshot)
      const id = crypto.randomUUID()
      await createDraft(client, dataKey, draft, id, { versions: [V1], version: V1 })
      expect(await listUpdateDocuments(client)).toEqual(
        expect.arrayContaining([
          { id: snapshot, kind: 'snapshot' },
          { id, kind: 'draft' },
        ]),
      )
      expect(await listUpdateDocuments(client)).toHaveLength(2)
    })

    test('deleting the draft leaves none', async () => {
      const { client, dataKey } = await signedIn()
      const id = await createDraft(client, dataKey, draft, crypto.randomUUID(), { versions: [V1], version: V1 })
      await deleteDraft(client, id)
      expect(await loadDraft(client, dataKey)).toEqual({ draft: null, unreadable: 0 })
    })

    test('a malformed draft counts as unreadable, and there is no draft', async () => {
      const { client, dataKey } = await signedIn()
      await saveDocument(client, dataKey, { kind: 'draft', value: { schema: 2 } })
      expect(await loadDraft(client, dataKey)).toEqual({ draft: null, unreadable: 1 })
    })

    test('a draft that would not be read back is not saved', async () => {
      const { server, client, dataKey } = await signedIn()
      const bad = { ...draft, basedOn: '' }
      await expect(createDraft(client, dataKey, bad, crypto.randomUUID(), { versions: [V1], version: V1 })).rejects.toBeInstanceOf(InvalidDocumentError)
      const id = await createDraft(client, dataKey, draft, crypto.randomUUID(), { versions: [V1], version: V1 })
      const sent = server.recorded.length
      await expect(saveDraft(client, dataKey, bad, { id, versions: [V1], version: V2 })).rejects.toBeInstanceOf(
        InvalidDocumentError,
      )
      expect(server.recorded.length).toBe(sent)
      expect((await loadDraft(client, dataKey)).draft?.value).toEqual(draft)
    })

    test('nothing in it leaves the device in clear', async () => {
      const { server, client, dataKey } = await signedIn()
      const id = crypto.randomUUID()
      await createDraft(client, dataKey, draft, id, { versions: [V1], version: V1 })
      await saveDraft(client, dataKey, {
        ...draft,
        values: [amountEntry('livret-a-line', 13_000, '2026-11-07')],
      }, { id, versions: [V1], version: V2 })
      await listUpdateDocuments(client)
      const sent = server.recorded.map((r) => [r.path, JSON.stringify(r.headers), r.body ?? ''].join('\n')).join('\n')
      expect(sent).toContain('ciphertext')
      expect(sent).not.toContain('1300000')
      expect(sent).not.toContain('quartier')
    })
  })
})
