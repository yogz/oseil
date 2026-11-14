// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { ModelState } from '@/lib/app/use-model'
import HomePage from '../page'

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  loadPage: vi.fn(),
  state: { current: { status: 'loading' } as ModelState },
}))

vi.mock('@/lib/auth/account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/account')>()),
  signOut: mocks.signOut,
}))
vi.mock('@/lib/supabase/browser', () => ({ createBrowserSupabase: () => ({}) }))
vi.mock('@/lib/vault/device', () => ({ indexedDbKeyStore: () => ({}) }))
vi.mock('@/lib/app/use-model', () => ({ useModel: () => mocks.state.current }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/lib/navigation', () => ({ loadPage: mocks.loadPage }))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}))

beforeEach(() => {
  mocks.signOut.mockReset()
  mocks.loadPage.mockReset()
  mocks.state.current = { status: 'loading' }
})
afterEach(cleanup)

// « Se déconnecter » lives in the Réglages (and on the two first-launch screens that cannot reach
// them): Mon argent, where a person looks at their figures, has no way out of its own.
test('Mon argent has no « Se déconnecter », and keeps the way to the Réglages', () => {
  render(<HomePage />)
  expect(screen.queryByRole('button', { name: 'Se déconnecter' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Réglages' })).toHaveAttribute('href', '/reglages')
})

// The third pictogram (planche 9E, Nicolas, 14 November 2026): the magnifier, just left of the gear.
test('the magnifier « Trouver » sits just left of the gear of the Réglages', () => {
  render(<HomePage />)
  const find = screen.getByRole('link', { name: 'Trouver' })
  expect(find).toHaveAttribute('href', '/trouver')
  expect(find.nextElementSibling).toBe(screen.getByRole('link', { name: 'Réglages' }))
})

// Without the pill the line is the title, the magnifier and the gear: it fits from 249 px of screen,
// the title keeps the threshold it had (360 px).
test('without « Mettre à jour », the title keeps its 360 px threshold', () => {
  render(<HomePage />)
  const title = screen.getByRole('heading', { level: 1, name: 'Mon argent' })
  expect(title.className).toContain('max-[22.5rem]:sr-only')
  expect(title.className).not.toContain('max-[24rem]:sr-only')
})

test('a vault that cannot be opened for now offers to try again', async () => {
  const user = userEvent.setup()
  const retry = vi.fn()
  mocks.state.current = { status: 'unavailable', retry }
  render(<HomePage />)

  expect(screen.getByText('Tes chiffres n’ont pas pu être chargés.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Réessayer' }))
  expect(retry).toHaveBeenCalledOnce()
})
