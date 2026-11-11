// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cushionArrival, recoverArrival } from '@/lib/app/arrival'
import type { Model, ModelState } from '@/lib/app/use-model'
import { account, amountEntry, line, snapshotOf, unitsEntry } from '@/lib/model/__tests__/fixtures'
import type { Account, Establishment, Line, Profile, Settings, Snapshot } from '@/lib/model/types'
import type { MarketState } from '@/lib/market/use-market'
import ReperesPage from '../reperes/page'

const mocks = vi.hoisted(() => ({
  state: { current: { status: 'loading' } as ModelState },
  replace: vi.fn(),
  market: { current: { status: 'ready', market: { quotes: {}, rates: null }, retry: vi.fn() } as MarketState },
}))

vi.mock('@/lib/app/use-model', () => ({ useModel: () => mocks.state.current }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('@/lib/market/use-market', () => ({ useMarket: () => mocks.market.current }))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}))

const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const plain = (text: string | null) => text?.replace(/[  ]/g, ' ') ?? ''

const establishments: Establishment[] = [
  { id: 'a', name: 'Banque A', kind: 'institution' },
  { id: 'h', name: 'Chez toi', kind: 'home' },
]
const accounts: Account[] = [
  { ...account('cur', 'current'), establishmentId: 'a' },
  { ...account('house', 'home'), establishmentId: 'h' },
  { ...account('loan', 'loan', { name: 'Crédit', financedLineId: 'house-line' }), establishmentId: 'a' },
  { ...account('pea', 'pea'), establishmentId: 'a' },
]
const lines: Line[] = [
  line('cur-line', 'cur'),
  line('house-line', 'house'),
  line('loan-line', 'loan'),
  line('x1', 'pea', { kind: 'units', name: 'Fonds' }),
]
const profile: Profile = { schema: 1, establishments, accounts, lines }
const snapshot: Snapshot = snapshotOf([
  amountEntry('cur-line', 11_000),
  amountEntry('house-line', 200_000),
  amountEntry('loan-line', 100_000),
  unitsEntry('x1', 10, 100, null),
])

function ready(options: { budget?: boolean; monthly?: number; unreadableSnapshots?: number; snapshots?: Snapshot[] } = {}): ModelState {
  const settings: Settings | null = options.budget
    ? { schema: 1, budget: { basis: 'expenses', monthly: options.monthly ?? 200_000 }, display: 'euros', hideAmounts: false }
    : null
  const model: Model = {
    profile: loaded(profile),
    snapshots: (options.snapshots ?? [snapshot]).map((s, i) => loaded(s, `s${i}`)),
    goals: [],
    settings: settings ? loaded(settings) : null,
    draft: null,
    unreadable: { profile: 0, snapshots: options.unreadableSnapshots ?? 0, goals: 0, settings: 0, draft: 0 },
  }
  return { status: 'ready', model, client: {} as never, dataKey: {} as CryptoKey, reload: vi.fn() }
}

beforeEach(() => {
  mocks.state.current = { status: 'loading' }
  mocks.replace.mockReset()
  mocks.market.current = { status: 'ready', market: { quotes: {}, rates: null }, retry: vi.fn() }
})
afterEach(cleanup)

test('the four sections come in the order of the spec', () => {
  mocks.state.current = ready({ budget: true })
  render(<ReperesPage />)
  expect(screen.getByRole('heading', { level: 1, name: 'Repères' })).toBeInTheDocument()
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
    'Ton coussin de sécurité',
    'Ce que tu peux récupérer vite',
    'Bon à savoir',
    'Où est ton argent',
  ])
})

test('B7: the grid of what can be had back has medium squares, the same as the cushion and Évolution', () => {
  mocks.state.current = ready({})
  render(<ReperesPage />)
  expect(screen.getByRole('img', { name: /se récupèrent vite/ }).className).toContain('var(--spacing-square-m)')
  for (const month of document.querySelectorAll('[data-month]')) expect(month.className).toContain('size-square-m')
})

