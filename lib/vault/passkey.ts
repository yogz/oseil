// The third lock of the vault: a passkey's WebAuthn PRF secret becomes a
// wrapping key through HKDF. The secret itself never leaves the device.

// SHA-256 of the UTF-8 string "stefin:vault-passkey:v1". The digest API is
// asynchronous, so the 32 bytes are written out; a test recomputes them.
const PRF_SALT_BYTES = [
  131, 7, 141, 156, 196, 123, 50, 247, 65, 240, 123, 199, 120, 72, 238, 35, 29, 130, 74, 146, 243,
  195, 100, 127, 251, 153, 136, 148, 61, 83, 55, 49,
]

// A fresh copy each call: an exported array could be modified by any importer.
export function prfSalt(): Uint8Array<ArrayBuffer> {
  return new Uint8Array(PRF_SALT_BYTES)
}

// Binds a packet to one person and one credential: copied to another row, it no longer opens.
export function passkeyAad(userId: string, credentialId: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`stefin:passkey:v1:${userId.toLowerCase()}:${credentialId}`)
}

// A BufferSource, as the DOM types the PRF results (an ArrayBuffer in browsers).
export async function wrappingKeyFromPrf(prfOutput: BufferSource): Promise<CryptoKey> {
  const hkdfKey = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: prfSalt(),
      info: new TextEncoder().encode('stefin vault passkey wrap'),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  )
}

// The only extension result the server may see: whether the passkey is
// discoverable (`credProps.rk`), a plain yes or no. Every other result stays
// on the device, whatever its name: the PRF's is the secret, and another
// extension can answer the same salt with the same secret (hmacGetSecret), or
// under a name nobody knows yet. An allowlist, so that nothing new slips by.
export function serverExtensionResults(results: unknown): { credProps?: { rk: boolean } } {
  const rk = (results as { credProps?: { rk?: unknown } } | null | undefined)?.credProps?.rk
  return typeof rk === 'boolean' ? { credProps: { rk } } : {}
}

// A deep copy of a WebAuthn response, as it may be sent to the server: its
// extension results cut down to the allowlist above.
export function forServer<T>(responseJson: T): T {
  const copy = structuredClone(responseJson)
  if (copy && typeof copy === 'object') {
    const response = copy as { clientExtensionResults?: unknown }
    response.clientExtensionResults = serverExtensionResults(response.clientExtensionResults)
  }
  return copy
}
