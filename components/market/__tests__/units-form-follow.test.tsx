// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AmountForm } from '@/components/setup/AmountForm'
import { LoanForm } from '@/components/setup/LoanForm'
import { UnitsForm } from '@/components/setup/UnitsForm'
import { CURRENCY_CHANGED, FOLLOW_PRICE, FOLLOWED, NO_PRICE_YET } from '@/lib/market/words'
import { plain } from '@/lib/__tests__/plain'

const client = vi.hoisted(() => ({ requestSearch: vi.fn(), requestQuotes: vi.fn(), requestRates: vi.fn() }))
vi.mock('@/lib/market/client', () => client)
const rates = { on: '2026-11-06', perEuro: { USD: 1.1165, GBP: 0.83415, CHF: 0.9143 } }
vi.mock('@/lib/market/use-market', () => ({
  useRates: (enabled: boolean) => (enabled ? { status: 'ready', rates } : { status: 'idle' }),
}))

const MATCH = { symbol: 'CW8.PA', name: 'Amundi MSCI World', exchange: 'Paris', kind: 'ETF' as const }

beforeEach(() => {
  client.requestSearch.mockReset().mockResolvedValue([MATCH])
  client.requestQuotes.mockReset().mockResolvedValue({ 'CW8.PA': { price: 692.3, currency: 'EUR', asOf: '2026-11-06' } })
  client.requestRates.mockReset().mockResolvedValue(rates)
})
afterEach(cleanup)

function units(props: Partial<React.ComponentProps<typeof UnitsForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(true)
  render(
    <UnitsForm type="pea" submitLabel="Ajouter" saveError={null} onSubmit={onSubmit} onCancel={() => {}} {...props} />,
  )
  return onSubmit
}

async function pick() {
  await userEvent.click(screen.getByRole('button', { name: FOLLOW_PRICE }))
  await userEvent.type(screen.getByLabelText('Son nom ou son code ISIN'), 'LU1681043599')
  await userEvent.click(screen.getByRole('button', { name: 'Chercher' }))
  await userEvent.click(await screen.findByRole('button', { name: /Amundi MSCI World/ }))
}

test('opened from a form named « Fonds de papa », the search box holds that name and nothing is sent before « Chercher »', async () => {
  units({ initial: { name: 'Fonds de papa' } })
  await userEvent.click(screen.getByRole('button', { name: FOLLOW_PRICE }))
  expect(screen.getByLabelText('Son nom ou son code ISIN')).toHaveValue('Fonds de papa')
  expect(client.requestSearch).not.toHaveBeenCalled()
  await userEvent.clear(screen.getByLabelText('Son nom ou son code ISIN'))
  await userEvent.type(screen.getByLabelText('Son nom ou son code ISIN'), 'LU1681043599')
  await userEvent.click(screen.getByRole('button', { name: 'Chercher' }))
  expect(client.requestSearch).toHaveBeenCalledTimes(1)
  expect(client.requestSearch).toHaveBeenCalledWith('LU1681043599')
})

test('a name typed before opening the search is kept: in the search box, then back in its own box', async () => {
  units()
  await userEvent.type(screen.getByLabelText('Son nom'), 'Mon fonds')
  await userEvent.click(screen.getByRole('button', { name: FOLLOW_PRICE }))
  expect(screen.getByLabelText('Son nom ou son code ISIN')).toHaveValue('Mon fonds')
  await userEvent.click(screen.getByRole('button', { name: 'Je ne le trouve pas' }))
  expect(screen.getByLabelText('Son nom')).toHaveValue('Mon fonds')
})

test('validating while the search is open closes it first: the error sits on a box that is shown', async () => {
  const onSubmit = units()
  await userEvent.click(screen.getByRole('button', { name: FOLLOW_PRICE }))
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(onSubmit).not.toHaveBeenCalled()
  expect(screen.queryByLabelText('Son nom ou son code ISIN')).toBeNull()
  const name = screen.getByLabelText('Son nom')
  expect(name).toBeVisible()
  expect(name).toHaveAccessibleDescription(/Donne-lui un nom/)
})

test('one piece of information, one box: while the search is open there is no second name box', async () => {
  units()
  expect(screen.getByLabelText('Son nom')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: FOLLOW_PRICE }))
  expect(screen.queryByLabelText('Son nom')).toBeNull()
  expect(screen.getByLabelText('Son nom ou son code ISIN')).toBeInTheDocument()
  // « Chercher » is a button, like « Ajouter »: it acts on the spot.
  expect(screen.getByRole('button', { name: 'Chercher' })).toBeInTheDocument()
  // Given up: the name box is back, with what was typed in it.
  await userEvent.click(screen.getByRole('button', { name: 'Je ne le trouve pas' }))
  expect(screen.getByLabelText('Son nom')).toBeInTheDocument()
})

test('a pick fills the name and the price, says it follows, and the submit carries the symbol', async () => {
  const onSubmit = units()
  await pick()
  expect(screen.getByLabelText('Son nom')).toHaveValue('Amundi MSCI World')
  expect(screen.getByLabelText('Combien vaut une part aujourd’hui ?')).toHaveValue('692,30')
  expect(screen.getByText(plain(FOLLOWED('Amundi MSCI World', 'Paris')))).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Combien de parts as-tu ?'), '10')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Amundi MSCI World', units: 10, unitPrice: 692.3, quoteSymbol: 'CW8.PA', currency: 'EUR', eurPerUnit: 1 }),
  )
})

test('a pick does not overwrite a name already typed', async () => {
  units()
  await userEvent.type(screen.getByLabelText('Son nom'), 'Mon fonds')
  await pick()
  expect(screen.getByLabelText('Son nom')).toHaveValue('Mon fonds')
})

