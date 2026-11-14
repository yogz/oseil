// Sign-up, sign-in and sign-out. The password never leaves the device: what
// Supabase receives as a "password" is the connection secret derived from it,
// and the other half of the derivation — the key that opens the vault — stays
// here.

import { idleClock } from '@/lib/app/idle-lock'
import { isAuthApiError, type SupabaseClient } from '@supabase/supabase-js'
import { forgetInEveryTab } from '@/lib/app/session-memory'
import type { KeyStore } from '@/lib/vault/device'
import { deriveSecrets, normalizeEmail } from '@/lib/vault/kdf'
import {
  WrongPasswordError,
  assertPasswordLength,
  createVault,
  isRecoveryKeyConfirmed,
  renewRecoveryKey,
  signedInUserWithEmail,
  unlockVault,
} from '@/lib/vault/store'
import { accountHere } from './account-here'
import { faceIdMarker } from './face-id-marker'
import { rememberedEmail } from './remembered-email'

export { PasswordTooShortError } from '@/lib/vault/store'

export class WrongCredentialsError extends Error {
  constructor(options?: ErrorOptions) {
    super('Wrong e-mail address or password', options)
    this.name = 'WrongCredentialsError'
  }
}

export class EmailNotConfirmedError extends Error {
  constructor(options?: ErrorOptions) {
    super('The e-mail address has not been confirmed yet', options)
    this.name = 'EmailNotConfirmedError'
  }
}

// The vault is not created here but at the first sign-in: the address has been
// confirmed by then, and the person is in front of a screen that can show the
// recovery key.
export async function signUp(
  client: SupabaseClient,
  input: { email: string; password: string; redirectTo: string },
): Promise<void> {
  assertPasswordLength(input.password)
  const { authSecret } = await deriveSecrets(input.password, input.email)
  const { error } = await client.auth.signUp({
    email: normalizeEmail(input.email),
    password: authSecret,
    options: { emailRedirectTo: input.redirectTo },
  })
  if (error) throw error
}

// The confirmation link once more, to the same address (planche 3 of the account screens). Only the
// address and the return address leave: nothing derived from the password.
export async function resendConfirmation(
  client: SupabaseClient,
  input: { email: string; redirectTo: string },
): Promise<void> {
  const { error } = await client.auth.resend({
    type: 'signup',
    email: normalizeEmail(input.email),
    options: { emailRedirectTo: input.redirectTo },
  })
  if (error) throw error
}

// What activating Face ID needs, handed to the sign-in page after an ordinary
// unlock. The page keeps it in memory only, until the person answers the offer.
export type FaceIdMaterial = {
  /** Opens the password packet. Never written anywhere. */
  keyEncryptionKey: CryptoKey
  userId: string
  /** Face ID is offered only once the recovery key is confirmed. */
  recoveryConfirmed: boolean
}

export async function signIn(
  client: SupabaseClient,
  keys: KeyStore,
  input: { email: string; password: string },
): Promise<
  | { status: 'unlocked'; faceId: FaceIdMaterial }
  | { status: 'new-vault'; recoveryDisplay: string }
  | { status: 'renewed-recovery'; recoveryDisplay: string }
> {
  // Whoever signs in, nothing any tab kept of an earlier session is shown to them.
  forgetInEveryTab()
  const { authSecret, keyEncryptionKey } = await deriveSecrets(input.password, input.email)
  const { data, error } = await client.auth.signInWithPassword({
    email: normalizeEmail(input.email),
    password: authSecret,
  })
  if (error) {
    // Only these two refusals have a meaning for the person. Anything else — a
    // network failure, an overloaded server, a rate limit — is passed on as is.
    if (error.code === 'invalid_credentials') throw new WrongCredentialsError({ cause: error })
    if (error.code === 'email_not_confirmed') throw new EmailNotConfirmedError({ cause: error })
    throw error
  }
  const userId = data.user.id

  // One key per device: whatever another account left here goes first.
  async function keep(dataKey: CryptoKey): Promise<void> {
    await keys.clear()
    await keys.set(userId, dataKey)
  }

  try {
    let dataKey = await unlockVault(client, keyEncryptionKey)
    if (dataKey === 'missing') {
      const created = await createVault(client, keyEncryptionKey)
      if ('dataKey' in created) {
        await keep(created.dataKey)
        return { status: 'new-vault', recoveryDisplay: created.recoveryDisplay }
      }
      // Another tab or device created it in the meantime: open that one. Its
      // recovery key is on that tab's screen right now, so it is not renewed
      // from here; if never confirmed, the next sign-in renews it.
      dataKey = await unlockVault(client, keyEncryptionKey)
      if (dataKey === 'missing') throw new Error('The vault could neither be created nor found')
      await keep(dataKey)
      // A vault created a moment ago: its key, on that tab's screen, is not
      // known to be confirmed, and reading it would add a request. No offer.
      return { status: 'unlocked', faceId: { keyEncryptionKey, userId, recoveryConfirmed: false } }
    }
    await keep(dataKey)
    // A key shown once and never confirmed may be lost: replace it, and show
    // the new one the same way.
    const recoveryConfirmed = await isRecoveryKeyConfirmed(client)
    if (!recoveryConfirmed) {
      const recoveryDisplay = await renewRecoveryKey(client, keyEncryptionKey)
      // Null: another device confirmed or renewed in the meantime; the key
      // that stands is theirs, and there is nothing to show here. Which of the
      // two is not known, so it is not counted as confirmed.
      if (recoveryDisplay !== null) return { status: 'renewed-recovery', recoveryDisplay }
    }
    return { status: 'unlocked', faceId: { keyEncryptionKey, userId, recoveryConfirmed } }
  } catch (error) {
    // Signed in, but without a key: close that session rather than leave one
    // open that opens nothing. The error that matters is the one above.
    await signOut(client, keys).catch(() => {})
    throw error
  }
}

