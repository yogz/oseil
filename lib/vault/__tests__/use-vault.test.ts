// @vitest-environment jsdom
import { AuthRetryableFetchError } from '@supabase/supabase-js'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  TAB_CHANNEL,
  forgetEverything,
  modelMark,
  rememberModel,
  rememberVault,
  rememberedModel,
  rememberedVault,
  vaultMark,
} from '@/lib/app/session-memory'
import type { Model } from '@/lib/app/use-model'
import { useVault } from '../use-vault'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getKey: vi.fn(),
  signOut: vi.fn(),
  router: { replace: vi.fn() },
}))

vi.mock('@/lib/supabase/browser', () => ({
  createBrowserSupabase: () => ({ auth: { getSession: mocks.getSession } }),
}))
vi.mock('../device', () => ({
  indexedDbKeyStore: () => ({ get: mocks.getKey, set: vi.fn(), delete: vi.fn(), clear: vi.fn() }),
}))
vi.mock('@/lib/auth/account', () => ({ signOut: mocks.signOut }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))

const KEY = {} as CryptoKey
const REMEMBERED_KEY = { remembered: true } as unknown as CryptoKey
const signedIn = { data: { session: { user: { id: 'someone' } } }, error: null }
const model: Model = {
  profile: null,
  snapshots: [],
  goals: [],
  settings: null,
  draft: null,
  unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
}

// What a screen opened before this one left in the tab's memory.
function screenBefore() {
  rememberVault({ userId: 'someone', dataKey: REMEMBERED_KEY }, vaultMark())
  rememberModel({ userId: 'someone', model, client: {} as SupabaseClient }, modelMark())
}

beforeEach(() => {
  forgetEverything()
  mocks.getSession.mockReset().mockResolvedValue(signedIn)
  mocks.getKey.mockReset().mockResolvedValue(KEY)
  mocks.signOut.mockReset().mockResolvedValue(undefined)
  mocks.router.replace.mockReset()
})
afterEach(cleanup)

