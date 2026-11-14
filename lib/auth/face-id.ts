// Face ID: a passkey becomes the vault's third lock. It is activated right
// after a password sign-in, whose key opens the password packet: the data key
// inside is sealed again, for the passkey's PRF secret, and that packet is
// stored in `vault_passkeys`. Signing in with Face ID opens the session and,
// with the same tap, that packet. The secret itself never leaves the device.

import { isAuthApiError, type SupabaseClient } from '@supabase/supabase-js'
import { forgetInEveryTab } from '@/lib/app/session-memory'
import { todayIso } from '@/lib/dates'
import type { IsoDate } from '@/lib/model/types'
import type { KeyStore } from '@/lib/vault/device'
import { unwrapDataKey, wrapDataKey } from '@/lib/vault/keys'
import { forServer, passkeyAad, prfSalt, wrappingKeyFromPrf } from '@/lib/vault/passkey'
import type { Sealed } from '@/lib/vault/seal'
import { readVault } from '@/lib/vault/store'
import { signOut } from './account'
import { faceIdMarker } from './face-id-marker'
import {
  creationOptionsFromJSON,
  credentialId,
  credentialJSON,
  requestOptionsFromJSON,
  type WebAuthn,
} from './webauthn'

/** The person closed the Face ID prompt, or let it time out. Nothing was sent; there is nothing to say. */
export class FaceIdCancelledError extends Error {
  constructor(options?: ErrorOptions) {
    super('The Face ID prompt was cancelled', options)
    this.name = 'FaceIdCancelledError'
  }
}

/** The passkey chosen gave no secret to open the vault with. Nothing was sent. */
export class FaceIdUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('The passkey gave no secret to open the vault with', options)
    this.name = 'FaceIdUnavailableError'
  }
}

/**
 * The passkey no longer opens the vault on this device: Supabase no longer
 * knows it, or its packet is missing or does not open. No session is left
 * open, and the device's marker is gone, so that the offer comes back.
 */
export class FaceIdNoLongerOpensError extends Error {
  constructor(options?: ErrorOptions) {
    super('Face ID no longer opens the vault on this device', options)
    this.name = 'FaceIdNoLongerOpensError'
  }
}

/**
 * Asked to confirm who is signed in, the passkey opened a session for another
 * account. That session is closed; nothing of that account was opened.
 */
export class FaceIdOtherAccountError extends Error {
  constructor(options?: ErrorOptions) {
    super('The passkey belongs to another account than the one signed in', options)
    this.name = 'FaceIdOtherAccountError'
  }
}

/** A moment on both of the device's clocks, in milliseconds. */
export type Clocks = {
  /** `performance.now()`: cannot be set, but may stop while an Apple device sleeps. */
  monotonic: number
  /** `Date.now()`: goes on while the device sleeps, but can be set anywhere. */
  wall: number
}

function clocksNow(): Clocks {
  return { monotonic: performance.now(), wall: Date.now() }
}

/** A registration started with Supabase, waiting for the tap on « Activer ». */
export type Prepared = {
  challengeId: string
  options: PublicKeyCredentialCreationOptions
  /** When the challenge was asked for. */
  preparedAt: Clocks
}

// How long a prepared challenge is trusted, from the moment it was asked for.
// Supabase gives its own end (`expires_at`), but comparing it with the
// device's clock would trust that clock: one set a day ahead would make every
// tap expired. A margin is measured here instead, as the time gone by on each
// of the device's clocks, and the first to reach it wins: the monotonic clock
// may not move while an iPhone is locked, the wall clock does. Unverified: that
// GoTrue keeps a challenge longer than this. A challenge it refuses as expired
// still goes through the failure path.
const TRUSTED_FOR_MS = 4 * 60_000

/**
 * Whether a prepared challenge is too old to send. Checked by the screens at
 * the tap: an expired one is replaced by a fresh one, for one more tap, rather
 * than asked again between the tap and the prompt.
 */
export function hasExpired(prepared: { preparedAt: Clocks }, now: Clocks = clocksNow()): boolean {
  return (
    now.monotonic - prepared.preparedAt.monotonic >= TRUSTED_FOR_MS ||
    now.wall - prepared.preparedAt.wall >= TRUSTED_FOR_MS
  )
}

export type FaceIdActivation = { status: 'active' } | { status: 'no-prf' } | { status: 'already' }

type ActivationInput = {
  prepared: Prepared
  /** From `signIn`: the key that opens the password packet. Never written anywhere. */
  keyEncryptionKey: CryptoKey
  userId: string
  /**
   * Resolved by the screen's second button, when the creation gave no secret.
   * Required: that opening must follow a tap, which Safari can insist on.
   */
  confirm: () => Promise<void>
}

