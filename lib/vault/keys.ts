import { fromBase64, toBase64 } from './encoding'
import type { Sealed } from './seal'

export class InvalidRecoveryKeyError extends Error {
  constructor() {
    super('Invalid recovery key')
    this.name = 'InvalidRecoveryKeyError'
  }
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const RECOVERY_BYTES = 20
const RECOVERY_CHARS = 32

export function generateDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

// `aad` binds the packet to a context (a user, a credential); without it the
// bytes are exactly those of the original format.
export async function wrapDataKey(
  dataKey: CryptoKey,
  wrappingKey: CryptoKey,
  aad?: Uint8Array<ArrayBuffer>,
): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const wrapped = await crypto.subtle.wrapKey('raw', dataKey, wrappingKey, {
    name: 'AES-GCM',
    iv,
    ...(aad ? { additionalData: aad } : {}),
  })
  return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(wrapped)) }
}

// Rejects with the WebCrypto error when the wrapping key is wrong.
export function unwrapDataKey(
  wrapped: Sealed,
  wrappingKey: CryptoKey,
  options: { extractable?: boolean; aad?: Uint8Array<ArrayBuffer> } = {},
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    fromBase64(wrapped.ciphertext),
    wrappingKey,
    {
      name: 'AES-GCM',
      iv: fromBase64(wrapped.iv),
      ...(options.aad ? { additionalData: options.aad } : {}),
    },
    { name: 'AES-GCM', length: 256 },
    options.extractable ?? false,
    ['encrypt', 'decrypt'],
  )
}

function encodeCrockford(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
    value &= (1 << bits) - 1
  }
  return out
}

function decodeCrockford(text: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(RECOVERY_BYTES)
  let bits = 0
  let value = 0
  let index = 0
  for (const char of text) {
    value = (value << 5) | CROCKFORD.indexOf(char)
    bits += 5
    if (bits >= 8) {
      bytes[index++] = (value >>> (bits - 8)) & 255
      bits -= 8
    }
    value &= (1 << bits) - 1
  }
  return bytes
}

async function recoveryWrappingKey(bytes: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const hkdfKey = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode('stefin:recovery:v1'),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  )
}

export async function generateRecoveryKey(): Promise<{ display: string; key: CryptoKey }> {
  const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_BYTES))
  const display = encodeCrockford(bytes).match(/.{4}/g)!.join('-')
  return { display, key: await recoveryWrappingKey(bytes) }
}

/**
 * What a person typed of their key, as the key writes it: upper case, without
 * separators, with the letters a reader mistakes for figures read as figures.
 */
export function cleanRecoveryInput(typed: string): string {
  return (
    typed
      .toUpperCase()
      // Any dash a phone keyboard or a word processor may have put in (hyphen,
      // en and em dash, minus sign...) counts as a separator, like a space.
      .replace(/[\s\u2212]|\p{Pd}/gu, '')
      .replace(/O/g, '0')
      .replace(/[IL]/g, '1')
  )
}

export async function recoveryKeyFromDisplay(display: string): Promise<CryptoKey> {
  const cleaned = cleanRecoveryInput(display)
  if (cleaned.length !== RECOVERY_CHARS || [...cleaned].some((c) => !CROCKFORD.includes(c))) {
    throw new InvalidRecoveryKeyError()
  }
  return recoveryWrappingKey(decodeCrockford(cleaned))
}
