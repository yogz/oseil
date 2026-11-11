// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Model, ModelState } from '@/lib/app/use-model'
import { exampleProfile, exampleSnapshot } from '@/lib/model/__tests__/fixtures'
import type { Profile } from '@/lib/model/types'
import type { MarketState } from '@/lib/market/use-market'
import { startDraft } from '@/lib/update/draft'
import { attachSymbol } from '@/lib/screens/titles'
import TitlesPage from '../titres/page'

const mocks = vi.hoisted(() => ({
  state: { current: { status: 'loading' } as ModelState },
  search: { current: '' },
  reload: vi.fn(),
  loadProfile: vi.fn(),
  loadSnapshots: vi.fn(),
  loadDraft: vi.fn(),
  saveProfile: vi.fn(),
  addSnapshot: vi.fn(),
  saveSnapshot: vi.fn(),
  requestSearch: vi.fn(),
  requestQuotes: vi.fn(),
  requestRates: vi.fn(),
  market: { current: { status: 'ready', market: { quotes: {}, rates: null }, retry: vi.fn() } as MarketState },
}))

vi.mock('@/lib/dates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dates')>()),
  todayIso: () => '2026-11-07',
}))
vi.mock('@/lib/app/use-model', () => ({ useModel: () => mocks.state.current }))
vi.mock('@/lib/model/repository', () => ({
  loadProfile: mocks.loadProfile,
  loadSnapshots: mocks.loadSnapshots,
  loadDraft: mocks.loadDraft,
  saveProfile: mocks.saveProfile,
  addSnapshot: mocks.addSnapshot,
  saveSnapshot: mocks.saveSnapshot,
}))
vi.mock('@/lib/market/client', () => ({
  requestSearch: mocks.requestSearch,
  requestQuotes: mocks.requestQuotes,
  requestRates: mocks.requestRates,
}))
vi.mock('@/lib/market/use-market', () => ({ useMarket: () => mocks.market.current }))
vi.mock('@/components/account/SignOutFrame', () => ({
  SignOutFrame: ({ children }: { children: React.ReactNode }) => (
    <>
      {children}
      <button type="button">Se déconnecter</button>
    </>
  ),
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.search.current) }))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}))

const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const RATES = { on: '2026-11-06', perEuro: { USD: 1.1165, GBP: 0.83415, CHF: 0.9143 } }
const MATCH = { symbol: 'ISF.L', name: 'iShares Core FTSE 100', exchange: 'Londres', kind: 'ETF' as const }
const plain = (text: string) => text.replace(/[  ]/g, ' ')

function ready(profile: Profile = exampleProfile, draftBasedOn?: string): ModelState {
  const model: Model = {
    profile: loaded(profile, 'p0'),
    snapshots: [loaded(exampleSnapshot, 's0')],
    goals: [],
    settings: null,
    draft: draftBasedOn === undefined ? null : loaded(startDraft(draftBasedOn), 'd0'),
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
  }
  return { status: 'ready', model, client: { tag: 'client' } as never, dataKey: { tag: 'key' } as never, reload: mocks.reload }
}

// What the database holds when the save re-reads it.
function database(profile: Profile = exampleProfile, draft: ReturnType<typeof loaded<ReturnType<typeof startDraft>>> | null = null) {
  mocks.loadProfile.mockResolvedValue({ profile: loaded(profile, 'p0'), unreadable: 0 })
  mocks.loadSnapshots.mockResolvedValue({ snapshots: [loaded(exampleSnapshot, 's0')], unreadable: 0 })
  mocks.loadDraft.mockResolvedValue({ draft, unreadable: 0 })
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) if (typeof mock === 'function' && 'mockReset' in mock) mock.mockReset()
  mocks.market.current = { status: 'ready', market: { quotes: {}, rates: null }, retry: vi.fn() }
  mocks.search.current = ''
  mocks.state.current = ready()
  mocks.saveProfile.mockResolvedValue('p0')
  mocks.requestSearch.mockResolvedValue([MATCH])
  mocks.requestQuotes.mockResolvedValue({ 'ISF.L': { price: 10.392, currency: 'GBP', asOf: '2026-11-06' } })
  mocks.requestRates.mockResolvedValue(RATES)
  database()
})
afterEach(cleanup)

