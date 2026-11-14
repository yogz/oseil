// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { GOAL_PRESETS } from '@/lib/catalog'
import type { Model, ModelState } from '@/lib/app/use-model'
import { account, amountEntry, exampleProfile, exampleSnapshot, line, profileOf, snapshotOf, unitsEntry } from '@/lib/model/__tests__/fixtures'
import { DEFAULT_SETTINGS } from '@/lib/model/documents'
import type { GoalAllocation, Profile, Snapshot } from '@/lib/model/types'
import { computeSituation } from '@/lib/model/situation'
import { excludedSentence } from '@/lib/screens/mon-argent'
import type { MarketState } from '@/lib/market/use-market'
import CategoryPage from '../categorie/[id]/page'
import { todayIso } from '@/lib/dates'
import { plain } from '@/lib/__tests__/plain'

const mocks = vi.hoisted(() => ({
  state: { current: { status: 'loading' } as ModelState },
  params: { current: { id: 'markets' } as { id: string } },
  replace: vi.fn(),
  saveSettings: vi.fn(),
  addSnapshot: vi.fn(),
  saveSnapshot: vi.fn(),
  saveProfile: vi.fn(),
  market: { current: { status: 'ready', market: { quotes: {}, rates: null }, retry: vi.fn() } as MarketState },
  useMarket: vi.fn(),
}))

vi.mock('@/lib/app/use-model', () => ({ useModel: () => mocks.state.current }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useParams: () => mocks.params.current,
}))
vi.mock('@/lib/model/repository', () => ({
  saveSettings: mocks.saveSettings,
  addSnapshot: mocks.addSnapshot,
  saveSnapshot: mocks.saveSnapshot,
  saveProfile: mocks.saveProfile,
}))
vi.mock('@/lib/market/use-market', () => ({
  useMarket: (...args: unknown[]) => {
    mocks.useMarket(...args)
    return mocks.market.current
  },
}))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}))

const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const balanced: GoalAllocation = { schema: 1, validFrom: '2026-01-01', shares: GOAL_PRESETS.balanced.shares }

function ready(profile: Profile = exampleProfile, snapshot: Snapshot = exampleSnapshot): ModelState {
  const model: Model = {
    profile: loaded(profile),
    snapshots: [loaded(snapshot, 's0')],
    goals: [loaded(balanced, 'g0')],
    settings: null,
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
  }
  return { status: 'ready', model, client: {} as never, dataKey: {} as CryptoKey, reload: vi.fn() }
}

beforeEach(() => {
  mocks.market.current = { status: 'ready', market: { quotes: {}, rates: null }, retry: vi.fn() }
  mocks.useMarket.mockReset()
  mocks.replace.mockReset()
  mocks.saveSettings.mockReset().mockResolvedValue('settings-id')
  mocks.params.current = { id: 'markets' }
  mocks.state.current = ready()
})
afterEach(cleanup)

test('shows the category, its header, its goal bar and its lines', () => {
  render(<CategoryPage />)
  const back = screen.getByRole('link', { name: '‹ Mon argent' })
  expect(back).toHaveAttribute('href', '/')
  expect(screen.getByRole('heading', { name: 'Placements en bourse' })).toBeInTheDocument()
  expect(screen.getByText('15 carrés sur 100, un peu en dessous de ton objectif (19 carrés)')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: '15 carrés, objectif 19' })).toBeInTheDocument()
  expect(screen.getByText('ETF')).toBeInTheDocument()
  expect(screen.getByText(/PEA chez BoursoBank/)).toBeInTheDocument()
  expect(screen.getByText(/a gagné 5.000.€ depuis l’achat/)).toHaveClass('text-gain')
  expect(mocks.replace).not.toHaveBeenCalled()
})

