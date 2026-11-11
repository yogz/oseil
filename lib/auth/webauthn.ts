// The browser's WebAuthn calls behind a small interface, so that Face ID can be
// tested without a browser; and the conversions between Supabase's JSON (every
// binary field in base64url) and what the browser takes and gives back.
//
// auth-js has these conversions but does not export them: they are written
// here the way its own fallback writes them.

import type {
  PasskeyAuthenticationOptionsResponse,
  PasskeyRegistrationOptionsResponse,
  VerifyPasskeyRegistrationParams,
} from '@supabase/supabase-js'
import { fromBase64Url, toBase64Url } from '@/lib/vault/encoding'
import { serverExtensionResults } from '@/lib/vault/passkey'

export interface WebAuthn {
  /** Whether this device can create a passkey that checks the person: Face ID, Touch ID, a fingerprint. */
  supported(): Promise<boolean>
  create(options: PublicKeyCredentialCreationOptions): Promise<PublicKeyCredential>
  get(options: PublicKeyCredentialRequestOptions): Promise<PublicKeyCredential>
}

export const browserWebAuthn: WebAuthn = {
  async supported() {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) return false
    try {
      return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    } catch {
      return false
    }
  },
  async create(options) {
    const credential = await navigator.credentials.create({ publicKey: options })
    if (!credential) throw new Error('The browser created no passkey')
    return credential as PublicKeyCredential
  },
  async get(options) {
    const credential = await navigator.credentials.get({ publicKey: options })
    if (!credential) throw new Error('The browser opened no passkey')
    return credential as PublicKeyCredential
  },
}

type CreationOptionsJSON = PasskeyRegistrationOptionsResponse['options']
type RequestOptionsJSON = PasskeyAuthenticationOptionsResponse['options']
type DescriptorJSON = NonNullable<CreationOptionsJSON['excludeCredentials']>[number]

// The cast: auth-js lists transports the DOM types do not know yet ("cable"...).
function descriptorFromJSON({ id, ...rest }: DescriptorJSON): PublicKeyCredentialDescriptor {
  return { ...rest, id: fromBase64Url(id) } as PublicKeyCredentialDescriptor
}

// The server's extensions are never taken. Whatever an extension answers goes
// back to the server with the passkey's response, and one of them can answer
// with the PRF secret under another name: stefin asks for its own (face-id.ts).
export function creationOptionsFromJSON({
  challenge,
  user,
  excludeCredentials,
  ...rest
}: CreationOptionsJSON): PublicKeyCredentialCreationOptions {
  delete rest.extensions
  return {
    ...rest,
    challenge: fromBase64Url(challenge),
    user: { ...user, id: fromBase64Url(user.id) },
    ...(excludeCredentials ? { excludeCredentials: excludeCredentials.map(descriptorFromJSON) } : {}),
  }
}

export function requestOptionsFromJSON({
  challenge,
  allowCredentials,
  ...rest
}: RequestOptionsJSON): PublicKeyCredentialRequestOptions {
  delete rest.extensions
  return {
    ...rest,
    challenge: fromBase64Url(challenge),
    ...(allowCredentials ? { allowCredentials: allowCredentials.map(descriptorFromJSON) } : {}),
  }
}

/**
 * Whether a passkey of this relying party can work on this page. The browser
 * refuses it anywhere but on the rp id's address or one of its subdomains: a
 * Vercel preview or localhost, which reach the site's Supabase project, cannot
 * use the site's passkeys. Options that name no rp id are for the page's own.
 */
export function rpIdServesHost(rpId: string | undefined, hostname: string): boolean {
  if (!rpId) return true
  const rp = rpId.toLowerCase()
  const host = hostname.toLowerCase()
  return host === rp || host.endsWith(`.${rp}`)
}

/** The passkey's WebAuthn id: its raw id in base64url, the form `vault_passkeys` stores. */
export function credentialId(credential: PublicKeyCredential): string {
  return toBase64Url(new Uint8Array(credential.rawId))
}

type CredentialJSON = VerifyPasskeyRegistrationParams['credential']

// What Supabase reads: the browser's own toJSON when it has one, else the same
// fields written out by hand. The browser's toJSON still carries the PRF
// secret, so `forServer` must come before anything is sent; the fields written
// by hand go through the same allowlist already.
export function credentialJSON(credential: PublicKeyCredential): CredentialJSON {
  if (typeof credential.toJSON === 'function') return credential.toJSON()
  const encode = (buffer: ArrayBuffer) => toBase64Url(new Uint8Array(buffer))
  const common = {
    id: credential.id,
    rawId: credentialId(credential),
    type: 'public-key' as const,
    clientExtensionResults: serverExtensionResults(credential.getClientExtensionResults()),
    ...(credential.authenticatorAttachment
      ? { authenticatorAttachment: credential.authenticatorAttachment as AuthenticatorAttachment }
      : {}),
  }
  if ('attestationObject' in credential.response) {
    const attestation = credential.response as AuthenticatorAttestationResponse
    return {
      ...common,
      response: {
        clientDataJSON: encode(attestation.clientDataJSON),
        attestationObject: encode(attestation.attestationObject),
      },
    }
  }
  const assertion = credential.response as AuthenticatorAssertionResponse
  return {
    ...common,
    response: {
      clientDataJSON: encode(assertion.clientDataJSON),
      authenticatorData: encode(assertion.authenticatorData),
      signature: encode(assertion.signature),
      ...(assertion.userHandle ? { userHandle: encode(assertion.userHandle) } : {}),
    },
  }
}