async function pickIsf() {
  await userEvent.click(screen.getAllByRole('button', { name: /^Le retrouver/ })[0])
  // The box opens with the line's name: the search is typed over it.
  await userEvent.clear(screen.getByLabelText('Son nom ou son code ISIN'))
  await userEvent.type(screen.getByLabelText('Son nom ou son code ISIN'), 'ishares ftse')
  await userEvent.click(screen.getByRole('button', { name: 'Chercher' }))
  await userEvent.click(await screen.findByRole('button', { name: /iShares Core FTSE 100/ }))
}

test('its way back carries the name of the screen it was opened from', () => {
  mocks.search.current = 'depuis=categorie/markets'
  const first = render(<TitlesPage />)
  expect(screen.getByRole('link', { name: '‹ Placements en bourse' })).toHaveAttribute('href', '/categorie/markets')
  first.unmount()
  mocks.search.current = 'depuis=ligne/etf'
  render(<TitlesPage />)
  expect(screen.getByRole('link', { name: '‹ ETF' })).toHaveAttribute('href', '/ligne/etf')
})

test('lists the two lines of the example, with where they are, a back link and the tabs', () => {
  render(<TitlesPage />)
  expect(screen.getByRole('heading', { name: 'Tes titres' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '‹ Mon argent' })).toHaveAttribute('href', '/')
  expect(screen.getByRole('navigation', { name: 'Onglets' })).toBeInTheDocument()
  // No way out of its own: « Se déconnecter » is in the Réglages.
  expect(screen.queryByRole('button', { name: 'Se déconnecter' })).toBeNull()
  expect(screen.getByText('PEA chez BoursoBank')).toBeInTheDocument()
  expect(screen.getAllByText('prix tapé à la main')).toHaveLength(2)
  expect(screen.queryByRole('button', { name: /Ne plus le suivre/ })).toBeNull()
})