test('the details open and close with the button', async () => {
  const user = userEvent.setup()
  render(<CategoryPage />)
  const toggle = screen.getByRole('button', { name: 'Voir les chiffres détaillés' })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByText(/prix moyen d’achat/)).not.toBeInTheDocument()
  await user.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(toggle).toHaveTextContent('Masquer les chiffres détaillés')
  expect(screen.getAllByText(/prix moyen d’achat/)).toHaveLength(2)
  await user.click(toggle)
  expect(toggle).toHaveTextContent('Voir les chiffres détaillés')
  expect(screen.queryByText(/prix moyen d’achat/)).not.toBeInTheDocument()
})

test('the property category shows the sentence about the bank', () => {
  mocks.params.current = { id: 'property' }
  render(<CategoryPage />)
  expect(screen.getByText(/300.000.€ dont 180.000.€ dus à la banque/)).toBeInTheDocument()
  expect(screen.queryByRole('img', { name: /objectif/ })).not.toBeInTheDocument()
})

test('an unknown category goes back to Mon argent', () => {
  mocks.params.current = { id: 'nope' }
  render(<CategoryPage />)
  expect(mocks.replace).toHaveBeenCalledWith('/')
})

test('says so when the figures could not be loaded', () => {
  mocks.state.current = { status: 'failed', retry: vi.fn() }
  render(<CategoryPage />)
  expect(screen.getByRole('alert')).toHaveTextContent('Tes chiffres n’ont pas pu être chargés.')
})

const quotedProfile: Profile = {
  ...exampleProfile,
  lines: exampleProfile.lines.map((l) => (l.id === 'etf' ? { ...l, quoteSymbol: 'CW8.PA' } : l)),
}
const MARKET = { quotes: { 'CW8.PA': { price: 260, currency: 'EUR', asOf: todayIso() } }, rates: null }

test('prices: nothing is drawn while the market loads, then the line is at the day’s price', async () => {
  mocks.state.current = ready(quotedProfile)
  mocks.market.current = { status: 'loading' }
  const { rerender } = render(<CategoryPage />)
  expect(screen.queryByRole('heading', { name: 'Placements en bourse' })).not.toBeInTheDocument()
  expect(mocks.replace).not.toHaveBeenCalled()

  mocks.market.current = { status: 'ready', market: MARKET, retry: vi.fn() }
  rerender(<CategoryPage />)
  expect(screen.getByRole('heading', { name: 'Placements en bourse' })).toBeInTheDocument()
  expect(screen.getByText(/26\s000\s€/)).toBeInTheDocument()
  expect(mocks.useMarket).toHaveBeenLastCalledWith(['CW8.PA'], { rates: true })
  expect(mocks.addSnapshot).not.toHaveBeenCalled()
  expect(mocks.saveSnapshot).not.toHaveBeenCalled()
  expect(mocks.saveProfile).not.toHaveBeenCalled()
})

test('prices: with no quoted line, no symbol is asked for', () => {
  render(<CategoryPage />)
  expect(mocks.useMarket).toHaveBeenLastCalledWith([], { rates: false })
})

