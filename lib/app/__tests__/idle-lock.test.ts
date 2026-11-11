import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { memoryStorage } from '@/lib/auth/__tests__/memory-storage'
import { IDLE_LIMIT_MS, idleClock, shouldClose } from '../idle-lock'

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('the vault closes after 15 minutes untouched, not a moment before', () => {
  expect(IDLE_LIMIT_MS).toBe(15 * 60 * 1000)
  expect(shouldClose(0, IDLE_LIMIT_MS - 1)).toBe(false)
  expect(shouldClose(0, IDLE_LIMIT_MS)).toBe(true)
})

// No time known is no reason to close: a storage that refuses never locks anyone out.
test('without a time of activity, nothing closes', () => {
  expect(shouldClose(null, Date.now())).toBe(false)
})

test('the clock keeps the last time, and forgets it on sign-out', () => {
  expect(idleClock.last()).toBeNull()
  idleClock.touch(1_234)
  expect(idleClock.last()).toBe(1_234)
  idleClock.forget()
  expect(idleClock.last()).toBeNull()
})

test('a closing is said until the next entry, which starts the clock again', () => {
  idleClock.markClosed()
  expect(idleClock.wasClosed()).toBe(true)
  idleClock.start(5_000)
  expect(idleClock.wasClosed()).toBe(false)
  expect(idleClock.last()).toBe(5_000)
})

test('a time that is not one reads as no time', () => {
  localStorage.setItem('oseil-derniere-activite', 'abc')
  expect(idleClock.last()).toBeNull()
})

test('a storage that refuses keeps nothing and throws nothing', () => {
  const refuse = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  }
  vi.stubGlobal('localStorage', { length: 0, key: refuse, getItem: refuse, setItem: refuse, removeItem: refuse, clear: refuse })
  expect(() => idleClock.touch(1)).not.toThrow()
  expect(idleClock.last()).toBeNull()
  expect(idleClock.wasClosed()).toBe(false)
})
