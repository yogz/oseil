import { afterEach, describe, expect, test, vi } from 'vitest'
import { faceIdMarker } from '../face-id-marker'
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

describe('the Face ID marker of this device', () => {
  test('is a single flag under its own key', () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)

    expect(faceIdMarker.isSet()).toBe(false)
    faceIdMarker.set()
    expect(faceIdMarker.isSet()).toBe(true)
    expect(storage.getItem('stefin-face-id')).toBe('1')
    expect(storage.length).toBe(1)

    faceIdMarker.clear()
    expect(faceIdMarker.isSet()).toBe(false)
    expect(storage.getItem('stefin-face-id')).toBeNull()
  })

  // Which passkey Face ID uses here, when this device knows it: the one it
  // created or signed in with. Its credential id is no secret, the server holds it.
  test('can name the passkey this device uses, in the same single entry', () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)

    faceIdMarker.set('cred-abc_123')
    expect(faceIdMarker.isSet()).toBe(true)
    expect(faceIdMarker.credentialId()).toBe('cred-abc_123')
    expect(storage.getItem('stefin-face-id')).toBe('1:cred-abc_123')
    expect(storage.length).toBe(1)

    // Set again without a name (a keychain that already held one): this device no longer knows which.
    faceIdMarker.set()
    expect(faceIdMarker.isSet()).toBe(true)
    expect(faceIdMarker.credentialId()).toBeNull()

    faceIdMarker.set('cred-abc_123')
    faceIdMarker.clear()
    expect(faceIdMarker.isSet()).toBe(false)
    expect(faceIdMarker.credentialId()).toBeNull()
  })

  test('only the value it writes counts as set', () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    storage.setItem('stefin-face-id', 'yes')
    expect(faceIdMarker.isSet()).toBe(false)
    storage.setItem('stefin-face-id', '1:')
    expect(faceIdMarker.isSet()).toBe(false)
    expect(faceIdMarker.credentialId()).toBeNull()
  })

  // Safari in private browsing, a storage quota, a page with storage turned off.
  test('a storage that refuses reads as not set, and never throws', () => {
    vi.stubGlobal('localStorage', throwingStorage())
    expect(faceIdMarker.isSet()).toBe(false)
    expect(faceIdMarker.credentialId()).toBeNull()
    expect(() => faceIdMarker.set('cred')).not.toThrow()
    expect(() => faceIdMarker.set()).not.toThrow()
    expect(() => faceIdMarker.clear()).not.toThrow()
  })

  test('no storage at all (a server render) reads as not set', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(faceIdMarker.isSet()).toBe(false)
    expect(() => faceIdMarker.set()).not.toThrow()
    expect(() => faceIdMarker.clear()).not.toThrow()
  })
})
