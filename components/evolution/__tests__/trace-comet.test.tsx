// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { TraceComet } from '../TraceComet'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function motion(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query === '(prefers-reduced-motion: reduce)',
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

test('a trace that moves gets a dot and its tail, hidden from VoiceOver', () => {
  motion(false)
  const { container } = render(<TraceComet positions={[90, 70, 60]} color="available" startedAt={0} />)
  const head = container.querySelector('[data-comet="head"]')
  const tail = container.querySelector('[data-comet="tail"]')
  expect(head).toHaveAttribute('aria-hidden', 'true')
  expect(tail).toHaveAttribute('aria-hidden', 'true')
  expect(head).toHaveClass('bg-cat-available')
})

test('nothing travels with fewer animations asked', () => {
  motion(true)
  const { container } = render(<TraceComet positions={[90, 70, 60]} color="available" startedAt={0} />)
  expect(container).toBeEmptyDOMElement()
})

test('nothing travels on a trace that never moved', () => {
  motion(false)
  const { container } = render(<TraceComet positions={[0, 0, 0]} color="gold" startedAt={0} />)
  expect(container).toBeEmptyDOMElement()
})