test('the cushion: twelve squares, five and a half filled, and the 3 to 6 months line', () => {
  mocks.state.current = ready({ budget: true })
  const { container } = render(<ReperesPage />)
  expect(screen.getByText(/couvrirait environ 5 mois et demi de dépenses\./)).toBeInTheDocument()
  expect(container.querySelectorAll('[data-month]')).toHaveLength(12)
  expect(container.querySelectorAll('[data-fill="full"]')).toHaveLength(5)
  expect(container.querySelectorAll('[data-fill="half"]')).toHaveLength(1)
  const zone = screen.getByText("3 à 6 mois : le repère le plus courant")
  expect(zone).toBeInTheDocument()
  // Under the boxes: a white trait under months 4 to 6, the reference (11 November 2026), and its
  // sentence on one line from the trait's start, never squeezed into its three columns (C14).
  const boxes = container.querySelector('[data-month]')!.parentElement!
  expect(boxes.compareDocumentPosition(zone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  const trait = container.querySelector('[data-zone]')!
  expect(trait.className).toMatch(/\bcol-start-4 col-end-7\b/)
  expect(trait.className).toContain('bg-ink')
  expect(trait.getAttribute('aria-hidden')).toBe('true')
  expect(zone.className).toMatch(/\bcol-start-4 col-end-13\b/)
  expect(zone.className).toContain('whitespace-nowrap')
  // Up to twelve months, the boxes say it all.
  expect(screen.queryByText(/^\+/)).toBeNull()
})

test('past twelve months, the boxes are all full and the end of the row says how much more', () => {
  mocks.state.current = ready({ budget: true, monthly: 57_800 })
  const { container } = render(<ReperesPage />)
  expect(screen.getByText(/couvrirait environ 19 mois de dépenses\./)).toBeInTheDocument()
  expect(container.querySelectorAll('[data-fill="full"]')).toHaveLength(12)
  expect(plain(screen.getByText(/^\+/).textContent)).toBe('+ 7 mois')
})

test('without a budget, the section says how to get it and shows no squares', () => {
  mocks.state.current = ready()
  const { container } = render(<ReperesPage />)
  expect(screen.getByText('Indique tes dépenses dans les Réglages pour le calculer.')).toBeInTheDocument()
  expect(container.querySelectorAll('[data-month]')).toHaveLength(0)
  expect(screen.queryByText(/0 mois/)).toBeNull()
})

test('what can be had back quickly: a grid of 100 squares, lit or dimmed', () => {
  mocks.state.current = ready({ budget: true })
  const { container } = render(<ReperesPage />)
  expect(container.querySelectorAll('[data-lit], [data-dim]')).toHaveLength(100)
  expect(container.querySelectorAll('[data-dim]').length).toBeGreaterThan(0)
  expect(container.querySelectorAll('[data-lit]').length).toBeGreaterThan(0)
  // A dimmed square keeps its category's colour, at low opacity.
  const dim = container.querySelectorAll('[data-dim]')[0].className
  expect(dim).toMatch(/bg-cat-[a-z]+\/20/)
  expect(dim).not.toContain('bg-field')
  expect(plain(screen.getByRole('region', { name: 'Ce que tu peux récupérer vite' }).textContent)).toContain('Le reste est dans ton logement')
})

test('the key under the grid shows exactly what is drawn: the same colours, lit and dimmed, no white square', () => {
  mocks.state.current = ready({ budget: true })
  const { container } = render(<ReperesPage />)
  const classesOf = (selector: string) => [...container.querySelectorAll(selector)].map((el) => el.className)
  const colour = (className: string) => className.match(/bg-cat-[a-z]+(\/20)?/)?.[0]
  const litInGrid = new Set(classesOf('[data-lit]').map(colour))
  const dimInGrid = new Set(classesOf('[data-dim]').map(colour))
  const litInKey = classesOf('[data-key="lit"] i').map(colour)
  const dimInKey = classesOf('[data-key="dim"] i').map(colour)
  expect(litInKey.length).toBeGreaterThan(0)
  expect(new Set(litInKey)).toEqual(litInGrid)
  expect(new Set(dimInKey)).toEqual(dimInGrid)
  expect(container.querySelector('[data-key] i.bg-ink')).toBeNull()
})

test('where the money is: Banque A with its bar and its loan, Chez toi last without a bar', () => {
  mocks.state.current = ready({ budget: true })
  render(<ReperesPage />)
  const section = screen.getByRole('region', { name: 'Où est ton argent' })
  const items = within(section).getAllByRole('listitem')
  expect(items).toHaveLength(2)
  expect(items[0]).toHaveTextContent('Banque A')
  expect(plain(items[0].textContent)).toContain('Crédit')
  expect(plain(items[0].textContent)).toContain('100 000 € à rembourser')
  expect(items[0].querySelectorAll('[class*="bg-cat-"]').length).toBeGreaterThan(0)
  expect(items[1]).toHaveTextContent('Chez toi')
  expect(items[1].querySelectorAll('[class*="bg-cat-"]')).toHaveLength(0)
})

test('nothing on the page is red, the loan included', () => {
  mocks.state.current = ready({ budget: true })
  const { container } = render(<ReperesPage />)
  expect(container.innerHTML).not.toContain('text-loss')
  expect(container.innerHTML).not.toContain('bg-loss')
})

test('the tab bar has Repères as the current tab, and links the others', () => {
  mocks.state.current = ready({ budget: true })
  render(<ReperesPage />)
  expect(screen.getByRole('link', { name: 'Repères' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'Repères' })).toHaveAttribute('href', '/reperes')
  expect(screen.getByRole('link', { name: 'Mon argent' })).toHaveAttribute('href', '/')
})

test('part of the figures unreadable: it is said, nothing else is drawn', () => {
  mocks.state.current = ready({ unreadableSnapshots: 1 })
  render(<ReperesPage />)
  expect(screen.getByText('Une partie de tes chiffres n’a pas pu être lue. Rien n’a été effacé.')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
})

test('a first launch not finished: where one is and « Continuer », like Mon argent and Évolution', () => {
  const firstLaunch = { complete: false, finished: [] as string[], planned: [] as string[] }
  const state = ready({ budget: true })
  if (state.status !== 'ready') throw new Error('not ready')
  mocks.state.current = { ...state, model: { ...state.model, profile: loaded({ ...profile, firstLaunch }) } }
  render(<ReperesPage />)
  expect(screen.getByText(/Il te reste \d+ (banques? à ajouter|étapes? avant ta grille)/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Continuer' })).toHaveAttribute('href', '/premier-lancement/etape')
  expect(screen.queryByRole('heading', { level: 2, name: 'Ton coussin' })).toBeNull()
  expect(mocks.replace).not.toHaveBeenCalled()
})

test('nothing to read yet: Mon argent decides what to do', () => {
  mocks.state.current = ready({ snapshots: [] })
  render(<ReperesPage />)
  expect(mocks.replace).toHaveBeenCalledWith('/')
})

test('nothing is drawn while the market is awaited', () => {
  mocks.state.current = ready({ budget: true })
  mocks.market.current = { status: 'loading' }
  render(<ReperesPage />)
  expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
})

test('a load that fails offers to try again', () => {
  const retry = vi.fn()
  mocks.state.current = { status: 'failed', retry }
  render(<ReperesPage />)
  expect(screen.getByRole('alert')).toHaveTextContent('Tes chiffres n’ont pas pu être chargés.')
  expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
})

// Two motions of the squares (Nicolas, 10 November 2026), each played once per page load, the first
// time its squares come into view.
describe('the motions of Repères', () => {
  // What the browser would say once the squares are in view.
  let watched: Array<{ element: Element; tell: (entries: Array<{ isIntersecting: boolean; intersectionRatio: number; target: Element }>) => void; options?: IntersectionObserverInit }> = []
  // `ratio`: the share of the squares the browser says is in view (1: all of them).
  const comeIntoView = (element: Element, ratio = 1) =>
    act(() => {
      for (const w of watched.filter((w) => w.element === element))
        w.tell([{ isIntersecting: ratio > 0, intersectionRatio: ratio, target: element }])
    })
  const months = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>('[data-month] i'))
  const recoverGrid = () => screen.getByRole('img', { name: /se récupèrent vite/ })
  const dimSquares = () => Array.from(recoverGrid().querySelectorAll<HTMLElement>('[data-dim]'))

  beforeEach(() => {
    watched = []
    cushionArrival.reset()
    recoverArrival.reset()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(
          private tell: (entries: Array<{ isIntersecting: boolean; intersectionRatio: number; target: Element }>) => void,
          private options?: IntersectionObserverInit,
        ) {}
        observe(element: Element) {
          watched.push({ element, tell: this.tell, options: this.options })
        }
        disconnect() {
          watched = watched.filter((w) => w.tell !== this.tell)
        }
        unobserve() {}
        takeRecords() {
          return []
        }
      },
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('the cushion: empty outlines until seen, then each covered month fills, left to right, 80 ms apart', () => {
    mocks.state.current = ready({ budget: true })
    const { container } = render(<ReperesPage />)
    const boxes = container.querySelector('[data-month]')!.parentElement!
    // Before: the covered months are still empty outlines; the reference is there from the start.
    expect(months(container).slice(0, 6).every((i) => i.style.transform === 'scaleX(0)')).toBe(true)
    expect(screen.getByText('3 à 6 mois : le repère le plus courant')).toBeInTheDocument()
    comeIntoView(boxes)
    const fills = months(container)
    // After: exactly today's look (5 full, a half, 6 empty), each one in 350 ms with the curve to enter.
    expect(fills.every((i) => i.style.transform === '')).toBe(true)
    expect(fills.map((i) => i.style.width)).toEqual([...Array(5).fill('100%'), '50%', ...Array(6).fill('0%')])
    expect(fills.slice(0, 6).map((i) => i.style.transitionDelay)).toEqual(['0ms', '80ms', '160ms', '240ms', '320ms', '400ms'])
    expect(fills[0].className).toContain('duration-(--motion-mid)')
    expect(fills[0].className).toContain('ease-(--motion-enter)')
  })

  // 10 November 2026: on a phone, the squares just under the fold, or hidden behind the tab bar, are
  // not seen: the motion waits until they are all on screen, above the tab bar.
  test('nothing moves while the squares are only partly in view, or behind the tab bar', () => {
    mocks.state.current = ready({ budget: true })
    const { container } = render(<ReperesPage />)
    const boxes = container.querySelector('[data-month]')!.parentElement!
    comeIntoView(boxes, 0.4)
    comeIntoView(recoverGrid(), 0.4)
    expect(months(container).slice(0, 6).every((i) => i.style.transform === 'scaleX(0)')).toBe(true)
    expect(dimSquares().every((s) => !s.className.includes('/20'))).toBe(true)
    // The view the browser watches leaves out the bottom, where the tab bar lies.
    const options = watched.find((w) => w.element === boxes)!.options!
    expect(Array.isArray(options.threshold) ? options.threshold[0] : options.threshold).toBeGreaterThanOrEqual(0.99)
    expect(options.rootMargin).toMatch(/^0px 0px -\d+px 0px$/)
    comeIntoView(boxes)
    expect(months(container).every((i) => i.style.transform === '')).toBe(true)
  })

  test('the cushion fills once per page load: coming back to Repères shows it full at once', () => {
    mocks.state.current = ready({ budget: true })
    const first = render(<ReperesPage />)
    comeIntoView(first.container.querySelector('[data-month]')!.parentElement!)
    cleanup()
    const { container } = render(<ReperesPage />)
    const fills = months(container)
    expect(fills.every((i) => i.style.transform === '' && i.style.transitionDelay === '')).toBe(true)
    expect(fills[0].style.width).toBe('100%')
  })

  test('what is not had back quickly: lit at first, held 400 ms, then it dims one by one from the end, the dimming itself (hold excluded) under 1.2 s', () => {
    mocks.state.current = ready({ budget: true })
    render(<ReperesPage />)
    const dims = dimSquares()
    expect(dims.length).toBeGreaterThan(1)
    // Before: the whole grid lit, in each category's full colour.
    expect(dims.every((s) => /bg-cat-[a-z]+(\s|$)/.test(s.className) && !s.className.includes('/20'))).toBe(true)
    comeIntoView(recoverGrid())
    // After: exactly today's look, the last square first.
    expect(dims.every((s) => /bg-cat-[a-z]+\/20/.test(s.className))).toBe(true)
    const delays = dims.map((s) => parseFloat(s.style.transitionDelay))
    for (let k = 1; k < delays.length; k++) {
      const gap = delays[k - 1] - delays[k]
      expect(gap).toBeGreaterThan(0)
      expect(gap).toBeLessThanOrEqual(20)
    }
    // The hold, then the dimming: the ceiling counts from the first square dimmed to the last.
    expect(delays[delays.length - 1]).toBe(400)
    expect(delays[0] - delays[delays.length - 1] + 350).toBeLessThanOrEqual(1200)
    expect(dims[0].className).toContain('ease-(--motion-leave)')
    // The lit squares never move.
    expect(Array.from(recoverGrid().querySelectorAll<HTMLElement>('[data-lit]')).every((s) => s.style.transitionDelay === '')).toBe(true)
  })

  test('with fewer animations asked, both are in their final state at once, with no motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    mocks.state.current = ready({ budget: true })
    const { container } = render(<ReperesPage />)
    const fills = months(container)
    expect(fills.every((i) => i.style.transform === '' && i.style.transitionDelay === '')).toBe(true)
    expect(fills[0].className).not.toContain('duration-')
    expect(dimSquares().every((s) => /\/20/.test(s.className) && s.style.transitionDelay === '' && !s.className.includes('duration-'))).toBe(true)
  })
})
