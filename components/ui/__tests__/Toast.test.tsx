// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Toast } from '../Toast'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

test('is a polite status that disappears after 1.8 seconds', () => {
  const onDone = vi.fn()
  render(<Toast message="Bonjour" onDone={onDone} />)
  const status = screen.getByRole('status')
  expect(status).toHaveAttribute('aria-live', 'polite')
  expect(status).toHaveTextContent('Bonjour')
  act(() => void vi.advanceTimersByTime(1799))
  expect(onDone).not.toHaveBeenCalled()
  act(() => void vi.advanceTimersByTime(1))
  expect(onDone).toHaveBeenCalledTimes(1)
})

// Nicolas, 10 November 2026: over the page, a see-through ground (bg-field, 5 %) let the text under it
// read through. The message sits on the page's own ground, opaque, inside its outline.
test('sits on an opaque ground, so the page under it never reads through', () => {
  render(<Toast message="Chiffres en % partout" onDone={vi.fn()} />)
  const status = screen.getByRole('status')
  expect(status).toHaveClass('bg-ground', 'border-rule-strong')
  expect(status).not.toHaveClass('bg-field')
})

test('a newer message restarts the delay', () => {
  const onDone = vi.fn()
  const { rerender } = render(<Toast message="Un" onDone={onDone} />)
  act(() => void vi.advanceTimersByTime(1500))
  rerender(<Toast message="Deux" onDone={onDone} />)
  expect(screen.getByRole('status')).toHaveTextContent('Deux')
  act(() => void vi.advanceTimersByTime(1500))
  expect(onDone).not.toHaveBeenCalled()
  act(() => void vi.advanceTimersByTime(300))
  expect(onDone).toHaveBeenCalledTimes(1)
})
