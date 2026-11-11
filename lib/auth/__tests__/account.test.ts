import { describe, expect, test } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import {
  modelMark,
  rememberModel,
  rememberVault,
  rememberedModel,
  rememberedVault,
  vaultMark,
} from '@/lib/app/session-memory'
import { fakeSupabase, type RecordedRequest } from '@/lib/vault/__tests__/fake-supabase'
import { memoryKeyStore, type KeyStore } from '@/lib/vault/device'
import { KDF_PARAMS, deriveSecrets } from '@/lib/vault/kdf'
import type { Sealed } from '@/lib/vault/seal'
import { generateDataKey, unwrapDataKey, wrapDataKey } from '@/lib/vault/keys'
import { InvalidRecoveryKeyError } from '@/lib/vault/keys'
import {
  WrongPasswordError,
  RecoveryKeyReplacedError,
  confirmRecoveryKeySeen,
  createVault,
  loadDocuments,
  resetWithRecoveryKey,
  saveDocument,
} from '@/lib/vault/store'
import {
  DeviceKeyNotClearedError,
  EmailNotConfirmedError,
  PasswordTooShortError,
  WrongCredentialsError,
  signIn,
  signOut,
  signUp,
} from '../account'

const EMAIL = 'a@b.fr'
const PASSWORD = 'correct horse battery'
const REDIRECT = 'http://x/confirmation'
const RECOVERY_FORMAT = /^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/

// The key a sign-in shows; none was shown when the vault simply unlocked.
function shown(result: Awaited<ReturnType<typeof signIn>>): string {
  if (result.status === 'unlocked') throw new Error('expected a recovery key to be shown')
  return result.recoveryDisplay
}

// An ordinary unlock: the vault opened and there is nothing to show. It hands
// back what activating Face ID needs, and whether the recovery key is
// confirmed, which Face ID requires.
const unlocked = (recoveryConfirmed: boolean) => ({
  status: 'unlocked',
  faceId: { keyEncryptionKey: expect.any(CryptoKey), userId: expect.any(String), recoveryConfirmed },
})

const vaultRequests = (requests: RecordedRequest[]) =>
  requests.filter((r) => r.path.startsWith('/rest/v1/vaults'))
const vaultWrites = (requests: RecordedRequest[]) =>
  vaultRequests(requests).filter((r) => r.method !== 'GET')

