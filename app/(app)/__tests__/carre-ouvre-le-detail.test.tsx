// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { plain } from '@/lib/__tests__/plain'
import { GOAL_PRESETS } from '@/lib/catalog'
import { todayIso } from '@/lib/dates'
import { setAmountsHidden } from '@/lib/format'
import { categoryDetailView } from '@/lib/screens/category-detail'
import type { Model, ModelState } from '@/lib/app/use-model'
import { account, amountEntry, exampleProfile, exampleSnapshot, line, profileOf, snapshotOf } from '@/lib/model/__tests__/fixtures'
import type { GoalAllocation, Snapshot } from '@/lib/model/types'
import type { MarketState } from '@/lib/market/use-market'
import CategoryPage from '../categorie/[id]/page'
import HomePage from '../page'

// 9 November 2026 (Nicolas): a square opens its category's detail, on a computer first, then on a
// phone too (« le même comportement sur téléphone … affiché en dessous du cube »). On the detail, a
// square of the same category lights its line and sets its row forth.
const mocks = vi.hoisted(() => ({
  state: { current: { status: 'loading' } as ModelState },
  params: { current: { id: 'markets' } as { id: string } },
  desktop: { current: true },
  push: vi.fn(),
  replace: vi.fn(),
  market: { current: { status: 'ready', market: { quotes: {}, rates: null }, retry: vi.fn() } as MarketState },
}))

vi.mock('@/lib/app/use-model', () => ({ useModel: () => mocks.state.current }))
vi.mock('@/lib/app/use-desktop', () => ({ useIsDesktop: () => mocks.desktop.current }))
// jsdom lays nothing out: the fit of the grid is said, as a phone would measure it.
vi.mock('@/lib/app/grid-fit', () => ({ useGridFit: (_ref: unknown, on: boolean) => (on ? 280 : null) }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useParams: () => mocks.params.current,
}))
vi.mock('@/lib/model/repository', () => ({ saveSettings: vi.fn() }))
vi.mock('@/lib/market/use-market', () => ({ useMarket: () => mocks.market.current }))
vi.mock('@/lib/supabase/browser', () => ({ createBrowserSupabase: () => ({}) }))
vi.mock('@/lib/vault/device', () => ({ indexedDbKeyStore: () => ({}) }))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}))

const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const balanced: GoalAllocation = { schema: 1, validFrom: '2026-01-01', shares: GOAL_PRESETS.balanced.shares }
// In January the current account held 2 000 € less: a progress to show under the total.
const earlier: Snapshot = {
  ...exampleSnapshot,
  takenOn: '2026-01-31',
  entries: exampleSnapshot.entries.map((e) => (e.lineId === 'current-line' ? amountEntry('current-line', 6_000) : e)),
}

// The house typed 100 000 € instead of 300 000 €: below its loan, Immobilier holds no square.
const typo: Snapshot = {
  ...exampleSnapshot,
  entries: exampleSnapshot.entries.map((e) => (e.lineId === 'house-line' ? amountEntry('house-line', 100_000) : e)),
}

