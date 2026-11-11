// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { OPEN_DELAY_MS, useOpenAfterDim } from '../board-motion'

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
const reduced = vi.hoisted(() => ({ current: false }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('@/lib/app/use-reduced-motion', () => ({ useReducedMotion: () => reduced.current }))

beforeEach(() => {
  vi.useFakeTimers()
  router.push.mockClear()
  router.replace.mockClear()
  reduced.current = false
})
afterEach(() => vi.useRealTimers())

test('a touched square opens its page once its dimming is done, not before', () => {
  renderHook(() => useOpenAfterDim('/categorie/available'))
  act(() => vi.advanceTimersByTime(OPEN_DELAY_MS - 1))
  expect(router.push).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(1))
  expect(router.push).toHaveBeenCalledWith('/categorie/available')
  expect(router.replace).not.toHaveBeenCalled()
})

test('with fewer animations asked, the page opens at once', () => {
  reduced.current = true
  renderHook(() => useOpenAfterDim('/categorie/available'))
  expect(router.push).toHaveBeenCalledWith('/categorie/available')
})

test('replace keeps the history as it is', () => {
  renderHook(() => useOpenAfterDim('/categorie/secured', { replace: true }))
  act(() => vi.advanceTimersByTime(OPEN_DELAY_MS))
  expect(router.replace).toHaveBeenCalledWith('/categorie/secured')
  expect(router.push).not.toHaveBeenCalled()
})

test('nothing to open: nothing happens', () => {
  renderHook(() => useOpenAfterDim(null))
  act(() => vi.advanceTimersByTime(OPEN_DELAY_MS * 10))
  expect(router.push).not.toHaveBeenCalled()
  expect(router.replace).not.toHaveBeenCalled()
})

test('a screen left before the delay opens nothing', () => {
  const { unmount } = renderHook(() => useOpenAfterDim('/categorie/available'))
  unmount()
  act(() => vi.advanceTimersByTime(OPEN_DELAY_MS))
  expect(router.push).not.toHaveBeenCalled()
})
