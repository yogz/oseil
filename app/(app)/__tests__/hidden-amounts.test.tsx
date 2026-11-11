// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Model, ModelState } from '@/lib/app/use-model'
import { CATEGORY_ORDER, GOAL_PRESETS } from '@/lib/catalog'
import { setAmountsHidden } from '@/lib/format'
import type { MarketState } from '@/lib/market/use-market'
import { exampleProfile, exampleSnapshot } from '@/lib/model/__tests__/fixtures'
import type { GoalAllocation, Profile, Settings, Snapshot } from '@/lib/model/types'
import type { UpdateState } from '@/lib/update/use-update'
import { confirmLine, markStep, setTakenOn, setValue, startDraft } from '@/lib/update/draft'
import { setContribution } from '@/lib/update/lines'
import HomePage from '../page'
import CategoryPage from '../categorie/[id]/page'
import EvolutionPage from '../evolution/page'
import LinePage from '../ligne/[id]/page'
import ReperesPage from '../reperes/page'
import SettingsPage from '../reglages/page'
import TitlesPage from '../titres/page'
import ResultPage from '../mise-a-jour/resultat/page'

// Rule 12 of the finishing pass: « Masquer les montants » covers every amount of every screen
// that is not a box to fill in, without exception. Each read-only screen is drawn twice: with
// its figures (so the check cannot pass on an empty screen), then hidden. A figure followed by
// a currency sign is an amount; none may be left. An oversight (Évolution once let « D'où ça
// vient » through) is caught here, whatever screen it is on.

const mocks = vi.hoisted(() => ({
  state: { current: { status: 'loading' } as ModelState },
  params: { current: { id: 'markets' } as { id: string } },
  update: { current: null as unknown },
  market: { current: null as unknown as MarketState },
}))

vi.mock('@/lib/app/use-model', () => ({ useModel: () => mocks.state.current }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useParams: () => mocks.params.current,
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/market/use-market', () => ({ useMarket: () => mocks.market.current }))
vi.mock('@/components/update/UpdateProvider', () => ({
  useUpdateScreen: () => ({ state: mocks.update.current, current: null, show: vi.fn() }),
}))
vi.mock('@/lib/dates', async (original) => ({ ...(await original<typeof import('@/lib/dates')>()), todayIso: () => '2026-11-07' }))
vi.mock('@/lib/auth/face-id', () => ({ listFaceIdKeys: async () => [], removeFaceIdKey: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ createBrowserSupabase: () => ({}) }))
vi.mock('@/lib/vault/device', () => ({ indexedDbKeyStore: () => ({}) }))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props} />,
}))

const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const balanced: GoalAllocation = { schema: 1, validFrom: '2026-01-01', shares: GOAL_PRESETS.balanced.shares }
const settings: Settings = { schema: 1, budget: { basis: 'expenses', monthly: 200_000 }, display: 'euros', hideAmounts: false }
const older: Snapshot = { ...exampleSnapshot, takenOn: '2026-06-30' }
// The ETF follows a price: today's price is on the screens too.
const followed: Profile = {
  ...exampleProfile,
  lines: exampleProfile.lines.map((l) => (l.id === 'etf' ? { ...l, quoteSymbol: 'CW8.PA' } : l)),
}
const MARKET: MarketState = {
  status: 'ready',
  market: { quotes: { 'CW8.PA': { price: 260, currency: 'EUR', asOf: '2026-11-06' } }, rates: null },
  retry: () => {},
}
const client = { auth: { getUser: async () => ({ data: { user: { email: 'a@example.com' } } }) } } as never

function ready(profile: Profile = followed, snapshots: Snapshot[] = [exampleSnapshot]): ModelState {
  const model: Model = {
    profile: loaded(profile, 'p0'),
    snapshots: snapshots.map((s, i) => loaded(s, `s${i}`)),
    goals: [loaded(balanced, 'g0')],
    settings: loaded(settings, 'st0'),
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
  }
  return { status: 'ready', model, client, dataKey: {} as CryptoKey, reload: vi.fn() }
}