function ready({
  history = false,
  snapshot = exampleSnapshot,
  display = 'euros',
}: { history?: boolean; snapshot?: Snapshot; display?: 'euros' | 'percent' } = {}): ModelState {
  const model: Model = {
    profile: loaded(exampleProfile),
    snapshots: history ? [loaded(earlier, 's0'), loaded(snapshot, 's1')] : [loaded(snapshot, 's0')],
    goals: [loaded(balanced, 'g0')],
    settings: display === 'euros' ? null : loaded({ schema: 1, budget: null, display, hideAmounts: false }, 'set0'),
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
  }
  return { status: 'ready', model, client: {} as never, dataKey: {} as CryptoKey, reload: vi.fn() }
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.desktop.current = true
  mocks.params.current = { id: 'markets' }
  mocks.push.mockReset()
  mocks.replace.mockReset()
  mocks.state.current = ready()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const grid = () => screen.getByRole('img', { name: /^Ta grille/ })
const squaresOf = (category: string) =>
  Array.from(grid().children).filter((s) => s.getAttribute('data-category') === category) as HTMLElement[]
const firstOfOther = (category: string) =>
  Array.from(grid().children).find((s) => s.getAttribute('data-category') !== category) as HTMLElement
const litCategories = () =>
  new Set(
    Array.from(grid().children)
      .filter((s) => !s.hasAttribute('data-dim'))
      .map((s) => s.getAttribute('data-category')),
  )
const fewerAnimations = () =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
const SIZES = [
  ['on a computer', true],
  ['on a phone', false],
] as const

describe.each(SIZES)('Mon argent, %s', (_, desktop) => {
  beforeEach(() => {
    mocks.desktop.current = desktop
  })

  test('a square opens its category’s detail after the film; the big amount stays the total', () => {
    const { container } = render(<HomePage />)
    const first = grid().children[0] as HTMLElement
    const category = first.getAttribute('data-category')!
    fireEvent.click(first)
    // At once: that category is lit, what is beside or under the grid fades, nothing has moved yet.
    expect(litCategories()).toEqual(new Set([category]))
    expect(mocks.push).not.toHaveBeenCalled()
    const columns = Array.from(container.querySelector('[data-columns]')!.children)
    expect(columns[columns.length - 1]).toHaveClass('opacity-0', 'pointer-events-none')
    // Nothing is said in place any more: no « Voir le détail › », no label nor amount that slides.
    expect(screen.queryByRole('link', { name: /^Voir le détail/ })).not.toBeInTheDocument()
    expect(screen.getByText('Ce qui est vraiment à toi')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(349))
    expect(mocks.push).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(`/categorie/${category}`)
  })

  test('with fewer animations asked, it opens at once', () => {
    fewerAnimations()
    render(<HomePage />)
    const first = grid().children[0] as HTMLElement
    fireEvent.click(first)
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(`/categorie/${first.getAttribute('data-category')}`)
  })

  test('a click on another category during the film changes nothing: one push, to the first', () => {
    render(<HomePage />)
    const first = grid().children[0] as HTMLElement
    const category = first.getAttribute('data-category')!
    fireEvent.click(first)
    fireEvent.click(firstOfOther(category))
    expect(litCategories()).toEqual(new Set([category]))
    act(() => vi.advanceTimersByTime(1_000))
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(`/categorie/${category}`)
  })

  test('the same square twice lights no line: the category opens, that is all', () => {
    render(<HomePage />)
    const first = grid().children[0] as HTMLElement
    fireEvent.click(first)
    fireEvent.click(first)
    expect(grid().querySelectorAll('.opacity-50, .opacity-12')).toHaveLength(0)
    act(() => vi.advanceTimersByTime(1_000))
    expect(mocks.push).toHaveBeenCalledOnce()
  })
})

describe.each(SIZES)('a category, %s', (_, desktop) => {
  beforeEach(() => {
    mocks.desktop.current = desktop
  })

  test('a square of another category: that category lights, the detail fades, then it replaces the page', () => {
    render(<CategoryPage />)
    const other = firstOfOther('markets')
    const category = other.getAttribute('data-category')!
    fireEvent.click(other)
    expect(litCategories()).toEqual(new Set([category]))
    expect(screen.getByRole('heading', { name: 'Placements en bourse' }).closest('[data-detail]')).toHaveClass('opacity-0', 'pointer-events-none')
    expect(mocks.replace).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(350))
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(`/categorie/${category}`)
    expect(mocks.push).not.toHaveBeenCalled()
  })

  test('a square of this category lights its line alone, opens its chapter and sets its row forth', () => {
    // The available money is told in chapters (current accounts, savings books).
    mocks.params.current = { id: 'available' }
    render(<CategoryPage />)
    const mine = squaresOf('available')
    expect(document.querySelector('[data-focused]')).toBeNull()
    fireEvent.click(mine[0])
    const lit = Array.from(grid().children).filter((s) => !s.hasAttribute('data-dim'))
    expect(lit.length).toBeGreaterThan(0)
    expect(lit.every((s) => s.getAttribute('data-category') === 'available')).toBe(true)
    expect(lit.length).toBeLessThan(mine.length)
    expect(document.querySelectorAll('[data-focused]')).toHaveLength(1)
    const row = document.querySelector('[data-focused]') as HTMLElement
    expect(row).toHaveClass('bg-field', 'rounded-control')
    const chapter = within(row.closest('div.border-t') as HTMLElement).getAllByRole('button')[0]
    expect(chapter).toHaveAttribute('aria-expanded', 'true')
    // Nothing leaves.
    act(() => vi.advanceTimersByTime(1_000))
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
    // The label above the grid is not swapped.
    expect(screen.getByText('Ce qui est vraiment à toi')).toBeInTheDocument()
  })

  test('the same square again puts the line out, the detail stays', () => {
    render(<CategoryPage />)
    const mine = squaresOf('markets')
    fireEvent.click(mine[0])
    fireEvent.click(mine[0])
    expect(litCategories()).toEqual(new Set(['markets']))
    expect(grid().querySelectorAll('[data-dim]')).toHaveLength(100 - mine.length)
    expect(document.querySelector('[data-focused]')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Placements en bourse' })).toBeInTheDocument()
  })

  // Nicolas, 10 November 2026: a touch anywhere outside the squares puts the line out, as it does
  // for the « Tu possèdes… » bubble; the detail stays, nothing leaves.
  test('a touch outside the squares puts the line out, the detail stays', () => {
    render(<CategoryPage />)
    const mine = squaresOf('markets')
    fireEvent.click(mine[0])
    expect(document.querySelector('[data-focused]')).not.toBeNull()
    fireEvent.pointerDown(screen.getByRole('heading', { name: 'Placements en bourse' }))
    expect(document.querySelector('[data-focused]')).toBeNull()
    expect(grid().querySelectorAll('[data-dim]')).toHaveLength(100 - mine.length)
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  test('a touch on a square is not a touch outside: another line of it still moves the line', () => {
    render(<CategoryPage />)
    const mine = squaresOf('markets')
    fireEvent.click(mine[0])
    fireEvent.pointerDown(mine[mine.length - 1])
    fireEvent.click(mine[mine.length - 1])
    expect(document.querySelectorAll('[data-focused]')).toHaveLength(1)
  })

  test('a square of another line of this category moves the line', () => {
    render(<CategoryPage />)
    const mine = squaresOf('markets')
    fireEvent.click(mine[0])
    const firstRow = document.querySelector('[data-focused]')
    // The last square of the category belongs to another line (the example has two or more).
    fireEvent.click(mine[mine.length - 1])
    const rows = document.querySelectorAll('[data-focused]')
    expect(rows).toHaveLength(1)
    expect(rows[0]).not.toBe(firstRow)
  })

  // The review of 9 November 2026: opened from its link with no square of its own, the grid went all dark.
  test('a category with no square in the grid lights nothing, and darkens nothing', () => {
    mocks.state.current = ready({ snapshot: typo })
    mocks.params.current = { id: 'property' }
    render(<CategoryPage />)
    expect(screen.getByRole('heading', { name: 'Immobilier' })).toBeInTheDocument()
    expect(squaresOf('property')).toHaveLength(0)
    expect(grid().querySelectorAll('[data-dim]')).toHaveLength(0)
  })

  test('with a rental, a square of Immobilier opens the group it belongs to, « En location » or « Pour y vivre »', () => {
    const withRental = profileOf(
      [account('c', 'current'), account('h', 'home'), account('r', 'home', { residence: 'rental' })],
      [line('cash', 'c'), line('home', 'h'), line('rent', 'r')],
    )
    const state = ready()
    if (state.status !== 'ready') throw new Error('ready expected')
    state.model.profile = loaded(withRental)
    // 20 squares of cash, then 20 of the rental, then 60 of Chez toi.
    state.model.snapshots = [loaded(snapshotOf([amountEntry('cash', 100_000), amountEntry('home', 300_000), amountEntry('rent', 100_000)]), 's0')]
    state.model.goals = [loaded({ schema: 1, validFrom: '2026-01-01', shares: { available: 50, secured: 0, markets: 0, gold: 0, rental: 50 } }, 'g0')]
    mocks.state.current = state
    mocks.params.current = { id: 'property' }
    render(<CategoryPage />)
    const group = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) })
    expect(group('Pour y vivre')).toHaveAttribute('aria-expanded', 'false')
    expect(group('En location')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('pas d’objectif')).toBeInTheDocument()
    expect(screen.getByText('pile à ton objectif (20 carrés)')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '20 carrés, objectif 20' })).toBeInTheDocument()
    const mine = squaresOf('property')
    // The first squares of Immobilier are the rental's.
    fireEvent.click(mine[0])
    expect(group('En location')).toHaveAttribute('aria-expanded', 'true')
    expect(group('Pour y vivre')).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(mine[mine.length - 1])
    expect(group('Pour y vivre')).toHaveAttribute('aria-expanded', 'true')
  })

  test('Escape puts a lit line out; without one it goes back to Mon argent', () => {
    render(<CategoryPage />)
    fireEvent.click(squaresOf('markets')[0])
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.querySelector('[data-focused]')).toBeNull()
    expect(mocks.push).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/')
  })

  test('Escape closes the « Tu possèdes… » bubble without leaving; the next one goes back', () => {
    render(<CategoryPage />)
    const label = screen.getByText('Ce qui est vraiment à toi')
    fireEvent.click(within(label.nextElementSibling as HTMLElement).getByRole('button'))
    expect(screen.getByText(/^Tu possèdes/)).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText(/^Tu possèdes/)).not.toBeInTheDocument()
    expect(mocks.push).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/')
  })
})

