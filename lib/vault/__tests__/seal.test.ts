import { describe, expect, test } from 'vitest'
import { fromBase64, toBase64 } from '../encoding'
import { generateDataKey } from '../keys'
import { VaultOpenError, open, seal } from '../seal'
import { documentAad } from '../store'

describe('seal', () => {
  test('round-trips a value', async () => {
    const key = await generateDataKey()
    const value = { name: 'Livret A', amount: 10000 }
    expect(await open(key, await seal(key, value))).toEqual(value)
  })

  test.each([
    ['undefined', undefined],
    ['a function', () => 1],
    ['a symbol', Symbol('x')],
  ])('refuses %s, which JSON cannot represent', async (_name, value) => {
    const key = await generateDataKey()
    await expect(seal(key, value)).rejects.toBeInstanceOf(TypeError)
  })

  test('uses a fresh iv every time', async () => {
    const key = await generateDataKey()
    const a = await seal(key, { x: 1 })
    const b = await seal(key, { x: 1 })
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })

  test('refuses the wrong key', async () => {
    const sealed = await seal(await generateDataKey(), { x: 1 })
    await expect(open(await generateDataKey(), sealed)).rejects.toBeInstanceOf(VaultOpenError)
  })

  test('refuses a tampered ciphertext', async () => {
    const key = await generateDataKey()
    const sealed = await seal(key, { x: 1 })
    const bytes = fromBase64(sealed.ciphertext)
    bytes[0] ^= 1
    await expect(open(key, { ...sealed, ciphertext: toBase64(bytes) })).rejects.toBeInstanceOf(
      VaultOpenError,
    )
  })

  test('opens only with the same associated data', async () => {
    const key = await generateDataKey()
    const sealed = await seal(key, { x: 1 }, documentAad('u', 'profile', 'a'))
    expect(await open(key, sealed, documentAad('u', 'profile', 'a'))).toEqual({ x: 1 })
    await expect(open(key, sealed, documentAad('u', 'profile', 'b'))).rejects.toBeInstanceOf(
      VaultOpenError,
    )
    await expect(open(key, sealed)).rejects.toBeInstanceOf(VaultOpenError)
  })

  test('keeps nothing readable in the sealed form', async () => {
    const key = await generateDataKey()
    const sealed = await seal(key, { name: 'MARQUEUR-EN-CLAIR', amount: 123456.78 })
    expect(JSON.stringify(sealed)).not.toMatch(/MARQUEUR|123456/)
  })

  // The bytes bound to every stored document: changing them locks everyone out.
  test('pins the exact associated data of a document', () => {
    expect(new TextDecoder().decode(documentAad('u', 'profile', 'a'))).toBe('stefin:doc:v1:u:profile:a')
  })

  test('reads a uuid the same in upper and lower case', () => {
    const id = '0A1B2C3D-0000-4000-8000-ABCDEF012345'
    expect(documentAad('u', 'goals', id)).toEqual(documentAad('u', 'goals', id.toLowerCase()))
  })

  // Known answer: a packet stored once must keep opening. Produced with a throwaway
  // script (plain WebCrypto, not this code): raw key = bytes 0..31, iv = bytes
  // 100..111, plaintext = JSON.stringify({ name: 'Livret A', amount: 10000 }),
  // AES-GCM 256 with the associated data below.
  test('opens a packet sealed once and kept, with the right data only', async () => {
    const raw = new Uint8Array(32).map((_, i) => i)
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt'])
    const stored = {
      iv: 'ZGVmZ2hpamtsbW5v',
      ciphertext: 'MzmwBxSMdKQcLjaeqAAe3QPgKijqAZwHyaWOcsqTlXiklBAJ3d1/VY2F4nFHdLCGoqA=',
    }
    expect(await open(key, stored, documentAad('user-1', 'profile', 'doc-1'))).toEqual({
      name: 'Livret A',
      amount: 10000,
    })
    await expect(open(key, stored, documentAad('user-1', 'profile', 'doc-2'))).rejects.toBeInstanceOf(
      VaultOpenError,
    )
    await expect(open(key, stored)).rejects.toBeInstanceOf(VaultOpenError)
  })
})
