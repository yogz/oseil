// The vault and the documents, as stored by Supabase. Everything describing a
// person's situation is sealed here, in the browser, before it is sent: the
// server only ever receives `{ iv, ciphertext }` packets, the derivation
// parameters, and dates.
//
// Every read and write names the signed-in person's id explicitly. Row-level
// security would refuse anyone else's rows anyway; filtering here as well means
// a policy mistake on the server is not enough to mix two people's data.

import type { SupabaseClient } from '@supabase/supabase-js'
import { forgetInEveryTab } from '@/lib/app/session-memory'
import { KDF_PARAMS, deriveSecrets, normalizeEmail } from './kdf'
import {
  InvalidRecoveryKeyError,
  generateDataKey,
  generateRecoveryKey,
  recoveryKeyFromDisplay,
  unwrapDataKey,
  wrapDataKey,
} from './keys'
import { VaultOpenError, open, seal, type Sealed } from './seal'

export type DocumentKind = 'profile' | 'snapshot' | 'draft' | 'goals' | 'settings'

// The number written in clear on each document. A packet sealed under another
// scheme is never opened as if it were this one.
export const DOCUMENT_FORMAT = 1

// Binds a packet to its owner, its kind and its id: copied to another row, it
// no longer opens. The "v1" is written out, not built from DOCUMENT_FORMAT:
// these bytes are part of every stored packet, so bumping the constant must
// not silently change them (a golden test pins them). The id is lowercased
// because Postgres prints uuids in lowercase.
export function documentAad(userId: string, kind: DocumentKind, id: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`stefin:doc:v1:${userId}:${kind}:${id.toLowerCase()}`)
}

export const MIN_PASSWORD_LENGTH = 10

export class WrongPasswordError extends Error {
  constructor() {
    super('The password does not open this vault')
    this.name = 'WrongPasswordError'
  }
}

export class PasswordTooShortError extends Error {
  constructor() {
    super(`A password needs at least ${MIN_PASSWORD_LENGTH} characters`)
    this.name = 'PasswordTooShortError'
  }
}

// The vault was sealed for the new password, but the session did not take it:
// the vault opens with the new password, the sign-in still takes the old one.
// Retrying with the new password in both fields finishes the change.
export class PasswordHalfChangedError extends Error {
  constructor(options?: ErrorOptions) {
    super('The vault took the new password, the session did not', options)
    this.name = 'PasswordHalfChangedError'
  }
}

// The address is part of the derivation: sealing the vault for an address that
// is not the account's would lock the person out at the next sign-in.
export class EmailMismatchError extends Error {
  constructor() {
    super("The address given does not belong to the signed-in account")
    this.name = 'EmailMismatchError'
  }
}

// Postgres unique_violation: the vault of this person already exists.
const UNIQUE_VIOLATION = '23505'

// Counted in characters as a person sees them, not in UTF-16 units.
export function assertPasswordLength(password: string): void {
  if ([...password.normalize('NFC')].length < MIN_PASSWORD_LENGTH) throw new PasswordTooShortError()
}

function fail(action: string, error: { message: string }): never {
  throw new Error(`${action}: ${error.message}`, { cause: error })
}

// AES-GCM refuses a wrong key with an OperationError; anything else is not a
// question of key and is passed on untouched.
function isWrongKey(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'OperationError'
}

async function signedInUser(client: SupabaseClient): Promise<{ id: string; email: string }> {
  const result = await client.auth.getUser()
  if (result.error) throw result.error
  return { id: result.data.user.id, email: normalizeEmail(result.data.user.email ?? '') }
}

// Asks the server who is signed in (not the session kept in the browser).
export async function signedInUserId(client: SupabaseClient): Promise<string> {
  return (await signedInUser(client)).id
}

// The signed-in user's id, once the address typed is known to be theirs.
export async function signedInUserWithEmail(client: SupabaseClient, email: string): Promise<string> {
  const user = await signedInUser(client)
  if (normalizeEmail(email) !== user.email) throw new EmailMismatchError()
  return user.id
}

