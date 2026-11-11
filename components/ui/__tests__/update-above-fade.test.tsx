// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AppFrame } from '../AppFrame'

// 11 November 2026: the fade between two screens gives each address a new key, which builds again
// everything below it. The update's provider holds the bank on screen; built again on the way from
// the list to a bank, it forgot the bank touched and opened the first one left (Coinbase added
// during the update opened BoursoBank; so did any bank touched in the list or on the result).
// The provider sits above the fade: it is built once for the whole update.

const mocks = vi.hoisted(() => ({ pathname: { current: '/mise-a-jour' }, mounts: { count: 0 } }))

vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname.current }))
vi.mock('@/lib/app/use-desktop', () => ({ useIsDesktop: () => false }))
vi.mock('@/components/update/UpdateProvider', () => ({
  UpdateProvider: ({ children }: { children: React.ReactNode }) => {
    useEffect(() => {
      mocks.mounts.count += 1
    }, [])
    return <div data-testid="update">{children}</div>
  },
}))

beforeEach(() => {
  mocks.pathname.current = '/mise-a-jour'
  mocks.mounts.count = 0
})
afterEach(cleanup)

test('from the list to a bank, then to the result, the update is the same one', () => {
  const { rerender } = render(<AppFrame><p>liste</p></AppFrame>)
  expect(screen.getByTestId('update')).toContainElement(screen.getByText('liste'))
  for (const path of ['/mise-a-jour/banque', '/mise-a-jour/resultat', '/mise-a-jour']) {
    mocks.pathname.current = path
    rerender(<AppFrame><p>{path}</p></AppFrame>)
    expect(screen.getByTestId('update')).toContainElement(screen.getByText(path))
  }
  expect(mocks.mounts.count).toBe(1)
})

test('outside the update, there is no update', () => {
  mocks.pathname.current = '/reperes'
  render(<AppFrame><p>repères</p></AppFrame>)
  expect(screen.queryByTestId('update')).not.toBeInTheDocument()
})
