// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Model, ModelState } from '@/lib/app/use-model'
import type { MarketState } from '@/lib/market/use-market'
import { account, line, snapshotOf, unitsEntry } from '@/lib/model/__tests__/fixtures'
import type { Account, Establishment, Line, Profile, Snapshot } from '@/lib/model/types'
import { FIND_EMPTY, FIND_FOOTER, FIND_NONE } from '@/lib/screens/find-words'
import { forgetFromInside, markFromInside } from '@/lib/app/find-entry'
import FindPage from '../trouver/page'

const mocks = vi.hoisted(() => ({
  state: { current: { status: 'loading' } as ModelState },
  market: { current: { status: 'ready', market: { quotes: {}, rates: null }, retry: () => {} } as MarketState },
  back: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  marketAsked: vi.fn(),
}))

vi.mock('@/lib/app/use-model', () => ({ useModel: () => mocks.state.current }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: mocks.back, replace: mocks.replace, push: mocks.push }) }))
vi.mock('@/lib/market/use-market', () => ({
  useMarket: (symbols: readonly string[], options?: { rates?: boolean }) => {
    mocks.marketAsked(symbols, options)
    return mocks.market.current
  },
}))
vi.mock('@/components/ui/VaultWait', () => ({ VaultWait: ({ phase }: { phase: string }) => <p>attente {phase}</p> }))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props} />,
}))

const plain = (text: string | null | undefined) => text?.replace(/[\u00A0\u202F]/g, " ") ?? ""
const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const at = (establishmentId: string, a: Account): Account => ({ ...a, establishmentId })

const ESTABLISHMENTS: Establishment[] = [
  { id: 'bourso', name: 'BoursoBank', kind: 'institution' },
  { id: 'amundi', name: 'Amundi', kind: 'institution' },
]
const ACCOUNTS = [at('bourso', account('pea', 'pea', { name: 'PEA' })), at('amundi', account('pee', 'employee-savings', { name: 'PEE' }))]
const LINES: Line[] = [
  line('o1', 'pea', { kind: 'units', name: 'OVHCLOUD', quoteSymbol: 'OVH.PA' }),
  line('o2', 'pee', { kind: 'units', name: 'Actions OVHcloud', quoteSymbol: 'OVH.PA' }),
  ...Array.from({ length: 7 }, (_, i) => line(`f${i}`, 'pea', { kind: 'units', name: `Fonds ${i + 1}` })),
]
const LATEST: Snapshot = snapshotOf([
  unitsEntry('o1', 10, 20, 10),
  unitsEntry('o2', 5, 20, 16),
  ...Array.from({ length: 7 }, (_, i) => unitsEntry(`f${i}`, 1, 100, null)),
])

function ready(): ModelState {
  const profile: Profile = { schema: 1, establishments: ESTABLISHMENTS, accounts: ACCOUNTS, lines: LINES }
  const model: Model = {
    profile: loaded(profile),
    snapshots: [loaded(LATEST, 's-latest')],
    goals: [],
    settings: null,
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
  }
  return { status: 'ready', model, client: {} as never, dataKey: {} as CryptoKey, reload: vi.fn() }
}

const theCase = () => screen.getByRole('searchbox', { name: 'Trouver' })

beforeEach(() => {
  mocks.state.current = ready()
  mocks.market.current = { status: 'ready', market: { quotes: {}, rates: null }, retry: () => {} }
  for (const fn of [mocks.back, mocks.replace, mocks.push, mocks.marketAsked]) fn.mockReset()
})
afterEach(() => {
  cleanup()
  forgetFromInside()
})

test('the case « Trouver » is a search box, focused on open, and the empty case says what can be found', () => {
  render(<FindPage />)
  expect(theCase()).toHaveAttribute('type', 'search')
  expect(theCase()).toHaveFocus()
  // A field without a name is never sent by the browser, and nothing is written into the address.
  expect(theCase()).not.toHaveAttribute('name')
  expect(screen.getByText(FIND_EMPTY)).toBeInTheDocument()
  expect(screen.queryByText(FIND_FOOTER)).toBeNull()
})