describe('account', () => {
  test('sends the derived secret to Supabase, never the password', async () => {
    const server = fakeSupabase()
    const client = server.client()
    // Typed with a capital and a space at sign-up, in lower case at sign-in.
    await signUp(client, { email: ' A@B.fr ', password: PASSWORD, redirectTo: REDIRECT })
    await signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD })

    const signup = server.recorded.find((r) => r.path.startsWith('/auth/v1/signup'))!
    const token = server.recorded.find((r) => r.path.startsWith('/auth/v1/token'))!
    const sent = JSON.parse(signup.body!)
    expect(sent.email).toBe(EMAIL)
    expect(sent.password).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.parse(token.body!).password).toBe(sent.password)
    expect(new URL(signup.path, 'http://h').searchParams.get('redirect_to')).toBe(REDIRECT)
    expect(JSON.stringify(server.recorded)).not.toContain(PASSWORD)
  })

  test('refuses a password under 10 characters', async () => {
    const server = fakeSupabase()
    const client = server.client()
    await expect(
      signUp(client, { email: EMAIL, password: '123456789', redirectTo: REDIRECT }),
    ).rejects.toBeInstanceOf(PasswordTooShortError)
    expect(server.recorded).toEqual([])

    await signUp(client, { email: EMAIL, password: '1234567890', redirectTo: REDIRECT })
    expect(server.recorded).toHaveLength(1)
  })

  test('leaves only the new key on the device, not another account’s', async () => {
    const server = fakeSupabase()
    const client = server.client()
    const keys = memoryKeyStore()
    await keys.set('someone-else', await generateDataKey())
    await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: REDIRECT })

    await signIn(client, keys, { email: EMAIL, password: PASSWORD })
    expect(await keys.get('someone-else')).toBeNull()
    expect(await keys.get(server.user!.id)).toBeInstanceOf(CryptoKey)

    // Same on an ordinary unlock (the vault exists by now).
    await keys.set('another-one', await generateDataKey())
    await signIn(client, keys, { email: EMAIL, password: PASSWORD })
    expect(await keys.get('another-one')).toBeNull()
    expect(await keys.get(server.user!.id)).toBeInstanceOf(CryptoKey)
  })

  test('creates the vault at the first sign-in and shows the recovery key once', async () => {
    const server = fakeSupabase()
    const client = server.client()
    const keys = memoryKeyStore()
    await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: REDIRECT })

    const first = await signIn(client, keys, { email: EMAIL, password: PASSWORD })
    expect(first).toEqual({
      status: 'new-vault',
      recoveryDisplay: expect.stringMatching(RECOVERY_FORMAT),
    })
    expect(server.tables.vaults).toHaveLength(1)
    const [vault] = server.tables.vaults
    expect(vault.user_id).toBe(server.user!.id)
    expect(vault.kdf).toEqual(KDF_PARAMS)
    expect(vault.wrapped_by_password).toEqual({ iv: expect.any(String), ciphertext: expect.any(String) })
    expect(vault.wrapped_by_recovery).toEqual({ iv: expect.any(String), ciphertext: expect.any(String) })

    // The key kept on the device can be used but never read out of it.
    const key = await keys.get(server.user!.id)
    expect(key).toBeInstanceOf(CryptoKey)
    expect(key!.extractable).toBe(false)

    await confirmRecoveryKeySeen(client, shown(first))
    expect(await signIn(client, keys, { email: EMAIL, password: PASSWORD })).toEqual(unlocked(true))
    expect(server.tables.vaults).toHaveLength(1)
  })

  test('renews an unconfirmed recovery key at sign-in', async () => {
    const server = fakeSupabase()
    const client = server.client()
    await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: REDIRECT })
    const first = await signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD })
    if (first.status !== 'new-vault') throw new Error('expected a new vault')
    expect(server.tables.vaults[0].recovery_confirmed_at).toBeNull()

    const second = await signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD })
    if (second.status !== 'renewed-recovery') throw new Error('expected a renewed recovery key')
    expect(second.recoveryDisplay).toMatch(RECOVERY_FORMAT)
    expect(second.recoveryDisplay).not.toBe(first.recoveryDisplay)

    // The key never seen no longer opens anything; the new one does.
    await expect(
      resetWithRecoveryKey(client, { recoveryDisplay: first.recoveryDisplay, newPassword: 'another long password', email: EMAIL }),
    ).rejects.toBeInstanceOf(InvalidRecoveryKeyError)
    await resetWithRecoveryKey(client, { recoveryDisplay: second.recoveryDisplay, newPassword: 'another long password', email: EMAIL })
  })

  test('the renewed key opens the same data key', async () => {
    const server = fakeSupabase()
    const client = server.client()
    const keys = memoryKeyStore()
    await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: REDIRECT })
    await signIn(client, keys, { email: EMAIL, password: PASSWORD })
    const id = await saveDocument(client, (await keys.get(server.user!.id))!, {
      kind: 'profile',
      value: { name: 'Alix' },
    })

    const renewed = shown(await signIn(client, keys, { email: EMAIL, password: PASSWORD }))
    const dataKey = await resetWithRecoveryKey(client, {
      recoveryDisplay: renewed,
      newPassword: 'another long password',
      email: EMAIL,
    })
    expect(await loadDocuments(client, dataKey, 'profile')).toEqual({
      documents: [{ id, value: { name: 'Alix' }, updatedAt: expect.any(String), createdAt: expect.any(String) }],
      unreadable: [],
    })
  })

  // A key shown on one screen is replaced by a sign-in on another device: the
  // first screen must not be able to mark the vault as confirmed.
  test('a stale key screen cannot confirm a key that was replaced', async () => {
    const server = fakeSupabase()
    const laptop = server.client()
    await signUp(laptop, { email: EMAIL, password: PASSWORD, redirectTo: REDIRECT })
    const k1 = shown(await signIn(laptop, memoryKeyStore(), { email: EMAIL, password: PASSWORD }))
    const k2 = shown(await signIn(server.client(), memoryKeyStore(), { email: EMAIL, password: PASSWORD }))

    await expect(confirmRecoveryKeySeen(laptop, k1)).rejects.toBeInstanceOf(RecoveryKeyReplacedError)
    expect(server.tables.vaults[0].recovery_confirmed_at).toBeNull()

    await confirmRecoveryKeySeen(laptop, k2.toLowerCase())
    expect(server.tables.vaults[0].recovery_confirmed_at).toEqual(expect.any(String))
  })

  test('a confirmation that lands between the reading and the writing is refused', async () => {
    const server = fakeSupabase()
    const client = server.client()
    await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: REDIRECT })
    const k1 = shown(await signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD }))
    // The key is renewed right after the screen's check, before its write.
    server.beforeEachRequest((request) => {
      if (request.method === 'PATCH') {
        server.beforeEachRequest(null)
        server.tables.vaults[0].wrapped_by_recovery = { iv: 'another', ciphertext: 'packet' }
      }
    })
    await expect(confirmRecoveryKeySeen(client, k1)).rejects.toBeInstanceOf(RecoveryKeyReplacedError)
    expect(server.tables.vaults[0].recovery_confirmed_at).toBeNull()
  })

  test('shows nothing when someone confirmed while the key was being renewed', async () => {
    const server = fakeSupabase()
    const client = server.client()
    await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: REDIRECT })
    await signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD })
    const wrapped = structuredClone(server.tables.vaults[0].wrapped_by_recovery)
    // Another device confirms after this sign-in read the vault, before its write.
    server.beforeEachRequest((request) => {
      if (request.method === 'PATCH') {
        server.beforeEachRequest(null)
        server.tables.vaults[0].recovery_confirmed_at = new Date().toISOString()
      }
    })

    expect(await signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD })).toEqual(unlocked(false))
    expect(server.tables.vaults[0].wrapped_by_recovery).toEqual(wrapped)
  })

  test('renewing again until the key is confirmed', async () => {
    const server = fakeSupabase()
    const client = server.client()
    await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: REDIRECT })
    await signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD })
    const second = await signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD })
    const third = await signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD })
    expect(second.status).toBe('renewed-recovery')
    expect(third.status).toBe('renewed-recovery')
  })

  test('does not renew a confirmed key', async () => {
    const server = fakeSupabase()
    const client = server.client()
    await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: REDIRECT })
    const first = await signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD })
    await confirmRecoveryKeySeen(client, shown(first))
    expect(server.tables.vaults[0].recovery_confirmed_at).toEqual(expect.any(String))
    const wrapped = structuredClone(server.tables.vaults[0].wrapped_by_recovery)

    expect(await signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD })).toEqual(unlocked(true))
    expect(server.tables.vaults[0].wrapped_by_recovery).toEqual(wrapped)
  })

  test('using the recovery key confirms it', async () => {
    const server = fakeSupabase()
    const client = server.client()
    await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: REDIRECT })
    const first = await signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD })
    if (first.status !== 'new-vault') throw new Error('expected a new vault')
    await resetWithRecoveryKey(client, { recoveryDisplay: first.recoveryDisplay, newPassword: 'another long password', email: EMAIL })

    expect(await signIn(client, memoryKeyStore(), { email: EMAIL, password: 'another long password' })).toEqual(unlocked(true))
  })

  test('a failure while renewing fails the sign-in and closes the session', async () => {
    const server = fakeSupabase()
    const client = server.client()
    const keys = memoryKeyStore()
    await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: REDIRECT })
    await signIn(client, keys, { email: EMAIL, password: PASSWORD })
    server.beforeEachRequest((request) => {
      if (request.method === 'PATCH' && request.path.startsWith('/rest/v1/vaults')) throw new Error('offline')
    })

    await expect(signIn(client, keys, { email: EMAIL, password: PASSWORD })).rejects.toThrow()
    expect(await keys.get(server.user!.id)).toBeNull()
  })

  test('a second device opens the existing vault', async () => {
    const server = fakeSupabase()
    const phone = server.client()
    const phoneKeys = memoryKeyStore()
    await signUp(phone, { email: EMAIL, password: PASSWORD, redirectTo: REDIRECT })
    const firstSignIn = await signIn(phone, phoneKeys, { email: EMAIL, password: PASSWORD })
    await confirmRecoveryKeySeen(phone, shown(firstSignIn))
    const userId = server.user!.id
    const id = await saveDocument(phone, (await phoneKeys.get(userId))!, {
      kind: 'profile',
      value: { name: 'Alix' },
    })

    const laptop = server.client()
    const laptopKeys = memoryKeyStore()
    expect(await signIn(laptop, laptopKeys, { email: EMAIL, password: PASSWORD })).toEqual(unlocked(true))
    expect(await loadDocuments(laptop, (await laptopKeys.get(userId))!, 'profile')).toEqual({
      documents: [{ id, value: { name: 'Alix' }, updatedAt: expect.any(String), createdAt: expect.any(String) }],
      unreadable: [],
    })
    expect(server.tables.vaults).toHaveLength(1)
  })

  test('a wrong password leaves the vault untouched', async () => {
    const server = fakeSupabase()
    const client = server.client()
    await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: REDIRECT })

    // Before the vault exists: nothing is even asked of the vaults table.
    await expect(
      signIn(client, memoryKeyStore(), { email: EMAIL, password: 'wrong horse battery' }),
    ).rejects.toBeInstanceOf(WrongCredentialsError)
    expect(vaultRequests(server.recorded)).toEqual([])
    expect(server.tables.vaults).toEqual([])

    // Once it exists: it stays exactly as it was.
    await signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD })
    const before = structuredClone(server.tables.vaults)
    const mark = server.recorded.length
    await expect(
      signIn(server.client(), memoryKeyStore(), { email: EMAIL, password: 'wrong horse battery' }),
    ).rejects.toBeInstanceOf(WrongCredentialsError)
    expect(vaultWrites(server.recorded.slice(mark))).toEqual([])
    expect(server.tables.vaults).toEqual(before)
    expect(JSON.stringify(server.recorded)).not.toContain('wrong horse battery')
  })

  test('an address not yet confirmed is told apart from a wrong password', async () => {
    const server = fakeSupabase()
    const client = server.client()
    await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: REDIRECT })

    server.refuseNextSignIn('email_not_confirmed')
    await expect(
      signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD }),
    ).rejects.toBeInstanceOf(EmailNotConfirmedError)

    // Any other refusal, even with the same status, is passed on as Supabase gave it.
    server.refuseNextSignIn('validation_failed')
    const other = await signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD }).catch(
      (error: unknown) => error,
    )
    expect(other).not.toBeInstanceOf(WrongCredentialsError)
    expect(other).toMatchObject({ name: 'AuthApiError', status: 400, code: 'validation_failed' })
    expect(vaultRequests(server.recorded)).toEqual([])
  })

  test('a vault that does not open signs the person back out', async () => {
    const server = fakeSupabase()
    const client = server.client()
    const keys = memoryKeyStore()
    await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: REDIRECT })
    await signIn(client, keys, { email: EMAIL, password: PASSWORD })

    // The vault now answers to a key this password does not give.
    const { keyEncryptionKey: other } = await deriveSecrets('some other password', EMAIL)
    server.tables.vaults[0].wrapped_by_password = await wrapDataKey(await generateDataKey(), other)
    const mark = server.recorded.length

    await expect(signIn(client, keys, { email: EMAIL, password: PASSWORD })).rejects.toBeInstanceOf(
      WrongPasswordError,
    )
    expect(await keys.get(server.user!.id)).toBeNull()
    expect((await client.auth.getSession()).data.session).toBeNull()
    expect(server.recorded.slice(mark).some((r) => r.path.startsWith('/auth/v1/logout'))).toBe(true)
  })

  test('two tabs creating the vault at once end with a single vault', async () => {
    const server = fakeSupabase()
    const tabA = server.client()
    const keysA = memoryKeyStore()
    await signUp(tabA, { email: EMAIL, password: PASSWORD, redirectTo: REDIRECT })
    expect((await signIn(tabA, keysA, { email: EMAIL, password: PASSWORD })).status).toBe('new-vault')

    // Tab B looked for the vault before tab A's insert landed, so it tries to create one too.
    const tabB = server.client()
    const keysB = memoryKeyStore()
    server.simulateStaleVaultRead()
    expect(await signIn(tabB, keysB, { email: EMAIL, password: PASSWORD })).toEqual(unlocked(false))
    const inserts = vaultWrites(server.recorded).filter((r) => r.method === 'POST')
    expect(inserts.map((r) => r.status)).toEqual([201, 409])
    expect(server.tables.vaults).toHaveLength(1)

    // Both tabs hold the same data key.
    const userId = server.user!.id
    const id = await saveDocument(tabA, (await keysA.get(userId))!, { kind: 'goals', value: [1, 2] })
    expect(await loadDocuments(tabB, (await keysB.get(userId))!, 'goals')).toEqual({
      documents: [{ id, value: [1, 2], updatedAt: expect.any(String), createdAt: expect.any(String) }],
      unreadable: [],
    })

    const { keyEncryptionKey } = await deriveSecrets(PASSWORD, EMAIL)
    expect(await createVault(tabB, keyEncryptionKey)).toEqual({ alreadyExists: true })
  })

  // iOS Safari can lose its connection to IndexedDB. The key then stays on the
  // device; the session must not stay open with it, and the failure must be
  // told apart from a session that was already dead.
  test('closes the session even when the device cannot forget its key, and says so', async () => {
    const server = fakeSupabase()
    const client = server.client()
    const keys = memoryKeyStore()
    await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: REDIRECT })
    await signIn(client, keys, { email: EMAIL, password: PASSWORD })
    const userId = server.user!.id

    const lost = new DOMException('Connection to Indexed Database server lost', 'UnknownError')
    const broken: KeyStore = { ...keys, clear: () => Promise.reject(lost) }
    const outcome = await signOut(client, broken).then(
      () => null,
      (error: unknown) => error,
    )

    expect(outcome).toBeInstanceOf(DeviceKeyNotClearedError)
    expect((outcome as Error).cause).toBe(lost)
    expect((await client.auth.getSession()).data.session).toBeNull()
    expect(server.recorded.some((r) => r.path.startsWith('/auth/v1/logout'))).toBe(true)
    // The key really is still there: the error is the only thing that says so.
    expect(await keys.get(userId)).toBeInstanceOf(CryptoKey)
  })
})

