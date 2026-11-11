// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import UpdateLayout from '../layout'

vi.mock('@/components/update/UpdateProvider', () => ({
  UpdateProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="provider">{children}</div>,
}))
vi.mock('@/lib/auth/account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/account')>()),
  signOut: vi.fn(),
}))
vi.mock('@/lib/supabase/browser', () => ({ createBrowserSupabase: () => ({}) }))
vi.mock('@/lib/vault/device', () => ({ indexedDbKeyStore: () => ({}) }))
vi.mock('@/lib/navigation', () => ({ loadPage: vi.fn() }))

afterEach(cleanup)

// The provider is in AppFrame, above the fade (components/ui/__tests__/update-above-fade.test.tsx):
// here, a second one would hold a second update.
test('the update is drawn with no provider of its own, no sign-out of its own and no tab bar', () => {
  render(
    <UpdateLayout>
      <h1>Mettre à jour tes chiffres</h1>
    </UpdateLayout>,
  )
  expect(screen.queryByTestId('provider')).not.toBeInTheDocument()
  expect(screen.getByRole('heading')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Se déconnecter' })).not.toBeInTheDocument()
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
})
