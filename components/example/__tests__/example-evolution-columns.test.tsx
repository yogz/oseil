// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { ExampleEvolution } from '../ExampleEvolution'

const mocks = vi.hoisted(() => ({ desktop: { current: false } }))

vi.mock('@/lib/app/use-desktop', () => ({ useIsDesktop: () => mocks.desktop.current }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

afterEach(() => {
  cleanup()
  mocks.desktop.current = false
})

const STEPS = 'Sa grille, relevé par relevé'
const columns = (container: HTMLElement) => {
  const [aside, reading] = Array.from(container.querySelector('[data-columns]')!.children)
  return { aside, reading }
}

// C2 (Nicolas, 11 November 2026): on a computer the grid snapshot by snapshot fills the left
// column under the title, as the grid of Mon argent does; once only.
test('on a computer, the grid snapshot by snapshot is in the left column, once', () => {
  mocks.desktop.current = true
  const { container } = render(<ExampleEvolution />)
  const { aside, reading } = columns(container)
  expect(aside.querySelector(`section[aria-label="${STEPS}"]`)).not.toBeNull()
  expect(reading.querySelector(`section[aria-label="${STEPS}"]`)).toBeNull()
})

test('on a phone, it stays in the reading, after the curve', () => {
  const { container } = render(<ExampleEvolution />)
  const { aside, reading } = columns(container)
  expect(aside.querySelector(`section[aria-label="${STEPS}"]`)).toBeNull()
  expect(reading.querySelector(`section[aria-label="${STEPS}"]`)).not.toBeNull()
})