test('« Le retrouver » opens with the line’s name, editable; nothing is sent until « Chercher », then exactly the box', async () => {
  render(<TitlesPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Le retrouver\u00A0: ETF' }))
  const box = screen.getByLabelText('Son nom ou son code ISIN')
  expect(box).toHaveValue('ETF')
  expect(mocks.requestSearch).not.toHaveBeenCalled()
  await userEvent.clear(box)
  await userEvent.type(screen.getByLabelText('Son nom ou son code ISIN'), 'LU1681043599')
  await userEvent.click(screen.getByRole('button', { name: 'Chercher' }))
  expect(mocks.requestSearch).toHaveBeenCalledTimes(1)
  expect(mocks.requestSearch).toHaveBeenCalledWith('LU1681043599')
})

test('« Le retrouver » on a line named like its account opens empty: « PEA » names no title', async () => {
  const sameName: Profile = {
    ...exampleProfile,
    lines: exampleProfile.lines.map((l) => (l.id === 'etf' ? { ...l, name: 'PEA' } : l)),
  }
  mocks.state.current = ready(sameName)
  render(<TitlesPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Le retrouver : PEA' }))
  expect(screen.getByLabelText('Son nom ou son code ISIN')).toHaveValue('')
  expect(mocks.requestSearch).not.toHaveBeenCalled()
})

test('a pick shows today’s price in the line’s currency next to the snapshot’s, and says they are far apart', async () => {
  render(<TitlesPage />)
  await pickIsf()
  const sentence = await screen.findByText(/Son prix aujourd’hui/)
  expect(plain(sentence.textContent!)).toMatch(/^Son prix aujourd’hui : 12,46 €\. À ton dernier relevé : 250,00 €\.$/)
  expect(screen.getByText(/Ces deux prix sont très éloignés/)).toBeInTheDocument()
  expect(mocks.saveProfile).not.toHaveBeenCalled()
})

test('close prices raise no warning', async () => {
  mocks.requestQuotes.mockResolvedValue({ 'ISF.L': { price: 250, currency: 'EUR', asOf: '2026-11-06' } })
  render(<TitlesPage />)
  await pickIsf()
  await screen.findByText(/Son prix aujourd’hui/)
  expect(screen.queryByText(/très éloignés/)).toBeNull()
})

// F6: this screen has no box to fill: the sentence never asks for one.
test('a price that cannot be had is said, never 0, and the person can still choose', async () => {
  mocks.requestQuotes.mockResolvedValue(null)
  render(<TitlesPage />)
  await pickIsf()
  expect(await screen.findByText('Son prix n’a pas pu être récupéré pour l’instant.')).toBeInTheDocument()
  expect(screen.queryByText(/remplis-le/)).toBeNull()
  expect(screen.queryByText(/Son prix aujourd’hui/)).toBeNull()
  expect(screen.getByRole('button', { name: 'C’est bien lui' })).toBeInTheDocument()
})

test('« Ce n’est pas lui » saves nothing', async () => {
  render(<TitlesPage />)
  await pickIsf()
  await userEvent.click(await screen.findByRole('button', { name: 'Ce n’est pas lui' }))
  expect(mocks.saveProfile).not.toHaveBeenCalled()
  expect(screen.queryByText(/Son prix aujourd’hui/)).toBeNull()
  expect(screen.getAllByRole('button', { name: /^Le retrouver/ })).toHaveLength(2)
})

test('« C’est bien lui » saves the profile with the symbol, keeps the currency, reloads, and writes no snapshot', async () => {
  render(<TitlesPage />)
  await pickIsf()
  await userEvent.click(await screen.findByRole('button', { name: 'C’est bien lui' }))
  await waitFor(() => expect(mocks.saveProfile).toHaveBeenCalledTimes(1))
  const [client, key, profile, id] = mocks.saveProfile.mock.calls[0]
  expect(client).toEqual({ tag: 'client' })
  expect(key).toEqual({ tag: 'key' })
  expect(id).toBe('p0')
  const etf = (profile as Profile).lines.find((l) => l.id === 'etf')!
  expect(etf.quoteSymbol).toBe('ISF.L')
  expect(etf.currency).toBe('EUR')
  expect((profile as Profile).lines.find((l) => l.id === 'life-uc')!.quoteSymbol).toBeUndefined()
  await waitFor(() => expect(mocks.reload).toHaveBeenCalled())
  expect(mocks.addSnapshot).not.toHaveBeenCalled()
  expect(mocks.saveSnapshot).not.toHaveBeenCalled()
})

test('the change is applied to the profile read again, so a line added elsewhere is kept', async () => {
  const fresher: Profile = {
    ...exampleProfile,
    lines: [...exampleProfile.lines, { id: 'added', accountId: 'pea', name: 'Ajoutée', kind: 'units', currency: 'EUR' }],
  }
  database(fresher)
  render(<TitlesPage />)
  await pickIsf()
  await userEvent.click(await screen.findByRole('button', { name: 'C’est bien lui' }))
  await waitFor(() => expect(mocks.saveProfile).toHaveBeenCalled())
  const saved = mocks.saveProfile.mock.calls[0][2] as Profile
  expect(saved.lines.map((l) => l.id)).toContain('added')
  expect(saved.lines.find((l) => l.id === 'etf')!.quoteSymbol).toBe('ISF.L')
})

test('an update begun elsewhere since the page opened is not raced: nothing is written, and it is said', async () => {
  database(exampleProfile, loaded(startDraft('s0'), 'd0'))
  render(<TitlesPage />)
  await pickIsf()
  await userEvent.click(await screen.findByRole('button', { name: 'C’est bien lui' }))
  expect(await screen.findByText(/Une mise à jour est en cours/)).toBeInTheDocument()
  expect(mocks.saveProfile).not.toHaveBeenCalled()
  expect(mocks.reload).not.toHaveBeenCalled()
})

test('with an update in progress on screen, the buttons are off and the page says why', () => {
  mocks.state.current = ready(exampleProfile, 's0')
  render(<TitlesPage />)
  expect(screen.getByText(/Une mise à jour est en cours/)).toBeInTheDocument()
  for (const button of screen.getAllByRole('button', { name: /^Le retrouver/ })) expect(button).toBeDisabled()
})

test('a failed write is said and nothing is reloaded', async () => {
  mocks.saveProfile.mockRejectedValue(new Error('network'))
  render(<TitlesPage />)
  await pickIsf()
  await userEvent.click(await screen.findByRole('button', { name: 'C’est bien lui' }))
  expect(await screen.findByText(/Ça n’a pas pu être enregistré/)).toBeInTheDocument()
  expect(mocks.reload).not.toHaveBeenCalled()
})

test('a line that already has a symbol shows it with its price, and can be detached', async () => {
  const followed = attachSymbol(exampleProfile, 'etf', 'CW8.PA')
  mocks.state.current = ready(followed)
  database(followed)
  mocks.market.current = {
    status: 'ready',
    market: { quotes: { 'CW8.PA': { price: 342.37, currency: 'USD', asOf: '2026-11-06' } }, rates: RATES },
    retry: vi.fn(),
  }
  render(<TitlesPage />)
  const shown = plain(screen.getByText(/prix automatique/).textContent!)
  expect(shown).toBe('prix automatique · CW8.PA · 306,65 €')
  expect(screen.getAllByText('prix tapé à la main')).toHaveLength(1)

  await userEvent.click(screen.getByRole('button', { name: /Ne plus le suivre/ }))
  await waitFor(() => expect(mocks.saveProfile).toHaveBeenCalledTimes(1))
  const saved = mocks.saveProfile.mock.calls[0][2] as Profile
  const etf = saved.lines.find((l) => l.id === 'etf')!
  expect('quoteSymbol' in etf).toBe(false)
  expect(etf.currency).toBe('EUR')
  expect(mocks.addSnapshot).not.toHaveBeenCalled()
  expect(mocks.saveSnapshot).not.toHaveBeenCalled()
  await waitFor(() => expect(mocks.reload).toHaveBeenCalled())
})

test('a followed line whose price is missing says so, never 0', () => {
  const followed = attachSymbol(exampleProfile, 'etf', 'CW8.PA')
  mocks.state.current = ready(followed)
  mocks.market.current = { status: 'ready', market: { quotes: { 'CW8.PA': null }, rates: null }, retry: vi.fn() }
  render(<TitlesPage />)
  expect(screen.getByText('prix automatique · CW8.PA · Son prix n’a pas pu être récupéré pour l’instant.')).toBeInTheDocument()
  expect(screen.queryByText(/remplis-le/)).toBeNull()
})

test('the gold units lines are not offered; the crypto ones are, since Yahoo prices a coin', () => {
  const coins: Profile = {
    ...exampleProfile,
    accounts: [...exampleProfile.accounts, { id: 'coins', establishmentId: 'home', type: 'crypto', name: 'Pièces' }],
    lines: [
      ...exampleProfile.lines,
      { id: 'gold-units', accountId: 'gold', name: 'Lingots', kind: 'units', currency: 'EUR' },
      { id: 'coin-units', accountId: 'coins', name: 'Bitcoin', kind: 'units', currency: 'EUR' },
    ],
  }
  mocks.state.current = ready(coins)
  render(<TitlesPage />)
  expect(screen.queryByText('Lingots')).toBeNull()
  expect(screen.getByText('Bitcoin')).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /^Le retrouver/ })).toHaveLength(3)
})