describe('useVault', () => {
  test('opens with the key this device keeps for the signed-in person', async () => {
    const { result } = renderHook(() => useVault())
    expect(result.current).toEqual({ status: 'loading' })
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', dataKey: KEY, userId: 'someone' }))
    expect(mocks.getKey).toHaveBeenCalledWith('someone')
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  // Only a device that truly has no key, or a session that truly is gone,
  // signs the person out — which also wipes the keys.
  test.each([
    ['no key on this device', () => mocks.getKey.mockResolvedValue(null)],
    ['no session', () => mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })],
  ])('with %s, closes the session and goes to /connexion', async (_, arrange) => {
    arrange()
    const { result } = renderHook(() => useVault())
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith('/connexion'))
    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(result.current).toEqual({ status: 'loading' })
  })

  // A hiccup is not a missing key: wiping the key over it would make the
  // person type their password again for nothing — or for good, offline.
  test.each([
    ['the key store fails to answer', () => mocks.getKey.mockRejectedValue(new DOMException('lost', 'UnknownError'))],
    [
      'the session cannot be refreshed for now',
      () =>
        mocks.getSession.mockResolvedValue({
          data: { session: null },
          error: new AuthRetryableFetchError('Failed to fetch', 0),
        }),
    ],
    ['the session cannot be read', () => mocks.getSession.mockRejectedValue(new Error('boom'))],
  ])('when %s, keeps everything and offers to try again', async (_, arrange) => {
    arrange()
    const { result } = renderHook(() => useVault())
    await waitFor(() => expect(result.current.status).toBe('unavailable'))
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(mocks.router.replace).not.toHaveBeenCalled()

    // The hiccup passes; trying again opens the vault.
    mocks.getSession.mockResolvedValue(signedIn)
    mocks.getKey.mockResolvedValue(KEY)
    act(() => {
      if (result.current.status === 'unavailable') result.current.retry()
    })
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', dataKey: KEY, userId: 'someone' }))
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  test('a vault opened leaves itself to the next screen', async () => {
    const { result } = renderHook(() => useVault())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(rememberedVault()).toEqual({ userId: 'someone', dataKey: KEY })
  })

  // The defect of 9 November 2026: each screen showed nothing while it opened the vault again.
  test('a remembered vault is ready at once, and the check that follows has the last word', async () => {
    screenBefore()
    const { result } = renderHook(() => useVault())
    expect(result.current).toEqual({ status: 'ready', dataKey: REMEMBERED_KEY, userId: 'someone', recalled: true })

    await waitFor(() => expect(result.current).toEqual({ status: 'ready', dataKey: KEY, userId: 'someone' }))
    expect(mocks.getKey).toHaveBeenCalledWith('someone')
    expect(rememberedVault()).toEqual({ userId: 'someone', dataKey: KEY })
    expect(rememberedModel('someone')).not.toBeNull()
  })

  test('a remembered vault is ready at once, and an absent session still signs out', async () => {
    screenBefore()
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
    const { result } = renderHook(() => useVault())
    expect(result.current.status).toBe('ready')

    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith('/connexion'))
    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(rememberedVault()).toBeNull()
    expect(rememberedModel('someone')).toBeNull()
    // Nothing of the session that is gone stays on screen.
    expect(result.current).toEqual({ status: 'loading' })
  })

  test('a hiccup keeps the remembered vault on screen', async () => {
    screenBefore()
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    })
    const { result } = renderHook(() => useVault())

    // Checked as far as it could be: the screen may read with it.
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', dataKey: REMEMBERED_KEY, userId: 'someone' }))
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(mocks.router.replace).not.toHaveBeenCalled()
    expect(rememberedVault()).toEqual({ userId: 'someone', dataKey: REMEMBERED_KEY })
  })

  test('after a sign-out, a new screen opens the vault from nothing', async () => {
    const { result, unmount } = renderHook(() => useVault())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    rememberModel({ userId: 'someone', model, client: {} as SupabaseClient }, modelMark())
    unmount()

    const { signOut } = await vi.importActual<typeof import('@/lib/auth/account')>('@/lib/auth/account')
    const client = { auth: { signOut: async () => ({ error: null }) } } as unknown as SupabaseClient
    await signOut(client, { get: vi.fn(), set: vi.fn(), delete: vi.fn(), clear: async () => {} })

    expect(rememberedModel('someone')).toBeNull()
    const next = renderHook(() => useVault())
    expect(next.result.current).toEqual({ status: 'loading' })
  })

  // A shared computer: someone signs out, or signs in, in another tab.
  test('a word from another tab forgets: the next screen opens the vault from nothing', async () => {
    screenBefore()
    const otherTab = new BroadcastChannel(TAB_CHANNEL)
    otherTab.postMessage('forget')
    await waitFor(() => expect(rememberedVault()).toBeNull())
    otherTab.close()

    expect(rememberedModel('someone')).toBeNull()
    const { result } = renderHook(() => useVault())
    expect(result.current).toEqual({ status: 'loading' })
  })

  test('does nothing once the screen has gone', async () => {
    let answer: (value: unknown) => void = () => {}
    mocks.getSession.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    mocks.getKey.mockResolvedValue(null)
    const { unmount } = renderHook(() => useVault())
    unmount()
    answer(signedIn)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(mocks.router.replace).not.toHaveBeenCalled()
  })

  test('does not navigate if the screen goes while the session is being closed', async () => {
    let closed: (value: unknown) => void = () => {}
    mocks.getKey.mockResolvedValue(null)
    mocks.signOut.mockReturnValue(new Promise((resolve) => (closed = resolve)))
    const { unmount } = renderHook(() => useVault())
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce())
    unmount()
    closed(undefined)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(mocks.router.replace).not.toHaveBeenCalled()
  })
})
