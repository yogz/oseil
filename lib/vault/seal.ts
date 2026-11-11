import { fromBase64, toBase64 } from './encoding'

export type Sealed = { iv: string; ciphertext: string }

export class VaultOpenError extends Error {
  constructor() {
    super('Could not open the sealed value')
    this.name = 'VaultOpenError'
  }
}

// `aad` (associated data) is authenticated but not stored: opening with other
// data fails, which binds a packet to the place it was sealed for.
export async function seal(key: CryptoKey, value: unknown, aad?: Uint8Array<ArrayBuffer>): Promise<Sealed> {
  // JSON.stringify answers undefined for undefined, functions and symbols:
  // sealing "undefined" would produce a packet that can never be opened.
  const json = JSON.stringify(value) as string | undefined
  if (json === undefined) throw new TypeError('This value cannot be represented as JSON')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(json)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, plaintext)
  return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) }
}

export async function open<T>(key: CryptoKey, sealed: Sealed, aad?: Uint8Array<ArrayBuffer>): Promise<T> {
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(sealed.iv), additionalData: aad },
      key,
      fromBase64(sealed.ciphertext),
    )
    return JSON.parse(new TextDecoder().decode(plaintext)) as T
  } catch {
    throw new VaultOpenError()
  }
}
