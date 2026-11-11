// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { TabBar } from '../ui/TabBar'

vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}))

afterEach(cleanup)

test('marks the current tab, and links the three screens', () => {
  render(<TabBar current="reperes" />)

  expect(screen.getByRole('link', { name: 'Mon argent' })).toHaveAttribute('href', '/')
  const current = screen.getByRole('link', { name: 'Repères' })
  expect(current).toHaveAttribute('href', '/reperes')
  expect(current).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'Évolution' })).toHaveAttribute('href', '/evolution')
  expect(screen.getByRole('link', { name: 'Mon argent' })).not.toHaveAttribute('aria-current')
})
