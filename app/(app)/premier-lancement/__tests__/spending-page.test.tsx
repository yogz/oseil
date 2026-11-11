// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Model, ModelState } from '@/lib/app/use-model'
import { DEFAULT_SETTINGS } from '@/lib/model/documents'
import { exampleProfile, exampleSnapshot } from '@/lib/model/__tests__/fixtures'
import type { Settings } from '@/lib/model/types'
import DepensesPage from '../depenses/page'

const mocks = vi.hoisted(() => ({
  state: { current: {} as unknown },
  saveSettings: vi.fn(),
  push: vi.fn(),
  reload: vi.fn(),
  params: { current: new URLSearchParams() },
}))

vi.mock('@/lib/app/use-model', () => ({ useModel: () => mocks.state.current }))
vi.mock('@/lib/model/repository', async (original) => ({
  ...(await original<typeof import('@/lib/model/repository')>()),
  saveSettings: mocks.saveSettings,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => mocks.params.current,
}))

const client = {} as never
const dataKey = {} as CryptoKey
const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })

function ready(settings: Settings | null, unreadableSettings = 0): ModelState {
  const model: Model = {
    profile: loaded(exampleProfile),
    snapshots: [loaded(exampleSnapshot, 's0')],
    goals: [],
    settings: settings ? loaded(settings, 'settings-1') : null,
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: unreadableSettings, draft: 0 },
  }
  return { status: 'ready', model, client, dataKey, reload: mocks.reload }
}

beforeEach(() => {
  mocks.saveSettings.mockReset()
  mocks.saveSettings.mockResolvedValue('settings-1')
  mocks.push.mockReset()
  mocks.reload.mockReset()
  mocks.params.current = new URLSearchParams()
  mocks.state.current = ready(null)
})
afterEach(cleanup)

test('asks the question, offers ready-made amounts and a way out', () => {
  render(<DepensesPage />)
  expect(screen.getByRole('heading', { level: 1, name: 'Combien dépenses-tu par mois, à peu près\u00A0?' })).toBeInTheDocument()
  expect(
    screen.getByText('Pour savoir combien de mois ton argent disponible te couvrirait si tes revenus s’arrêtaient.'),
  ).toBeInTheDocument()
  for (const amount of ['1 500', '2 000', '2 500', '3 000', '3 500']) {
    expect(screen.getByRole('button', { name: `${amount} €` })).toBeInTheDocument()
  }
  expect(screen.getByText('Un ordre d’idée suffit. Loyer ou crédit, courses, factures, transports.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Je ne connais pas mes dépenses' })).toBeInTheDocument()
})

test('« 2 500 » is saved as expenses of 250 000 cents, on top of the default settings, then home', async () => {
  render(<DepensesPage />)
  await userEvent.type(screen.getByLabelText('Tes dépenses par mois'), '2 500')
  await userEvent.click(screen.getByRole('button', { name: 'Terminer' }))
  expect(mocks.saveSettings).toHaveBeenCalledWith(
    client,
    dataKey,
    { ...DEFAULT_SETTINGS, budget: { basis: 'expenses', monthly: 250_000 } },
    undefined,
  )
  expect(mocks.push).toHaveBeenCalledWith('/')
  expect(screen.getByRole('button', { name: 'Terminer' })).toBeDisabled()
})

test('opened from the settings: back, « Annuler » and the save return there', async () => {
  mocks.params.current = new URLSearchParams('depuis=reglages')
  render(<DepensesPage />)
  expect(screen.getByRole('link', { name: '‹ Retour' })).toHaveAttribute('href', '/reglages')
  await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
  expect(mocks.push).toHaveBeenLastCalledWith('/reglages')
  await userEvent.type(screen.getByLabelText('Tes dépenses par mois'), '1800')
  await userEvent.click(screen.getByRole('button', { name: 'Terminer' }))
  expect(mocks.saveSettings).toHaveBeenCalledTimes(1)
  expect(mocks.push).toHaveBeenLastCalledWith('/reglages')
})

test('a ready-made amount fills the field; existing settings are kept and their id passed', async () => {
  const existing: Settings = { schema: 1, budget: null, display: 'percent', hideAmounts: true }
  mocks.state.current = ready(existing)
  render(<DepensesPage />)
  await userEvent.click(screen.getByRole('button', { name: '3 000 €' }))
  expect(screen.getByLabelText('Tes dépenses par mois')).toHaveValue('3\u202f000')
  await userEvent.click(screen.getByRole('button', { name: 'Terminer' }))
  expect(mocks.saveSettings).toHaveBeenCalledWith(
    client,
    dataKey,
    { ...existing, budget: { basis: 'expenses', monthly: 300_000 } },
    'settings-1',
  )
})