export async function createVault(
  client: SupabaseClient,
  keyEncryptionKey: CryptoKey,
): Promise<{ dataKey: CryptoKey; recoveryDisplay: string } | { alreadyExists: true }> {
  const userId = await signedInUserId(client)
  const dataKey = await generateDataKey()
  const recovery = await generateRecoveryKey()
  const wrappedByPassword = await wrapDataKey(dataKey, keyEncryptionKey)

  const { error } = await client.from('vaults').insert({
    user_id: userId,
    kdf: KDF_PARAMS,
    wrapped_by_password: wrappedByPassword,
    wrapped_by_recovery: await wrapDataKey(dataKey, recovery.key),
  })
  // Another tab or device got there first: one vault per person, theirs stands.
  if (error?.code === UNIQUE_VIOLATION) return { alreadyExists: true }
  if (error) fail('Could not create the vault', error)

  // The new key had to be extractable to be wrapped. The one handed back, the
  // one kept on the device, is not.
  return {
    dataKey: await unwrapDataKey(wrappedByPassword, keyEncryptionKey),
    recoveryDisplay: recovery.display,
  }
}

// One lock's packet of the person's vault, or null when they have no vault yet.
export async function readVault(
  client: SupabaseClient,
  userId: string,
  column: 'wrapped_by_password' | 'wrapped_by_recovery',
): Promise<Sealed | null> {
  const { data, error } = await client
    .from('vaults')
    .select(column)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) fail('Could not read the vault', error)
  const row = data as Record<typeof column, Sealed> | null
  return row ? row[column] : null
}

