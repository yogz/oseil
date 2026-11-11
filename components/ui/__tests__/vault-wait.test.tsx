// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { VaultWait, WAIT_DELAY_MS, WAIT_WORDS, WaitCover, type WaitPhase } from '../VaultWait'

// The phone asks for fewer animations; returns what undoes it.
function reduceMotion(): () => void {
  const before = window.matchMedia
  window.matchMedia = ((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  return () => {
    window.matchMedia = before
  }
}

const SCRAMBLED = /\bbg-(hairline|rule-strong)\b/

function squares(): HTMLElement[] {
  const grid = screen.getByRole('status').querySelector('[aria-hidden="true"]')
  return Array.from(grid?.children ?? []) as HTMLElement[]
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

test('nothing before a third of a second', () => {
  render(<VaultWait phase="open" />)
  act(() => vi.advanceTimersByTime(WAIT_DELAY_MS - 1))
  expect(screen.queryByRole('status')).toBeNull()
  act(() => vi.advanceTimersByTime(1))
  expect(screen.getByRole('status')).toHaveTextContent(/^Ouverture de ton coffre…$/)
})

test('a hundred squares, hidden from VoiceOver', () => {
  render(<VaultWait phase="open" />)
  act(() => vi.advanceTimersByTime(WAIT_DELAY_MS))
  expect(squares()).toHaveLength(100)
})

test('each phase says its words', () => {
  const expected: Record<WaitPhase, string> = {
    open: 'Ouverture de ton coffre…',
    lock: 'Mise sous clé…',
    create: 'Création de ton coffre…',
    prices: 'Derniers cours…',
  }
  expect(WAIT_WORDS).toEqual(expected)
  for (const phase of Object.keys(expected) as WaitPhase[]) {
    const { unmount } = render(<VaultWait phase={phase} />)
    act(() => vi.advanceTimersByTime(WAIT_DELAY_MS))
    expect(screen.getByRole('status')).toHaveTextContent(expected[phase])
    unmount()
  }
})

test('changing phase keeps the same element, without waiting again', () => {
  const { rerender } = render(<VaultWait phase="open" />)
  act(() => vi.advanceTimersByTime(WAIT_DELAY_MS))
  const before = screen.getByRole('status')
  rerender(<VaultWait phase="prices" />)
  expect(screen.getByRole('status')).toBe(before)
  expect(before).toHaveTextContent(/^Derniers cours…$/)
})

test('reduced motion: still, in colour', () => {
  const undo = reduceMotion()
  try {
    render(<VaultWait phase="open" />)
    act(() => vi.advanceTimersByTime(WAIT_DELAY_MS))
    expect(squares().some((square) => SCRAMBLED.test(square.className))).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    undo()
  }
})

test('lock starts in colour, open starts scrambled', () => {
  const { unmount } = render(<VaultWait phase="lock" />)
  act(() => vi.advanceTimersByTime(WAIT_DELAY_MS))
  expect(squares().some((square) => SCRAMBLED.test(square.className))).toBe(false)
  unmount()
  render(<VaultWait phase="open" />)
  act(() => vi.advanceTimersByTime(WAIT_DELAY_MS))
  expect(squares().every((square) => SCRAMBLED.test(square.className))).toBe(true)
})

test('the scramble settles into colours, row after row', () => {
  render(<VaultWait phase="open" />)
  act(() => vi.advanceTimersByTime(WAIT_DELAY_MS))
  act(() => vi.advanceTimersByTime(110 * 20))
  const coloured = squares().filter((square) => !SCRAMBLED.test(square.className))
  expect(coloured.length).toBeGreaterThan(0)
  expect(coloured.length).toBeLessThan(100)
})

test('WaitCover keeps the form and its values', () => {
  const { rerender } = render(
    <WaitCover active phase="open">
      <input aria-label="e-mail" defaultValue="a@b.fr" />
    </WaitCover>,
  )
  expect(screen.getByLabelText('e-mail')).toBeVisible()
  act(() => vi.advanceTimersByTime(WAIT_DELAY_MS))
  expect(screen.getByLabelText('e-mail')).not.toBeVisible()
  expect(screen.getByRole('status')).toHaveTextContent('Ouverture de ton coffre…')
  rerender(
    <WaitCover active={false} phase="open">
      <input aria-label="e-mail" defaultValue="a@b.fr" />
    </WaitCover>,
  )
  expect(screen.getByLabelText('e-mail')).toBeVisible()
  expect(screen.getByLabelText('e-mail')).toHaveValue('a@b.fr')
  expect(screen.queryByRole('status')).toBeNull()
})

test('WaitCover stops the timers once done', () => {
  const { rerender } = render(<WaitCover active phase="lock">x</WaitCover>)
  act(() => vi.advanceTimersByTime(WAIT_DELAY_MS))
  rerender(<WaitCover active={false} phase="lock">x</WaitCover>)
  expect(vi.getTimerCount()).toBe(0)
})
