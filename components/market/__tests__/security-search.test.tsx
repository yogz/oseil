// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { SecuritySearch } from '../SecuritySearch'
import { NOTHING_FOUND, NOTHING_FOUND_CRYPTO, SEARCH_FAILED } from '@/lib/market/words'
import { plain } from '@/lib/__tests__/plain'

vi.mock('@/lib/dates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dates')>()),
  todayIso: () => '2026-11-07',
}))
const client = vi.hoisted(() => ({ requestSearch: vi.fn(), requestQuotes: vi.fn(), requestRates: vi.fn() }))
vi.mock('@/lib/market/client', () => client)

const MATCH = { symbol: 'CW8.PA', name: 'Amundi MSCI World', exchange: 'Paris', kind: 'ETF' as const }
const RATES = { on: '2026-11-06', perEuro: { USD: 1.1165, GBP: 0.83415, CHF: 0.9143 } }

beforeEach(() => {
  client.requestSearch.mockReset().mockResolvedValue([MATCH])
  client.requestQuotes.mockReset()
  client.requestRates.mockReset().mockResolvedValue(RATES)
})
afterEach(cleanup)

async function find(text: string) {
  await userEvent.type(screen.getByLabelText('Son nom ou son code ISIN'), text)
  await userEvent.click(screen.getByRole('button', { name: 'Chercher' }))
}

test('the box opens empty, and the search is sent on « Chercher » only, once, with exactly what was typed', async () => {
  render(<SecuritySearch accountType="pea" currency="EUR" onPick={() => {}} onClose={() => {}} />)
  expect(screen.getByLabelText('Son nom ou son code ISIN')).toHaveValue('')
  await userEvent.type(screen.getByLabelText('Son nom ou son code ISIN'), 'LU1681043599')
  expect(client.requestSearch).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Chercher' }))
  expect(client.requestSearch).toHaveBeenCalledTimes(1)
  expect(client.requestSearch).toHaveBeenCalledWith('LU1681043599')
  expect(await screen.findByText('Paris · ETF')).toBeInTheDocument()
  expect(screen.getByText('Amundi MSCI World')).toBeInTheDocument()
})

test('opened with a name (« Le retrouver »): the box holds it, editable; nothing is sent until « Chercher », and then exactly what is in the box', async () => {
  render(<SecuritySearch accountType="pea" currency="EUR" initialText="Comgest Monde C" onPick={() => {}} onClose={() => {}} />)
  const box = screen.getByLabelText('Son nom ou son code ISIN')
  expect(box).toHaveValue('Comgest Monde C')
  expect(screen.getByText('Rien ne part tant que tu n’as pas touché Chercher.')).toBeInTheDocument()
  expect(client.requestSearch).not.toHaveBeenCalled()
  // Editable: what is sent is what is in the box after the edit, not the name it opened with.
  await userEvent.clear(box)
  await userEvent.type(box, 'LU1681043599')
  expect(client.requestSearch).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Chercher' }))
  expect(client.requestSearch).toHaveBeenCalledTimes(1)
  expect(client.requestSearch).toHaveBeenCalledWith('LU1681043599')
})

test('opened with a name, « Chercher » sends it as it stands, and only then', async () => {
  render(<SecuritySearch accountType="pea" currency="EUR" initialText="Comgest Monde C" onPick={() => {}} onClose={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'Chercher' }))
  expect(client.requestSearch).toHaveBeenCalledTimes(1)
  expect(client.requestSearch).toHaveBeenCalledWith('Comgest Monde C')
})

test('without a name given, the box stays empty and says nothing of what is sent', () => {
  render(<SecuritySearch accountType="pea" currency="EUR" onPick={() => {}} onClose={() => {}} />)
  expect(screen.getByLabelText('Son nom ou son code ISIN')).toHaveValue('')
  expect(screen.queryByText(/Rien ne part/)).not.toBeInTheDocument()
})

test('a pick in the quote currency hands back the price and does not ask for rates', async () => {
  client.requestQuotes.mockResolvedValue({ 'CW8.PA': { price: 692.3, currency: 'EUR', asOf: '2026-11-06' } })
  const onPick = vi.fn()
  render(<SecuritySearch accountType="pea" currency="EUR" onPick={onPick} onClose={() => {}} />)
  await find('LU1681043599')
  await userEvent.click(await screen.findByRole('button', { name: /Amundi MSCI World/ }))
  expect(client.requestQuotes).toHaveBeenCalledWith(['CW8.PA'])
  expect(client.requestRates).not.toHaveBeenCalled()
  expect(onPick).toHaveBeenCalledWith({ symbol: 'CW8.PA', name: 'Amundi MSCI World', exchange: 'Paris', price: 692.3, quote: { price: 692.3, currency: 'EUR', asOf: '2026-11-06' } })
})

test('a dollar quote into euros is converted with the rates', async () => {
  client.requestQuotes.mockResolvedValue({ 'CW8.PA': { price: 342.37, currency: 'USD', asOf: '2026-11-06' } })
  const onPick = vi.fn()
  render(<SecuritySearch accountType="pea" currency="EUR" onPick={onPick} onClose={() => {}} />)
  await find('world')
  await userEvent.click(await screen.findByRole('button', { name: /Amundi MSCI World/ }))
  expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ price: 306.6458 }))
})

