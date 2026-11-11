import { describe, expect, test, vi } from 'vitest'
import {
  modelMark,
  rememberModel,
  rememberVault,
  rememberedModel,
  rememberedVault,
  vaultMark,
} from '@/lib/app/session-memory'
import { WrongCredentialsError, signIn, signUp } from '@/lib/auth/account'
import { memoryKeyStore } from '../device'
import { deriveSecrets } from '../kdf'
import { InvalidRecoveryKeyError, generateRecoveryKey, recoveryKeyFromDisplay, unwrapDataKey } from '../keys'
import type { Sealed } from '../seal'
import {
  DocumentChangedError,
  changePassword,
  confirmRecoveryKeySeen,
  isRecoveryKeyConfirmed,
  remakeRecoveryKey,
  EmailMismatchError,
  PasswordHalfChangedError,
  PasswordTooShortError,
  WrongPasswordError,
  deleteDocument,
  deleteDrafts,
  insertDocument,
  listDocumentIds,
  loadDocuments,
  resetWithRecoveryKey,
  saveDocument,
  saveDocumentIfUnchanged,
  startOver,
  unlockVault,
} from '../store'
import { fakeSupabase, type FakeSupabase } from './fake-supabase'

const EMAIL = 'a@b.fr'
const PASSWORD = 'correct horse battery'
const NEW_PASSWORD = 'staple battery horse'
const RECOVERY_FORMAT = /^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/

async function signedInWithDocument(server: FakeSupabase) {
  const client = server.client()
  const keys = memoryKeyStore()
  await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: 'http://x' })
  const first = await signIn(client, keys, { email: EMAIL, password: PASSWORD })
  if (first.status !== 'new-vault') throw new Error('expected a new vault')
  const userId = server.user!.id
  const dataKey = (await keys.get(userId))!
  const documentId = await saveDocument(client, dataKey, { kind: 'profile', value: { name: 'Alix' } })
  return { client, userId, dataKey, documentId, recoveryDisplay: first.recoveryDisplay }
}