test('a stale quote on a pick is told as missing, with no comparison and no warning', async () => {
  mocks.requestQuotes.mockResolvedValue({ 'ISF.L': { price: 10.392, currency: 'GBP', asOf: '2026-10-01' } })
  render(<TitlesPage />)
  await pickIsf()
  expect(await screen.findByText('Son prix n’a pas pu être récupéré pour l’instant.')).toBeInTheDocument()
  expect(screen.queryByText(/Son prix aujourd’hui/)).toBeNull()
  expect(screen.queryByText(/très éloignés/)).toBeNull()
})

test('a followed line whose quote is stale says the price is missing', () => {
  const followed = attachSymbol(exampleProfile, 'etf', 'CW8.PA')
  mocks.state.current = ready(followed)
  mocks.market.current = {
    status: 'ready',
    market: { quotes: { 'CW8.PA': { price: 342.37, currency: 'EUR', asOf: '2026-10-01' } }, rates: null },
    retry: vi.fn(),
  }
  render(<TitlesPage />)
  expect(screen.getByText('prix automatique · CW8.PA · Son prix n’a pas pu être récupéré pour l’instant.')).toBeInTheDocument()
  expect(screen.queryByText(/342/)).toBeNull()
})

test('the list is named, and each « Le retrouver » says which line', () => {
  render(<TitlesPage />)
  expect(screen.getByRole('list', { name: 'Tes titres' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Le retrouver\u00A0: ETF' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Le retrouver\u00A0: Unité de compte' })).toBeInTheDocument()
})

test('the confirmation is one live region', async () => {
  render(<TitlesPage />)
  await pickIsf()
  await screen.findByText(/Son prix aujourd’hui/)
  expect(screen.getAllByRole('status')).toHaveLength(1)
})