test('without a quote the price box stays empty and says so', async () => {
  client.requestQuotes.mockResolvedValue(null)
  units()
  await pick()
  expect(screen.getByLabelText('Combien vaut une part aujourd’hui ?')).toHaveValue('')
  expect(screen.getByText(plain(NO_PRICE_YET))).toBeInTheDocument()
})

test('the person can type over the filled boxes', async () => {
  const onSubmit = units()
  await pick()
  const box = screen.getByLabelText('Combien vaut une part aujourd’hui ?')
  await userEvent.clear(box)
  await userEvent.type(box, '700')
  await userEvent.type(screen.getByLabelText('Combien de parts as-tu ?'), '2')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ unitPrice: 700 }))
})

test('gold and crypto cannot follow a price', () => {
  units({ type: 'gold' })
  expect(screen.queryByRole('button', { name: FOLLOW_PRICE })).not.toBeInTheDocument()
})

test('R5: an untouched currency sends no currency and no rate', async () => {
  const onSubmit = units({ initial: { name: 'X', units: 1, unitPrice: 10, currency: 'USD' } })
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  const values = onSubmit.mock.calls[0][0]
  expect(values).not.toHaveProperty('currency')
  expect(values).not.toHaveProperty('eurPerUnit')
})

test('a chosen currency sends both, and the summary is written in it', async () => {
  const onSubmit = units()
  // The category line has its own « changer ».
  await userEvent.click(screen.getByRole('button', { name: 'Changer de devise' }))
  await userEvent.click(screen.getByRole('button', { name: 'dollars américains' }))
  await userEvent.type(screen.getByLabelText('Son nom'), 'X')
  await userEvent.type(screen.getByLabelText('Combien de parts as-tu ?'), '2')
  await userEvent.type(screen.getByLabelText('Combien vaut une part aujourd’hui ?'), '100')
  expect(screen.getByTestId('units-summary').textContent).toMatch(/200\s\$/)
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ currency: 'USD', eurPerUnit: expect.closeTo(0.895656, 5) }))
})

test('the amount form offers the currency; the loan form does not', () => {
  render(<AmountForm type="current" submitLabel="Ajouter" saveError={null} onSubmit={vi.fn()} onCancel={() => {}} />)
  expect(screen.getByRole('button', { name: 'Changer de devise' })).toBeInTheDocument()
  cleanup()
  render(<LoanForm homes={[]} submitLabel="Ajouter" saveError={null} onSubmit={vi.fn()} onCancel={() => {}} />)
  expect(screen.queryByText(/^En euros/)).not.toBeInTheDocument()
})

test('an initial currency is shown as chosen, and a locked one has no « changer »', () => {
  render(
    <AmountForm type="current" initial={{ currency: 'GBP' }} currencyLocked submitLabel="Ajouter" saveError={null} onSubmit={vi.fn()} onCancel={() => {}} />,
  )
  expect(screen.getByText(/^En livres sterling/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Changer de devise' })).not.toBeInTheDocument()
})

test('a pick on a non-EUR line with nothing chosen sends the symbol only: no currency, no rate', async () => {
  client.requestQuotes.mockResolvedValue({ 'CW8.PA': { price: 100, currency: 'USD', asOf: '2026-11-06' } })
  const onSubmit = units({ initial: { name: 'X', currency: 'USD' } })
  await pick()
  await userEvent.type(screen.getByLabelText('Combien de parts as-tu ?'), '1')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  const values = onSubmit.mock.calls[0][0]
  expect(values).toMatchObject({ quoteSymbol: 'CW8.PA', unitPrice: 100 })
  expect(values).not.toHaveProperty('currency')
  expect(values).not.toHaveProperty('eurPerUnit')
})

test('a pick then a currency change recomputes the price box', async () => {
  client.requestQuotes.mockResolvedValue({ 'CW8.PA': { price: 100, currency: 'EUR', asOf: '2026-11-06' } })
  units()
  await pick()
  expect(screen.getByLabelText('Combien vaut une part aujourd’hui ?')).toHaveValue('100,00')
  await userEvent.click(screen.getByRole('button', { name: 'Changer de devise' }))
  await userEvent.click(screen.getByRole('button', { name: 'dollars américains' }))
  expect(screen.getByLabelText('Combien vaut une part aujourd’hui ?')).toHaveValue('111,65')
})

test('a pick that cannot be converted, then a currency change, keeps the box empty and says so', async () => {
  // A yen quote has no rate: the box stays empty, and a new currency cannot fill it either.
  client.requestQuotes.mockResolvedValue({ 'CW8.PA': { price: 15000, currency: 'JPY', asOf: '2026-11-06' } })
  units()
  await pick()
  expect(screen.getByLabelText('Combien vaut une part aujourd’hui ?')).toHaveValue('')
  await userEvent.click(screen.getByRole('button', { name: 'Changer de devise' }))
  await userEvent.click(screen.getByRole('button', { name: 'dollars américains' }))
  expect(screen.getByLabelText('Combien vaut une part aujourd’hui ?')).toHaveValue('')
  expect(screen.getByText(plain(CURRENCY_CHANGED))).toBeInTheDocument()
})

test('a number the person typed is left alone by a currency change', async () => {
  units()
  await userEvent.type(screen.getByLabelText('Combien vaut une part aujourd’hui ?'), '50')
  await userEvent.click(screen.getByRole('button', { name: 'Changer de devise' }))
  await userEvent.click(screen.getByRole('button', { name: 'dollars américains' }))
  expect(screen.getByLabelText('Combien vaut une part aujourd’hui ?')).toHaveValue('50,00')
})
