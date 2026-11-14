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
import { setUnquoted } from '@/lib/correct/profile-changes'
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

// The way back can carry a name typed by the person (a line's): its row keeps clear of the magnifier.
test('the way back comes before the magnifier, and its row leaves the magnifier its room', () => {
  mocks.search.current = 'depuis=ligne/etf'
  render(<TitlesPage />)
  const back = screen.getByRole('link', { name: '‹ ETF' })
  const find = screen.getByRole('link', { name: 'Trouver' })
  expect(back.compareDocumentPosition(find) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(back.parentElement).toBe(find.parentElement)
  expect(back.parentElement).toHaveClass('relative', 'pr-9')
  expect(find).toHaveClass('absolute', 'top-0')
})

test('lists the two lines of the example to find, with where they are, a back link and the tabs', () => {
  render(<TitlesPage />)
  expect(screen.getByRole('heading', { name: 'Tes titres' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '‹ Mon argent' })).toHaveAttribute('href', '/')
  expect(screen.getByRole('navigation', { name: 'Onglets' })).toBeInTheDocument()
  // No way out of its own: « Se déconnecter » is in the Réglages.
  expect(screen.queryByRole('button', { name: 'Se déconnecter' })).toBeNull()
  expect(screen.getByText('2 titres ne suivent pas leur cours. Retrouve-les, ou dis-nous s’ils ne sont pas cotés.')).toBeInTheDocument()
  // The lead replaces the general sentence.
  expect(screen.queryByText(/le prix d’une part peut se mettre à jour tout seul/)).toBeNull()
  expect(screen.getByRole('heading', { name: 'À retrouver' })).toBeInTheDocument()
  expect(screen.getByText('PEA chez BoursoBank · son prix ne bouge pas tout seul')).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /^Pas coté/ })).toHaveLength(2)
  expect(screen.queryByText('prix tapé à la main')).toBeNull()
  expect(screen.queryByRole('button', { name: /Ne plus le suivre/ })).toBeNull()
  // Nothing followed, nothing said not listed: no folded group.
  expect(screen.queryByRole('button', { name: /suit son cours|suivent leur cours|placements? pas cot/ })).toBeNull()
})

test('opened from the Repères, its way back goes to the Repères', () => {
  mocks.search.current = 'depuis=reperes'
  render(<TitlesPage />)
  expect(screen.getByRole('link', { name: '‹ Repères' })).toHaveAttribute('href', '/reperes')
})

test('a strip of squares, hidden from VoiceOver: followed, then not listed, then to find', () => {
  const mixed = setUnquoted(attachSymbol(exampleProfile, 'life-uc', 'CW8.PA'), 'etf', true)
  const more: Profile = { ...mixed, lines: [...mixed.lines, { id: 'b', accountId: 'pea', name: 'Bis', kind: 'units', currency: 'EUR' }] }
  mocks.state.current = ready(more)
  const { container } = render(<TitlesPage />)
  const strip = container.querySelector('[data-strip]')!
  expect(strip).toHaveAttribute('aria-hidden', 'true')
  expect([...strip.children].map((s) => s.getAttribute('data-state'))).toEqual(['followed', 'unquoted', 'to-find'])
})