// Started as soon as the offer shows, so that the passkey's creation follows
// the tap at once: Safari can refuse a WebAuthn request that does not.
export async function prepareFaceId(client: SupabaseClient): Promise<Prepared> {
  // Before the request leaves: the challenge cannot be older than this.
  const preparedAt = clocksNow()
  const { data, error } = await client.auth.passkey.startRegistration()
  if (error) throw error
  const options = creationOptionsFromJSON(data.options)
  return {
    challengeId: data.challenge_id,
    preparedAt,
    options: {
      ...options,
      // Found by the device without an address typed, and always checking the
      // person. `requireResidentKey` is the older form some browsers still read.
      authenticatorSelection: {
        ...options.authenticatorSelection,
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'required',
      },
      // Chosen here, never taken from the server: whatever an extension
      // answers goes back to it. Whether the passkey is discoverable, and the
      // secret that will seal the data key.
      extensions: { credProps: true, prf: { eval: { first: prfSalt() } } },
    },
  }
}

export async function activateFaceId(
  client: SupabaseClient,
  webauthn: WebAuthn,
  input: ActivationInput,
): Promise<FaceIdActivation> {
  let credential: PublicKeyCredential
  try {
    credential = await webauthn.create(input.prepared.options)
  } catch (error) {
    // This keychain already holds one of the account's passkeys, which the
    // server listed for exclusion: Face ID is ready on this device.
    if (error instanceof DOMException && error.name === 'InvalidStateError') {
      // Which passkey it is, the device may already know: kept, never written over.
      faceIdMarker.set(faceIdMarker.credentialId() ?? undefined)
      return { status: 'already' }
    }
    throw error
  }

  // A passkey whose manager cannot give the secret (Proton Pass on iPhone)
  // would open a session and no vault: stop before anything is sent.
  const prf = credential.getClientExtensionResults().prf
  if (prf?.enabled !== true) return { status: 'no-prf' }
  const id = credentialId(credential)
  const secret = prf.results?.first ?? (await secretFromOpening(webauthn, input, credential))
  if (!secret) return { status: 'no-prf' }

  const wrapped = await sealForPasskey(client, input, secret, id)

  const verified = await client.auth.passkey.verifyRegistration({
    challengeId: input.prepared.challengeId,
    credential: forServer(credentialJSON(credential)),
  })
  if (verified.error) throw verified.error
  const passkeyId = verified.data.id

  const { error } = await client
    .from('vault_passkeys')
    .insert({ user_id: input.userId, credential_id: id, passkey_id: passkeyId, wrapped })
  if (error) {
    // Without its packet, the passkey would open a session and no vault.
    await deletePasskey(client, passkeyId)
    throw new Error(`Could not save the Face ID packet: ${error.message}`, { cause: error })
  }

  faceIdMarker.set(id)
  return { status: 'active' }
}

// Some passkeys give the secret only when opened. This opening is local: a
// challenge drawn here, limited to the passkey just created, nothing asked of
// the server. It waits for the person's second tap.
async function secretFromOpening(
  webauthn: WebAuthn,
  input: ActivationInput,
  created: PublicKeyCredential,
): Promise<BufferSource | undefined> {
  await input.confirm()
  const opened = await webauthn.get({
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rpId: input.prepared.options.rp.id,
    allowCredentials: [{ type: 'public-key', id: created.rawId }],
    userVerification: 'required',
    extensions: { prf: { eval: { first: prfSalt() } } },
  })
  // Another passkey's secret would seal a packet this one could never open.
  if (credentialId(opened) !== credentialId(created)) throw new Error('Another passkey answered the opening')
  return opened.getClientExtensionResults().prf?.results?.first
}

// The data key comes out of the password packet extractable only to be sealed
// again, for the passkey. It is not kept: only the new packet leaves here.
async function sealForPasskey(
  client: SupabaseClient,
  input: ActivationInput,
  secret: BufferSource,
  id: string,
): Promise<Sealed> {
  const passwordPacket = await readVault(client, input.userId, 'wrapped_by_password')
  if (!passwordPacket) throw new Error('No vault to activate Face ID for')
  const dataKey = await unwrapDataKey(passwordPacket, input.keyEncryptionKey, { extractable: true })
  return wrapDataKey(dataKey, await wrappingKeyFromPrf(secret), passkeyAad(input.userId, id))
}

// Best effort: the failure that matters to the person is the one before it.
async function deletePasskey(client: SupabaseClient, passkeyId: string): Promise<void> {
  try {
    const { error } = await client.auth.passkey.delete({ passkeyId })
    if (error) throw error
  } catch (error) {
    console.error('Could not remove a passkey left without its packet', error)
  }
}