test('a single holding: the answer on top, then its lines with the hit in bold, where, amount and « › »', async () => {
  render(<FindPage />)
  await userEvent.type(theCase(), 'ovh')
  const answer = screen.getByRole('region', { name: 'OVHCLOUD' })
  expect(plain(within(answer).getByText(/€/).textContent)).toBe('300 €')
  expect(plain(answer.textContent)).toContain('sur 2 comptes')

  const lines = screen.getByRole('region', { name: 'Tes lignes' })
  const links = within(lines).getAllByRole('link')
  expect(links.map((l) => l.getAttribute('href'))).toEqual(['/ligne/o1', '/ligne/o2'])
  const first = links[0]
  expect(first.querySelector('[data-hit]')?.textContent).toBe('OVH')
  expect(first.querySelector('[data-hit]')).toHaveClass('font-semibold')
  expect(first.querySelector('[data-category]')).toHaveClass('size-square-s')
  expect(plain(first.textContent)).toContain('PEA')
  expect(plain(first.textContent)).toContain('200 €')
  expect(within(first).getByText('›')).toHaveAttribute('aria-hidden', 'true')
  expect(screen.getByText(FIND_FOOTER)).toBeInTheDocument()
})

test('nothing found: the one sentence', async () => {
  render(<FindPage />)
  await userEvent.type(theCase(), 'zzz')
  expect(screen.getByText(FIND_NONE)).toBeInTheDocument()
  expect(screen.queryByRole('link')).toBeNull()
})

test('« Voir les 2 autres » shows them in place and moves the focus to the first one revealed', async () => {
  render(<FindPage />)
  await userEvent.type(theCase(), 'fonds')
  const lines = screen.getByRole('region', { name: 'Tes lignes' })
  expect(within(lines).getAllByRole('link')).toHaveLength(5)
  await userEvent.click(within(lines).getByRole('button', { name: 'Voir les 2 autres' }))
  const links = within(lines).getAllByRole('link')
  expect(links).toHaveLength(7)
  expect(links[5]).toHaveFocus()
  expect(within(lines).queryByRole('button')).toBeNull()
})

test('« Ce que tu peux faire »: the actions are links with « › »', async () => {
  render(<FindPage />)
  await userEvent.type(theCase(), 'fonds 1')
  const actions = screen.getByRole('region', { name: 'Ce que tu peux faire' })
  const link = within(actions).getByRole('link', { name: /^Relier «\sFonds 1\s» à son cours$/ })
  expect(link).toHaveAttribute('href', '/titres')
  expect(within(link).getByText('›')).toBeInTheDocument()
})

test('« Fermer » goes back to the screen before when « Trouver » was opened from inside Oseil', async () => {
  markFromInside()
  render(<FindPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Fermer' }))
  expect(mocks.back).toHaveBeenCalledTimes(1)
  expect(mocks.replace).not.toHaveBeenCalled()
})

test('Échap goes back too, even from inside the case', async () => {
  markFromInside()
  render(<FindPage />)
  await userEvent.type(theCase(), 'ovh')
  await userEvent.keyboard('{Escape}')
  expect(mocks.back).toHaveBeenCalledTimes(1)
})

// The history may hold another site before: going back would leave Oseil.
test('opened from its address, « Fermer » and Échap go to Mon argent, whatever the history holds', () => {
  const length = vi.spyOn(window.history, 'length', 'get').mockReturnValue(5)
  render(<FindPage />)
  fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(mocks.replace).toHaveBeenCalledTimes(2)
  expect(mocks.replace).toHaveBeenCalledWith('/')
  expect(mocks.back).not.toHaveBeenCalled()
  length.mockRestore()
})

test('Échap does nothing while a word is being composed in the case', () => {
  markFromInside()
  render(<FindPage />)
  fireEvent.keyDown(theCase(), { key: 'Escape', isComposing: true })
  expect(mocks.back).not.toHaveBeenCalled()
  expect(mocks.replace).not.toHaveBeenCalled()
})

test('the words in the empty case are in the soft colour of the text, readable in both appearances', () => {
  render(<FindPage />)
  expect(theCase().className).toMatch(/\bplaceholder:text-ink-soft\b/)
  expect(theCase().className).not.toMatch(/placeholder:text-ink-muted/)
})

test('the one wait while the vault opens, then while the prices come; the case is there all along', () => {
  mocks.state.current = { status: 'loading' }
  const { rerender } = render(<FindPage />)
  expect(screen.getByText('attente open')).toBeInTheDocument()
  expect(theCase()).toBeInTheDocument()
  mocks.state.current = ready()
  mocks.market.current = { status: 'loading' }
  rerender(<FindPage />)
  expect(screen.getByText('attente prices')).toBeInTheDocument()
  expect(screen.queryByText(FIND_EMPTY)).toBeNull()
})

test('the prices are asked with the symbols of Mon argent, and typing never changes what is asked', async () => {
  render(<FindPage />)
  const asked = () => mocks.marketAsked.mock.calls.map(([symbols, options]) => JSON.stringify([symbols, options]))
  const before = new Set(asked())
  expect([...before]).toEqual([JSON.stringify([['OVH.PA'], { rates: true }])])
  await userEvent.type(theCase(), 'ovh')
  expect(new Set(asked())).toEqual(before)
})
