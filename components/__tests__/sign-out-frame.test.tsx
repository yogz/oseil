// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { SignOutFrame } from '@/components/account/SignOutFrame'
import { DeviceKeyNotClearedError } from '@/lib/auth/account'

const mocks = vi.hoisted(() => ({ signOut: vi.fn(), loadPage: vi.fn() }))

vi.mock('@/lib/auth/account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/account')>()),
  signOut: mocks.signOut,
}))
vi.mock('@/lib/supabase/browser', () => ({ createBrowserSupabase: () => ({}) }))
vi.mock('@/lib/vault/device', () => ({ indexedDbKeyStore: () => ({}) }))
vi.mock('@/lib/navigation', () => ({ loadPage: mocks.loadPage }))

const KEY_KEPT = "Tu es bien déconnecté, mais cet appareil n’a pas pu tout oublier. Reconnecte-toi puis déconnecte-toi à nouveau."

beforeEach(() => {
  mocks.signOut.mockReset()
  mocks.loadPage.mockReset()
})
afterEach(cleanup)

function show(props: { title?: string } = {}) {
  render(
    <SignOutFrame {...props} after={<nav aria-label="Onglets" />}>
      <p>Le contenu de l’écran</p>
    </SignOutFrame>,
  )
}

test('shows the screen, then a discreet « Se déconnecter » under it, before what comes after', () => {
  show()
  const content = screen.getByText('Le contenu de l’écran')
  const button = screen.getByRole('button', { name: 'Se déconnecter' })
  expect(content.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(button.compareDocumentPosition(screen.getByRole('navigation')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(button.className).toContain('min-h-11')
  expect(button.className).toContain('text-ink-muted')
})

test.each([
  ['succeeds', () => mocks.signOut.mockResolvedValue(undefined)],
  [
    'fails on a session that was already dead',
    () => mocks.signOut.mockRejectedValue(Object.assign(new Error('gone'), { code: 'refresh_token_not_found' })),
  ],
])('a sign-out that %s is a full page load to /connexion', async (_, arrange) => {
  arrange()
  show()
  await userEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }))
  await vi.waitFor(() => expect(mocks.loadPage).toHaveBeenCalledWith('/connexion'))
  expect(screen.queryByText(KEY_KEPT)).not.toBeInTheDocument()
})

test('while it signs out, the button cannot be touched again', async () => {
  mocks.signOut.mockReturnValue(new Promise(() => {}))
  show()
  await userEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }))
  expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeDisabled()
  expect(mocks.signOut).toHaveBeenCalledOnce()
})

test('a key that could not be erased is said, and nothing else stays on screen', async () => {
  mocks.signOut.mockRejectedValue(new DeviceKeyNotClearedError({ cause: new Error('IndexedDB lost') }))
  show({ title: 'Mon argent' })
  await userEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }))
  expect(await screen.findByText(KEY_KEPT)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Mon argent' })).toBeInTheDocument()
  // A real link: a full page load, so the key held in this page's memory goes too.
  expect(screen.getByRole('link', { name: 'Te connecter' })).toHaveAttribute('href', '/connexion')
  expect(screen.queryByText('Le contenu de l’écran')).not.toBeInTheDocument()
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Se déconnecter' })).not.toBeInTheDocument()
  expect(mocks.loadPage).not.toHaveBeenCalled()
})

test('without a title, the message stands alone', async () => {
  mocks.signOut.mockRejectedValue(new DeviceKeyNotClearedError({ cause: new Error('IndexedDB lost') }))
  show()
  await userEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }))
  expect(await screen.findByText(KEY_KEPT)).toBeInTheDocument()
  expect(screen.queryByRole('heading')).not.toBeInTheDocument()
})
