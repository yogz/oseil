import { describe, expect, test } from 'vitest'
import { generateDataKey, unwrapDataKey, wrapDataKey } from '../keys'
import { forServer, prfSalt, passkeyAad, wrappingKeyFromPrf } from '../passkey'

function bytes(fill: number): ArrayBuffer {
  return new Uint8Array(32).fill(fill).buffer
}

describe('passkey crypto', () => {
  test('prfSalt is SHA-256 of the versioned label, and a fresh copy each time', async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('stefin:vault-passkey:v1'))
    expect(prfSalt()).toHaveLength(32)
    expect([...prfSalt()]).toEqual([...new Uint8Array(digest)])
    prfSalt().fill(0)
    expect([...prfSalt()]).toEqual([...new Uint8Array(digest)])
  })

  test('the AAD is bound to the user (lowercased) and the credential', () => {
    expect(new TextDecoder().decode(passkeyAad('U-1', 'Cred_1'))).toBe('stefin:passkey:v1:u-1:Cred_1')
  })

  test('a packet opens only with the same user and credential', async () => {
    const dataKey = await generateDataKey()
    const wrappingKey = await wrappingKeyFromPrf(bytes(7))
    const wrapped = await wrapDataKey(dataKey, wrappingKey, passkeyAad('U', 'c1'))

    expect((await unwrapDataKey(wrapped, wrappingKey, { aad: passkeyAad('U', 'c1') })).extractable).toBe(false)
    await expect(unwrapDataKey(wrapped, wrappingKey, { aad: passkeyAad('U', 'c2') })).rejects.toBeDefined()
    await expect(unwrapDataKey(wrapped, wrappingKey, { aad: passkeyAad('V', 'c1') })).rejects.toBeDefined()
    await expect(unwrapDataKey(wrapped, wrappingKey)).rejects.toBeDefined()
  })

  test('the same secret gives keys that open each other; another secret does not', async () => {
    const dataKey = await generateDataKey()
    const aad = passkeyAad('U', 'c1')
    const a = await wrappingKeyFromPrf(bytes(1))
    const b = await wrappingKeyFromPrf(bytes(1))
    const other = await wrappingKeyFromPrf(bytes(2))
    expect(a.extractable).toBe(false)
    expect((a.algorithm as AesKeyAlgorithm).length).toBe(256)
    expect(a.usages.sort()).toEqual(['unwrapKey', 'wrapKey'])

    const wrapped = await wrapDataKey(dataKey, a, aad)
    await expect(unwrapDataKey(wrapped, b, { aad })).resolves.toBeInstanceOf(CryptoKey)
    await expect(unwrapDataKey(wrapped, other, { aad })).rejects.toBeDefined()
  })

  // Only whether the passkey is discoverable goes back to the server. Any other
  // result could carry the secret: the PRF's own, or another extension's
  // answer to the same salt, under any name.
  test('forServer keeps credProps.rk alone, drops every other result whatever its name, and leaves its input alone', () => {
    const response = {
      id: 'x',
      rawId: 'x',
      response: { clientDataJSON: 'abc' },
      clientExtensionResults: {
        prf: { enabled: true, results: { first: 'AAAA', second: 'BBBB' } },
        credProps: { rk: true, extra: 'CCCC' },
        hmacGetSecret: { output1: 'DDDD' },
        largeBlob: { blob: 'EEEE' },
        foo: 'FFFF',
      },
    }
    const copy = structuredClone(response)
    const out = forServer(response)

    expect(out.clientExtensionResults).toEqual({ credProps: { rk: true } })
    expect(out.response).toEqual({ clientDataJSON: 'abc' })
    for (const leaked of ['AAAA', 'BBBB', 'CCCC', 'DDDD', 'EEEE', 'FFFF']) {
      expect(JSON.stringify(out)).not.toContain(leaked)
    }
    expect(response).toEqual(copy)
  })

  test('forServer sends no credProps that is not a plain yes or no', () => {
    expect(forServer({ clientExtensionResults: { credProps: { rk: false } } }).clientExtensionResults).toEqual({
      credProps: { rk: false },
    })
    expect(forServer({ clientExtensionResults: { credProps: { rk: 'AAAA' } } }).clientExtensionResults).toEqual({})
    expect(forServer({ clientExtensionResults: { credProps: 'AAAA' } }).clientExtensionResults).toEqual({})
    expect(forServer({ clientExtensionResults: { credProps: {} } }).clientExtensionResults).toEqual({})
  })

  test('forServer tolerates a response with no extension results', () => {
    expect(forServer({ id: 'x' })).toEqual({ id: 'x', clientExtensionResults: {} })
  })
})
