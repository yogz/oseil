// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { memoryStorage } from '@/lib/auth/__tests__/memory-storage'
import { rememberedEmail } from '@/lib/auth/remembered-email'
import { SignOutFrame } from '../SignOutFrame'

const mocks = vi.hoisted(() => ({ signOut: vi.fn(async () => {}), loadPage: vi.fn() }))
vi.mock('@/lib/auth/account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/account')>()),
  signOut: mocks.signOut,
}))
vi.mock('@/lib/navigation', () => ({ loadPage: mocks.loadPage }))
vi.mock('@/lib/supabase/browser', () => ({ createBrowserSupabase: () => ({}) }))
vi.mock('@/lib/vault/device', () => ({ indexedDbKeyStore: () => ({}) }))

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  mocks.signOut.mockReset()
  mocks.signOut.mockResolvedValue(undefined)
  mocks.loadPage.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('« Se déconnecter » forgets the remembered address, then signs out', async () => {
  rememberedEmail.set('me@example.com')
  render(<SignOutFrame>contenu</SignOutFrame>)

  fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }))

  await vi.waitFor(() => expect(mocks.loadPage).toHaveBeenCalledWith('/connexion'))
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
  expect(rememberedEmail.read()).toBeNull()
})

test('the address is forgotten even when the sign-out fails', async () => {
  rememberedEmail.set('me@example.com')
  mocks.signOut.mockRejectedValue(new Error('network'))
  render(<SignOutFrame>contenu</SignOutFrame>)

  fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }))

  await vi.waitFor(() => expect(mocks.loadPage).toHaveBeenCalled())
  expect(rememberedEmail.read()).toBeNull()
})