test('« Pas coté » saves the flag through the page’s save, then the row leaves and the focus goes to the next one', async () => {
  const unquoted = setUnquoted(exampleProfile, 'etf', true)
  mocks.reload.mockImplementation(() => {
    mocks.state.current = ready(unquoted)
  })
  const { rerender } = render(<TitlesPage />)
  const button = screen.getByRole('button', { name: 'Pas coté : ETF' })
  await userEvent.click(button)
  await waitFor(() => expect(mocks.saveProfile).toHaveBeenCalledTimes(1))
  const saved = mocks.saveProfile.mock.calls[0][2] as Profile
  expect(saved.lines.find((l) => l.id === 'etf')!.unquoted).toBe(true)
  expect(saved.lines.find((l) => l.id === 'life-uc')!.unquoted).toBeUndefined()
  expect(mocks.addSnapshot).not.toHaveBeenCalled()
  await waitFor(() => expect(mocks.reload).toHaveBeenCalled())
  rerender(<TitlesPage />)
  expect(screen.queryByRole('button', { name: 'Le retrouver : ETF' })).toBeNull()
  expect(screen.getByRole('button', { name: /^1 placement pas coté/ })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Le retrouver : Unité de compte' })).toHaveFocus())
})

test('« Pas coté » on the last one to find puts the focus on the lead, which says all is in order', async () => {
  const one = setUnquoted(exampleProfile, 'etf', true)
  const none = setUnquoted(one, 'life-uc', true)
  mocks.state.current = ready(one)
  database(one)
  mocks.reload.mockImplementation(() => {
    mocks.state.current = ready(none)
  })
  const { rerender } = render(<TitlesPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Pas coté : Unité de compte' }))
  await waitFor(() => expect(mocks.reload).toHaveBeenCalled())
  rerender(<TitlesPage />)
  const lead = screen.getByText('Tous tes titres sont en ordre.')
  await waitFor(() => expect(lead).toHaveFocus())
  expect(screen.queryByRole('heading', { name: 'À retrouver' })).toBeNull()
})

test('« Pas coté » is off while it saves, so a double tap saves once', async () => {
  let release: (id: string) => void = () => {}
  mocks.saveProfile.mockImplementation(() => new Promise<string>((resolve) => (release = resolve)))
  render(<TitlesPage />)
  const button = screen.getByRole('button', { name: 'Pas coté : ETF' })
  await userEvent.click(button)
  await waitFor(() => expect(mocks.saveProfile).toHaveBeenCalledTimes(1))
  expect(button).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Le retrouver : ETF' })).toBeDisabled()
  release('p0')
  await waitFor(() => expect(mocks.reload).toHaveBeenCalled())
  expect(mocks.saveProfile).toHaveBeenCalledTimes(1)
})

test('« C’est bien lui » takes the row out of « À retrouver »: the focus goes to the next one, never to the page', async () => {
  const followed = attachSymbol(exampleProfile, 'etf', 'ISF.L')
  mocks.reload.mockImplementation(() => {
    mocks.state.current = ready(followed)
  })
  const { rerender } = render(<TitlesPage />)
  await pickIsf()
  await userEvent.click(await screen.findByRole('button', { name: 'C’est bien lui' }))
  await waitFor(() => expect(mocks.reload).toHaveBeenCalled())
  rerender(<TitlesPage />)
  expect(screen.queryByRole('button', { name: 'Le retrouver : ETF' })).toBeNull()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Le retrouver : Unité de compte' })).toHaveFocus())
})

test('« C’est bien lui » on the last one to find puts the focus on the lead', async () => {
  const one = setUnquoted(exampleProfile, 'life-uc', true)
  mocks.state.current = ready(one)
  database(one)
  mocks.reload.mockImplementation(() => {
    mocks.state.current = ready(attachSymbol(one, 'etf', 'ISF.L'))
  })
  const { rerender } = render(<TitlesPage />)
  await pickIsf()
  await userEvent.click(await screen.findByRole('button', { name: 'C’est bien lui' }))
  await waitFor(() => expect(mocks.reload).toHaveBeenCalled())
  rerender(<TitlesPage />)
  await waitFor(() => expect(screen.getByText('Tous tes titres sont en ordre.')).toHaveFocus())
})

test('a « Pas coté » that fails puts the focus on what is said', async () => {
  mocks.saveProfile.mockRejectedValue(new Error('network'))
  render(<TitlesPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Pas coté : ETF' }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent(/Ça n’a pas pu être enregistré/)
  await waitFor(() => expect(alert).toHaveFocus())
})

test('a « Changer » that fails puts the focus on what is said', async () => {
  const unquoted = setUnquoted(exampleProfile, 'etf', true)
  mocks.state.current = ready(unquoted)
  database(unquoted)
  mocks.saveProfile.mockRejectedValue(new Error('network'))
  render(<TitlesPage />)
  await userEvent.click(screen.getByRole('button', { name: /^1 placement pas coté/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Changer : ETF' }))
  const alert = await screen.findByRole('alert')
  await waitFor(() => expect(alert).toHaveFocus())
})

test('« Pas coté » that fails is said, and the row stays', async () => {
  mocks.saveProfile.mockRejectedValue(new Error('network'))
  render(<TitlesPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Pas coté : ETF' }))
  expect(await screen.findByText(/Ça n’a pas pu être enregistré/)).toBeInTheDocument()
  expect(mocks.reload).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Le retrouver : ETF' })).toBeEnabled()
})

test('the titles not listed are folded; « Voir » shows them in place, and « Changer » sends one back to find', async () => {
  const unquoted = setUnquoted(exampleProfile, 'etf', true)
  mocks.state.current = ready(unquoted)
  database(unquoted)
  mocks.reload.mockImplementation(() => {
    mocks.state.current = ready(exampleProfile)
  })
  const { rerender } = render(<TitlesPage />)
  expect(screen.queryByRole('button', { name: 'Changer : ETF' })).toBeNull()
  const fold = screen.getByRole('button', { name: /^1 placement pas coté/ })
  expect(fold).toHaveAttribute('aria-expanded', 'false')
  await userEvent.click(fold)
  expect(fold).toHaveAttribute('aria-expanded', 'true')
  const change = screen.getByRole('button', { name: 'Changer : ETF' })
  expect(change).toHaveFocus()
  await userEvent.click(change)
  await waitFor(() => expect(mocks.saveProfile).toHaveBeenCalledTimes(1))
  expect((mocks.saveProfile.mock.calls[0][2] as Profile).lines.find((l) => l.id === 'etf')).not.toHaveProperty('unquoted')
  await waitFor(() => expect(mocks.reload).toHaveBeenCalled())
  rerender(<TitlesPage />)
  expect(screen.getByRole('button', { name: 'Le retrouver : ETF' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /placements? pas cot/ })).toBeNull()
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

test('the followed titles are folded; « Voir » shows them in place, each a link to its sheet with its price', async () => {
  const followed = attachSymbol(exampleProfile, 'etf', 'CW8.PA')
  mocks.state.current = ready(followed)
  mocks.market.current = {
    status: 'ready',
    market: { quotes: { 'CW8.PA': { price: 342.37, currency: 'USD', asOf: '2026-11-06' } }, rates: RATES },
    retry: vi.fn(),
  }
  render(<TitlesPage />)
  expect(screen.getByText('1 titre ne suit pas son cours. Retrouve-le, ou dis-nous s’il n’est pas coté.')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /^ETF/ })).toBeNull()
  const fold = screen.getByRole('button', { name: /^1 titre suit son cours/ })
  expect(fold).toHaveAttribute('aria-expanded', 'false')
  await userEvent.click(fold)
  const row = screen.getByRole('link', { name: /^ETF/ })
  expect(row).toHaveAttribute('href', '/ligne/etf')
  expect(row).toHaveFocus()
  expect(plain(row.textContent!)).toContain('PEA chez BoursoBank · 306,65 €')
  expect(row.textContent).not.toContain('CW8')
  // Changing or stopping it lives on its sheet now.
  expect(screen.queryByRole('button', { name: /Ne plus le suivre/ })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Le retrouver : ETF' })).toBeNull()
  // Folded again.
  await userEvent.click(fold)
  expect(screen.queryByRole('link', { name: /^ETF/ })).toBeNull()
})

test('a followed line whose price is missing says so, never 0', async () => {
  const followed = attachSymbol(exampleProfile, 'etf', 'CW8.PA')
  mocks.state.current = ready(followed)
  mocks.market.current = { status: 'ready', market: { quotes: { 'CW8.PA': null }, rates: null }, retry: vi.fn() }
  render(<TitlesPage />)
  await userEvent.click(screen.getByRole('button', { name: /^1 titre suit son cours/ }))
  expect(screen.getByText('PEA chez BoursoBank · Son prix n’a pas pu être récupéré pour l’instant.')).toBeInTheDocument()
  expect(screen.queryByText(/remplis-le/)).toBeNull()
})

test('with every title in order, the lead says so and nothing is left to find', () => {
  mocks.state.current = ready(setUnquoted(attachSymbol(exampleProfile, 'etf', 'CW8.PA'), 'life-uc', true))
  render(<TitlesPage />)
  expect(screen.getByText('Tous tes titres sont en ordre.')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'À retrouver' })).toBeNull()
  expect(screen.queryByRole('button', { name: /^Le retrouver/ })).toBeNull()
})

test('with no title at all, the page says so as before', () => {
  const none: Profile = { ...exampleProfile, lines: exampleProfile.lines.filter((l) => l.kind === 'amount') }
  mocks.state.current = ready(none)
  const { container } = render(<TitlesPage />)
  expect(screen.getByText('Tu n’as aucun titre dont le prix puisse se mettre à jour tout seul.')).toBeInTheDocument()
  expect(container.querySelector('[data-strip]')).toBeNull()
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

test('a followed line whose quote is stale says the price is missing', async () => {
  const followed = attachSymbol(exampleProfile, 'etf', 'CW8.PA')
  mocks.state.current = ready(followed)
  mocks.market.current = {
    status: 'ready',
    market: { quotes: { 'CW8.PA': { price: 342.37, currency: 'EUR', asOf: '2026-10-01' } }, rates: null },
    retry: vi.fn(),
  }
  render(<TitlesPage />)
  await userEvent.click(screen.getByRole('button', { name: /^1 titre suit son cours/ }))
  expect(screen.getByText('PEA chez BoursoBank · Son prix n’a pas pu être récupéré pour l’instant.')).toBeInTheDocument()
  expect(screen.queryByText(/342/)).toBeNull()
})

test('the list is named, and each « Le retrouver » says which line', () => {
  render(<TitlesPage />)
  expect(screen.getByRole('list', { name: 'À retrouver' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Le retrouver\u00A0: ETF' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Le retrouver\u00A0: Unité de compte' })).toBeInTheDocument()
})

test('the confirmation is one live region', async () => {
  render(<TitlesPage />)
  await pickIsf()
  await screen.findByText(/Son prix aujourd’hui/)
  expect(screen.getAllByRole('status')).toHaveLength(1)
})