// Whether the person has said they put the recovery key aside. A key that was
// shown but never confirmed is not trusted to exist anywhere.
export async function isRecoveryKeyConfirmed(client: SupabaseClient): Promise<boolean> {
  const userId = await signedInUserId(client)
  const { data, error } = await client
    .from('vaults')
    .select('recovery_confirmed_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) fail('Could not read the vault', error)
  if (!data) throw new Error('No vault to read the recovery confirmation from')
  return data.recovery_confirmed_at != null
}

// The key on a screen was replaced by a newer one (a sign-in on another device
// renewed it): confirming it would mark a dead key as safe.
export class RecoveryKeyReplacedError extends Error {
  constructor() {
    super('The recovery key shown is no longer the vault’s')
    this.name = 'RecoveryKeyReplacedError'
  }
}

// Confirms the key that is on the screen, not just "a key": it must still open
// the vault's packet, checked on the device, and the write only lands on that
// very packet (told by its iv, which the server already holds). The key itself
// is never sent. The date is the device's: it only tells "confirmed" from "not
// yet".
export async function confirmRecoveryKeySeen(client: SupabaseClient, recoveryDisplay: string): Promise<void> {
  const userId = await signedInUserId(client)
  const wrapped = await readVault(client, userId, 'wrapped_by_recovery')
  if (!wrapped) throw new RecoveryKeyReplacedError()
  try {
    await unwrapDataKey(wrapped, await recoveryKeyFromDisplay(recoveryDisplay))
  } catch (error) {
    if (isWrongKey(error)) throw new RecoveryKeyReplacedError()
    throw error
  }
  const { data, error } = await client
    .from('vaults')
    .update({ recovery_confirmed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('wrapped_by_recovery->>iv', wrapped.iv)
    .select('user_id')
  if (error) fail('Could not confirm the recovery key', error)
  if (data.length === 0) throw new RecoveryKeyReplacedError()
  if (data.length !== 1) throw new Error(`Confirming touched ${data.length} vaults instead of one`)
}

// The key shown earlier was never confirmed, so it may be lost: seal the data
// key with a new one, which replaces it. The old key opens nothing from here on.
// The write only lands on the packet that was read, and only while nobody has
// confirmed; otherwise another device got there first and null is returned,
// with nothing to show.
export async function renewRecoveryKey(
  client: SupabaseClient,
  keyEncryptionKey: CryptoKey,
): Promise<string | null> {
  const userId = await signedInUserId(client)
  const wrapped = await readVault(client, userId, 'wrapped_by_password')
  const previous = await readVault(client, userId, 'wrapped_by_recovery')
  if (!wrapped || !previous) throw new Error('No vault to renew the recovery key of')
  let dataKey: CryptoKey
  try {
    dataKey = await unwrapDataKey(wrapped, keyEncryptionKey, { extractable: true })
  } catch (error) {
    if (isWrongKey(error)) throw new WrongPasswordError()
    throw error
  }
  const recovery = await generateRecoveryKey()
  const { data, error } = await client
    .from('vaults')
    .update({ wrapped_by_recovery: await wrapDataKey(dataKey, recovery.key), updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('wrapped_by_recovery->>iv', previous.iv)
    .is('recovery_confirmed_at', null)
    .select('user_id')
  if (error) fail('Could not renew the recovery key', error)
  if (data.length === 0) return null
  if (data.length !== 1) throw new Error(`Renewing touched ${data.length} vaults instead of one`)
  return recovery.display
}

export async function unlockVault(
  client: SupabaseClient,
  keyEncryptionKey: CryptoKey,
): Promise<CryptoKey | 'missing'> {
  const userId = await signedInUserId(client)
  const wrapped = await readVault(client, userId, 'wrapped_by_password')
  if (!wrapped) return 'missing'
  try {
    return await unwrapDataKey(wrapped, keyEncryptionKey)
  } catch (error) {
    if (isWrongKey(error)) throw new WrongPasswordError()
    throw error
  }
}

// GoTrue refuses a password equal to the current one. Here that means an
// earlier attempt already changed it (its answer was lost, or the person
// retried), and the vault has just been sealed for it again: the goal is met.
async function setPassword(client: SupabaseClient, authSecret: string): Promise<void> {
  const { error } = await client.auth.updateUser({ password: authSecret })
  if (error && error.code !== 'same_password') throw error
}

// Everything that can refuse — the new password's length, the key's format,
// the address, the key itself — is checked before anything is written.
export async function resetWithRecoveryKey(
  client: SupabaseClient,
  input: { recoveryDisplay: string; newPassword: string; email: string },
): Promise<CryptoKey> {
  assertPasswordLength(input.newPassword)
  const recoveryKey = await recoveryKeyFromDisplay(input.recoveryDisplay)
  const userId = await signedInUserWithEmail(client, input.email)
  const wrapped = await readVault(client, userId, 'wrapped_by_recovery')
  if (!wrapped) throw new InvalidRecoveryKeyError()

  let dataKey: CryptoKey
  try {
    dataKey = await unwrapDataKey(wrapped, recoveryKey, { extractable: true })
  } catch (error) {
    if (isWrongKey(error)) throw new InvalidRecoveryKeyError()
    throw error
  }

  const { authSecret, keyEncryptionKey } = await deriveSecrets(input.newPassword, input.email)
  const wrappedByPassword = await wrapDataKey(dataKey, keyEncryptionKey)
  const { data, error } = await client
    .from('vaults')
    .update({
      wrapped_by_password: wrappedByPassword,
      // Opening the vault with the key proves the person has it.
      recovery_confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    // Only the packet that was just opened: if another device renewed the key
    // since, the typed one is dead and must not be marked as confirmed.
    .eq('wrapped_by_recovery->>iv', wrapped.iv)
    .select('user_id')
  if (error) fail('Could not reseal the vault', error)
  if (data.length === 0) throw new InvalidRecoveryKeyError()
  // Changing the password without a resealed vault would leave nothing it opens.
  if (data.length !== 1) throw new Error(`Resealing touched ${data.length} vaults instead of one`)

  await setPassword(client, authSecret)

  return unwrapDataKey(wrappedByPassword, keyEncryptionKey)
}

// Unwraps the data key from the password packet, extractable, to be sealed again.
async function unwrapWithPassword(wrapped: Sealed, password: string, email: string): Promise<CryptoKey> {
  const { keyEncryptionKey } = await deriveSecrets(password, email)
  try {
    return await unwrapDataKey(wrapped, keyEncryptionKey, { extractable: true })
  } catch (error) {
    if (isWrongKey(error)) throw new WrongPasswordError()
    throw error
  }
}

// After a write that answered with an error: whether it landed all the same,
// i.e. the packet stored now is the one just sealed (its iv is new for every seal).
// A read that fails too says nothing, and the first failure stands.
async function landed(
  client: SupabaseClient,
  userId: string,
  column: 'wrapped_by_password' | 'wrapped_by_recovery',
  iv: string,
): Promise<boolean> {
  try {
    return (await readVault(client, userId, column))?.iv === iv
  } catch {
    return false
  }
}

// The order is what keeps a vault some secret opens: the old password opens
// the packet (nothing is written otherwise), the packet is sealed again for the
// new one, and only then does the session take the new secret. Should that last
// step fail, the vault opens with the new password while the session still
// takes the old secret: a retry typing the new password as the old one opens
// the packet again and sets the session. The recovery key and the Face ID
// packets seal the same data key, which does not change: they keep opening.
export async function changePassword(
  client: SupabaseClient,
  input: { email: string; oldPassword: string; newPassword: string },
): Promise<CryptoKey> {
  assertPasswordLength(input.oldPassword)
  assertPasswordLength(input.newPassword)
  const userId = await signedInUserWithEmail(client, input.email)
  const wrapped = await readVault(client, userId, 'wrapped_by_password')
  if (!wrapped) throw new Error('No vault to change the password of')
  const dataKey = await unwrapWithPassword(wrapped, input.oldPassword, input.email)

  const { authSecret, keyEncryptionKey } = await deriveSecrets(input.newPassword, input.email)
  const wrappedByPassword = await wrapDataKey(dataKey, keyEncryptionKey)
  const { data, error } = await client
    .from('vaults')
    .update({ wrapped_by_password: wrappedByPassword, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    // Only the packet the old password just opened: if another device changed
    // the password since, the one typed is no longer the current one.
    .eq('wrapped_by_password->>iv', wrapped.iv)
    .select('user_id')
  if (error) {
    // The answer may have been lost after the write landed: the packet read back tells.
    if (!(await landed(client, userId, 'wrapped_by_password', wrappedByPassword.iv))) {
      fail('Could not reseal the vault', error)
    }
  } else {
    if (data.length === 0) throw new WrongPasswordError()
    // Changing the password without a resealed vault would leave nothing it opens.
    if (data.length !== 1) throw new Error(`Resealing touched ${data.length} vaults instead of one`)
  }

  try {
    await setPassword(client, authSecret)
  } catch (cause) {
    throw new PasswordHalfChangedError({ cause })
  }

  return unwrapDataKey(wrappedByPassword, keyEncryptionKey)
}

// A new recovery key, asked for from the settings: the typed password opens the
// data key, which is sealed for a new key; the old key opens nothing from here
// on. The new one is not trusted until confirmed, as in the first launch. The
// write only lands on the packet that was read: when another device replaced
// it in between, nothing is written over theirs, and null is returned.
export async function remakeRecoveryKey(
  client: SupabaseClient,
  input: { email: string; password: string },
): Promise<string | null> {
  const userId = await signedInUserWithEmail(client, input.email)
  const wrapped = await readVault(client, userId, 'wrapped_by_password')
  const previous = await readVault(client, userId, 'wrapped_by_recovery')
  if (!wrapped || !previous) throw new Error('No vault to remake the recovery key of')
  const dataKey = await unwrapWithPassword(wrapped, input.password, input.email)

  const recovery = await generateRecoveryKey()
  const sealed = await wrapDataKey(dataKey, recovery.key)
  const { data, error } = await client
    .from('vaults')
    .update({
      wrapped_by_recovery: sealed,
      recovery_confirmed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('wrapped_by_recovery->>iv', previous.iv)
    .select('user_id')
  if (error) {
    if (await landed(client, userId, 'wrapped_by_recovery', sealed.iv)) return recovery.display
    fail('Could not remake the recovery key', error)
  }
  if (data.length === 0) return null
  if (data.length !== 1) throw new Error(`Remaking touched ${data.length} vaults instead of one`)
  return recovery.display
}

// Supabase's own passkeys sign the person in without a password; once their
// vault packets are gone they have nothing left to open. A failure here is
// logged and must not stop the new vault.
async function deleteAuthPasskeys(client: SupabaseClient): Promise<void> {
  try {
    const listed = await client.auth.passkey.list()
    if (listed.error) throw listed.error
    for (const { id } of listed.data) {
      try {
        const deleted = await client.auth.passkey.delete({ passkeyId: id })
        if (deleted.error) throw deleted.error
      } catch (error) {
        console.error('Could not delete a passkey of the account', error)
      }
    }
  } catch (error) {
    console.error('Could not list the passkeys of the account', error)
  }
}

// Without the recovery key the old documents can never be opened again: erase
// them, set the new password, and begin with an empty vault.
export async function startOver(
  client: SupabaseClient,
  input: { newPassword: string; email: string },
): Promise<{ dataKey: CryptoKey; recoveryDisplay: string }> {
  // The documents and the key that opens them are about to go: what any tab
  // kept of them goes first (lib/app/session-memory.ts).
  forgetInEveryTab()
  assertPasswordLength(input.newPassword)
  const userId = await signedInUserWithEmail(client, input.email)
  // Derived before erasing: nothing is lost until the new password is ready.
  const { authSecret, keyEncryptionKey } = await deriveSecrets(input.newPassword, input.email)

  // First, and alone able to stop everything: the Face ID packets open the
  // old data key, so they must not outlive the vault. Nothing is irreversible yet.
  const packets = await client.from('vault_passkeys').delete().eq('user_id', userId)
  if (packets.error) fail('Could not erase the Face ID packets', packets.error)
  await deleteAuthPasskeys(client)

  const documents = await client.from('documents').delete().eq('user_id', userId)
  if (documents.error) fail('Could not erase the documents', documents.error)
  const vault = await client.from('vaults').delete().eq('user_id', userId)
  if (vault.error) fail('Could not erase the vault', vault.error)

  await setPassword(client, authSecret)

  const created = await createVault(client, keyEncryptionKey)
  if ('alreadyExists' in created) throw new Error('A vault reappeared while starting over')
  return created
}

export async function saveDocument<T>(
  client: SupabaseClient,
  dataKey: CryptoKey,
  input: { kind: DocumentKind; id?: string; value: T },
): Promise<string> {
  const userId = await signedInUserId(client)

  if (input.id === undefined) {
    // The id is chosen here because the packet is sealed for it.
    const id = crypto.randomUUID()
    const { iv, ciphertext } = await seal(dataKey, input.value, documentAad(userId, input.kind, id))
    const { error } = await client
      .from('documents')
      .insert({ id, user_id: userId, kind: input.kind, format: DOCUMENT_FORMAT, iv, ciphertext })
    if (error) fail('Could not save the document', error)
    return id
  }

  const { iv, ciphertext } = await seal(
    dataKey,
    input.value,
    documentAad(userId, input.kind, input.id),
  )
  const { data, error } = await client
    .from('documents')
    .update({ iv, ciphertext, format: DOCUMENT_FORMAT, updated_at: new Date().toISOString() })
    .eq('id', input.id)
    .eq('user_id', userId)
    .eq('kind', input.kind)
    .select('id')
  if (error) fail('Could not save the document', error)
  if (data.length === 0) throw new Error(`No ${input.kind} document ${input.id} to update`)
  return input.id
}

// The document is no longer the one this device last read or wrote: another device wrote
// it (or erased it, or took its place) in between. Nothing was written over that work.
export class DocumentChangedError extends Error {
  constructor(readonly kind: DocumentKind) {
    super(`The ${kind} document changed since this device last read or wrote it`)
    this.name = 'DocumentChangedError'
  }
}

// Writes a document only while its `updated_at` is still a version this device knows: the
// one it last read or wrote, or the one an attempt whose answer was lost may have left.
// The write sets `version`, drawn by the caller (and kept across its retries). When
// another device wrote in between, no row matches, the database writes nothing, and this
// throws DocumentChangedError. The version is a date, which already travels in clear.
export async function saveDocumentIfUnchanged<T>(
  client: SupabaseClient,
  dataKey: CryptoKey,
  input: { kind: DocumentKind; id: string; value: T; versions: string[]; version: string },
): Promise<string> {
  const userId = await signedInUserId(client)
  const { iv, ciphertext } = await seal(dataKey, input.value, documentAad(userId, input.kind, input.id))
  const { data, error } = await client
    .from('documents')
    .update({ iv, ciphertext, format: DOCUMENT_FORMAT, updated_at: input.version })
    .eq('id', input.id)
    .eq('user_id', userId)
    .eq('kind', input.kind)
    .in('updated_at', input.versions)
    .select('id')
  if (error) fail('Could not save the document', error)
  if (data.length === 0) throw new DocumentChangedError(input.kind)
  return input.id
}

// Inserts a document under an id the caller drew, so that a retry after a lost answer
// meets its own row: a conflict (23505) falls back to updating that row by id, person
// and kind, which throws when none matches (a conflict on another row still fails).
// With a `version`, the row is created with it and the fallback is guarded on `versions`
// (the ones earlier attempts whose answer was lost may have left; by default only this
// one): a row another device wrote over, or a draft it started (one per person), is
// DocumentChangedError.
export async function insertDocument<T>(
  client: SupabaseClient,
  dataKey: CryptoKey,
  input: { kind: DocumentKind; id: string; value: T; version?: string; versions?: string[] },
): Promise<string> {
  const userId = await signedInUserId(client)
  const { iv, ciphertext } = await seal(dataKey, input.value, documentAad(userId, input.kind, input.id))
  const { version, versions, ...document } = input
  const { error } = await client.from('documents').insert({
    id: input.id,
    user_id: userId,
    kind: input.kind,
    format: DOCUMENT_FORMAT,
    iv,
    ciphertext,
    ...(version !== undefined ? { updated_at: version } : {}),
  })
  if (!error) return input.id
  if (error.code !== '23505') fail('Could not save the document', error)
  if (version !== undefined) {
    return saveDocumentIfUnchanged(client, dataKey, { ...document, versions: versions ?? [version], version })
  }
  return saveDocument(client, dataKey, document)
}

// The ids of the person's documents of these kinds, and nothing of their content: enough to
// tell whether another device added one since they were read.
export async function listDocumentIds(
  client: SupabaseClient,
  kinds: DocumentKind[],
): Promise<Array<{ id: string; kind: DocumentKind }>> {
  const userId = await signedInUserId(client)
  const { data, error } = await client.from('documents').select('id, kind').eq('user_id', userId).in('kind', kinds)
  if (error) fail('Could not read the documents', error)
  return data as Array<{ id: string; kind: DocumentKind }>
}

// The id and the version (`updated_at`) of the signed-in person's single document of a kind,
// without its content: to tell whether it was rewritten since it was read. Null: no such row.
export async function readDocumentVersion(
  client: SupabaseClient,
  kind: DocumentKind,
): Promise<{ id: string; updatedAt: string } | null> {
  const userId = await signedInUserId(client)
  const { data, error } = await client.from('documents').select('id, updated_at').eq('user_id', userId).eq('kind', kind)
  if (error) fail('Could not read the document', error)
  const rows = data as Array<{ id: string; updated_at: string }>
  return rows[0] ? { id: rows[0].id, updatedAt: rows[0].updated_at } : null
}

// Removes one document of the signed-in person, by its id and kind. An id that
// is already gone is not an error: the goal (no such document) is met. It never
// runs without all three filters.
export async function deleteDocument(client: SupabaseClient, kind: DocumentKind, id: string): Promise<void> {
  if (!id) throw new Error('No document id to delete')
  const userId = await signedInUserId(client)
  const { error } = await client.from('documents').delete().eq('id', id).eq('user_id', userId).eq('kind', kind)
  if (error) fail('Could not delete the document', error)
}

// Removes every draft of the signed-in person, whatever its id: for a draft that cannot
// be read (its id is lost). Drafts only, by person AND kind: it cannot reach anything else.
export async function deleteDrafts(client: SupabaseClient): Promise<void> {
  const userId = await signedInUserId(client)
  const { error } = await client.from('documents').delete().eq('user_id', userId).eq('kind', 'draft')
  if (error) fail('Could not delete the drafts', error)
}

// A document that cannot be opened is reported, not thrown: one damaged or
// foreign-format row must not hide the rest. `knownUserId`: the id `signedInUserId`
// just gave, when the caller reads several kinds in a row (one question to the
// server instead of one per kind).
export async function loadDocuments<T>(
  client: SupabaseClient,
  dataKey: CryptoKey,
  kind: DocumentKind,
  knownUserId?: string,
): Promise<{
  documents: Array<{ id: string; value: T; updatedAt: string; createdAt: string }>
  unreadable: string[]
}> {
  const userId = knownUserId ?? (await signedInUserId(client))
  const { data, error } = await client
    .from('documents')
    .select('id, format, iv, ciphertext, updated_at, created_at')
    .eq('user_id', userId)
    .eq('kind', kind)
    .order('created_at')
  if (error) fail('Could not read the documents', error)
  const rows = data as Array<{
    id: string
    format: number
    iv: string
    ciphertext: string
    updated_at: string
    created_at: string
  }>

  const documents: Array<{ id: string; value: T; updatedAt: string; createdAt: string }> = []
  const unreadable: string[] = []
  for (const row of rows) {
    if (row.format !== DOCUMENT_FORMAT) {
      unreadable.push(row.id)
      continue
    }
    try {
      const value = await open<T>(
        dataKey,
        { iv: row.iv, ciphertext: row.ciphertext },
        documentAad(userId, kind, row.id),
      )
      documents.push({ id: row.id, value, updatedAt: row.updated_at, createdAt: row.created_at })
    } catch (caught) {
      if (!(caught instanceof VaultOpenError)) throw caught
      unreadable.push(row.id)
    }
  }
  return { documents, unreadable }
}