function result(): UpdateState {
  const today = '2026-11-07'
  let draft = setTakenOn(startDraft('s1'), today)
  draft = setValue(draft, exampleSnapshot, 'livret-a-line', { kind: 'amount', amount: 1_300_000 }, today, {})
  draft = setValue(draft, exampleSnapshot, 'etf', { kind: 'units', units: 100, unitPrice: 260, averagePrice: 200 }, today, {})
  draft = setValue(draft, exampleSnapshot, 'mortgage-line', { kind: 'amount', amount: 17_890_000 }, today, {})
  draft = setContribution(draft, 'life', 50_000)
  draft = confirmLine(draft, 'house-line')
  draft = ['home', 'boursobank', 'linxea'].reduce((d, step) => markStep(d, step, 'done'), draft)
  return {
    status: 'ready',
    session: {
      profile: exampleProfile,
      base: { id: 's1', value: exampleSnapshot, updatedAt: '' },
      draft,
      market: { prices: {}, rates: null },
      failedPrices: [],
      retryMarket: vi.fn(),
      saved: true,
      change: vi.fn(),
      save: vi.fn(),
      abandon: async () => true,
      settled: async () => true,
      resave: async () => true,
      saveError: null,
    },
  } as unknown as UpdateState
}

// A figure followed by a currency: « 25 739 € », « 1 200 $US », « 10,39 £GB », « 3 CHF ».
const AMOUNT = /\d[\s  ]*(?:€|\$|£|CHF)/g

// Each amount left, with the words around it, so the failure says where it is.
function amountsIn(text: string | null): string[] {
  const found: string[] = []
  for (const match of (text ?? '').matchAll(AMOUNT)) {
    const at = match.index ?? 0
    found.push(`«${(text ?? '').slice(Math.max(0, at - 40), at + match[0].length + 10)}»`)
  }
  return found
}

type Screen = { name: string; draw: () => void; page: () => React.ReactElement }
const SCREENS: Screen[] = [
  { name: 'Mon argent', draw: () => (mocks.state.current = ready()), page: () => <HomePage /> },
  ...CATEGORY_ORDER.map((id) => ({
    name: `le détail « ${id} »`,
    draw: () => {
      mocks.state.current = ready()
      mocks.params.current = { id }
    },
    page: () => <CategoryPage />,
  })),
  ...['etf', 'life-uc', 'livret-a-line', 'house-line', 'mortgage-line'].map((id) => ({
    name: `la fiche de « ${id} »`,
    draw: () => {
      mocks.state.current = ready()
      mocks.params.current = { id }
    },
    page: () => <LinePage />,
  })),
  { name: 'Tes titres', draw: () => (mocks.state.current = ready()), page: () => <TitlesPage /> },
  { name: 'Repères', draw: () => (mocks.state.current = ready()), page: () => <ReperesPage /> },
  { name: 'Évolution', draw: () => (mocks.state.current = ready(followed, [older, exampleSnapshot])), page: () => <EvolutionPage /> },
  { name: 'Réglages', draw: () => (mocks.state.current = ready()), page: () => <SettingsPage /> },
]

beforeEach(() => {
  mocks.market.current = MARKET
})
afterEach(() => {
  cleanup()
  setAmountsHidden(false)
})

describe('Masquer les montants', () => {
  test.each(SCREENS)('$name: figures shown, then not one amount left once hidden', ({ draw, page }) => {
    draw()
    setAmountsHidden(false)
    const shown = render(page())
    expect(amountsIn(shown.container.textContent).length).toBeGreaterThan(0)
    cleanup()

    setAmountsHidden(true)
    draw()
    const hidden = render(page())
    expect(amountsIn(hidden.container.textContent)).toEqual([])
    expect(hidden.container.textContent).toContain('•••')
  })

  // The result of the update is the last check of an entry flow: what was just typed is checked
  // there, so it always shows its figures, like the boxes it comes from.
  test('the result of the update is a check of what was typed: its figures stay, hidden or not', () => {
    setAmountsHidden(true)
    mocks.update.current = result()
    const { container } = render(<ResultPage />)
    expect(amountsIn(container.textContent).length).toBeGreaterThan(0)
    expect(container.textContent).not.toContain('•••')
  })
})
