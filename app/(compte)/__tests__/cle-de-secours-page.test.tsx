// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import RecoveryKeyPage from '@/app/(compte)/cle-de-secours/page'
import { confirmRecoveryKey } from '@/components/__tests__/confirm-recovery-key'
import { clearPendingRecovery, setPendingRecovery } from '@/lib/auth/pending-recovery'
import { RecoveryKeyReplacedError } from '@/lib/vault/store'

const DISPLAY = '0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ'
const REPLACED =
  "Cette clé ne marche plus : elle a été remplacée lors d’une connexion sur un autre appareil. Reconnecte-toi pour en recevoir une nouvelle."
const CLIENT = { name: 'browser client' }

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  confirmRecoveryKeySeen: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('@/lib/supabase/browser', () => ({ createBrowserSupabase: () => CLIENT }))
vi.mock('@/lib/vault/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/vault/store')>()),
  confirmRecoveryKeySeen: mocks.confirmRecoveryKeySeen,
}))

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.confirmRecoveryKeySeen.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  clearPendingRecovery()
})

async function saveAndContinue() {
  await confirmRecoveryKey(userEvent.setup(), DISPLAY)
}

test('« C’est fait » confirms the key, then goes home', async () => {
  setPendingRecovery(DISPLAY)
  render(<RecoveryKeyPage />)

  await saveAndContinue()
  await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'))
  expect(mocks.confirmRecoveryKeySeen).toHaveBeenCalledWith(CLIENT, DISPLAY)
})

test('stays on the key when it cannot be confirmed', async () => {
  setPendingRecovery(DISPLAY)
  mocks.confirmRecoveryKeySeen.mockRejectedValue(new Error('offline'))
  render(<RecoveryKeyPage />)

  await saveAndContinue()
  expect(await screen.findByRole('alert')).toHaveTextContent("Ça n’a pas marché. Vérifie ton accès à internet et réessaie.")
  // Still on the check: the key is one touch away.
  await userEvent.setup().click(screen.getByRole('button', { name: 'Oups, revoir ma clé' }))
  expect(screen.getByText(DISPLAY)).toBeInTheDocument()
  expect(mocks.replace).not.toHaveBeenCalled()
})

test('a key replaced on another device is said to be dead, and stays on screen', async () => {
  setPendingRecovery(DISPLAY)
  mocks.confirmRecoveryKeySeen.mockRejectedValue(new RecoveryKeyReplacedError())
  render(<RecoveryKeyPage />)

  await saveAndContinue()
  expect(await screen.findByRole('alert')).toHaveTextContent(REPLACED)
  expect(mocks.replace).not.toHaveBeenCalled()
})

test('tells a renewed key apart', () => {
  setPendingRecovery(DISPLAY, true)
  render(<RecoveryKeyPage />)
  expect(screen.getByText(/Tu n’avais pas confirmé avoir mis ta clé de secours de côté/)).toBeInTheDocument()
})

test('without a key in memory, goes home', () => {
  render(<RecoveryKeyPage />)
  expect(mocks.replace).toHaveBeenCalledWith('/')
})