describe('store', () => {
  test('saves, updates and loads the documents of one kind', async () => {
    const server = fakeSupabase()
    const { client, dataKey, documentId } = await signedInWithDocument(server)

    expect(
      await saveDocument(client, dataKey, { kind: 'profile', id: documentId, value: { name: 'Alix B.' } }),
    ).toBe(documentId)
    expect(server.tables.documents).toHaveLength(1)
    expect(await loadDocuments(client, dataKey, 'profile')).toEqual({
      documents: [{ id: documentId, value: { name: 'Alix B.' }, updatedAt: expect.any(String), createdAt: expect.any(String) }],
      unreadable: [],
    })
    expect(await loadDocuments(client, dataKey, 'goals')).toEqual({ documents: [], unreadable: [] })
    await expect(
      saveDocument(client, dataKey, { kind: 'profile', id: crypto.randomUUID(), value: 1 }),
    ).rejects.toThrow()
  })

  test('a key that does not open the vault is a wrong password, not a crash', async () => {
    const server = fakeSupabase()
    const { client } = await signedInWithDocument(server)
    const { keyEncryptionKey } = await deriveSecrets('another long password', EMAIL)
    await expect(unlockVault(client, keyEncryptionKey)).rejects.toBeInstanceOf(WrongPasswordError)

    server.tables.vaults.length = 0
    expect(await unlockVault(client, keyEncryptionKey)).toBe('missing')
  })

  test('a recovery key typed by hand restores access with a new password', async () => {
    const server = fakeSupabase()
    const { client, documentId, recoveryDisplay } = await signedInWithDocument(server)
    const wrappedByRecovery = structuredClone(server.tables.vaults[0].wrapped_by_recovery)

    const typed = recoveryDisplay.toLowerCase().replace(/-/g, ' ')
    const dataKey = await resetWithRecoveryKey(client, {
      recoveryDisplay: typed,
      newPassword: NEW_PASSWORD,
      email: EMAIL,
    })
    expect(dataKey.extractable).toBe(false)
    expect(await loadDocuments(client, dataKey, 'profile')).toEqual({
      documents: [{ id: documentId, value: { name: 'Alix' }, updatedAt: expect.any(String), createdAt: expect.any(String) }],
      unreadable: [],
    })
    expect(server.tables.vaults[0].wrapped_by_recovery).toEqual(wrappedByRecovery)

    const laptop = server.client()
    const keys = memoryKeyStore()
    expect(await signIn(laptop, keys, { email: EMAIL, password: NEW_PASSWORD })).toEqual({
      status: 'unlocked',
      // Using the key confirmed it.
      faceId: { keyEncryptionKey: expect.any(CryptoKey), userId: server.user!.id, recoveryConfirmed: true },
    })
    expect(await loadDocuments(laptop, (await keys.get(server.user!.id))!, 'profile')).toEqual({
      documents: [{ id: documentId, value: { name: 'Alix' }, updatedAt: expect.any(String), createdAt: expect.any(String) }],
      unreadable: [],
    })
    await expect(
      signIn(server.client(), memoryKeyStore(), { email: EMAIL, password: PASSWORD }),
    ).rejects.toBeInstanceOf(WrongCredentialsError)
  })

  // The password change landed but its answer was lost: the retry finds the
  // password already set, and the vault is already resealed for it.
  test('a reset retried after the password was already changed still succeeds', async () => {
    const server = fakeSupabase()
    const { client, documentId, recoveryDisplay } = await signedInWithDocument(server)
    await resetWithRecoveryKey(client, { recoveryDisplay, newPassword: NEW_PASSWORD, email: EMAIL })

    const dataKey = await resetWithRecoveryKey(client, { recoveryDisplay, newPassword: NEW_PASSWORD, email: EMAIL })
    expect(server.recorded.filter((r) => r.method === 'PUT' && r.path.startsWith('/auth/v1/user')).at(-1)!.status).toBe(422)
    expect(await loadDocuments(client, dataKey, 'profile')).toEqual({
      documents: [{ id: documentId, value: { name: 'Alix' }, updatedAt: expect.any(String), createdAt: expect.any(String) }],
      unreadable: [],
    })
  })

  // Every document goes, and the vault with them: nothing the tab kept of them may come back.
  test('starting over forgets what the tab kept between screens, before erasing anything', async () => {
    const server = fakeSupabase()
    const { client, userId, dataKey } = await signedInWithDocument(server)
    rememberVault({ userId, dataKey }, vaultMark())
    rememberModel(
      {
        userId,
        client,
        model: {
          profile: null,
          snapshots: [],
          goals: [],
          settings: null,
          draft: null,
          unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
        },
      },
      modelMark(),
    )
    const mark = server.recorded.length

    const startingOver = startOver(client, { newPassword: NEW_PASSWORD, email: EMAIL })
    expect(rememberedVault()).toBeNull()
    expect(rememberedModel(userId)).toBeNull()
    expect(server.recorded.slice(mark).filter((r) => r.method === 'DELETE')).toEqual([])
    await startingOver
  })

  test('starting over retried after the password was already changed still succeeds', async () => {
    const server = fakeSupabase()
    const { client } = await signedInWithDocument(server)
    await startOver(client, { newPassword: NEW_PASSWORD, email: EMAIL })

    const fresh = await startOver(client, { newPassword: NEW_PASSWORD, email: EMAIL })
    expect(server.recorded.filter((r) => r.method === 'PUT' && r.path.startsWith('/auth/v1/user')).at(-1)!.status).toBe(422)
    expect(fresh.recoveryDisplay).toMatch(RECOVERY_FORMAT)
    expect(server.tables.vaults).toHaveLength(1)
  })

  test('a wrong recovery key changes nothing', async () => {
    const server = fakeSupabase()
    const { client } = await signedInWithDocument(server)
    const vaults = structuredClone(server.tables.vaults)
    const password = server.user!.password
    const mark = server.recorded.length

    const otherKey = (await generateRecoveryKey()).display
    await expect(
      resetWithRecoveryKey(client, { recoveryDisplay: otherKey, newPassword: NEW_PASSWORD, email: EMAIL }),
    ).rejects.toBeInstanceOf(InvalidRecoveryKeyError)
    await expect(
      resetWithRecoveryKey(client, { recoveryDisplay: 'ABCD-EFGH', newPassword: NEW_PASSWORD, email: EMAIL }),
    ).rejects.toBeInstanceOf(InvalidRecoveryKeyError)

    const after = server.recorded.slice(mark)
    expect(after.filter((r) => r.path.startsWith('/rest/v1/vaults') && r.method !== 'GET')).toEqual([])
    expect(after.filter((r) => r.method === 'PUT' && r.path.startsWith('/auth/v1/user'))).toEqual([])
    expect(server.tables.vaults).toEqual(vaults)
    expect(server.user!.password).toBe(password)
  })

  test("an address other than the session’s is refused before anything is written", async () => {
    const server = fakeSupabase()
    const { client, recoveryDisplay } = await signedInWithDocument(server)
    const tables = structuredClone(server.tables)
    const mark = server.recorded.length

    await expect(
      resetWithRecoveryKey(client, { recoveryDisplay, newPassword: NEW_PASSWORD, email: 'other@b.fr' }),
    ).rejects.toBeInstanceOf(EmailMismatchError)
    await expect(startOver(client, { newPassword: NEW_PASSWORD, email: 'other@b.fr' })).rejects.toBeInstanceOf(
      EmailMismatchError,
    )
    const after = server.recorded.slice(mark)
    expect(after.filter((r) => r.path.startsWith('/rest/v1/') && r.method !== 'GET')).toEqual([])
    expect(after.filter((r) => r.method === 'PUT' && r.path.startsWith('/auth/v1/user'))).toEqual([])
    expect(server.tables).toEqual(tables)

    // The same address typed differently is the same address.
    await expect(
      resetWithRecoveryKey(client, { recoveryDisplay, newPassword: NEW_PASSWORD, email: ' A@B.fr ' }),
    ).resolves.toBeInstanceOf(CryptoKey)
  })

  test('a recovery key renewed between the read and the write is refused and confirms nothing', async () => {
    const server = fakeSupabase()
    const { client, recoveryDisplay } = await signedInWithDocument(server)
    const password = server.user!.password
    const before = structuredClone(server.tables.vaults[0])
    // Another device renews the recovery key just before the reseal lands.
    server.beforeEachRequest((r) => {
      if (r.method === 'PATCH' && r.path.startsWith('/rest/v1/vaults')) {
        server.tables.vaults[0].wrapped_by_recovery = { iv: 'AAAAAAAAAAAAAAAA', ciphertext: 'AAAA' }
      }
    })
    const mark = server.recorded.length

    await expect(
      resetWithRecoveryKey(client, { recoveryDisplay, newPassword: NEW_PASSWORD, email: EMAIL }),
    ).rejects.toBeInstanceOf(InvalidRecoveryKeyError)
    expect(server.tables.vaults[0].recovery_confirmed_at).toBeNull()
    expect(server.tables.vaults[0].wrapped_by_password).toEqual(before.wrapped_by_password)
    expect(server.recorded.slice(mark).filter((r) => r.method === 'PUT' && r.path.startsWith('/auth/v1/user'))).toEqual([])
    expect(server.user!.password).toBe(password)
  })

  test('a reseal that lands on no vault does not change the password', async () => {
    const server = fakeSupabase()
    const { client, recoveryDisplay } = await signedInWithDocument(server)
    const password = server.user!.password
    // The vault disappears between the moment it is read and the moment it is resealed.
    server.beforeEachRequest((r) => {
      if (r.method === 'PATCH' && r.path.startsWith('/rest/v1/vaults')) server.tables.vaults.length = 0
    })
    const mark = server.recorded.length

    await expect(
      resetWithRecoveryKey(client, { recoveryDisplay, newPassword: NEW_PASSWORD, email: EMAIL }),
    ).rejects.toBeInstanceOf(InvalidRecoveryKeyError)
    expect(server.recorded.slice(mark).filter((r) => r.method === 'PUT' && r.path.startsWith('/auth/v1/user'))).toEqual([])
    expect(server.user!.password).toBe(password)
  })

  test('a new password under 10 characters is refused before anything is sent', async () => {
    const server = fakeSupabase()
    const { client, recoveryDisplay } = await signedInWithDocument(server)
    const mark = server.recorded.length

    await expect(
      resetWithRecoveryKey(client, { recoveryDisplay, newPassword: 'too short', email: EMAIL }),
    ).rejects.toBeInstanceOf(PasswordTooShortError)
    await expect(startOver(client, { newPassword: 'too short', email: EMAIL })).rejects.toBeInstanceOf(
      PasswordTooShortError,
    )
    expect(server.recorded.slice(mark)).toEqual([])
  })

  test('starting over also erases the Face ID packets and every passkey of the account', async () => {
    const server = fakeSupabase()
    const { client, userId } = await signedInWithDocument(server)
    server.tables.vault_passkeys.push({
      user_id: userId,
      credential_id: 'c1',
      passkey_id: crypto.randomUUID(),
      wrapped: { iv: 'AAAA', ciphertext: 'AAAA' },
    })
    server.authPasskeys.push(
      { id: 'p1', created_at: '2026-11-07T00:00:00Z' },
      { id: 'p2', created_at: '2026-11-07T00:00:00Z' },
    )
    const mark = server.recorded.length

    const fresh = await startOver(client, { newPassword: NEW_PASSWORD, email: EMAIL })
    expect(fresh.recoveryDisplay).toMatch(RECOVERY_FORMAT)
    expect(server.tables.vault_passkeys).toEqual([])
    expect(server.authPasskeys).toEqual([])

    const after = server.recorded.slice(mark)
    const deletes = after.filter((r) => r.method === 'DELETE')
    expect(deletes.map((r) => r.path)).toEqual([
      `/rest/v1/vault_passkeys?user_id=eq.${userId}`,
      '/auth/v1/passkeys/p1',
      '/auth/v1/passkeys/p2',
      `/rest/v1/documents?user_id=eq.${userId}`,
      `/rest/v1/vaults?user_id=eq.${userId}`,
    ])
    const passwordSet = after.findIndex((r) => r.method === 'PUT' && r.path.startsWith('/auth/v1/user'))
    expect(passwordSet).toBeGreaterThan(after.findIndex((r) => r.path.startsWith('/rest/v1/vaults') && r.method === 'DELETE'))
  })

  test('a failing passkey cleanup is logged and does not stop the new vault', async () => {
    const server = fakeSupabase()
    const { client } = await signedInWithDocument(server)
    server.failPasskeyListing()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const fresh = await startOver(client, { newPassword: NEW_PASSWORD, email: EMAIL })
      expect(fresh.recoveryDisplay).toMatch(RECOVERY_FORMAT)
      expect(server.tables.vaults).toHaveLength(1)
      expect(logged).toHaveBeenCalledWith('Could not list the passkeys of the account', expect.anything())
    } finally {
      logged.mockRestore()
    }
  })

  test('a passkey that cannot be deleted does not stop the others nor the new vault', async () => {
    const server = fakeSupabase()
    const { client } = await signedInWithDocument(server)
    for (const id of ['p1', 'p2', 'p3']) server.authPasskeys.push({ id, created_at: '2026-11-07T00:00:00Z' })
    server.failPasskeyDelete('p2')
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const fresh = await startOver(client, { newPassword: NEW_PASSWORD, email: EMAIL })
      expect(fresh.recoveryDisplay).toMatch(RECOVERY_FORMAT)
      expect(server.authPasskeys.map((p) => p.id)).toEqual(['p2'])
      expect(logged).toHaveBeenCalledTimes(1)
      expect(logged).toHaveBeenCalledWith('Could not delete a passkey of the account', expect.anything())
      expect(server.tables.vaults).toHaveLength(1)
    } finally {
      logged.mockRestore()
    }
  })

  test('when the Face ID packets cannot be erased, nothing else is touched', async () => {
    const server = fakeSupabase()
    const { client } = await signedInWithDocument(server)
    server.failPasskeyRowDelete()
    const before = structuredClone({ documents: server.tables.documents, vaults: server.tables.vaults })
    const password = server.user!.password
    const mark = server.recorded.length

    await expect(startOver(client, { newPassword: NEW_PASSWORD, email: EMAIL })).rejects.toThrow()
    expect({ documents: server.tables.documents, vaults: server.tables.vaults }).toEqual(before)
    expect(server.user!.password).toBe(password)
    expect(
      server.recorded.slice(mark).filter((r) => r.method === 'DELETE' && !r.path.includes('vault_passkeys')),
    ).toEqual([])
  })

  test('starting over leaves an empty vault and a new recovery key', async () => {
    const server = fakeSupabase()
    const { client, recoveryDisplay } = await signedInWithDocument(server)

    const fresh = await startOver(client, { newPassword: NEW_PASSWORD, email: EMAIL })
    expect(fresh.recoveryDisplay).toMatch(RECOVERY_FORMAT)
    expect(fresh.recoveryDisplay).not.toBe(recoveryDisplay)
    expect(await loadDocuments(client, fresh.dataKey, 'profile')).toEqual({
      documents: [],
      unreadable: [],
    })
    expect(server.tables.documents).toEqual([])
    expect(server.tables.vaults).toHaveLength(1)

    // The new key was shown but not confirmed yet: the next sign-in renews it.
    expect(
      await signIn(server.client(), memoryKeyStore(), { email: EMAIL, password: NEW_PASSWORD }),
    ).toEqual({ status: 'renewed-recovery', recoveryDisplay: expect.stringMatching(RECOVERY_FORMAT) })
    // The old recovery key opened the old vault only.
    await expect(
      resetWithRecoveryKey(client, { recoveryDisplay, newPassword: 'another long one', email: EMAIL }),
    ).rejects.toBeInstanceOf(InvalidRecoveryKeyError)
  })

  test('a new document gets its id on the device', async () => {
    const server = fakeSupabase()
    const { documentId } = await signedInWithDocument(server)
    const insert = server.recorded.find((r) => r.method === 'POST' && r.path.startsWith('/rest/v1/documents'))!
    const sent = JSON.parse(insert.body!)
    expect(sent.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(sent.id).toBe(documentId)
    expect(sent.format).toBe(1)
  })

  test('a packet moved to another document is unreadable', async () => {
    const server = fakeSupabase()
    const { client, dataKey } = await signedInWithDocument(server)
    const idA = await saveDocument(client, dataKey, { kind: 'goals', value: { n: 'A' } })
    const idB = await saveDocument(client, dataKey, { kind: 'goals', value: { n: 'B' } })
    const a = server.tables.documents.find((row) => row.id === idA)!
    const b = server.tables.documents.find((row) => row.id === idB)!
    b.iv = a.iv
    b.ciphertext = a.ciphertext

    expect(await loadDocuments(client, dataKey, 'goals')).toEqual({
      documents: [{ id: idA, value: { n: 'A' }, updatedAt: expect.any(String), createdAt: expect.any(String) }],
      unreadable: [idB],
    })
  })

  test('a document of an unknown format is set aside', async () => {
    const server = fakeSupabase()
    const { client, dataKey, documentId } = await signedInWithDocument(server)
    server.tables.documents[0].format = 2
    expect(await loadDocuments(client, dataKey, 'profile')).toEqual({
      documents: [],
      unreadable: [documentId],
    })
  })

  test('one bad document does not hide the others', async () => {
    const server = fakeSupabase()
    const { client, dataKey } = await signedInWithDocument(server)
    const ids = [
      await saveDocument(client, dataKey, { kind: 'snapshot', value: 1 }),
      await saveDocument(client, dataKey, { kind: 'snapshot', value: 2 }),
      await saveDocument(client, dataKey, { kind: 'snapshot', value: 3 }),
    ]
    const damaged = server.tables.documents.find((row) => row.id === ids[1])!
    damaged.ciphertext = 'AAAA' + String(damaged.ciphertext).slice(4)

    const { documents, unreadable } = await loadDocuments<number>(client, dataKey, 'snapshot')
    expect(documents.map((d) => d.value)).toEqual([1, 3])
    expect(unreadable).toEqual([ids[1]])
  })

  test('a loaded document carries the server created_at of its row', async () => {
    const server = fakeSupabase()
    const { client, dataKey } = await signedInWithDocument(server)
    const id = await saveDocument(client, dataKey, { kind: 'snapshot', value: 1 })
    server.tables.documents.find((row) => row.id === id)!.created_at = '2026-11-11T09:00:00Z'

    const { documents } = await loadDocuments<number>(client, dataKey, 'snapshot')
    expect(documents[0].createdAt).toBe('2026-11-11T09:00:00Z')
  })

  test("the code asks only for the signed-in person’s rows", async () => {
    const server = fakeSupabase()
    const { client, userId, dataKey, documentId, recoveryDisplay } = await signedInWithDocument(server)
    await saveDocument(client, dataKey, { kind: 'profile', id: documentId, value: { name: 'B' } })
    await loadDocuments(client, dataKey, 'profile')
    // The guarded writes and the reading of ids (F3) filter on the person too.
    const draft = crypto.randomUUID()
    const v0 = new Date(0).toISOString()
    await insertDocument(client, dataKey, { kind: 'draft', id: draft, value: { a: 1 }, version: v0 })
    await insertDocument(client, dataKey, { kind: 'draft', id: draft, value: { a: 2 }, version: v0 })
    await saveDocumentIfUnchanged(client, dataKey, { kind: 'draft', id: draft, value: { a: 3 }, versions: [v0], version: v0 })
    await listDocumentIds(client, ['snapshot', 'draft'])
    await resetWithRecoveryKey(client, { recoveryDisplay, newPassword: NEW_PASSWORD, email: EMAIL })
    await startOver(client, { newPassword: 'third long password', email: EMAIL })

    const tableRequests = server.recorded.filter((r) => r.path.startsWith('/rest/v1/'))
    expect(
      tableRequests.filter((r) => r.method === 'GET' && r.path.startsWith('/rest/v1/documents')).length,
    ).toBeGreaterThan(0)
    // First rampart: the code filters by itself. Row-level security is the second.
    for (const r of tableRequests) {
      const label = `${r.method} ${r.path}`
      if (r.method === 'POST') expect(JSON.parse(r.body!).user_id, label).toBe(userId)
      else expect(new URL(r.path, 'http://h').searchParams.get('user_id'), label).toBe(`eq.${userId}`)
    }
  })

  test('deleting a document removes that one only, and an absent one is not an error', async () => {
    const server = fakeSupabase()
    const { client, userId, dataKey, documentId } = await signedInWithDocument(server)
    const mine = await saveDocument(client, dataKey, { kind: 'draft', value: { a: 1 } })
    const snapshot = await saveDocument(client, dataKey, { kind: 'snapshot', value: { b: 2 } })
    // Another person's draft, as row-level security would hide it from the real thing.
    server.tables.documents.push({ id: crypto.randomUUID(), user_id: 'someone-else', kind: 'draft', format: 1, iv: 'x', ciphertext: 'y' })

    await deleteDocument(client, 'draft', mine)
    expect(server.tables.documents.map((row) => row.id)).not.toContain(mine)
    expect(server.tables.documents.filter((row) => row.kind === 'draft')).toHaveLength(1)
    expect(server.tables.documents.map((row) => row.id)).toEqual(expect.arrayContaining([documentId, snapshot]))

    await expect(deleteDocument(client, 'draft', mine)).resolves.toBeUndefined()

    // Narrowed by person, kind and id.
    const request = server.recorded.filter((r) => r.method === 'DELETE').at(-1)!
    const params = new URL(request.path, 'http://h').searchParams
    expect(params.get('id')).toBe(`eq.${mine}`)
    expect(params.get('user_id')).toBe(`eq.${userId}`)
    expect(params.get('kind')).toBe('eq.draft')
  })

  test('deleting a kind removes only that kind of the signed-in person', async () => {
    const server = fakeSupabase()
    const { client, userId, dataKey, documentId } = await signedInWithDocument(server)
    const draft = await saveDocument(client, dataKey, { kind: 'draft', value: { a: 1 } })
    const snapshot = await saveDocument(client, dataKey, { kind: 'snapshot', value: { b: 2 } })
    server.tables.documents.push({ id: 'theirs', user_id: 'someone-else', kind: 'draft', format: 1, iv: 'x', ciphertext: 'y' })

    await deleteDrafts(client)
    const left = server.tables.documents.map((row) => row.id)
    expect(left).not.toContain(draft)
    expect(left).toEqual(expect.arrayContaining([documentId, snapshot, 'theirs']))

    const request = server.recorded.filter((r) => r.method === 'DELETE').at(-1)!
    const params = new URL(request.path, 'http://h').searchParams
    expect(params.get('user_id')).toBe(`eq.${userId}`)
    expect(params.get('kind')).toBe('eq.draft')
    expect(params.get('id')).toBeNull()
  })

  test('inserting twice with one id leaves one row, and the second content opens', async () => {
    const server = fakeSupabase()
    const { client, dataKey } = await signedInWithDocument(server)
    const id = crypto.randomUUID()
    await insertDocument(client, dataKey, { kind: 'snapshot', id, value: { n: 1 } })
    await insertDocument(client, dataKey, { kind: 'snapshot', id, value: { n: 2 } })
    expect(server.tables.documents.filter((row) => row.id === id)).toHaveLength(1)
    const { documents, unreadable } = await loadDocuments<{ n: number }>(client, dataKey, 'snapshot')
    expect(unreadable).toEqual([])
    expect(documents.map((d) => d.value)).toEqual([{ n: 2 }])
  })

  test('a conflict on another row still fails: a second draft with a new id is not written over', async () => {
    const server = fakeSupabase()
    const { client, dataKey } = await signedInWithDocument(server)
    const first = await saveDocument(client, dataKey, { kind: 'draft', value: { a: 1 } })
    // The one-draft index refuses it, and no row has its id to fall back on.
    await expect(insertDocument(client, dataKey, { kind: 'draft', id: crypto.randomUUID(), value: { a: 3 } })).rejects.toThrow()
    const { documents } = await loadDocuments<{ a: number }>(client, dataKey, 'draft')
    expect(documents.map((d) => d.id)).toEqual([first])
  })

  describe('a write guarded by the version last read or written (F3)', () => {
    const T0 = '2026-11-08T09:00:00.000Z'
    const T1 = '2026-11-08T10:00:00.000Z'
    const T2 = '2026-11-08T11:00:00.000Z'

    test('a stale update matches no row: nothing is written, and the newer content stays', async () => {
      const server = fakeSupabase()
      const { client, dataKey } = await signedInWithDocument(server)
      const id = crypto.randomUUID()
      await insertDocument(client, dataKey, { kind: 'draft', id, value: { n: 0 }, version: T0 })
      // Another device read T0 and wrote T1 over it.
      await saveDocumentIfUnchanged(client, dataKey, { kind: 'draft', id, value: { n: 1 }, versions: [T0], version: T1 })
      // This one still holds T0.
      await expect(
        saveDocumentIfUnchanged(client, dataKey, { kind: 'draft', id, value: { n: 2 }, versions: [T0], version: T2 }),
      ).rejects.toBeInstanceOf(DocumentChangedError)
      const { documents } = await loadDocuments<{ n: number }>(client, dataKey, 'draft')
      expect(documents).toEqual([{ id, value: { n: 1 }, updatedAt: T1, createdAt: expect.any(String) }])
    })

    test('the version written is the one given, and it is what the next write is guarded on', async () => {
      const server = fakeSupabase()
      const { client, userId, dataKey } = await signedInWithDocument(server)
      const id = crypto.randomUUID()
      await insertDocument(client, dataKey, { kind: 'draft', id, value: { n: 0 }, version: T0 })
      expect(await saveDocumentIfUnchanged(client, dataKey, { kind: 'draft', id, value: { n: 1 }, versions: [T0], version: T1 })).toBe(id)
      expect((await loadDocuments(client, dataKey, 'draft')).documents[0].updatedAt).toBe(T1)
      // Narrowed by id, person, kind and version.
      const request = server.recorded.filter((r) => r.method === 'PATCH').at(-1)!
      const params = new URL(request.path, 'http://h').searchParams
      expect(params.get('id')).toBe(`eq.${id}`)
      expect(params.get('user_id')).toBe(`eq.${userId}`)
      expect(params.get('kind')).toBe('eq.draft')
      expect(params.get('updated_at')).toBe(`in.(${T0})`)
    })

    test('a version whose answer was lost is still this device’s: the retry is accepted', async () => {
      const server = fakeSupabase()
      const { client, dataKey } = await signedInWithDocument(server)
      const id = crypto.randomUUID()
      await insertDocument(client, dataKey, { kind: 'draft', id, value: { n: 0 }, version: T0 })
      // Written as T1, but the answer never came back: the device still knows only T0.
      await saveDocumentIfUnchanged(client, dataKey, { kind: 'draft', id, value: { n: 1 }, versions: [T0], version: T1 })
      await saveDocumentIfUnchanged(client, dataKey, { kind: 'draft', id, value: { n: 2 }, versions: [T0, T1], version: T1 })
      expect((await loadDocuments<{ n: number }>(client, dataKey, 'draft')).documents[0].value).toEqual({ n: 2 })
    })

    test('an insert retried after a lost answer, under a fresh version, meets its own row', async () => {
      const server = fakeSupabase()
      const { client, dataKey } = await signedInWithDocument(server)
      const id = crypto.randomUUID()
      await insertDocument(client, dataKey, { kind: 'draft', id, value: { n: 1 }, version: T1 })
      // The answer was lost: the retry writes T2 and accepts T1, which the first may have left.
      await insertDocument(client, dataKey, { kind: 'draft', id, value: { n: 2 }, versions: [T1, T2], version: T2 })
      expect(await loadDocuments(client, dataKey, 'draft')).toEqual({
        documents: [{ id, value: { n: 2 }, updatedAt: T2, createdAt: expect.any(String) }],
        unreadable: [],
      })
    })

    test('a fresh version on every attempt: a device that read what a lost answer left is refused over newer work', async () => {
      const server = fakeSupabase()
      const { client, dataKey } = await signedInWithDocument(server)
      const id = crypto.randomUUID()
      const TB = '2026-11-08T10:30:00.000Z'
      await insertDocument(client, dataKey, { kind: 'draft', id, value: { a: 'A0' }, version: T0 })
      // A writes A1 as T1; it lands, the answer is lost: A still knows only T0.
      await saveDocumentIfUnchanged(client, dataKey, { kind: 'draft', id, value: { a: 'A1' }, versions: [T0, T1], version: T1 })
      // B reads now, and sees A1 at T1.
      const seenByB = (await loadDocuments<{ a: string }>(client, dataKey, 'draft')).documents[0]
      // A writes A2 under a fresh T2, accepting T0 and T1.
      await saveDocumentIfUnchanged(client, dataKey, { kind: 'draft', id, value: { a: 'A2' }, versions: [T0, T1, T2], version: T2 })
      // B writes from what it read: refused, A2 stays.
      await expect(
        saveDocumentIfUnchanged(client, dataKey, { kind: 'draft', id, value: { a: 'A1+b' }, versions: [seenByB.updatedAt, TB], version: TB }),
      ).rejects.toBeInstanceOf(DocumentChangedError)
      expect((await loadDocuments<{ a: string }>(client, dataKey, 'draft')).documents).toEqual([
        { id, value: { a: 'A2' }, updatedAt: T2, createdAt: expect.any(String) },
      ])
    })

    test('an insert that meets a draft another device started is refused as changed, and that draft stays', async () => {
      const server = fakeSupabase()
      const { client, dataKey } = await signedInWithDocument(server)
      const theirs = crypto.randomUUID()
      await insertDocument(client, dataKey, { kind: 'draft', id: theirs, value: { n: 1 }, version: T0 })
      await expect(
        insertDocument(client, dataKey, { kind: 'draft', id: crypto.randomUUID(), value: { n: 2 }, version: T1 }),
      ).rejects.toBeInstanceOf(DocumentChangedError)
      expect((await loadDocuments(client, dataKey, 'draft')).documents).toEqual([{ id: theirs, value: { n: 1 }, updatedAt: T0, createdAt: expect.any(String) }])
    })

    test('an insert retried after another device wrote over the row it left is refused as changed', async () => {
      const server = fakeSupabase()
      const { client, dataKey } = await signedInWithDocument(server)
      const id = crypto.randomUUID()
      await insertDocument(client, dataKey, { kind: 'draft', id, value: { n: 1 }, version: T0 })
      await saveDocumentIfUnchanged(client, dataKey, { kind: 'draft', id, value: { n: 9 }, versions: [T0], version: T1 })
      await expect(insertDocument(client, dataKey, { kind: 'draft', id, value: { n: 2 }, version: T0 })).rejects.toBeInstanceOf(
        DocumentChangedError,
      )
      expect((await loadDocuments<{ n: number }>(client, dataKey, 'draft')).documents[0].value).toEqual({ n: 9 })
    })

    test('the ids of some kinds, without content, of the signed-in person only', async () => {
      const server = fakeSupabase()
      const { client, userId, dataKey, documentId } = await signedInWithDocument(server)
      const snapshot = await saveDocument(client, dataKey, { kind: 'snapshot', value: { b: 2 } })
      const draft = await saveDocument(client, dataKey, { kind: 'draft', value: { a: 1 } })
      await saveDocument(client, dataKey, { kind: 'goals', value: { g: 1 } })
      server.tables.documents.push({ id: 'theirs', user_id: 'someone-else', kind: 'snapshot', format: 1, iv: 'x', ciphertext: 'y' })

      const found = await listDocumentIds(client, ['snapshot', 'draft'])
      expect(found).toEqual(
        expect.arrayContaining([
          { id: snapshot, kind: 'snapshot' },
          { id: draft, kind: 'draft' },
        ]),
      )
      expect(found).toHaveLength(2)
      expect(found.map((f) => f.id)).not.toContain(documentId)

      const request = server.recorded.filter((r) => r.method === 'GET' && r.path.startsWith('/rest/v1/documents')).at(-1)!
      const params = new URL(request.path, 'http://h').searchParams
      expect(params.get('select')).toBe('id,kind')
      expect(params.get('user_id')).toBe(`eq.${userId}`)
      expect(params.get('kind')).toBe('in.(snapshot,draft)')
    })
  })
})

