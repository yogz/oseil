// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { AuthApiError } from '@supabase/supabase-js'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import DeleteAccountPage from '@/app/(app)/reglages/supprimer/page'
import { forgetEverything } from '@/lib/app/session-memory'

const mocks = vi.hoisted(() => ({
  client: {} as { auth?: { getUser: () => Promise<unknown> } },
  finishDeletion: vi.fn(),
  loadPage: vi.fn(),
}))

vi.mock('next/link', () => ({ default: ({ children }: { children: unknown }) => children }))
vi.mock('@/components/ui/use-menu-from-model', () => ({ useMenuFromModel: () => {} }))
vi.mock('@/lib/vault/use-vault', () => ({
  useVault: () => ({ status: 'ready', dataKey: {} as CryptoKey, userId: 'someone' }),
}))
vi.mock('@/lib/supabase/browser', () => ({ createBrowserSupabase: () => mocks.client }))
vi.mock('@/lib/vault/device', () => ({ indexedDbKeyStore: () => ({}) }))
vi.mock('@/lib/navigation', () => ({ loadPage: mocks.loadPage }))
vi.mock('@/lib/auth/account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/account')>()),
  finishDeletion: mocks.finishDeletion,
}))
// An account deleted elsewhere reads as nothing: the base gives its token no row.
vi.mock('@/lib/model/repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/model/repository')>()),
  loadModelDocuments: async () => {
    const none = { unreadable: 0 }
    return {
      profile: { profile: null, ...none },
      snapshots: { snapshots: [], ...none },
      goals: { goals: [], ...none },
      settings: { settings: null, ...none },
      draft: { draft: null, ...none },
    }
  },
}))

beforeEach(() => {
  forgetEverything()
  mocks.loadPage.mockReset()
  mocks.finishDeletion.mockReset().mockResolvedValue(undefined)
  mocks.client.auth = {
    getUser: () =>
      Promise.resolve({ data: { user: null }, error: new AuthApiError('User not found', 403, 'user_not_found') }),
  }
})
afterEach(cleanup)

test('the delete screen of an account deleted elsewhere goes to the landing that says so', async () => {
  render(<DeleteAccountPage />)
  await vi.waitFor(() => expect(mocks.loadPage).toHaveBeenCalledWith('/?compte=supprime'))
  expect(mocks.finishDeletion).toHaveBeenCalledTimes(1)
})