test('« Je ne connais pas mes dépenses » switches to the net salary', async () => {
  render(<DepensesPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Je ne connais pas mes dépenses' }))
  expect(screen.getByText(/Il est sur ta fiche de paie\. Si tu dépenses moins que tu gagnes, le calcul sera un peu prudent, ce qui est mieux que l’inverse\./)).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Tes revenus nets par mois'), '2200')
  await userEvent.click(screen.getByRole('button', { name: 'Terminer' }))
  expect(mocks.saveSettings).toHaveBeenCalledWith(
    client,
    dataKey,
    { ...DEFAULT_SETTINGS, budget: { basis: 'salary', monthly: 220_000 } },
    undefined,
  )
})

test('an unreadable or zero amount is refused with a word, nothing is written', async () => {
  render(<DepensesPage />)
  const field = screen.getByLabelText('Tes dépenses par mois')
  await userEvent.type(field, 'beaucoup')
  await userEvent.click(screen.getByRole('button', { name: 'Terminer' }))
  expect(screen.getByText('Ce montant n’est pas lisible.')).toBeInTheDocument()
  await userEvent.clear(field)
  await userEvent.type(field, '0')
  await userEvent.click(screen.getByRole('button', { name: 'Terminer' }))
  expect(screen.getByText('Ce montant doit être supérieur à zéro.')).toBeInTheDocument()
  expect(mocks.saveSettings).not.toHaveBeenCalled()
})

test('a failed save says so and stays', async () => {
  mocks.saveSettings.mockRejectedValue(new Error('network'))
  render(<DepensesPage />)
  await userEvent.type(screen.getByLabelText('Tes dépenses par mois'), '2000')
  await userEvent.click(screen.getByRole('button', { name: 'Terminer' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Ça n’a pas été enregistré. Vérifie ta connexion et réessaie.')
  expect(mocks.push).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Terminer' })).toBeEnabled()
})

test('« Plus tard » goes home without writing', async () => {
  render(<DepensesPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Plus tard' }))
  expect(mocks.saveSettings).not.toHaveBeenCalled()
  expect(mocks.push).toHaveBeenCalledWith('/')
})

test('unreadable settings: no write, the reason is said, reading again and « Plus tard » remain', async () => {
  mocks.state.current = ready(null, 1)
  render(<DepensesPage />)
  expect(
    screen.getByText('Tes réglages n’ont pas pu être lus : ce choix ne peut pas être enregistré pour l’instant.'),
  ).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Terminer' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  expect(mocks.reload).toHaveBeenCalledOnce()
  await userEvent.click(screen.getByRole('button', { name: 'Plus tard' }))
  expect(mocks.push).toHaveBeenCalledWith('/')
  expect(mocks.saveSettings).not.toHaveBeenCalled()
})

test('failed and loading states', async () => {
  mocks.state.current = { status: 'failed', retry: mocks.reload }
  const { rerender } = render(<DepensesPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  expect(mocks.reload).toHaveBeenCalled()
  mocks.state.current = { status: 'loading' }
  rerender(<DepensesPage />)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test('opened from the settings, it starts from the saved budget and its way out reads « Annuler »', async () => {
  mocks.params.current = new URLSearchParams('depuis=reglages')
  mocks.state.current = ready({ ...DEFAULT_SETTINGS, budget: { basis: 'salary', monthly: 310_000 } })
  render(<DepensesPage />)
  expect(screen.getByLabelText('Tes revenus nets par mois')).toHaveValue('3\u202f100')
  expect(screen.queryByRole('button', { name: 'Plus tard' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
  expect(mocks.push).toHaveBeenCalledWith('/reglages')
  expect(mocks.saveSettings).not.toHaveBeenCalled()
})

test('opened from the settings with expenses saved, the expenses box holds them', () => {
  mocks.params.current = new URLSearchParams('depuis=reglages')
  mocks.state.current = ready({ ...DEFAULT_SETTINGS, budget: { basis: 'expenses', monthly: 250_000 } })
  render(<DepensesPage />)
  expect(screen.getByLabelText('Tes dépenses par mois')).toHaveValue('2\u202f500')
})

test('the first launch does not start from a saved budget, and keeps « Plus tard »', () => {
  mocks.state.current = ready({ ...DEFAULT_SETTINGS, budget: { basis: 'expenses', monthly: 250_000 } })
  render(<DepensesPage />)
  expect(screen.getByLabelText('Tes dépenses par mois')).toHaveValue('')
  expect(screen.getByRole('button', { name: 'Plus tard' })).toBeInTheDocument()
})