// What the tab keeps between two screens (lib/app/session-memory.ts) never
// outlives the session it was opened in.
describe('the tab’s memory between screens', () => {
  const model: Model = {
    profile: null,
    snapshots: [],
    goals: [],
    settings: null,
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
  }
  function remember(client: ReturnType<ReturnType<typeof fakeSupabase>['client']>) {
    rememberVault({ userId: 'someone', dataKey: {} as CryptoKey }, vaultMark())
    rememberModel({ userId: 'someone', model, client }, modelMark())
  }

  test('signing out forgets the vault and the model first, before the keys and the session', async () => {
    const server = fakeSupabase()
    const client = server.client()
    remember(client)
    const seen: unknown[] = []
    const keys: KeyStore = {
      ...memoryKeyStore(),
      clear: async () => {
        seen.push(rememberedVault(), rememberedModel('someone'))
      },
    }

    await signOut(client, keys)
    expect(seen).toEqual([null, null])
    expect(rememberedVault()).toBeNull()
    expect(rememberedModel('someone')).toBeNull()
  })

  // Whoever signs in next, in this tab, never sees the screens of the one before.
  test('signing in forgets the vault and the model first, whatever comes of it', async () => {
    const server = fakeSupabase()
    const client = server.client()
    remember(client)

    const signingIn = signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD })
    expect(rememberedVault()).toBeNull()
    expect(rememberedModel('someone')).toBeNull()
    await expect(signingIn).rejects.toBeInstanceOf(WrongCredentialsError)
  })
})