// The device could not forget its keys (iOS Safari can lose its connection to
// IndexedDB). The session has been closed all the same, but a key is still on
// the device, and the person must be told: this is not a sign-out like another.
export class DeviceKeyNotClearedError extends Error {
  constructor(options?: ErrorOptions) {
    super('The keys on this device could not be erased; the session was closed', options)
    this.name = 'DeviceKeyNotClearedError'
  }
}

// What the tabs keep between two screens goes before anything else, in every
// tab (lib/app/session-memory.ts). Then every key on the device is forgotten,
// whatever state the session is in — even one that has expired and can no
// longer be loaded — so that nothing stays behind if closing the session
// fails. The session is closed even when forgetting the keys fails: a key
// left behind must not come with a session that opens it. A failure to forget
// outranks a failure to close, which is reported only once the keys are gone.
// Only this device is signed out: the others keep their session and their key.
export async function signOut(client: SupabaseClient, keys: KeyStore): Promise<void> {
  forgetInEveryTab()
  // No time of activity is left behind for the next person (lib/app/idle-lock.ts).
  idleClock.forget()
  let keysKept: { error: unknown } | null = null
  try {
    await keys.clear()
  } catch (error) {
    keysKept = { error }
  }

  let sessionError: unknown = null
  try {
    sessionError = (await client.auth.signOut({ scope: 'local' })).error
  } catch (error) {
    sessionError = error
  }

  if (keysKept) throw new DeviceKeyNotClearedError({ cause: keysKept.error })
  if (sessionError) throw sessionError
}

// Before deleting the account, the password typed again. The vault decides
// first, on the device: a password that does not open its packet sends
// nothing more. Then Supabase confirms it too, with the derived secret — never
// the password — so that a session already open is not enough on its own.
export async function confirmWithPassword(
  client: SupabaseClient,
  input: { email: string; password: string },
): Promise<void> {
  const { authSecret, keyEncryptionKey } = await deriveSecrets(input.password, input.email)
  // Another address would derive another key, and read as a wrong password.
  await signedInUserWithEmail(client, input.email)
  // The link to this screen shows only with the vault open: a vault missing is not a password question.
  if ((await unlockVault(client, keyEncryptionKey)) === 'missing') throw new Error('No vault to confirm against')
  const { error } = await client.auth.signInWithPassword({ email: normalizeEmail(input.email), password: authSecret })
  if (error) {
    if (error.code === 'invalid_credentials') throw new WrongPasswordError()
    throw error
  }
}

// GoTrue's answer for a session whose user no longer exists. Verified against GoTrue on the local
// Supabase copy on 12 November 2026: after `delete_my_account`, `getUser` with the old token answered
// `AuthApiError` 403 `user_not_found`.
export function isUserNotFound(error: unknown): boolean {
  return isAuthApiError(error) && error.code === 'user_not_found'
}

// Whether the account signed in here is gone from the server: after a refusal of the deletion (its
// answer was lost), or on another device after the deletion. Only GoTrue saying the session's user
// no longer exists says yes. Anything else — a user still there, a session refused for another reason
// (expired, signed out), the network — says nothing: wiping the device of an account that still
// exists would be worse.
export async function accountGone(client: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await client.auth.getUser()
    if (data.user) return false
    return isUserNotFound(error)
  } catch {
    return false
  }
}

// Once the account is gone from the server, the device forgets it: the Face ID mark, « un compte a
// servi ici », the remembered address, the keys and the session (signOut forgets what the tabs keep first). The session is
// dead on the server by then, so closing it may well fail, and that says nothing; a key the device
// could not forget still must be told.
export async function finishDeletion(client: SupabaseClient, keys: KeyStore): Promise<void> {
  faceIdMarker.clear()
  accountHere.clear()
  rememberedEmail.clear()
  try {
    await signOut(client, keys)
  } catch (signOutError) {
    if (signOutError instanceof DeviceKeyNotClearedError) throw signOutError
  }
}

// What the tabs keep goes first, as at every sign-out. Then the account, in one call
// (`public.delete_my_account()`: everything of the person cascades from it). Only once it is gone
// does the device forget it (finishDeletion).
export async function deleteAccount(client: SupabaseClient, keys: KeyStore): Promise<void> {
  forgetInEveryTab()
  const { error } = await client.rpc('delete_my_account')
  if (error && !(await accountGone(client))) {
    throw new Error(`Could not delete the account: ${error.message}`, { cause: error })
  }
  await finishDeletion(client, keys)
}
