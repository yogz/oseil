import { argon2id } from 'hash-wasm'

export const KDF_PARAMS = {
  algorithm: 'argon2id',
  memoryKiB: 65536,
  iterations: 3,
  parallelism: 1,
  version: 1,
} as const

const encoder = new TextEncoder()

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase().normalize('NFC')
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// From the password and the address, derive two independent secrets: one that
// goes to the server to log in, one that never leaves the device and seals the
// data key. The address is bound into the Argon2 salt, so HKDF needs no salt.
export async function deriveSecrets(
  password: string,
  email: string,
): Promise<{ authSecret: string; keyEncryptionKey: CryptoKey }> {
  const salt = new Uint8Array(
    await crypto.subtle.digest('SHA-256', encoder.encode(`stefin:v1:${normalizeEmail(email)}`)),
  )
  const master = await argon2id({
    password: password.normalize('NFC'),
    salt,
    memorySize: KDF_PARAMS.memoryKiB,
    iterations: KDF_PARAMS.iterations,
    parallelism: KDF_PARAMS.parallelism,
    hashLength: 32,
    outputType: 'binary',
  })

  const hkdfKey = await crypto.subtle.importKey('raw', new Uint8Array(master), 'HKDF', false, [
    'deriveBits',
    'deriveKey',
  ])
  const empty = new Uint8Array(0)

  const authBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: empty, info: encoder.encode('stefin:auth:v1') },
    hkdfKey,
    256,
  )
  const keyEncryptionKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: empty, info: encoder.encode('stefin:kek:v1') },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  )

  return { authSecret: toHex(new Uint8Array(authBits)), keyEncryptionKey }
}