describe('signIn, for Face ID', () => {
  test('an unlocked vault hands back the key that opens it, for this person', async () => {
    const server = fakeSupabase()
    const client = server.client()
    await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: REDIRECT })
    await confirmRecoveryKeySeen(client, shown(await signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD })))

    const result = await signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD })
    if (result.status !== 'unlocked') throw new Error('expected an unlocked vault')

    expect(result.faceId.userId).toBe(server.user!.id)
    expect(result.faceId.recoveryConfirmed).toBe(true)
    // The key derived from the password, which the page can use but never read
    // out: the one the password packet opens with.
    expect(result.faceId.keyEncryptionKey.extractable).toBe(false)
    const passwordPacket = server.tables.vaults[0].wrapped_by_password as Sealed
    await expect(unwrapDataKey(passwordPacket, result.faceId.keyEncryptionKey)).resolves.toBeInstanceOf(CryptoKey)
  })

  test('a new vault or a renewed recovery key carries nothing for Face ID', async () => {
    const server = fakeSupabase()
    const client = server.client()
    await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: REDIRECT })

    const first = await signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD })
    expect(first.status).toBe('new-vault')
    expect(first).not.toHaveProperty('faceId')

    const second = await signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD })
    expect(second.status).toBe('renewed-recovery')
    expect(second).not.toHaveProperty('faceId')
  })

  // The sequences below are those signIn sent before Face ID existed.
  test('every sign-in sends exactly the requests it sent before', async () => {
    const server = fakeSupabase()
    const client = server.client()
    await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: REDIRECT })
    async function sent(run: () => Promise<unknown>): Promise<string[]> {
      const mark = server.recorded.length
      await run()
      return server.recorded
        .slice(mark)
        .map((r) => `${r.method} ${r.path.replaceAll(server.user!.id, '<user>').replace(/iv=eq\.[^&]+/, 'iv=eq.<iv>')}`)
    }
    const signInHere = () => signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD })
    const opening = [
      'POST /auth/v1/token?grant_type=password',
      'GET /auth/v1/user',
      'GET /rest/v1/vaults?select=wrapped_by_password&user_id=eq.<user>',
      'GET /auth/v1/user',
    ]

    expect(await sent(signInHere)).toEqual([...opening, 'POST /rest/v1/vaults'])

    let renewed = ''
    expect(
      await sent(async () => {
        renewed = shown(await signInHere())
      }),
    ).toEqual([
      ...opening,
      'GET /rest/v1/vaults?select=recovery_confirmed_at&user_id=eq.<user>',
      'GET /auth/v1/user',
      'GET /rest/v1/vaults?select=wrapped_by_password&user_id=eq.<user>',
      'GET /rest/v1/vaults?select=wrapped_by_recovery&user_id=eq.<user>',
      'PATCH /rest/v1/vaults?user_id=eq.<user>&wrapped_by_recovery-%3E%3Eiv=eq.<iv>&recovery_confirmed_at=is.null&select=user_id',
    ])

    await confirmRecoveryKeySeen(client, renewed)
    expect(await sent(signInHere)).toEqual([
      ...opening,
      'GET /rest/v1/vaults?select=recovery_confirmed_at&user_id=eq.<user>',
    ])
  })
})