// B (Nicolas, 9 November 2026): « cliquer hors du carré doit le réinitialiser et l'afficher en
// entier ». A touch is a finger put down, then lifted: a click.
const tap = (element: Element) => {
  fireEvent.pointerDown(element)
  fireEvent.click(element)
}

describe.each(SIZES)('a category, %s: a touch outside the grid', (_, desktop) => {
  beforeEach(() => {
    mocks.desktop.current = desktop
  })

  test('on plain text, it goes back to Mon argent, where the grid is whole', () => {
    render(<CategoryPage />)
    tap(screen.getByText(/carrés sur 100/))
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/')
  })

  test('on the empty page around the detail, too', () => {
    render(<CategoryPage />)
    tap(screen.getByRole('heading', { name: 'Placements en bourse' }).closest('[data-detail]')!)
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/')
  })

  test('with a line lit, it goes back all the same', () => {
    render(<CategoryPage />)
    tap(squaresOf('markets')[0])
    expect(document.querySelector('[data-focused]')).not.toBeNull()
    tap(screen.getByText(/carrés sur 100/))
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/')
  })

  test('on the grid, a square or the room between two, it stays', () => {
    render(<CategoryPage />)
    tap(squaresOf('markets')[0])
    tap(grid())
    tap(grid().parentElement!)
    expect(mocks.push).not.toHaveBeenCalled()
  })

  test('on a chapter, a line, a link, a button of the detail, it stays', () => {
    mocks.params.current = { id: 'available' }
    render(<CategoryPage />)
    const chapter = screen.getByRole('button', { name: /Livrets/ })
    tap(chapter)
    expect(chapter).toHaveAttribute('aria-expanded', 'true')
    // Inside a link (the name of a line), on a link, on the € / % figure of a line, on another chapter.
    const block = chapter.closest('div.border-t') as HTMLElement
    const links = [...within(block).getAllByRole('link'), screen.getByRole('link', { name: '‹ Mon argent' })]
    for (const link of links) link.addEventListener('click', (event) => event.preventDefault())
    tap(links[0].firstElementChild!)
    tap(links[links.length - 1])
    const figure = within(within(block).getAllByRole('listitem')[0]).getByRole('button')
    tap(figure)
    expect(figure).toHaveTextContent(/%/)
    tap(screen.getByRole('button', { name: /Comptes courants/ }))
    expect(mocks.push).not.toHaveBeenCalled()
  })

  // The review of 9 November 2026: a tap inside a row or a chapter, off its link, left the detail.
  test('inside a line row or a chapter, off its link, it stays: the row’s edge, its small squares, the chapter’s sub-row', () => {
    mocks.params.current = { id: 'available' }
    render(<CategoryPage />)
    const chapter = screen.getByRole('button', { name: /Livrets/ })
    tap(chapter)
    const block = chapter.closest('div.border-t') as HTMLElement
    const row = within(block).getAllByRole('listitem')[0]
    tap(row)
    tap(within(row).getByRole('img', { name: /carrés?$/ }))
    tap(within(block).getByText(/1 ligne$/))
    expect(mocks.push).not.toHaveBeenCalled()
  })

  test('the touch that closes the « Tu possèdes… » bubble only closes it; the next one goes back', () => {
    render(<CategoryPage />)
    const label = screen.getByText('Ce qui est vraiment à toi')
    tap(within(label.nextElementSibling as HTMLElement).getByRole('button'))
    expect(screen.getByText(/^Tu possèdes/)).toBeInTheDocument()
    // On the bubble itself: it stays open, nothing leaves.
    tap(screen.getByText(/^Tu possèdes/))
    expect(mocks.push).not.toHaveBeenCalled()
    tap(label)
    expect(screen.queryByText(/^Tu possèdes/)).not.toBeInTheDocument()
    expect(mocks.push).not.toHaveBeenCalled()
    tap(label)
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/')
  })

  test('while another category is on its way, a touch elsewhere changes nothing', () => {
    render(<CategoryPage />)
    const other = firstOfOther('markets')
    tap(other)
    tap(screen.getByText(/carrés sur 100/))
    act(() => vi.advanceTimersByTime(1_000))
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(`/categorie/${other.getAttribute('data-category')}`)
  })

  test('text selected with the mouse is not a touch: it stays', () => {
    render(<CategoryPage />)
    const text = screen.getByText(/carrés sur 100/)
    window.getSelection()!.selectAllChildren(text)
    try {
      tap(text)
      expect(mocks.push).not.toHaveBeenCalled()
    } finally {
      window.getSelection()!.removeAllRanges()
    }
  })
})

