import { afterEach, describe, expect, test, vi } from 'vitest'
import { accountHere } from '../account-here'
import { memoryStorage } from './memory-storage'

function throwingStorage(): Storage {
  const refuse = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  }
  return { length: 0, key: refuse, getItem: refuse, setItem: refuse, removeItem: refuse, clear: refuse }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the « an account was used here » marker', () => {
  test('is not set by default, then set, as a bare 1 under its own key', () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)

    expect(accountHere.isSet()).toBe(false)
    accountHere.set()
    expect(accountHere.isSet()).toBe(true)
    expect(storage.getItem('oseil-compte-ici')).toBe('1')
    expect(storage.length).toBe(1)
  })

  test('reads as not set when the storage refuses', () => {
    vi.stubGlobal('localStorage', throwingStorage())
    expect(accountHere.isSet()).toBe(false)
  })

  test('setting it does not throw when the storage refuses', () => {
    vi.stubGlobal('localStorage', throwingStorage())
    expect(() => accountHere.set()).not.toThrow()
  })

  test('reads as not set when there is no storage at all (server render)', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(accountHere.isSet()).toBe(false)
    expect(() => accountHere.set()).not.toThrow()
  })
})