test('the category with a line whose price could be followed links to « Tes titres », after the details button', () => {
  render(<CategoryPage />)
  const link = screen.getByRole('link', { name: 'Le prix de tes titres' })
  expect(link).toHaveAttribute('href', '/titres?depuis=categorie/markets')
  const toggle = screen.getByRole('button', { name: 'Voir les chiffres détaillés' })
  expect(toggle.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('a category without such a line has no link', () => {
  mocks.params.current = { id: 'available' }
  render(<CategoryPage />)
  expect(screen.queryByRole('link', { name: 'Le prix de tes titres' })).toBeNull()
})

test('opens the fiche of a line from the detail, its figure beside the link and never inside it', () => {
  render(<CategoryPage />)
  const etf = screen.getByRole('link', { name: /ETF/ })
  expect(etf).toHaveAttribute('href', '/ligne/etf')
  expect(etf).toHaveTextContent(/PEA chez BoursoBank/)
  expect(etf.querySelector('button')).toBeNull()
  expect(screen.getByRole('link', { name: /Unité de compte/ })).toHaveAttribute('href', '/ligne/life-uc')
})

test('the loan of the house reads as a sub-line of the house, and opens its own fiche', () => {
  mocks.params.current = { id: 'property' }
  render(<CategoryPage />)
  const house = screen.getByRole('link', { name: /Maison/ })
  expect(house).toHaveAttribute('href', '/ligne/house-line')
  const loan = screen.getByRole('link', { name: /une fois déduits 180.000.€ encore dus/ })
  expect(loan).toHaveAttribute('href', '/ligne/mortgage-line')
  // Under the house, in the same row: not a line of its own above it.
  expect(loan.closest('li')).toBe(house.closest('li'))
  // The figure of the row is the house less its loan, and the sub-line says so.
  expect(house.closest('li')!.textContent?.replace(/[\u00a0\u202f]/g, ' ')).toContain('120 000 €')
  expect(screen.queryByText(/^Crédit/)).toBeNull()
})

test('never paints a loan in red', () => {
  mocks.params.current = { id: 'property' }
  render(<CategoryPage />)
  const loan = screen.getByRole('link', { name: /une fois déduits 180.000.€ encore dus/ })
  expect(loan.innerHTML).not.toContain('text-loss')
  expect(loan.closest('li')!.innerHTML).not.toContain('text-loss')
  expect(loan).toHaveClass('text-ink-soft')
})

test('a line left out for want of a rate gets a link to its fiche, under the note', () => {
  const profile = profileOf(
    [account('cur', 'current'), account('us', 'current')],
    [line('cur-l', 'cur', { name: 'Compte courant' }), line('us-l', 'us', { name: 'Revolut', currency: 'USD' })],
  )
  mocks.state.current = ready(profile, snapshotOf([amountEntry('cur-l', 1_000), amountEntry('us-l', 500)], {}))
  mocks.params.current = { id: 'available' }
  render(<CategoryPage />)
  const note = screen.getByText('« Revolut » n’est pas compté : son taux de change manque.')
  const sheet = screen.getByRole('link', { name: 'La fiche de « Revolut »' })
  expect(sheet).toHaveAttribute('href', '/ligne/us-l')
  expect(note.compareDocumentPosition(sheet) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('a category whose total is negative opens without squares, and its lines open their fiche', () => {
  // The house typed 100 000 € instead of 300 000 €: below its loan, Immobilier has no square.
  const typo: Snapshot = {
    ...exampleSnapshot,
    entries: exampleSnapshot.entries.map((e) => (e.lineId === 'house-line' ? amountEntry('house-line', 100_000) : e)),
  }
  mocks.state.current = ready(exampleProfile, typo)
  mocks.params.current = { id: 'property' }
  render(<CategoryPage />)
  expect(mocks.replace).not.toHaveBeenCalled()
  expect(screen.getByRole('heading', { name: 'Immobilier' })).toBeInTheDocument()
  expect(screen.getByText(plain(excludedSentence('property', computeSituation(exampleProfile, typo))))).toBeInTheDocument()
  // No line of it shows squares (Mon argent's grid, above the detail on a phone, is not its own).
  const detail = screen.getByRole('heading', { name: 'Immobilier' }).closest('[data-detail]') as HTMLElement
  expect(within(detail).queryByRole('img', { name: /carré/ })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Maison/ })).toHaveAttribute('href', '/ligne/house-line')
  expect(screen.getByRole('link', { name: /Crédit/ })).toHaveAttribute('href', '/ligne/mortgage-line')
})

test('a category opens when there is no grid at all', () => {
  const profile = profileOf(
    [account('cur', 'current'), account('loan', 'loan')],
    [line('cur-l', 'cur', { name: 'Compte courant' }), line('loan-l', 'loan', { name: 'Prêt perso' })],
  )
  mocks.state.current = ready(profile, snapshotOf([amountEntry('cur-l', 1_000), amountEntry('loan-l', 3_000)]))
  mocks.params.current = { id: 'available' }
  render(<CategoryPage />)
  expect(mocks.replace).not.toHaveBeenCalled()
  expect(screen.getByText(/ce que tu dois dépasse ce que tu possèdes/)).toBeInTheDocument()
  // Its name only repeats its type: its bank (« e ») is its title (planche 1, option B).
  expect(screen.getByRole('link', { name: /^e\b/ })).toHaveAttribute('href', '/ligne/cur-l')
  expect(screen.getByRole('link', { name: /Prêt perso/ })).toHaveAttribute('href', '/ligne/loan-l')
  expect(screen.queryByRole('img', { name: /carré/ })).not.toBeInTheDocument()
})

const rangedProfile = profileOf(
  [account('cc', 'current'), account('pea', 'pea')],
  [
    line('cc-line', 'cc'),
    line('us-line', 'pea', { group: 'us' }),
    line('eu-line', 'pea', { group: 'europe' }),
    line('free-line', 'pea'),
  ],
)
const rangedSnapshot = snapshotOf([
  amountEntry('cc-line', 10_000),
  amountEntry('us-line', 50_000),
  amountEntry('eu-line', 30_000),
  amountEntry('free-line', 20_000),
])

describe('the « Fonds monde » note', () => {
  const profile = (groups: Array<'world' | 'europe'>) =>
    profileOf([account('cc', 'current'), account('pea', 'pea')], [line('cc-line', 'cc'), ...groups.map((g, i) => line(`l${i}`, 'pea', { group: g }))])
  const snapshot = (n: number) => snapshotOf([amountEntry('cc-line', 10_000), ...Array.from({ length: n }, (_, i) => amountEntry(`l${i}`, 30_000 - i * 1_000))])

  test('with chapters, the note appears once « Fonds monde » is opened, above its lines', async () => {
    mocks.state.current = ready(profile(['world', 'europe']), snapshot(2))
    const user = userEvent.setup()
    render(<CategoryPage />)
    expect(screen.queryByText(/MSCI World/)).not.toBeInTheDocument()
    const world = screen.getByRole('button', { name: /Fonds monde/ })
    await user.click(world)
    const note = screen.getByText(/MSCI World/)
    expect(note).toHaveClass('text-caption', 'text-ink-muted')
    const panel = document.getElementById(world.getAttribute('aria-controls')!)!
    expect(panel).toContainElement(note)
    expect(panel.firstElementChild).toBe(note)
  })

  test('without chapters, the note sits under the list', () => {
    mocks.state.current = ready(profile(['world']), snapshot(1))
    render(<CategoryPage />)
    expect(screen.getByText(/MSCI World/)).toBeInTheDocument()
  })

  test('with no « Fonds monde » line, there is no note', () => {
    mocks.state.current = ready(profile(['europe']), snapshot(1))
    render(<CategoryPage />)
    expect(screen.queryByText(/MSCI World/)).not.toBeInTheDocument()
  })
})

describe('the chapters of a category', () => {
  beforeEach(() => {
    mocks.state.current = ready(rangedProfile, rangedSnapshot)
  })

  test('every chapter is closed on arrival, with its subtotal and its sub-line', () => {
    render(<CategoryPage />)
    const us = screen.getByRole('button', { name: /États-Unis/ })
    expect(us).toHaveAttribute('aria-expanded', 'false')
    expect(us).toHaveTextContent(/50\s000\s€/)
    expect(screen.getByRole('button', { name: /Europe/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: /Je ne sais pas/ })).toBeInTheDocument()
    // Planche 4, option B (Nicolas, 12 November 2026): its squares, with no « N carrés sur M · 1 ligne ».
    expect(screen.queryAllByText(/carrés? sur \d+\s·/)).toHaveLength(0)
    expect(screen.queryByRole('link', { name: /us-line/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Trop petit pour un carré')).not.toBeInTheDocument()
  })

  test('a chapter is not a <section>: the page columns would strip the first one’s rule', () => {
    const { container } = render(<CategoryPage />)
    expect(container.querySelector('section')).toBeNull()
  })

  test('one touch opens a chapter, a second closes it, each on its own', async () => {
    const user = userEvent.setup()
    render(<CategoryPage />)
    const us = screen.getByRole('button', { name: /États-Unis/ })
    const europe = screen.getByRole('button', { name: /Europe/ })
    const before = screen.getAllByRole('link').length
    await user.click(us)
    expect(us).toHaveAttribute('aria-expanded', 'true')
    expect(europe).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getAllByRole('link').length).toBeGreaterThan(before)
    await user.click(us)
    expect(us).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getAllByRole('link')).toHaveLength(before)
  })

  test('the ranging link goes to the ranging screen', () => {
    render(<CategoryPage />)
    expect(screen.getByRole('link', { name: 'Ranger par zone ›' })).toHaveAttribute('href', '/categorie/markets/ranger')
  })

  test('without chapters the page keeps its flat list and no chapter button', () => {
    mocks.state.current = ready()
    render(<CategoryPage />)
    expect(screen.queryByRole('button', { name: /États-Unis/ })).not.toBeInTheDocument()
    expect(screen.getByText('ETF')).toBeInTheDocument()
  })
})

describe('« En location » kept for a rental share, with no rental left', () => {
  beforeEach(() => {
    const homeAndCash = profileOf([account('c', 'current'), account('h', 'home')], [line('cash', 'c'), line('home', 'h')])
    const state = ready(homeAndCash, snapshotOf([amountEntry('cash', 100_000), amountEntry('home', 300_000)]))
    if (state.status !== 'ready') throw new Error('expected a ready state')
    const goal: GoalAllocation = { schema: 1, validFrom: '2026-01-01', shares: { available: 85, secured: 0, markets: 0, gold: 0, rental: 15 } }
    mocks.state.current = { ...state, model: { ...state.model, goals: [loaded(goal, 'g0')] } }
    mocks.params.current = { id: 'property' }
  })

  test('is shown with its gap and its bar, but opens on nothing: no button, no « › »', () => {
    const { container } = render(<CategoryPage />)
    expect(screen.getByRole('button', { name: /^Pour y vivre/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: /^En location/ })).not.toBeInTheDocument()
    const rental = [...container.querySelectorAll('[data-chapter]')].find((c) => c.textContent?.startsWith('En location'))!
    expect(rental).toBeDefined()
    expect(rental.querySelector('[aria-expanded]')).toBeNull()
    expect(rental.textContent).not.toContain('›')
    expect(plain(rental.textContent ?? '')).toContain('rien pour l’instant (4 carrés)')
    expect(rental.textContent).not.toContain('aucune ligne')
    expect(within(rental as HTMLElement).getByRole('img')).toBeInTheDocument()
  })
})

describe('the gain since purchase of « Placements en bourse »', () => {
  // us: +200 € on 1 000 €; europe: −30 € on 1 000 € and an amount line; unknown: no average price.
  const profile = profileOf(
    [account('cc', 'current'), account('pea', 'pea')],
    [
      line('cc-line', 'cc'),
      line('us-a', 'pea', { kind: 'units', group: 'us' }),
      line('eu-a', 'pea', { kind: 'units', group: 'europe' }),
      line('eu-b', 'pea', { group: 'europe' }),
      line('free', 'pea', { kind: 'units' }),
    ],
  )
  const snapshot = snapshotOf([
    amountEntry('cc-line', 5_000),
    unitsEntry('us-a', 10, 120, 100),
    unitsEntry('eu-a', 10, 97, 100),
    amountEntry('eu-b', 500),
    unitsEntry('free', 10, 50, null),
  ])
  const withDisplay = (display: 'euros' | 'percent'): ModelState => {
    const state = ready(profile, snapshot)
    if (state.status !== 'ready') throw new Error('expected ready')
    state.model.settings = loaded({ ...DEFAULT_SETTINGS, display })
    return state
  }

  test('the header says the gain in %, toned, and the lines left out', () => {
    mocks.state.current = withDisplay('percent')
    render(<CategoryPage />)
    // +170 € on 2 000 €.
    const figure = screen.getByText((_, el) => el?.tagName === 'SPAN' && plain(el.textContent ?? '') === '+8,5 %')
    expect(figure).toHaveClass('text-gain')
    expect(screen.getByText((_, el) => plain(el?.textContent ?? '') === 'depuis l’achat, hors 2 lignes')).toHaveClass('text-ink-muted')
    expect(
      screen.getByText((_, el) => plain(el?.textContent ?? '') === 'en hausse de 8,5 % depuis l’achat, sans compter 2 lignes sans prix d’achat'),
    ).toHaveClass('sr-only')
  })

  test('the header in euros', () => {
    mocks.state.current = withDisplay('euros')
    render(<CategoryPage />)
    expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && plain(el.textContent ?? '') === '+170 €')).toHaveClass('text-gain')
  })

  test('each row: its gain toned, its count of lines without a price, and one sentence for VoiceOver', () => {
    mocks.state.current = withDisplay('percent')
    const { container } = render(<CategoryPage />)
    const europe = screen.getByRole('button', { name: /^Europe/ })
    expect(plain(europe.getAttribute('aria-label')!)).toMatch(/^Europe, \d+ %, \d+ carrés sur \d+, 2 lignes, 1 sans prix, en baisse de 3,0 % depuis l’achat$/)
    expect(plain(screen.getByRole('button', { name: /^États-Unis/ }).getAttribute('aria-label')!)).toMatch(/en hausse de 20,0 % depuis l’achat$/)
    expect(plain(screen.getByRole('button', { name: /^Je ne sais pas/ }).getAttribute('aria-label')!)).toMatch(
      /, 1 ligne sans prix, gain inconnu, prix d’achat manquant$/,
    )
    const gains = [...container.querySelectorAll('[data-gain]')].map((el) => ({ text: plain(el.textContent!), tone: el.className }))
    // Europe (1 470 €) before the United States (1 200 €), the unknown chapter last.
    expect(gains.map((g) => g.text)).toEqual(['−3,0 %', '+20,0 %', '—'])
    expect(gains[0].tone).toContain('text-loss')
    expect(gains[1].tone).toContain('text-gain')
    expect(gains[2].tone).toContain('text-ink-muted')
    // Its squares say the rest: the sub-line keeps only the lines without a price (planche 4, option B).
    expect(screen.getAllByText((_, el) => el?.tagName === 'SPAN' && plain(el.textContent ?? '') === '1 ligne sans prix')).toHaveLength(2)
  })

  test('a line without a purchase price says so, once its chapter is open', async () => {
    const user = userEvent.setup()
    mocks.state.current = withDisplay('percent')
    render(<CategoryPage />)
    await user.click(screen.getByRole('button', { name: /^Je ne sais pas/ }))
    expect(screen.getByText('prix d’achat manquant')).toHaveClass('text-ink-muted')
  })

  test('without chapters, « hors N lignes » equals the captions « prix d’achat manquant » of the list', () => {
    // One unranged chapter only: the flat list.
    const flat = profileOf(
      [account('cc', 'current'), account('pea', 'pea')],
      [line('cc-line', 'cc'), line('k', 'pea', { kind: 'units' }), line('n', 'pea', { kind: 'units' }), line('m', 'pea')],
    )
    const state = ready(
      flat,
      snapshotOf([amountEntry('cc-line', 5_000), unitsEntry('k', 10, 120, 100), unitsEntry('n', 10, 50, null), amountEntry('m', 300)]),
    )
    mocks.state.current = state
    render(<CategoryPage />)
    expect(screen.queryByRole('button', { name: /Je ne sais pas/ })).not.toBeInTheDocument()
    const rest = screen.getByText((_, el) => /^depuis l’achat, hors \d+ lignes?$/.test(plain(el?.textContent ?? '')) && el?.tagName === 'SPAN')
    const n = Number(/hors (\d+)/.exec(plain(rest.textContent!))![1])
    expect(n).toBe(2)
    expect(screen.getAllByText('prix d’achat manquant')).toHaveLength(n)
  })

  test('« prix d’achat manquant » leads a line in parts to its average price; an amount line has none to give', () => {
    const flat = profileOf(
      [account('cc', 'current'), account('pea', 'pea')],
      [line('cc-line', 'cc'), line('n', 'pea', { kind: 'units' }), line('m', 'pea')],
    )
    mocks.state.current = ready(flat, snapshotOf([amountEntry('cc-line', 5_000), unitsEntry('n', 10, 50, null), amountEntry('m', 300)]))
    render(<CategoryPage />)
    const captions = screen.getAllByText('prix d’achat manquant')
    expect(captions).toHaveLength(2)
    const links = captions.filter((el) => el.closest('a'))
    expect(links).toHaveLength(1)
    expect(links[0].closest('a')).toHaveAttribute('href', '/ligne/n?modifier=prix-moyen')
    // Each link says which line it is for: its name starts with what is written.
    expect(screen.getByRole('link', { name: 'prix d’achat manquant : ajouter le prix moyen de n' })).toBe(links[0].closest('a'))
    const plainCaption = captions.find((el) => !el.closest('a'))!
    expect(plainCaption.closest('li')!.querySelector('a')).toHaveAttribute('href', '/ligne/m')
  })

  test('a line’s gain that rounds to zero in % reads « ni gain ni perte », muted; in € it stays signed', () => {
    const big = profileOf([account('cc', 'current'), account('pea', 'pea')], [line('cc-line', 'cc'), line('big', 'pea', { kind: 'units' })])
    const state = ready(big, snapshotOf([amountEntry('cc-line', 5_000), unitsEntry('big', 10_000, 100.003, 100)]))
    if (state.status !== 'ready') throw new Error('expected ready')
    state.model.settings = loaded({ ...DEFAULT_SETTINGS, display: 'percent' })
    mocks.state.current = state
    render(<CategoryPage />)
    expect(screen.getByRole('button', { name: 'ni gain ni perte depuis l’achat' })).toHaveClass('text-ink-muted')
    expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && plain(el.textContent ?? '') === '0,0 %')).toHaveClass('text-ink-muted')
  })

  test('another category tells no gain', () => {
    mocks.params.current = { id: 'available' }
    render(<CategoryPage />)
    expect(screen.queryByText(/depuis l’achat/)).not.toBeInTheDocument()
    expect(document.querySelector('[data-gain]')).toBeNull()
    expect(screen.queryByRole('link', { name: /prix d’achat pour/ })).not.toBeInTheDocument()
  })

  test('right under « depuis l’achat »: the way to the purchase price of the one title missing it', () => {
    mocks.state.current = withDisplay('percent')
    render(<CategoryPage />)
    // « free » has no average price; « eu-b » is an amount line, which can never take one.
    const row = screen.getByRole('link', { name: 'Ajoute son prix d’achat pour le compter ›' })
    expect(row).toHaveAttribute('href', '/ligne/free')
    const gain = screen.getByText((_, el) => plain(el?.textContent ?? '') === 'depuis l’achat, hors 2 lignes').closest('p')!
    expect(gain.nextElementSibling).toBe(row)
  })
})

// One magnifier per screen, while the vault opens as once it is open (a wrapper nested in another drew two).
test('exactly one magnifier « Trouver », loading as ready', () => {
  mocks.state.current = { status: 'loading' }
  const { rerender } = render(<CategoryPage />)
  expect(screen.getAllByRole('link', { name: 'Trouver' })).toHaveLength(1)
  mocks.state.current = ready()
  rerender(<CategoryPage />)
  expect(screen.getAllByRole('link', { name: 'Trouver' })).toHaveLength(1)
})