// C (Nicolas, 9 November 2026): « le mouse over peut afficher les infos de la case survolée », in the
// line under the grid, not in a bubble.
describe('on a computer, the square under the mouse is told under the grid', () => {
  const told = () => document.querySelector('[data-told]')
  const sentence = () => screen.getByText(/^Un carré vaut/)
  const hover = () => userEvent.setup()
  // The mouse of user-event waits on real timers; nothing here waits on the page's own.
  beforeEach(() => {
    vi.useRealTimers()
  })

  test('on Mon argent: its line, its category, its figure; its row lights, the grid does not dim', async () => {
    const user = hover()
    render(<HomePage />)
    expect(told()).toBeNull()
    await user.hover(squaresOf('markets')[0])
    expect(plain(told()!.textContent!)).toBe('ETF · Placements en bourse · 25 000 €')
    expect(told()!.querySelector('.size-square-s.rounded-square')).toHaveClass('bg-cat-markets')
    // Said in the place of « Un carré vaut… », which keeps its room: nothing below moves.
    expect(sentence()).toHaveClass('invisible')
    expect(screen.getByRole('link', { name: /Placements en bourse/ }).closest('li')).toHaveClass('lg:bg-field')
    expect(grid().querySelectorAll('[data-dim]')).toHaveLength(0)
    await user.hover(squaresOf('markets')[squaresOf('markets').length - 1])
    expect(plain(told()!.textContent!)).toBe('Unité de compte · Placements en bourse · 5 000 €')
    // The mouse leaves the grid: everything as before.
    await user.unhover(grid())
    expect(told()).toBeNull()
    expect(sentence()).not.toHaveClass('invisible')
    expect(screen.getByRole('link', { name: /Placements en bourse/ }).closest('li')).not.toHaveClass('lg:bg-field')
  })

  test('with the amounts hidden, the figure reads « ••• », as in the detail', async () => {
    const user = hover()
    setAmountsHidden(true)
    try {
      render(<HomePage />)
      await user.hover(squaresOf('markets')[0])
      expect(plain(told()!.textContent!)).toBe('ETF · Placements en bourse · •••')
    } finally {
      setAmountsHidden(false)
    }
  })

  // The review of 9 November 2026: the house's figure is already net of its loan; said nowhere, it
  // reads as the house's value (Nicolas's ruling: « , crédit déduit » after the figure).
  test('a line a loan finances says that the loan is taken off', async () => {
    const user = hover()
    render(<HomePage />)
    await user.hover(squaresOf('property')[0])
    expect(plain(told()!.textContent!)).toBe('Maison · Immobilier · 120 000 €, crédit déduit')
    await user.hover(squaresOf('markets')[0])
    expect(plain(told()!.textContent!)).not.toContain('crédit')
  })

  test('in percent, the line’s percent, as the detail shows it', async () => {
    const user = hover()
    mocks.state.current = ready({ display: 'percent' })
    const model = (mocks.state.current as Extract<ModelState, { status: 'ready' }>).model
    const percent = categoryDetailView(model, 'markets', todayIso(), { quotes: {}, rates: null })!.lines.find((l) => l.lineId === 'etf')!.percent
    render(<HomePage />)
    await user.hover(squaresOf('markets')[0])
    expect(told()!.textContent).toBe(`ETF · Placements en bourse · ${percent}`)
    expect(told()!.textContent).not.toContain('€')
  })

  test('on a category’s page too, whichever category the square is of', async () => {
    const user = hover()
    render(<CategoryPage />)
    await user.hover(squaresOf('available')[0])
    expect(plain(told()!.textContent!)).toMatch(/^Compte courant · Argent disponible · \d/)
    // What is lit stays what it was: the category of the page.
    expect(litCategories()).toEqual(new Set(['markets']))
    await user.unhover(grid())
    expect(told()).toBeNull()
  })

  test('while the simulation is on screen, nothing is told: its squares are not their lines', async () => {
    const user = hover()
    render(<HomePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Montre-moi mes objectifs' }))
    await user.hover(screen.getByRole('img', { name: /^Simulation/ }).children[0])
    expect(told()).toBeNull()
  })

  test('on a phone, nothing is told', async () => {
    mocks.desktop.current = false
    const user = hover()
    render(<HomePage />)
    await user.hover(squaresOf('markets')[0])
    expect(told()).toBeNull()
  })
})

describe('the row of a lit line is brought into sight', () => {
  const scrolled = vi.fn()
  beforeEach(() => {
    scrolled.mockReset()
    Element.prototype.scrollIntoView = scrolled
  })
  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView
  })

  test('on a phone, below the grid: to the middle of the screen, smoothly', () => {
    mocks.desktop.current = false
    render(<CategoryPage />)
    fireEvent.click(squaresOf('markets')[0])
    expect(scrolled).toHaveBeenCalledExactlyOnceWith({ block: 'center', behavior: 'smooth' })
    expect(scrolled.mock.contexts[0]).toBe(document.querySelector('[data-focused]'))
  })

  test('on a phone with fewer animations asked, at once', () => {
    mocks.desktop.current = false
    fewerAnimations()
    render(<CategoryPage />)
    fireEvent.click(squaresOf('markets')[0])
    expect(scrolled).toHaveBeenCalledExactlyOnceWith({ block: 'center', behavior: 'auto' })
  })

  test('on a computer, beside the grid: only as far as it takes to see it', () => {
    render(<CategoryPage />)
    fireEvent.click(squaresOf('markets')[0])
    expect(scrolled).toHaveBeenCalledExactlyOnceWith({ block: 'nearest', behavior: 'smooth' })
  })
})