test('no quote gives a null price, never 0', async () => {
  client.requestQuotes.mockResolvedValue(null)
  const onPick = vi.fn()
  render(<SecuritySearch accountType="pea" currency="EUR" onPick={onPick} onClose={() => {}} />)
  await find('world')
  await userEvent.click(await screen.findByRole('button', { name: /Amundi MSCI World/ }))
  expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ price: null }))
})

test('nothing found and a failed search are told apart', async () => {
  client.requestSearch.mockResolvedValueOnce([])
  render(<SecuritySearch accountType="pea" currency="EUR" onPick={() => {}} onClose={() => {}} />)
  await find('zzzz')
  expect(await screen.findByText(plain(NOTHING_FOUND))).toBeInTheDocument()
  client.requestSearch.mockResolvedValueOnce(null)
  await userEvent.click(screen.getByRole('button', { name: 'Chercher' }))
  expect(await screen.findByText(SEARCH_FAILED)).toBeInTheDocument()
})

test('« Je ne le trouve pas » closes', async () => {
  const onClose = vi.fn()
  render(<SecuritySearch accountType="pea" currency="EUR" onPick={() => {}} onClose={onClose} />)
  await userEvent.click(screen.getByRole('button', { name: 'Je ne le trouve pas' }))
  expect(onClose).toHaveBeenCalled()
})

test('a quote older than a week is no price: the pick hands back null, never the old price', async () => {
  client.requestQuotes.mockResolvedValue({ 'CW8.PA': { price: 692.3, currency: 'EUR', asOf: '2026-10-20' } })
  const onPick = vi.fn()
  render(<SecuritySearch accountType="pea" currency="EUR" onPick={onPick} onClose={() => {}} />)
  await find('LU1681043599')
  await userEvent.click(await screen.findByRole('button', { name: /Amundi MSCI World/ }))
  expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ price: null }))
})

const BTC = { symbol: 'BTC-USD', name: 'Bitcoin', exchange: '', kind: 'crypto' as const }
const AIRBUS = { symbol: 'AIR.PA', name: 'Airbus', exchange: 'Paris', kind: 'action' as const }

async function findCoin(text: string) {
  await userEvent.type(screen.getByLabelText('Son nom ou son symbole'), text)
  await userEvent.click(screen.getByRole('button', { name: 'Chercher' }))
}

test('a crypto account asks for a name or a symbol, and shows only the coins found', async () => {
  client.requestSearch.mockResolvedValue([AIRBUS, BTC])
  render(<SecuritySearch accountType="crypto" currency="EUR" onPick={() => {}} onClose={() => {}} />)
  await findCoin('bitcoin')
  expect(await screen.findByRole('button', { name: /Bitcoin/ })).toBeInTheDocument()
  expect(screen.getByText('crypto')).toBeInTheDocument()
  expect(screen.queryByText('Airbus')).not.toBeInTheDocument()
})

test('any other account never shows a coin', async () => {
  client.requestSearch.mockResolvedValue([AIRBUS, BTC])
  render(<SecuritySearch accountType="securities" currency="EUR" onPick={() => {}} onClose={() => {}} />)
  await find('bitcoin')
  expect(await screen.findByText('Airbus')).toBeInTheDocument()
  expect(screen.queryByText('Bitcoin')).not.toBeInTheDocument()
})

test('a crypto account with only shares found says nothing was found, with a coin hint', async () => {
  client.requestSearch.mockResolvedValue([AIRBUS])
  render(<SecuritySearch accountType="crypto" currency="EUR" onPick={() => {}} onClose={() => {}} />)
  await findCoin('airbus')
  expect(await screen.findByText(plain(NOTHING_FOUND_CRYPTO))).toBeInTheDocument()
})

test('a coin found in dollars, on a euro line, follows its euro price when Yahoo has one', async () => {
  client.requestSearch.mockResolvedValue([BTC])
  client.requestQuotes.mockResolvedValue({
    'BTC-EUR': { price: 65875.25, currency: 'EUR', asOf: '2026-11-07', kind: 'crypto' },
    'BTC-USD': { price: 73500, currency: 'USD', asOf: '2026-11-07', kind: 'crypto' },
  })
  const onPick = vi.fn()
  render(<SecuritySearch accountType="crypto" currency="EUR" onPick={onPick} onClose={() => {}} />)
  await findCoin('bitcoin')
  await userEvent.click(await screen.findByRole('button', { name: /Bitcoin/ }))
  expect(client.requestQuotes).toHaveBeenCalledWith(['BTC-EUR', 'BTC-USD'])
  expect(client.requestRates).not.toHaveBeenCalled()
  expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'BTC-EUR', name: 'Bitcoin', price: 65875.25 }))
})

test('a coin without a euro price keeps its dollar pair, converted', async () => {
  client.requestSearch.mockResolvedValue([BTC])
  client.requestQuotes.mockResolvedValue({
    'BTC-EUR': null,
    'BTC-USD': { price: 1116.5, currency: 'USD', asOf: '2026-11-07', kind: 'crypto' },
  })
  const onPick = vi.fn()
  render(<SecuritySearch accountType="crypto" currency="EUR" onPick={onPick} onClose={() => {}} />)
  await findCoin('bitcoin')
  await userEvent.click(await screen.findByRole('button', { name: /Bitcoin/ }))
  expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'BTC-USD', price: 1000 }))
})
