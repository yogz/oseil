import { describe, expect, test } from 'vitest'
import {
  InvalidRecoveryKeyError,
  generateDataKey,
  generateRecoveryKey,
  recoveryKeyFromDisplay,
  unwrapDataKey,
  wrapDataKey,
} from '../keys'
import { toBase64 } from '../encoding'
import { open, seal } from '../seal'

describe('keys', () => {
  test('a wrapped data key opens with its wrapping key only', async () => {
    const dataKey = await generateDataKey()
    const k1 = (await generateRecoveryKey()).key
    const k2 = (await generateRecoveryKey()).key
    const sealed = await seal(dataKey, { hello: 'world' })
    const wrapped = await wrapDataKey(dataKey, k1)

    const back = await unwrapDataKey(wrapped, k1)
    expect(back.extractable).toBe(false)
    expect(await open(back, sealed)).toEqual({ hello: 'world' })
    await expect(unwrapDataKey(wrapped, k2)).rejects.toBeDefined()
  })

  test('unwrap can be asked for an extractable key', async () => {
    const dataKey = await generateDataKey()
    const k = (await generateRecoveryKey()).key
    const wrapped = await wrapDataKey(dataKey, k)
    expect((await unwrapDataKey(wrapped, k, { extractable: true })).extractable).toBe(true)
  })

  test('formats the recovery key as 8 groups of 4 Crockford characters', async () => {
    const { display } = await generateRecoveryKey()
    expect(display).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/)
  })

  test.each([
    ['lower case, spaces, o for 0', 'o123 4567 89ab cdef ghjk mnpq rstv wxyz'],
    ['i for 1', '0i23-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ'],
    ['l for 1', '0l23-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ'],
    ['no separator', '0123456789ABCDEFGHJKMNPQRSTVWXYZ'],
  ])('accepts a recovery key typed by hand: %s', async (_name, typed) => {
    const canonical = '0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ'
    const dataKey = await generateDataKey()
    const wrapped = await wrapDataKey(dataKey, await recoveryKeyFromDisplay(canonical))
    const sealed = await seal(dataKey, 'secret')

    const back = await unwrapDataKey(wrapped, await recoveryKeyFromDisplay(typed))
    expect(await open(back, sealed)).toBe('secret')
  })

  test.each([
    ['hyphen U+2010', '\u2010'],
    ['en dash', '\u2013'],
    ['em dash', '\u2014'],
    ['minus sign', '\u2212'],
  ])('accepts a recovery key whose separators are a %s', async (_name, dash) => {
    const canonical = '0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ'
    const dataKey = await generateDataKey()
    const wrapped = await wrapDataKey(dataKey, await recoveryKeyFromDisplay(canonical))
    const sealed = await seal(dataKey, 'secret')

    const typed = canonical.replaceAll('-', ` ${dash} `)
    const back = await unwrapDataKey(wrapped, await recoveryKeyFromDisplay(typed))
    expect(await open(back, sealed)).toBe('secret')
  })

  test('the recovery wrapping key can only wrap and unwrap', async () => {
    const { key } = await generateRecoveryKey()
    expect([...key.usages].sort()).toEqual(['unwrapKey', 'wrapKey'])
  })

  test('refuses a recovery key of the wrong length or alphabet', async () => {
    await expect(recoveryKeyFromDisplay('ABCD-EFGH')).rejects.toBeInstanceOf(
      InvalidRecoveryKeyError,
    )
    await expect(recoveryKeyFromDisplay('UUUU-'.repeat(7) + 'UUUU')).rejects.toBeInstanceOf(
      InvalidRecoveryKeyError,
    )
  })

  test('a packet made with plain WebCrypto, no AAD, still opens without one and refuses any', async () => {
    const raw = Uint8Array.from({ length: 32 }, (_, i) => i + 1)
    const iv = Uint8Array.from({ length: 12 }, (_, i) => 100 + i)
    const wrappingKey = (await generateRecoveryKey()).key
    const dataKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', true, ['encrypt', 'decrypt'])
    const wrapped = await crypto.subtle.wrapKey('raw', dataKey, wrappingKey, { name: 'AES-GCM', iv })
    const packet = { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(wrapped)) }

    const opened = await unwrapDataKey(packet, wrappingKey, { extractable: true })
    expect([...new Uint8Array(await crypto.subtle.exportKey('raw', opened))]).toEqual([...raw])
    for (const aad of ['x', 'stefin:passkey:v1:u:c']) {
      await expect(
        unwrapDataKey(packet, wrappingKey, { aad: new TextEncoder().encode(aad) }),
      ).rejects.toBeDefined()
    }
  })
})
