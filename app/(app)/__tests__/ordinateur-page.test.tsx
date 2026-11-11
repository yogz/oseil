// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { GOAL_PRESETS } from '@/lib/catalog'
import type { Model, ModelState } from '@/lib/app/use-model'
import { setAmountsHidden } from '@/lib/format'
import { exampleProfile, exampleSnapshot } from '@/lib/model/__tests__/fixtures'
import type { GoalAllocation, Settings, Snapshot } from '@/lib/model/types'
import type { MarketState } from '@/lib/market/use-market'
import CategoryPage from '../categorie/[id]/page'
import HomePage from '../page'

const mocks = vi.hoisted(() => ({
  state: { current: { status: 'loading' } as ModelState },
  params: { current: { id: 'markets' } as { id: string } },
  desktop: { current: true },
  market: { current: { status: 'ready', market: { quotes: {}, rates: null }, retry: vi.fn() } as MarketState },
}))

vi.mock('@/lib/app/use-model', () => ({ useModel: () => mocks.state.current }))
vi.mock('@/lib/app/use-desktop', () => ({ useIsDesktop: () => mocks.desktop.current }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
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
const earlier: Snapshot = { ...exampleSnapshot, takenOn: '2026-01-31' }

function ready({ history = false, budget = false }: { history?: boolean; budget?: boolean } = {}): ModelState {
  const settings: Settings | null = budget
    ? { schema: 1, display: 'euros', hideAmounts: false, budget: { basis: 'expenses', monthly: 200_000 } }
    : null
  const model: Model = {
    profile: loaded(exampleProfile),
    snapshots: history ? [loaded(earlier, 's0'), loaded(exampleSnapshot, 's1')] : [loaded(exampleSnapshot, 's1')],
    goals: [loaded(balanced, 'g0')],
    settings: settings ? loaded(settings, 'set0') : null,
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
  }
  return { status: 'ready', model, client: {} as never, dataKey: {} as CryptoKey, reload: vi.fn() }
}

beforeEach(() => {
  mocks.desktop.current = true
  mocks.params.current = { id: 'markets' }
  mocks.market.current = { status: 'ready', market: { quotes: {}, rates: null }, retry: vi.fn() }
  mocks.state.current = ready()
})
afterEach(cleanup)

const squares = (container: HTMLElement) => Array.from(container.querySelectorAll('[data-category]'))
const dimmed = (container: HTMLElement) => squares(container).filter((s) => s.className.includes('opacity-25'))

test('Mon argent is in two columns from lg: the figures and the grid on the left, the list on the right', () => {
  const { container } = render(<HomePage />)
  const columns = container.querySelector('[data-columns]')!
  expect(columns).toHaveClass('lg:grid', 'lg:grid-cols-2')
  expect(columns.children).toHaveLength(2)
  const [left, right] = Array.from(columns.children) as HTMLElement[]
  expect(within(left).getByText('Ce qui est vraiment à toi')).toBeInTheDocument()
  expect(within(left).getByRole('img', { name: /^Ta grille/ })).toBeInTheDocument()
  expect(within(right).getByRole('link', { name: /Immobilier/ })).toBeInTheDocument()
  expect(within(left).queryByRole('link', { name: /Immobilier/ })).not.toBeInTheDocument()
})

test('a row lights up under the mouse and its squares light up in the grid, the others fade', async () => {
  const user = userEvent.setup()
  const { container } = render(<HomePage />)
  expect(dimmed(container)).toHaveLength(0)
  const row = screen.getByRole('link', { name: /Placements en bourse/ }).closest('li')!
  await user.hover(row)
  const markets = squares(container).filter((s) => s.getAttribute('data-category') === 'markets')
  expect(markets.length).toBeGreaterThan(0)
  expect(dimmed(container)).toHaveLength(100 - markets.length)
  expect(markets.every((s) => !s.className.includes('opacity-25'))).toBe(true)
  expect(row).toHaveClass('lg:bg-field')
  await user.unhover(row)
  expect(dimmed(container)).toHaveLength(0)
  expect(row).not.toHaveClass('lg:bg-field')
})

test('the glance cards lead to Repères and Évolution', () => {
  mocks.state.current = ready({ history: true, budget: true })
  render(<HomePage />)
  const cushion = screen.getByRole('link', { name: /Ton coussin de sécurité/ })
  expect(cushion).toHaveAttribute('href', '/reperes')
  expect(cushion).toHaveTextContent(/mois/)
  const progress = screen.getByRole('link', { name: /Depuis janvier 2026/ })
  expect(progress).toHaveAttribute('href', '/evolution')
  expect(progress).toHaveTextContent(/sur ce qui est à toi/)
})

test('without a budget the cushion card says what Repères says; with one snapshot there is no progress card', () => {
  render(<HomePage />)
  const cushion = screen.getByRole('link', { name: /Ton coussin de sécurité/ })
  expect(cushion).toHaveTextContent('Indique tes dépenses dans les Réglages pour le calculer.')
  expect(screen.queryByRole('link', { name: /Depuis/ })).not.toBeInTheDocument()
})

test('on a phone the glance cards are not there', () => {
  mocks.desktop.current = false
  mocks.state.current = ready({ history: true, budget: true })
  render(<HomePage />)
  expect(screen.queryByRole('link', { name: /Ton coussin de sécurité/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Depuis janvier/ })).not.toBeInTheDocument()
})

test('with the amounts hidden the glance cards show no amount either', () => {
  mocks.state.current = ready({ history: true, budget: true })
  setAmountsHidden(true)
  try {
    render(<HomePage />)
    expect(screen.getByRole('link', { name: /Depuis janvier 2026/ })).toBeInTheDocument()
    expect(screen.queryByText(/€/)).not.toBeInTheDocument()
  } finally {
    setAmountsHidden(false)
  }
})

test('a category keeps the left column, with its own squares lit, and the detail takes the right', () => {
  const { container } = render(<CategoryPage />)
  const columns = container.querySelector('[data-columns]')!
  expect(columns).toHaveClass('lg:grid', 'lg:grid-cols-2')
  const [left, right] = Array.from(columns.children) as HTMLElement[]
  expect(within(left).getByText('Ce qui est vraiment à toi')).toBeInTheDocument()
  expect(within(left).getByRole('img', { name: /^Ta grille/ })).toBeInTheDocument()
  expect(within(right).getByRole('heading', { name: 'Placements en bourse' })).toBeInTheDocument()
  expect(within(right).getByRole('link', { name: '‹ Mon argent' })).toHaveAttribute('href', '/')
  const markets = squares(container).filter((s) => s.getAttribute('data-category') === 'markets')
  expect(dimmed(container)).toHaveLength(100 - markets.length)
})

// 9 November 2026 (Nicolas): on a phone, Mon argent's grid stays above the detail, stacked.
test('on a phone the category page shows the same grid first, its own squares lit, the detail under it', () => {
  mocks.desktop.current = false
  const { container } = render(<CategoryPage />)
  const columns = container.querySelector('[data-columns]')!
  const [first, second] = Array.from(columns.children) as HTMLElement[]
  expect(within(first).getByText('Ce qui est vraiment à toi')).toBeInTheDocument()
  expect(within(first).getByRole('img', { name: /^Ta grille/ })).toBeInTheDocument()
  expect(within(second).getByRole('heading', { name: 'Placements en bourse' })).toBeInTheDocument()
  const markets = squares(container).filter((s) => s.getAttribute('data-category') === 'markets')
  expect(dimmed(container)).toHaveLength(100 - markets.length)
})

test('on a phone, focusing a row leaves the grid undimmed', async () => {
  mocks.desktop.current = false
  const user = userEvent.setup()
  const { container } = render(<HomePage />)
  const link = screen.getByRole('link', { name: /Placements en bourse/ })
  await user.tab()
  link.focus()
  await user.hover(link.closest('li')!)
  expect(dimmed(container)).toHaveLength(0)
})

test('on a phone, a finger on a row lights its squares while it rests there; the link still opens the detail', async () => {
  mocks.desktop.current = false
  const user = userEvent.setup()
  const { container } = render(<HomePage />)
  const link = screen.getByRole('link', { name: /Placements en bourse/ })
  const markets = squares(container).filter((s) => s.getAttribute('data-category') === 'markets')
  await user.pointer({ keys: '[TouchA>]', target: link })
  expect(dimmed(container)).toHaveLength(100 - markets.length)
  expect(markets.every((s) => !s.className.includes('opacity-25'))).toBe(true)
  await user.pointer({ keys: '[/TouchA]', target: link })
  expect(dimmed(container)).toHaveLength(0)
  expect(link).toHaveAttribute('href', '/categorie/markets')
})

test('a category whose board has no grid keeps the detail in the reading column, nothing on its left (B6)', () => {
  mocks.state.current = ready()
  const model = (mocks.state.current as Extract<ModelState, { status: 'ready' }>).model
  // A loan bigger than everything held: no grid, but the markets still open their detail.
  const entries = exampleSnapshot.entries.map((e) =>
    e.lineId === 'mortgage-line' && e.kind === 'amount' ? { ...e, amount: 100_000_000_00 } : e,
  )
  model.snapshots = [loaded({ ...exampleSnapshot, entries }, 's1')]
  const { container } = render(<CategoryPage />)
  const columns = container.querySelector('[data-columns]')!
  const [left, right] = Array.from(columns.children) as HTMLElement[]
  expect(left).toBeEmptyDOMElement()
  expect(container.querySelectorAll('[data-square]')).toHaveLength(0)
  expect(right.textContent).not.toBe('')
})
