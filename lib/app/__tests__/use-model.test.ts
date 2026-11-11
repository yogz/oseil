// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { signOut } from '@/lib/auth/account'
import { formatEuros, formatEurosShown, setAmountsHidden } from '@/lib/format'
import { saveProfile } from '@/lib/model/repository'
import { exampleProfile } from '@/lib/model/__tests__/fixtures'
import type { VaultState } from '@/lib/vault/use-vault'
import { forgetEverything, rememberedModel } from '../session-memory'
import { useModel } from '../use-model'

const mocks = vi.hoisted(() => ({
  vault: { current: { status: 'loading' } as VaultState },
  client: { tag: 'client' },
  loadProfile: vi.fn(),
  loadSnapshots: vi.fn(),
  loadGoals: vi.fn(),
  loadSettings: vi.fn(),
  loadDraft: vi.fn(),
}))

vi.mock('@/lib/vault/use-vault', () => ({ useVault: () => mocks.vault.current }))
vi.mock('@/lib/supabase/browser', () => ({ createBrowserSupabase: () => mocks.client }))
// The reads are faked; the writes are the real ones.
vi.mock('@/lib/model/repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/model/repository')>()),
  loadProfile: mocks.loadProfile,
  loadSnapshots: mocks.loadSnapshots,
  loadGoals: mocks.loadGoals,
  loadSettings: mocks.loadSettings,
  loadDraft: mocks.loadDraft,
  // The whole model in one go, as the repository reads it: each kind by its own (faked) reader.
  loadModelDocuments: async (client: unknown, dataKey: unknown) => {
    const [profile, snapshots, goals, settings, draft] = await Promise.all([
      mocks.loadProfile(client, dataKey),
      mocks.loadSnapshots(client, dataKey),
      mocks.loadGoals(client, dataKey),
      mocks.loadSettings(client, dataKey),
      mocks.loadDraft(client, dataKey),
    ])
    return { profile, snapshots, goals, settings, draft }
  },
}))

const KEY = { key: 'checked' } as unknown as CryptoKey
const REMEMBERED_KEY = { key: 'remembered' } as unknown as CryptoKey

beforeEach(() => {
  forgetEverything()
  mocks.vault.current = { status: 'ready', dataKey: KEY, userId: 'someone' }
  mocks.loadProfile.mockReset().mockResolvedValue({ profile: null, unreadable: 0 })
  mocks.loadSnapshots.mockReset().mockResolvedValue({ snapshots: [], unreadable: 2 })
  mocks.loadGoals.mockReset().mockResolvedValue({ goals: [], unreadable: 0 })
  mocks.loadSettings.mockReset().mockResolvedValue({ settings: null, unreadable: 1 })
  mocks.loadDraft.mockReset().mockResolvedValue({ draft: null, unreadable: 3 })
})
afterEach(cleanup)

test('is loading while the vault opens', () => {
  mocks.vault.current = { status: 'loading' }
  const { result } = renderHook(() => useModel())
  expect(result.current.status).toBe('loading')
  expect(mocks.loadProfile).not.toHaveBeenCalled()
})

test('is unavailable when the vault is, with its retry', () => {
  const retry = vi.fn()
  mocks.vault.current = { status: 'unavailable', retry }
  const { result } = renderHook(() => useModel())
  expect(result.current).toEqual({ status: 'unavailable', retry })
})

test('is ready with the five documents and their unreadable counts', async () => {
  const { result } = renderHook(() => useModel())
  expect(result.current.status).toBe('loading')
  await waitFor(() => expect(result.current.status).toBe('ready'))
  const state = result.current
  if (state.status !== 'ready') throw new Error('not ready')
  expect(state.model).toEqual({
    profile: null,
    snapshots: [],
    goals: [],
    settings: null,
    draft: null,
    unreadable: { profile: 0, snapshots: 2, goals: 0, settings: 1, draft: 3 },
  })
  expect(state.client).toBe(mocks.client)
  expect(state.dataKey).toBe(KEY)
  expect(mocks.loadSettings).toHaveBeenCalledWith(mocks.client, KEY)
  expect(mocks.loadDraft).toHaveBeenCalledWith(mocks.client, KEY)
})