/** A sign-in started with Supabase, waiting for the tap on « Utiliser Face ID ». */
export type PreparedSignIn = {
  challengeId: string
  options: PublicKeyCredentialRequestOptions
  /** When the challenge was asked for. */
  preparedAt: Clocks
}

// Started as soon as the sign-in page opens, so that the tap goes straight to
// the passkey: Safari can refuse a WebAuthn request that does not follow it at
// once. Supabase names no account here; the device offers its own passkey.
export async function prepareFaceIdSignIn(client: SupabaseClient): Promise<PreparedSignIn> {
  // Before the request leaves: the challenge cannot be older than this.
  const preparedAt = clocksNow()
  const { data, error } = await client.auth.passkey.startAuthentication()
  if (error) throw error
  const options = requestOptionsFromJSON(data.options)
  return {
    challengeId: data.challenge_id,
    preparedAt,
    options: {
      ...options,
      userVerification: 'required',
      // Chosen here, never taken from the server: the secret that opens the packet.
      extensions: { prf: { eval: { first: prfSalt() } } },
    },
  }
}

// One tap: the passkey opens, Supabase opens the session, and the passkey's
// secret opens its packet. The data key is kept on the device as after a
// password. Nothing is fetched before the passkey opens, for the same reason
// the sign-in was prepared beforehand.
export async function signInWithFaceId(
  client: SupabaseClient,
  keys: KeyStore,
  webauthn: WebAuthn,
  prepared: PreparedSignIn,
): Promise<void> {
  // Whoever signs in, nothing any tab kept of an earlier session is shown to them.
  forgetInEveryTab()
  try {
    await openSessionAndVault(client, keys, webauthn, prepared)
  } catch (error) {
    // Whatever says so, Face ID no longer opens the vault here: the marker
    // goes, and the next password sign-in offers Face ID again.
    if (error instanceof FaceIdNoLongerOpensError) faceIdMarker.clear()
    throw error
  }
}

// Supabase refusing the passkey for good: a 4xx refusal, which it answers
// before any session opens. Two of them say nothing of the passkey, and are
// passed on as they are: too many tries (429), and a challenge that ran out,
// which the next tap replaces.
//
// Unverified: that GoTrue refuses a passkey it no longer knows with a 4xx, and
// names a challenge that ran out `webauthn_challenge_expired` (a code auth-js
// lists). The live journey (e2e/face-id.live.spec.ts) removes the passkey from
// Supabase and checks what the screen then says.
function refusedForGood(error: unknown): boolean {
  return (
    isAuthApiError(error) &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 429 &&
    error.code !== 'webauthn_challenge_expired'
  )
}

// The passkey opens, and Supabase opens a session for it: who it is for, which
// passkey answered, and its secret, which never leaves the device. Shared by
// the sign-in and by the confirmation before deleting the account.
async function openSession(
  client: SupabaseClient,
  webauthn: WebAuthn,
  prepared: PreparedSignIn,
): Promise<{ userId: string; id: string; secret: BufferSource }> {
  const credential = await openPasskey(webauthn, prepared.options)

  // Without the secret the session would open no vault: stop before anything is sent.
  const secret = credential.getClientExtensionResults().prf?.results?.first
  if (!secret) throw new FaceIdUnavailableError()

  const { data, error } = await client.auth.passkey.verifyAuthentication({
    challengeId: prepared.challengeId,
    credential: forServer(credentialJSON(credential)),
  })
  // No session opened: there is nothing to close.
  if (error) throw refusedForGood(error) ? new FaceIdNoLongerOpensError({ cause: error }) : error
  const userId = data.session?.user.id
  if (!userId) throw new Error('The passkey opened no session')
  return { userId, id: credentialId(credential), secret }
}

async function openSessionAndVault(
  client: SupabaseClient,
  keys: KeyStore,
  webauthn: WebAuthn,
  prepared: PreparedSignIn,
): Promise<void> {
  const { userId, id, secret } = await openSession(client, webauthn, prepared)
  try {
    const dataKey = await openPacket(client, userId, id, secret)
    // One key per device: whatever another account left here goes first.
    await keys.clear()
    await keys.set(userId, dataKey)
  } catch (error) {
    // Signed in, but without a key: close that session rather than leave one
    // open that opens nothing. The error that matters is the one above.
    await signOut(client, keys).catch(() => {})
    throw error
  }
  faceIdMarker.set(id)
}

