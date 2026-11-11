import { describe, expect, test } from 'vitest'
import { fromBase64Url, toBase64Url } from '../encoding'

describe('base64url', () => {
  test('uses the URL-safe alphabet and drops the padding', () => {
    // In standard base64 these bytes are "+/+/" and "AQ==".
    expect(toBase64Url(new Uint8Array([0xfb, 0xff, 0xbf]))).toBe('-_-_')
    expect(toBase64Url(new Uint8Array([1]))).toBe('AQ')
  })

  test('agrees with Node’s own encoder and reads back what it wrote, whatever the length', () => {
    for (let length = 0; length < 40; length++) {
      const bytes = crypto.getRandomValues(new Uint8Array(length))
      expect(toBase64Url(bytes)).toBe(Buffer.from(bytes).toString('base64url'))
      expect([...fromBase64Url(toBase64Url(bytes))]).toEqual([...bytes])
    }
  })
})
