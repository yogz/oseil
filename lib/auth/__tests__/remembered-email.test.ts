import { afterEach, describe, expect, test, vi } from 'vitest'
import { rememberedEmail } from '../remembered-email'
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

describe('the remembered address', () => {
  test('reads as nothing by default, then as the address set, under its own key', () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)

    expect(rememberedEmail.read()).toBeNull()
    rememberedEmail.set('me@example.com')
    expect(rememberedEmail.read()).toBe('me@example.com')
    expect(storage.getItem('oseil-adresse')).toBe('me@example.com')
    expect(storage.length).toBe(1)
  })

  test('a later sign-in replaces it', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    rememberedEmail.set('first@example.com')
    rememberedEmail.set('second@example.com')
    expect(rememberedEmail.read()).toBe('second@example.com')
  })

  test('keeps no blank address, and no spaces around one', () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    rememberedEmail.set('   ')
    expect(storage.length).toBe(0)
    rememberedEmail.set('  me@example.com ')
    expect(rememberedEmail.read()).toBe('me@example.com')
  })

  test('is forgotten, and only it', () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    storage.setItem('oseil-compte-ici', '1')

    rememberedEmail.set('me@example.com')
    rememberedEmail.clear()
    expect(rememberedEmail.read()).toBeNull()
    expect(storage.getItem('oseil-compte-ici')).toBe('1')
  })

  test('reads as nothing, and never throws, when the storage refuses', () => {
    vi.stubGlobal('localStorage', throwingStorage())
    expect(rememberedEmail.read()).toBeNull()
    expect(() => rememberedEmail.set('me@example.com')).not.toThrow()
    expect(() => rememberedEmail.clear()).not.toThrow()
  })

  test('reads as nothing when there is no storage at all (server render)', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(rememberedEmail.read()).toBeNull()
    expect(() => rememberedEmail.set('me@example.com')).not.toThrow()
    expect(() => rememberedEmail.clear()).not.toThrow()
  })
})
