import { describe, expect, test } from 'vitest'
import { KDF_PARAMS, deriveSecrets, normalizeEmail } from '../kdf'
import { generateDataKey, unwrapDataKey, wrapDataKey } from '../keys'
import { open, seal } from '../seal'

describe('kdf', () => {
  test('normalises the address before deriving', async () => {
    const a = await deriveSecrets('correct horse battery', 'Nicolas@Example.com ')
    const b = await deriveSecrets('correct horse battery', 'nicolas@example.com')
    expect(a.authSecret).toBe(b.authSecret)
  })

  // Computed independently with Python (argon2-cffi + cryptography), not with this code.
  test('matches a known-answer vector', async () => {
    const { authSecret } = await deriveSecrets('Café-très-long-2026', ' Nicolas@Example.com ')
    expect(authSecret).toBe('adf83964f2f86df4548dc33531d8207aeca2ae2c14862831305b4751ddea1ba9')
  })

  test('derives the same secrets from composed and decomposed accents', async () => {
    const composed = await deriveSecrets('café-très-long', 'a@b.fr')
    const decomposed = await deriveSecrets('café-très-long', 'a@b.fr')
    expect(decomposed.authSecret).toBe(composed.authSecret)
  })

  test('gives a key-encryption key that reopens a wrapped data key', async () => {
    const dataKey = await generateDataKey()
    const first = await deriveSecrets('correct horse battery', 'A@B.fr ')
    const second = await deriveSecrets('correct horse battery', 'a@b.fr')
    const other = await deriveSecrets('another long password', 'a@b.fr')
    const wrapped = await wrapDataKey(dataKey, first.keyEncryptionKey)
    const back = await unwrapDataKey(wrapped, second.keyEncryptionKey)
    const sealed = await seal(dataKey, 'x')
    expect(await open(back, sealed)).toBe('x')
    await expect(unwrapDataKey(wrapped, other.keyEncryptionKey)).rejects.toBeDefined()
  })

  test('the key-encryption key can only wrap and unwrap', async () => {
    const { keyEncryptionKey } = await deriveSecrets('correct horse battery', 'a@b.fr')
    expect([...keyEncryptionKey.usages].sort()).toEqual(['unwrapKey', 'wrapKey'])
  })

  test('trims and lower-cases the address', () => {
    expect(normalizeEmail('  Nicolas@Example.com ')).toBe('nicolas@example.com')
  })

  test('gives a 64-hex auth secret that is not the password', async () => {
    const { authSecret } = await deriveSecrets('correct horse battery', 'a@b.fr')
    expect(authSecret).toMatch(/^[0-9a-f]{64}$/)
    expect(authSecret).not.toContain('correct')
  })

  test('changes with the address and with the password', async () => {
    const one = await deriveSecrets('correct horse battery', 'a@b.fr')
    const two = await deriveSecrets('correct horse battery', 'c@d.fr')
    const three = await deriveSecrets('another long password', 'a@b.fr')
    expect(new Set([one.authSecret, two.authSecret, three.authSecret]).size).toBe(3)
  })

  test('pins the parameters of the spec', () => {
    expect(KDF_PARAMS).toEqual({
      algorithm: 'argon2id',
      memoryKiB: 65536,
      iterations: 3,
      parallelism: 1,
      version: 1,
    })
  })

  test('never lets the key-encryption key be exported', async () => {
    const { keyEncryptionKey } = await deriveSecrets('correct horse battery', 'a@b.fr')
    expect(keyEncryptionKey.extractable).toBe(false)
  })
})