test('fails when one read rejects, and retry reads again', async () => {
  mocks.loadGoals.mockRejectedValueOnce(new Error('offline'))
  const { result } = renderHook(() => useModel())
  await waitFor(() => expect(result.current.status).toBe('failed'))
  act(() => {
    if (result.current.status === 'failed') result.current.retry()
  })
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(mocks.loadProfile).toHaveBeenCalledTimes(2)
})

test('reload reads again without going back through loading', async () => {
  const { result } = renderHook(() => useModel())
  await waitFor(() => expect(result.current.status).toBe('ready'))
  mocks.loadSnapshots.mockResolvedValue({ snapshots: [], unreadable: 0 })
  act(() => {
    if (result.current.status === 'ready') result.current.reload()
  })
  expect(result.current.status).toBe('ready')
  await waitFor(() => {
    if (result.current.status !== 'ready') throw new Error('not ready')
    expect(result.current.model.unreadable.snapshots).toBe(0)
  })
})

test('hides the amounts across the app when the settings say so, and shows them again otherwise', async () => {
  const settings = (hideAmounts: boolean) => ({
    settings: { id: 's', value: { schema: 1, budget: null, display: 'euros', hideAmounts }, updatedAt: 'x' },
    unreadable: 0,
  })
  mocks.loadSettings.mockResolvedValue(settings(true))
  const { result } = renderHook(() => useModel())
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(formatEurosShown(100_000)).toBe('•••')

  mocks.loadSettings.mockResolvedValue(settings(false))
  act(() => {
    if (result.current.status === 'ready') result.current.reload()
  })
  await waitFor(() => expect(formatEurosShown(100_000)).not.toBe('•••'))
})

test('settings that cannot be read hide the amounts on the read-only screens, as a precaution', async () => {
  mocks.loadSettings.mockResolvedValue({ settings: null, unreadable: 1 })
  const { result } = renderHook(() => useModel())
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(formatEurosShown(100_000)).toBe('•••')
  expect(formatEuros(100_000)).not.toBe('•••')
})