// Before deleting the account: a fresh tap, by the person signed in. A key
// already on the device is not enough, so the passkey must open its packet,
// as at sign-in; the key it opens is not kept, the device already has it.
// Who is signed in is read by the screen before the tap (`expectedUserId`):
// nothing is asked of the network between the tap and the prompt, which Safari
// can refuse. A passkey of another account opens that account's session,
// which is closed at once.
export async function confirmWithFaceId(
  client: SupabaseClient,
  webauthn: WebAuthn,
  prepared: PreparedSignIn,
  expectedUserId: string,
): Promise<void> {
  try {
    const { userId, id, secret } = await openSession(client, webauthn, prepared)
    if (userId !== expectedUserId) {
      // A failure to close that session must not hide which error this is: the screen signs out again.
      await client.auth.signOut({ scope: 'local' }).catch(() => {})
      throw new FaceIdOtherAccountError()
    }
    await openPacket(client, userId, id, secret)
  } catch (error) {
    // As at sign-in: the marker goes, so that the offer can come back.
    if (error instanceof FaceIdNoLongerOpensError) faceIdMarker.clear()
    throw error
  }
}

async function openPasskey(webauthn: WebAuthn, options: PublicKeyCredentialRequestOptions): Promise<PublicKeyCredential> {
  try {
    return await webauthn.get(options)
  } catch (error) {
    // Browsers give the same refusal when the person closes the prompt and when it times out.
    if (error instanceof DOMException && error.name === 'NotAllowedError') throw new FaceIdCancelledError({ cause: error })
    throw error
  }
}

// The packet of the passkey just used, for the person whose session just
// opened. A packet missing, or bound to another person or passkey, or that
// will not open, means Face ID no longer opens the vault here. A failure to
// read it says nothing of the sort, and is passed on as it is.
async function openPacket(
  client: SupabaseClient,
  userId: string,
  id: string,
  secret: BufferSource,
): Promise<CryptoKey> {
  const { data, error } = await client
    .from('vault_passkeys')
    .select('wrapped')
    .eq('user_id', userId)
    .eq('credential_id', id)
    .maybeSingle()
  if (error) throw new Error(`Could not read the Face ID packet: ${error.message}`, { cause: error })
  if (!data) throw new FaceIdNoLongerOpensError()
  try {
    return await unwrapDataKey(data.wrapped as Sealed, await wrappingKeyFromPrf(secret), {
      aad: passkeyAad(userId, id),
    })
  } catch (cause) {
    throw new FaceIdNoLongerOpensError({ cause })
  }
}

/** One of the account's Face ID keys, as the settings list them. */
export type FaceIdKey = { passkeyId: string; addedOn: IsoDate; onThisDevice: boolean }

async function signedInUserId(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getUser()
  if (error) throw error
  return data.user.id
}

// The keys whose packet the vault holds, newest first. Read from
// `vault_passkeys`, the packets left out: a passkey without its packet opens no
// vault, so it is not a key here. The day is the device's calendar day.
export async function listFaceIdKeys(client: SupabaseClient): Promise<FaceIdKey[]> {
  const userId = await signedInUserId(client)
  const { data, error } = await client
    .from('vault_passkeys')
    .select('passkey_id, credential_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Could not read the Face ID keys: ${error.message}`, { cause: error })
  const here = faceIdMarker.credentialId()
  return (data as Array<{ passkey_id: string; credential_id: string; created_at: string }>).map((row) => ({
    passkeyId: row.passkey_id,
    addedOn: todayIso(new Date(row.created_at)),
    onThisDevice: here !== null && row.credential_id === here,
  }))
}

// Unverified against the real GoTrue: that a passkey it no longer holds is
// refused with a 404 (the fake answers `passkey_not_found`, a code auth-js lists).
function alreadyGone(error: unknown): boolean {
  return isAuthApiError(error) && (error.status === 404 || error.code === 'passkey_not_found')
}

// First Supabase's passkey, so that it can no longer open a session, then its
// packet. A first attempt whose packet deletion failed is retried as is:
// Supabase no longer knowing the passkey is the goal met. When the key removed
// is the one this device uses, its marker goes, and the offer can come back.
export async function removeFaceIdKey(client: SupabaseClient, passkeyId: string): Promise<void> {
  if (!passkeyId) throw new Error('No Face ID key to remove')
  const userId = await signedInUserId(client)
  const deleted = await client.auth.passkey.delete({ passkeyId })
  if (deleted.error && !alreadyGone(deleted.error)) throw deleted.error

  const { data, error } = await client
    .from('vault_passkeys')
    .delete()
    .eq('user_id', userId)
    .eq('passkey_id', passkeyId)
    .select('credential_id')
  if (error) throw new Error(`Could not remove the Face ID packet: ${error.message}`, { cause: error })
  const here = faceIdMarker.credentialId()
  if (here !== null && (data as Array<{ credential_id: string }>).some((row) => row.credential_id === here)) {
    faceIdMarker.clear()
  }
}
