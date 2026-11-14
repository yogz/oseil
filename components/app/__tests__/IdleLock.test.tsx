// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { memoryStorage } from '@/lib/auth/__tests__/memory-storage'
import { IDLE_LIMIT_MS, idleClock } from '@/lib/app/idle-lock'
import { IdleLock } from '../IdleLock'

const mocks = vi.hoisted(() => ({ signOut: vi.fn(async () => {}), loadPage: vi.fn() }))
vi.mock('@/lib/auth/account', () => ({ signOut: mocks.signOut }))
vi.mock('@/lib/navigation', () => ({ loadPage: mocks.loadPage }))
vi.mock('@/lib/supabase/browser', () => ({ createBrowserSupabase: () => ({}) }))
vi.mock('@/lib/vault/device', () => ({ indexedDbKeyStore: () => ({}) }))

const START = new Date('2026-11-11T10:00:00Z').getTime()

beforeEach(() => {
  vi.useFakeTimers({ now: START })
  vi.stubGlobal('localStorage', memoryStorage())
  mocks.signOut.mockClear()
  mocks.loadPage.mockClear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

test('left untouched for 15 minutes, the vault closes: signed out, then the sign-in page', async () => {
  render(<IdleLock />)
  await wait(IDLE_LIMIT_MS - 30_000)
  expect(mocks.signOut).not.toHaveBeenCalled()
  await wait(30_000)
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
  expect(mocks.loadPage).toHaveBeenCalledWith('/connexion')
  expect(idleClock.wasClosed()).toBe(true)
})

test('a touch keeps the vault open for 15 more minutes', async () => {
  render(<IdleLock />)
  await wait(10 * 60 * 1000)
  act(() => {
    window.dispatchEvent(new Event('pointerdown'))
  })
  await wait(10 * 60 * 1000)
  expect(mocks.signOut).not.toHaveBeenCalled()
  await wait(5 * 60 * 1000 + 15_000)
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
})

// The phone put down, the application opened again an hour later.
test('opened again long after the last activity, the vault closes at once', async () => {
  idleClock.touch(START - 60 * 60 * 1000)
  render(<IdleLock />)
  await wait(0)
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
})

test('a recent activity in another tab keeps this one open', async () => {
  render(<IdleLock />)
  await wait(14 * 60 * 1000)
  idleClock.touch(Date.now())
  await wait(10 * 60 * 1000)
  expect(mocks.signOut).not.toHaveBeenCalled()
})

test('coming back to the front after the limit closes the vault before anything is seen', async () => {
  render(<IdleLock />)
  // Timers are slowed down in a tab in the background: the time written is what counts.
  vi.setSystemTime(START + IDLE_LIMIT_MS + 1)
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await wait(0)
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
})

// Found by e2e/verrouillage.spec.ts: the application moves to /connexion by itself once the key is
// gone; loading that page again when the sign-out ends emptied the form being filled.
test('a screen already left when the sign-out ends is not loaded again', async () => {
  let release = () => {}
  mocks.signOut.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)))
  idleClock.touch(START - 60 * 60 * 1000)
  const { unmount } = render(<IdleLock />)
  await wait(0)
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
  unmount()
  await act(async () => release())
  expect(mocks.loadPage).not.toHaveBeenCalled()
})

test('a touch after the limit does not open the vault again', async () => {
  render(<IdleLock />)
  vi.setSystemTime(START + IDLE_LIMIT_MS + 1)
  act(() => {
    window.dispatchEvent(new Event('keydown'))
  })
  await wait(0)
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
})

// Closed by the clock, not by the person: the sign-in page shows their address again.
test('closing by itself keeps the remembered address', async () => {
  localStorage.setItem('oseil-adresse', 'me@example.com')
  idleClock.touch(START - 60 * 60 * 1000)
  render(<IdleLock />)
  await wait(0)
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
  expect(localStorage.getItem('oseil-adresse')).toBe('me@example.com')
})