// A sign-in that opened the vault (its recovery key, never confirmed here, is renewed on the way).
const OPENED = /^(unlocked|renewed-recovery)$/
const passwordSets = (requests: FakeSupabase['recorded']) =>
  requests.filter((r) => r.method === 'PUT' && r.path.startsWith('/auth/v1/user'))
const vaultWrites = (requests: FakeSupabase['recorded']) =>
  requests.filter((r) => r.path.startsWith('/rest/v1/vaults') && r.method !== 'GET')

// Whether this key opens the vault's password packet.
async function opensPasswordPacket(server: FakeSupabase, keyEncryptionKey: CryptoKey): Promise<boolean> {
  try {
    await unwrapDataKey(server.tables.vaults[0].wrapped_by_password as Sealed, keyEncryptionKey)
    return true
  } catch {
    return false
  }
}

async function opensRecoveryPacket(server: FakeSupabase, display: string): Promise<boolean> {
  try {
    await unwrapDataKey(server.tables.vaults[0].wrapped_by_recovery as Sealed, await recoveryKeyFromDisplay(display))
    return true
  } catch {
    return false
  }
}

describe('changing the password', () => {
  test('the vault is resealed for the new password before the session takes it', async () => {
    const server = fakeSupabase()
    const { client, documentId } = await signedInWithDocument(server)
    const before = structuredClone(server.tables.vaults[0])
    const mark = server.recorded.length

    const dataKey = await changePassword(client, { email: EMAIL, oldPassword: PASSWORD, newPassword: NEW_PASSWORD })

    // The data key stays: every document opens as before.
    expect(dataKey.extractable).toBe(false)
    expect((await loadDocuments(client, dataKey, 'profile')).documents.map((d) => d.id)).toEqual([documentId])
    // The packet written opens with the new password, and no longer with the old one.
    expect(await opensPasswordPacket(server, (await deriveSecrets(NEW_PASSWORD, EMAIL)).keyEncryptionKey)).toBe(true)
    expect(await opensPasswordPacket(server, (await deriveSecrets(PASSWORD, EMAIL)).keyEncryptionKey)).toBe(false)
    // The recovery key and its confirmation are untouched.
    expect(server.tables.vaults[0].wrapped_by_recovery).toEqual(before.wrapped_by_recovery)
    expect(server.tables.vaults[0].recovery_confirmed_at).toEqual(before.recovery_confirmed_at)

    // The order: the vault first, guarded on the packet just read, then the session.
    const after = server.recorded.slice(mark)
    const [reseal] = vaultWrites(after)
    expect(reseal.method).toBe('PATCH')
    const query = new URL(reseal.path, 'http://x').searchParams
    expect(query.get('user_id')).toBe(`eq.${server.user!.id}`)
    expect(query.get('wrapped_by_password->>iv')).toBe(`eq.${(before.wrapped_by_password as Sealed).iv}`)
    expect(Object.keys(JSON.parse(reseal.body!)).sort()).toEqual(['updated_at', 'wrapped_by_password'])
    expect(after.indexOf(reseal)).toBeLessThan(after.indexOf(passwordSets(after)[0]))
    expect(vaultWrites(after)).toHaveLength(1)

    // The next sign-in takes the new password, and only it.
    await expect(signIn(server.client(), memoryKeyStore(), { email: EMAIL, password: PASSWORD })).rejects.toBeInstanceOf(
      WrongCredentialsError,
    )
    expect((await signIn(server.client(), memoryKeyStore(), { email: EMAIL, password: NEW_PASSWORD })).status).toMatch(
      OPENED,
    )
  })

  // Review Focus 1.
  test('a wrong old password writes nothing', async () => {
    const server = fakeSupabase()
    const { client } = await signedInWithDocument(server)
    const tables = structuredClone(server.tables)
    const password = server.user!.password
    const mark = server.recorded.length

    await expect(
      changePassword(client, { email: EMAIL, oldPassword: 'not the password at all', newPassword: NEW_PASSWORD }),
    ).rejects.toBeInstanceOf(WrongPasswordError)

    const after = server.recorded.slice(mark)
    expect(after.filter((r) => r.method !== 'GET')).toEqual([])
    expect(server.tables).toEqual(tables)
    expect(server.user!.password).toBe(password)
  })

  test('the old and the new password are both held to 10 characters, before anything is sent', async () => {
    const server = fakeSupabase()
    const { client } = await signedInWithDocument(server)
    const mark = server.recorded.length

    await expect(
      changePassword(client, { email: EMAIL, oldPassword: PASSWORD, newPassword: 'too short' }),
    ).rejects.toBeInstanceOf(PasswordTooShortError)
    await expect(
      changePassword(client, { email: EMAIL, oldPassword: 'too short', newPassword: NEW_PASSWORD }),
    ).rejects.toBeInstanceOf(PasswordTooShortError)
    expect(server.recorded.slice(mark)).toEqual([])
  })

  test("an address other than the session’s is refused before anything is written", async () => {
    const server = fakeSupabase()
    const { client } = await signedInWithDocument(server)
    const mark = server.recorded.length

    await expect(
      changePassword(client, { email: 'other@b.fr', oldPassword: PASSWORD, newPassword: NEW_PASSWORD }),
    ).rejects.toBeInstanceOf(EmailMismatchError)
    expect(server.recorded.slice(mark).filter((r) => r.method !== 'GET')).toEqual([])
  })

  // Review Focus 2: the vault took the new password, the session did not.
  test('the connection lost before the session takes it: the retry with the new password as old succeeds', async () => {
    const server = fakeSupabase()
    const { client, documentId } = await signedInWithDocument(server)
    const oldSecret = server.user!.password
    let cut = true
    server.beforeEachRequest((r) => {
      if (cut && r.method === 'PUT' && r.path.startsWith('/auth/v1/user')) {
        cut = false
        throw new TypeError('Failed to fetch')
      }
    })

    const failure = await changePassword(client, {
      email: EMAIL,
      oldPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    }).catch((error: unknown) => error)
    // The screen can tell this state apart, and the cause is kept.
    expect(failure).toBeInstanceOf(PasswordHalfChangedError)
    expect((failure as Error).cause).toBeInstanceOf(Error)
    // In between: the vault opens with the new password, the session still takes the old secret.
    expect(await opensPasswordPacket(server, (await deriveSecrets(NEW_PASSWORD, EMAIL)).keyEncryptionKey)).toBe(true)
    expect(server.user!.password).toBe(oldSecret)
    // Typing the old one again is refused, as the screen says it will be.
    await expect(
      changePassword(client, { email: EMAIL, oldPassword: PASSWORD, newPassword: NEW_PASSWORD }),
    ).rejects.toBeInstanceOf(WrongPasswordError)

    const dataKey = await changePassword(client, { email: EMAIL, oldPassword: NEW_PASSWORD, newPassword: NEW_PASSWORD })

    expect((await loadDocuments(client, dataKey, 'profile')).documents.map((d) => d.id)).toEqual([documentId])
    expect(await opensPasswordPacket(server, (await deriveSecrets(NEW_PASSWORD, EMAIL)).keyEncryptionKey)).toBe(true)
    expect((await signIn(server.client(), memoryKeyStore(), { email: EMAIL, password: NEW_PASSWORD })).status).toMatch(
      OPENED,
    )
  })

  // The answer of the session was lost after it took the password: the retry meets « same password ».
  test('a change retried after the session already took it still succeeds', async () => {
    const server = fakeSupabase()
    const { client } = await signedInWithDocument(server)
    await changePassword(client, { email: EMAIL, oldPassword: PASSWORD, newPassword: NEW_PASSWORD })

    await changePassword(client, { email: EMAIL, oldPassword: NEW_PASSWORD, newPassword: NEW_PASSWORD })

    expect(passwordSets(server.recorded).at(-1)!.status).toBe(422)
    expect((await signIn(server.client(), memoryKeyStore(), { email: EMAIL, password: NEW_PASSWORD })).status).toMatch(
      OPENED,
    )
  })

  test('a packet another device rewrote in between is not written over, and the session keeps its password', async () => {
    const server = fakeSupabase()
    const { client } = await signedInWithDocument(server)
    const password = server.user!.password
    const theirs = { iv: 'AAAAAAAAAAAAAAAA', ciphertext: 'AAAA' }
    server.beforeEachRequest((r) => {
      if (r.method === 'PATCH' && r.path.startsWith('/rest/v1/vaults')) server.tables.vaults[0].wrapped_by_password = theirs
    })
    const mark = server.recorded.length

    await expect(
      changePassword(client, { email: EMAIL, oldPassword: PASSWORD, newPassword: NEW_PASSWORD }),
    ).rejects.toBeInstanceOf(WrongPasswordError)
    expect(server.tables.vaults[0].wrapped_by_password).toEqual(theirs)
    expect(passwordSets(server.recorded.slice(mark))).toEqual([])
    expect(server.user!.password).toBe(password)
  })

  test('a reseal whose answer was lost but that landed goes on to the session and succeeds', async () => {
    const server = fakeSupabase()
    const { client } = await signedInWithDocument(server)
    server.loseNextAnswer((r) => r.method === 'PATCH' && r.path.startsWith('/rest/v1/vaults'))

    const dataKey = await changePassword(client, { email: EMAIL, oldPassword: PASSWORD, newPassword: NEW_PASSWORD })

    expect(dataKey).toBeTruthy()
    expect(await opensPasswordPacket(server, (await deriveSecrets(NEW_PASSWORD, EMAIL)).keyEncryptionKey)).toBe(true)
    expect(passwordSets(server.recorded).at(-1)!.status).toBe(200)
    expect((await signIn(server.client(), memoryKeyStore(), { email: EMAIL, password: NEW_PASSWORD })).status).toMatch(
      OPENED,
    )
  })

  test('a reseal that landed with its answer lost, then a session that refuses: half changed', async () => {
    const server = fakeSupabase()
    const { client } = await signedInWithDocument(server)
    server.loseNextAnswer((r) => r.method === 'PATCH' && r.path.startsWith('/rest/v1/vaults'))
    server.beforeEachRequest((r) => {
      if (r.method === 'PUT' && r.path.startsWith('/auth/v1/user')) throw new TypeError('Failed to fetch')
    })

    await expect(
      changePassword(client, { email: EMAIL, oldPassword: PASSWORD, newPassword: NEW_PASSWORD }),
    ).rejects.toBeInstanceOf(PasswordHalfChangedError)
  })

  test('a reseal that failed and did not land stays the failure it was', async () => {
    const server = fakeSupabase()
    const { client } = await signedInWithDocument(server)
    server.beforeEachRequest((r) => {
      if (r.method === 'PATCH' && r.path.startsWith('/rest/v1/vaults')) throw new TypeError('Failed to fetch')
    })
    const failure = await changePassword(client, { email: EMAIL, oldPassword: PASSWORD, newPassword: NEW_PASSWORD }).catch(
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(Error)
    expect(failure).not.toBeInstanceOf(PasswordHalfChangedError)
  })

  test('a reseal the server refuses is not a half change: nothing changed', async () => {
    const server = fakeSupabase()
    const { client } = await signedInWithDocument(server)
    const before = structuredClone(server.tables.vaults[0])
    const password = server.user!.password
    server.beforeEachRequest((r) => {
      if (r.method === 'PATCH' && r.path.startsWith('/rest/v1/vaults')) throw new TypeError('Failed to fetch')
    })

    const failure = await changePassword(client, {
      email: EMAIL,
      oldPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(Error)
    expect(failure).not.toBeInstanceOf(PasswordHalfChangedError)
    expect(server.tables.vaults[0]).toEqual(before)
    expect(passwordSets(server.recorded)).toEqual([])
    expect(server.user!.password).toBe(password)
  })
})

describe('remaking the recovery key', () => {
  test('a new key replaces the old one, and waits to be confirmed', async () => {
    const server = fakeSupabase()
    const { client, recoveryDisplay } = await signedInWithDocument(server)
    await confirmRecoveryKeySeen(client, recoveryDisplay)
    const before = structuredClone(server.tables.vaults[0])
    const password = server.user!.password
    const mark = server.recorded.length

    const display = await remakeRecoveryKey(client, { email: EMAIL, password: PASSWORD })

    expect(display).toMatch(RECOVERY_FORMAT)
    expect(await opensRecoveryPacket(server, display!)).toBe(true)
    expect(await opensRecoveryPacket(server, recoveryDisplay)).toBe(false)
    expect(await isRecoveryKeyConfirmed(client)).toBe(false)
    // The password and its packet are untouched.
    expect(server.tables.vaults[0].wrapped_by_password).toEqual(before.wrapped_by_password)
    expect(server.user!.password).toBe(password)

    const writes = vaultWrites(server.recorded.slice(mark))
    expect(writes).toHaveLength(1)
    const query = new URL(writes[0].path, 'http://x').searchParams
    expect(query.get('user_id')).toBe(`eq.${server.user!.id}`)
    expect(query.get('wrapped_by_recovery->>iv')).toBe(`eq.${(before.wrapped_by_recovery as Sealed).iv}`)
    expect(JSON.parse(writes[0].body!)).toMatchObject({ recovery_confirmed_at: null })
    expect(Object.keys(JSON.parse(writes[0].body!)).sort()).toEqual([
      'recovery_confirmed_at',
      'updated_at',
      'wrapped_by_recovery',
    ])

    // Confirmed as in the first launch.
    await confirmRecoveryKeySeen(client, display!)
    expect(await isRecoveryKeyConfirmed(client)).toBe(true)
  })

  test('a remake whose answer was lost but landed returns the new key', async () => {
    const server = fakeSupabase()
    const { client, recoveryDisplay } = await signedInWithDocument(server)
    await confirmRecoveryKeySeen(client, recoveryDisplay)
    server.loseNextAnswer((r) => r.method === 'PATCH' && r.path.startsWith('/rest/v1/vaults'))

    const display = await remakeRecoveryKey(client, { email: EMAIL, password: PASSWORD })

    expect(display).toMatch(RECOVERY_FORMAT)
    expect(await opensRecoveryPacket(server, display!)).toBe(true)
  })

  test('a wrong password writes nothing', async () => {
    const server = fakeSupabase()
    const { client } = await signedInWithDocument(server)
    const tables = structuredClone(server.tables)
    const mark = server.recorded.length

    await expect(remakeRecoveryKey(client, { email: EMAIL, password: 'not the password at all' })).rejects.toBeInstanceOf(
      WrongPasswordError,
    )
    expect(server.recorded.slice(mark).filter((r) => r.method !== 'GET')).toEqual([])
    expect(server.tables).toEqual(tables)
  })

  // Review Focus 3.
  test('another device remaking it at the same time: the second write lands nowhere, and says so', async () => {
    const server = fakeSupabase()
    const { client, recoveryDisplay } = await signedInWithDocument(server)
    await confirmRecoveryKeySeen(client, recoveryDisplay)
    // The other device's write lands between this one's read and its write.
    const theirs = { iv: 'AAAAAAAAAAAAAAAA', ciphertext: 'AAAA' }
    server.beforeEachRequest((r) => {
      if (r.method === 'PATCH' && r.path.startsWith('/rest/v1/vaults')) {
        server.beforeEachRequest(null)
        server.tables.vaults[0].wrapped_by_recovery = theirs
        server.tables.vaults[0].recovery_confirmed_at = null
      }
    })

    expect(await remakeRecoveryKey(client, { email: EMAIL, password: PASSWORD })).toBeNull()
    expect(server.tables.vaults[0].wrapped_by_recovery).toEqual(theirs)
  })
})