// The defect of 9 November 2026: each screen showed nothing for 0.4 s while it
// read the model again. A screen that comes after another one now starts from
// what the tab read last (lib/app/session-memory.ts).
describe('from one screen to the next', () => {
  const unreadableSnapshots = (state: ReturnType<typeof useModel>) =>
    state.status === 'ready' ? state.model.unreadable.snapshots : null

  // A first screen reads the model (two unreadable snapshots), then goes.
  async function screenBefore(userId = 'someone') {
    mocks.vault.current = { status: 'ready', dataKey: KEY, userId }
    const { result, unmount } = renderHook(() => useModel())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    unmount()
    mocks.loadProfile.mockClear()
  }

  // A reading the test answers when it chooses.
  function heldProfile() {
    let answer: () => void = () => {}
    mocks.loadProfile.mockReturnValue(
      new Promise((resolve) => (answer = () => resolve({ profile: null, unreadable: 0 }))),
    )
    return () => act(answer)
  }

  test('a screen mounted after another one draws the remembered model at once', async () => {
    await screenBefore()
    const answer = heldProfile()
    mocks.loadSnapshots.mockResolvedValue({ snapshots: [], unreadable: 0 })
    mocks.vault.current = { status: 'ready', dataKey: REMEMBERED_KEY, userId: 'someone', recalled: true }

    const { result, rerender } = renderHook(() => useModel())
    // Its first render, before anything is read again.
    expect(result.current.status).toBe('ready')
    expect(unreadableSnapshots(result.current)).toBe(2)
    // Read again only with a key the vault has checked.
    expect(mocks.loadProfile).not.toHaveBeenCalled()

    mocks.vault.current = { status: 'ready', dataKey: KEY, userId: 'someone' }
    rerender()
    expect(mocks.loadProfile).toHaveBeenCalledOnce()
    expect(mocks.loadProfile).toHaveBeenCalledWith(mocks.client, KEY)
    expect(unreadableSnapshots(result.current)).toBe(2)

    // The background reading replaces what is shown, and what the tab remembers.
    await answer()
    await waitFor(() => expect(unreadableSnapshots(result.current)).toBe(0))
    expect(rememberedModel('someone')?.model.unreadable.snapshots).toBe(0)
  })

  test('a write forgets the remembered model: the next screen reads afresh', async () => {
    await screenBefore()
    // The fake client cannot write: the model is forgotten all the same.
    await saveProfile(mocks.client as unknown as SupabaseClient, KEY, exampleProfile).catch(() => {})

    mocks.vault.current = { status: 'ready', dataKey: REMEMBERED_KEY, userId: 'someone', recalled: true }
    const { result } = renderHook(() => useModel())
    expect(result.current.status).toBe('loading')
  })

  test('sign-out forgets everything: the next screen shows nothing remembered', async () => {
    await screenBefore()
    const client = { auth: { signOut: async () => ({ error: null }) } } as unknown as SupabaseClient
    await signOut(client, { get: vi.fn(), set: vi.fn(), delete: vi.fn(), clear: async () => {} })

    expect(rememberedModel('someone')).toBeNull()
    const { result } = renderHook(() => useModel())
    expect(result.current.status).toBe('loading')
  })

  test('another person never sees the previous model', async () => {
    await screenBefore('a')
    mocks.vault.current = { status: 'ready', dataKey: KEY, userId: 'b' }
    const answer = heldProfile()

    const { result } = renderHook(() => useModel())
    expect(result.current.status).toBe('loading')
    await answer()
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })

  test('a vault checked again for another person never shows the previous model', async () => {
    await screenBefore('a')
    mocks.vault.current = { status: 'ready', dataKey: REMEMBERED_KEY, userId: 'a', recalled: true }
    const { result, rerender } = renderHook(() => useModel())
    expect(result.current.status).toBe('ready')

    const answer = heldProfile()
    mocks.vault.current = { status: 'ready', dataKey: KEY, userId: 'b' }
    rerender()
    expect(result.current.status).toBe('loading')
    await answer()
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })

  test('a failed background reading keeps the remembered model on screen', async () => {
    await screenBefore()
    mocks.loadGoals.mockRejectedValue(new Error('offline'))
    mocks.vault.current = { status: 'ready', dataKey: KEY, userId: 'someone' }

    const { result } = renderHook(() => useModel())
    await waitFor(() => expect(mocks.loadGoals).toHaveBeenCalledTimes(2))
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(result.current.status).toBe('ready')
    expect(unreadableSnapshots(result.current)).toBe(2)

    // Asked again by the screen (after a write), a failure is said, as without a memory.
    act(() => {
      if (result.current.status === 'ready') result.current.reload()
    })
    await waitFor(() => expect(result.current.status).toBe('failed'))
  })

  test('a remembered model hides the amounts on its very first render when its settings say so', async () => {
    mocks.loadSettings.mockResolvedValue({
      settings: { id: 's', value: { schema: 1, budget: null, display: 'euros', hideAmounts: true }, updatedAt: 'x' },
      unreadable: 0,
    })
    await screenBefore()
    setAmountsHidden(false)
    heldProfile()
    mocks.vault.current = { status: 'ready', dataKey: REMEMBERED_KEY, userId: 'someone', recalled: true }

    const { result } = renderHook(() => useModel())
    expect(result.current.status).toBe('ready')
    expect(formatEurosShown(100_000)).toBe('•••')
  })
})