describe('a category, on a phone: Mon argent’s grid above the detail', () => {
  beforeEach(() => {
    mocks.desktop.current = false
    mocks.state.current = ready({ history: true })
  })

  const before = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

  test('the way back in the header row’s place, then the label, the total, the progress, the grid, then the detail', () => {
    render(<CategoryPage />)
    const backs = screen.getAllByRole('link', { name: '‹ Mon argent' })
    expect(backs).toHaveLength(1)
    const label = screen.getByText('Ce qui est vraiment à toi')
    const amount = label.nextElementSibling as HTMLElement
    const progress = screen.getByTestId('progress')
    const heading = screen.getByRole('heading', { name: 'Placements en bourse' })
    const order = [backs[0], label, amount, progress, grid(), heading]
    for (let i = 1; i < order.length; i++) expect(before(order[i - 1], order[i])).toBe(true)
    // The way back is not inside the detail: it is the page's first row, as Mon argent's header is.
    expect(heading.closest('[data-detail]')!.contains(backs[0])).toBe(false)
    expect(within(progress).getByText(/^depuis janvier/)).toBeInTheDocument()
    // The same fitted width as on Mon argent: the grid never goes under the tab bar.
    expect(grid().parentElement).toHaveStyle({ maxWidth: '280px' })
    // Its own category lit, as on a computer.
    expect(litCategories()).toEqual(new Set(['markets']))
  })

  test('on a computer the way back stays at the top of the detail, and the grid is not fitted', () => {
    mocks.desktop.current = true
    render(<CategoryPage />)
    const back = screen.getByRole('link', { name: '‹ Mon argent' })
    expect(screen.getByRole('heading', { name: 'Placements en bourse' }).closest('[data-detail]')!.contains(back)).toBe(true)
    expect(grid().parentElement).not.toHaveStyle({ maxWidth: '280px' })
  })
})
