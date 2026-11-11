// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { GOAL_PRESETS } from '@/lib/catalog'
import type { Model, ModelState } from '@/lib/app/use-model'
import {
  account,
  amountEntry,
  exampleProfile,
  exampleSnapshot,
  line,
  profileOf,
  snapshotOf,
  unitsEntry,
} from '@/lib/model/__tests__/fixtures'
import type { GoalAllocation, Profile, Snapshot } from '@/lib/model/types'
import { startDraft } from '@/lib/update/draft'
import type { MarketState } from '@/lib/market/use-market'
import { setAmountsHidden } from '@/lib/format'
import { memoryStorage } from '@/lib/auth/__tests__/memory-storage'
import { gridArrival, updateEcho } from '@/lib/app/arrival'
import { SQUARE_HINT_KEY } from '@/lib/app/square-hint'
import { REMINDER_DISMISSED_KEY } from '@/lib/app/update-reminder'
import { addDays, todayIso } from '@/lib/dates'
import { lineRange } from '@/lib/screens/grid-pick'
import { monArgentView } from '@/lib/screens/mon-argent'
import HomePage from '../page'

const mocks = vi.hoisted(() => ({
  state: { current: { status: 'loading' } as ModelState },
  replace: vi.fn(),
  push: vi.fn(),
  saveSettings: vi.fn(),
  addSnapshot: vi.fn(),
  saveSnapshot: vi.fn(),
  saveProfile: vi.fn(),
  market: { current: { status: 'ready', market: { quotes: {}, rates: null }, retry: vi.fn() } as MarketState },
  useMarket: vi.fn(),
}))

vi.mock('@/lib/app/use-model', () => ({ useModel: () => mocks.state.current }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace, push: mocks.push }) }))
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
vi.mock('@/lib/supabase/browser', () => ({ createBrowserSupabase: () => ({}) }))
vi.mock('@/lib/vault/device', () => ({ indexedDbKeyStore: () => ({}) }))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}))

const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const balanced: GoalAllocation = { schema: 1, validFrom: '2026-01-01', shares: GOAL_PRESETS.balanced.shares }

function ready(
  parts: {
    profile?: Profile | null
    snapshot?: Snapshot
    unreadableProfile?: number
    unreadableSettings?: number
    draftBasedOn?: string
    savedAt?: string
    unreadableSnapshots?: number
  } = {},
): ModelState {
  const model: Model = {
    profile: parts.profile === null ? null : loaded(parts.profile ?? exampleProfile),
    // Saved just now unless said otherwise: the reminder of an update stays away from these tests,
    // whatever day they run (it has its own tests below).
    snapshots: [{ ...loaded(parts.snapshot ?? exampleSnapshot, 's0'), createdAt: parts.savedAt ?? new Date().toISOString() }],
    goals: [loaded(balanced, 'g0')],
    settings: null,
    draft: parts.draftBasedOn === undefined ? null : loaded(startDraft(parts.draftBasedOn), 'd0'),
    unreadable: { profile: parts.unreadableProfile ?? 0, snapshots: parts.unreadableSnapshots ?? 0, goals: 0, settings: parts.unreadableSettings ?? 0, draft: 0 },
  }
  return { status: 'ready', model, client: {} as never, dataKey: {} as CryptoKey, reload: vi.fn() }
}

beforeEach(() => {
  mocks.market.current = { status: 'ready', market: { quotes: {}, rates: null }, retry: vi.fn() }
  mocks.useMarket.mockReset()
  mocks.replace.mockReset()
  mocks.push.mockReset()
  mocks.saveSettings.mockReset().mockResolvedValue('settings-id')
})
afterEach(cleanup)

test('the example board shows the net, five category links and a grid of one hundred squares', () => {
  mocks.state.current = ready()
  const { container } = render(<HomePage />)

  expect(screen.getByRole('heading', { name: 'Mon argent' })).toBeInTheDocument()
  expect(screen.getByText('Ce qui est vraiment à toi')).toBeInTheDocument()
  expect(screen.getByText(/202\s000\s€/)).toBeInTheDocument()
  const links = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/categorie/'))
  expect(links.map((a) => a.getAttribute('href'))).toEqual(
    expect.arrayContaining([
      '/categorie/available',
      '/categorie/secured',
      '/categorie/markets',
      '/categorie/gold',
      '/categorie/property',
    ]),
  )
  expect(container.querySelectorAll('[data-square]')).toHaveLength(100)
  expect(screen.getByRole('img', { name: /^Ta grille\u00A0: Argent disponible 10 carrés/ })).toBeInTheDocument()
})

test('a goal category with nothing held is listed at 0 € with an empty bar, and is not a link', () => {
  const profile = profileOf([account('cur', 'current')], [line('cur-l', 'cur')])
  mocks.state.current = ready({ profile, snapshot: snapshotOf([amountEntry('cur-l', 9_000)]) })
  render(<HomePage />)
  const secured = screen.getByText('Épargne sécurisée').closest('li')!
  expect(within(secured).queryByRole('link')).not.toBeInTheDocument()
  expect(within(secured).getByRole('button')).toHaveTextContent(/^0\s€$/)
  expect(within(secured).getByRole('img', { name: '0 carré, objectif 25' })).toBeInTheDocument()
  expect(within(secured).getByText('rien pour l’instant')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Argent disponible/ })).toHaveAttribute('href', '/categorie/available')
})

test('a category without squares opens its lines from under « Voir ses lignes »', () => {
  // The house typed 100 000 € instead of 300 000 €: below its loan, Immobilier is out of the grid.
  const typo: Snapshot = {
    ...exampleSnapshot,
    entries: exampleSnapshot.entries.map((e) => (e.lineId === 'house-line' ? amountEntry('house-line', 100_000) : e)),
  }
  mocks.state.current = ready({ snapshot: typo })
  render(<HomePage />)
  const caption = screen.getByText('Voir ses lignes')
  const property = screen.getByRole('link', { name: /Immobilier/ })
  expect(property).toHaveAttribute('href', '/categorie/property')
  expect(property).toHaveTextContent(/^Immobilier\s*›$/)
  expect(caption.compareDocumentPosition(property) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('without a grid, each category that holds something still opens', () => {
  const profile = profileOf([account('cur', 'current'), account('loan', 'loan')], [line('cur-l', 'cur'), line('loan-l', 'loan')])
  mocks.state.current = ready({ profile, snapshot: snapshotOf([amountEntry('cur-l', 1_000), amountEntry('loan-l', 3_000)]) })
  render(<HomePage />)
  expect(screen.getByText(/ce que tu dois dépasse ce que tu possèdes/)).toBeInTheDocument()
  expect(screen.getByText('Voir ses lignes')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Argent disponible/ })).toHaveAttribute('href', '/categorie/available')
})

test('a line no rate converts, alone in its category, gets a link to its fiche after the warnings', () => {
  const profile = profileOf(
    [account('cur', 'current'), account('pea', 'pea')],
    [line('cur-l', 'cur'), line('us-l', 'pea', { name: 'Revolut', kind: 'units', currency: 'USD' })],
  )
  const snapshot = snapshotOf([amountEntry('cur-l', 1_000), unitsEntry('us-l', 10, 100, null)])
  mocks.state.current = ready({ profile, snapshot })
  render(<HomePage />)
  const warning = screen.getByText('« Revolut » n’est pas compté : son taux de change manque.')
  const sheet = screen.getByRole('link', { name: 'La fiche de « Revolut »' })
  expect(sheet).toHaveAttribute('href', '/ligne/us-l')
  expect(sheet.className).toContain('min-h-11')
  expect(sheet.className).toContain('focus-visible:outline-ink')
  expect(warning.compareDocumentPosition(sheet) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('the example board has no « Voir ses lignes »: every category is already a link', () => {
  mocks.state.current = ready()
  render(<HomePage />)
  expect(screen.queryByText('Voir ses lignes')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /^La fiche de/ })).not.toBeInTheDocument()
})

test('the home is listed without a bar and says it has no goal', () => {
  mocks.state.current = ready()
  render(<HomePage />)
  expect(screen.getByText('Hors chez toi, proche de tes objectifs')).toBeInTheDocument()
  expect(screen.getByText('À 5 carrés près.')).toBeInTheDocument()
  const property = screen.getByRole('link', { name: /Immobilier/ }).closest('li')!
  expect(within(property).queryByRole('img')).not.toBeInTheDocument()
  // On the real clock: the year shows once it is no longer 2026 (pinned in mon-argent.test.ts).
  expect(within(property).getByText(/^estimée le 30 septembre( 2026)? · pas d’objectif pour chez toi$/)).toBeInTheDocument()
  // No rental: no sub-row.
  expect(property.querySelector('[data-pocket]')).toBeNull()
  expect(within(property).queryByText('Chez toi')).not.toBeInTheDocument()
})

test('with a rental, Immobilier splits into « Chez toi » and « En location », the rental with its goal bar', async () => {
  const withRental = profileOf(
    [account('c', 'current'), account('h', 'home'), account('r', 'home', { residence: 'rental' })],
    [line('cash', 'c'), line('home', 'h'), line('rent', 'r')],
  )
  const state = ready({
    profile: withRental,
    snapshot: snapshotOf([amountEntry('cash', 100_000), amountEntry('home', 300_000), amountEntry('rent', 100_000)]),
  })
  if (state.status !== 'ready') throw new Error('ready expected')
  // 40 squares to steer: 8 of cash, 32 of rental.
  state.model.goals = [loaded({ schema: 1, validFrom: '2026-01-01', shares: { available: 20, secured: 0, markets: 0, gold: 0, rental: 80 } }, 'g0')]
  mocks.state.current = state
  render(<HomePage />)
  expect(screen.getByText('Hors chez toi, en route vers tes objectifs')).toBeInTheDocument()
  const property = screen.getByRole('link', { name: /Immobilier/ }).closest('li')!
  expect(within(property).getByText(/^estimée le 30 septembre( 2026)?$/)).toBeInTheDocument()
  // Closed at first (Nicolas, 11 November 2026): one line says where the rental stands, a touch opens.
  const toggle = within(property).getByRole('button', { name: 'En location\u00A0: en dessous de ton objectif' })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(property.querySelector('[data-pocket="chez-toi"]')).not.toBeVisible()
  await userEvent.click(toggle)
  expect(within(property).getByRole('button', { name: 'Masquer le détail' })).toHaveAttribute('aria-expanded', 'true')
  const home = property.querySelector<HTMLElement>('[data-pocket="chez-toi"]')!
  const rental = property.querySelector<HTMLElement>('[data-pocket="location"]')!
  expect(within(home).getByText('Chez toi')).toBeInTheDocument()
  expect(within(home).getByText('pas d’objectif')).toBeInTheDocument()
  expect(within(home).queryByRole('img')).not.toBeInTheDocument()
  // « Chez toi » takes its own green, as its squares in the grid; the rental keeps Immobilier's.
  expect(home.querySelector('.size-square-s.bg-cat-property-home')).not.toBeNull()
  expect(rental.querySelector('.size-square-s.bg-cat-property')).not.toBeNull()
  const grid = screen.getByRole('img', { name: /^Ta grille/ })
  const homeSquares = grid.querySelectorAll('[data-home]')
  expect(homeSquares.length).toBe(60)
  expect([...homeSquares].every((s) => s.className.includes('bg-cat-property-home'))).toBe(true)
  expect(grid.querySelectorAll('[data-category="property"]:not([data-home])').length).toBe(20)
  expect(within(rental).getByText('En location')).toBeInTheDocument()
  expect(within(rental).getByText('en dessous de ton objectif')).toBeInTheDocument()
  // The rental bar shares the scale of the screen: its target, 32 squares, is the largest.
  const bar = within(rental).getByRole('img', { name: '20 carrés, objectif 32' })
  expect((bar.querySelector('[data-part="extent"]') as HTMLElement).style.width).toBe('100%')
  const missing = bar.querySelector('[data-part="missing"]')!
  expect(missing.className).toContain('bg-cat-property/25')
  expect(missing.className).toContain('border-cat-property')
  // The figures follow the screen's € / % mode.
  expect(within(home).getByRole('button', { name: /^300.000.€$/ })).toBeInTheDocument()
  await userEvent.click(within(rental).getByRole('button', { name: /^100.000.€$/ }))
  expect(within(home).getByRole('button', { name: /^60.%$/ })).toBeInTheDocument()
  expect(within(rental).getByRole('button', { name: /^20.%$/ })).toBeInTheDocument()
})

test('the header: the title on one line, « Mettre à jour » a link to the update that never wraps', () => {
  mocks.state.current = ready()
  render(<HomePage />)
  const title = screen.getByRole('heading', { level: 1, name: 'Mon argent' })
  expect(title.className).toContain('whitespace-nowrap')
  const update = screen.getByRole('link', { name: 'Mettre à jour' })
  expect(update).toHaveAttribute('href', '/mise-a-jour')
  expect(update.className).toContain('whitespace-nowrap')
  expect(screen.queryByText(/Mise à jour en cours/)).not.toBeInTheDocument()
})

test('A4: « Mettre à jour » and the gear of the settings share the title\'s line; the label has its own', () => {
  mocks.state.current = ready()
  render(<HomePage />)
  const title = screen.getByRole('heading', { level: 1, name: 'Mon argent' })
  // Chosen by Nicolas on 9 November 2026: the settings are a gear, the only pictogram of the site,
  // named « Réglages » for VoiceOver.
  const settings = screen.getByRole('link', { name: 'Réglages' })
  expect(settings.parentElement).toBe(title.parentElement)
  expect(settings.textContent).toBe('')
  expect(settings.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  expect(screen.getByRole('link', { name: 'Mettre à jour' }).parentElement).toBe(title.parentElement)
  const label = screen.getByText('Ce qui est vraiment à toi')
  expect(label.parentElement).not.toBe(title.parentElement)
  // On a 320 px screen the line would be 334 px wide for 280: the title is then only read aloud.
  expect(title.className).toContain('max-[22.5rem]:sr-only')
})

test('B (9 November 2026): above the grid only the label, the amount and the progress; the rest under it, in small print', () => {
  const first: Snapshot = { ...exampleSnapshot, takenOn: '2026-01-31', entries: [amountEntry('current-line', 102_000)] }
  const state = ready() as Extract<ModelState, { status: 'ready' }>
  state.model.snapshots = [loaded(first, 's-first'), loaded(exampleSnapshot, 's0')]
  mocks.state.current = state
  render(<HomePage />)
  const grid = screen.getByRole('img', { name: /^Ta grille/ })
  const before = (el: Element) => (el.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  // The label in small grey, the amount just after it.
  const label = screen.getByText('Ce qui est vraiment à toi')
  expect(label.className).toContain('text-caption')
  expect(before(label)).toBe(true)
  expect(before(screen.getByTestId('progress'))).toBe(true)
  const small = [screen.getByText(/^Un carré vaut/), screen.getByText(/^Chiffres du/)]
  for (const line of small) {
    expect(before(line)).toBe(false)
    expect(line.className).toContain('text-caption')
  }
  // In this order: the legend of the grid, then the date of the figures.
  expect(small[0].compareDocumentPosition(small[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  // What is owned is no longer on the screen: the amount opens it (see below).
  expect(screen.queryByText(/^Tu possèdes/)).not.toBeInTheDocument()
})

test('2 (9 November 2026): touching the amount opens what is owned over the grid; a second touch, a touch elsewhere, leaving it or Escape closes it', () => {
  mocks.state.current = ready()
  render(<HomePage />)
  const amount = within(screen.getByText('Ce qui est vraiment à toi').nextElementSibling as HTMLElement).getByRole('button')
  expect(amount).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByText(/^Tu possèdes/)).not.toBeInTheDocument()

  fireEvent.click(amount)
  expect(amount).toHaveAttribute('aria-expanded', 'true')
  const owned = screen.getByText(/^Tu possèdes/)
  expect(amount.getAttribute('aria-controls')).toBe(owned.id)
  // Over the grid, never pushing it: nothing moves.
  expect(owned.className).toContain('absolute')

  fireEvent.click(amount)
  expect(screen.queryByText(/^Tu possèdes/)).not.toBeInTheDocument()

  fireEvent.click(amount)
  fireEvent.pointerDown(screen.getByRole('img', { name: /^Ta grille/ }))
  expect(screen.queryByText(/^Tu possèdes/)).not.toBeInTheDocument()

  fireEvent.click(amount)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByText(/^Tu possèdes/)).not.toBeInTheDocument()
  expect(amount).toHaveAttribute('aria-expanded', 'false')

  // By keyboard, moving on (to « Montre-moi mes objectifs », say) closes it: it would hide the
  // word « Simulation » on the grid.
  fireEvent.click(amount)
  fireEvent.focusOut(amount, { relatedTarget: screen.getByRole('link', { name: 'Mettre à jour' }) })
  expect(screen.queryByText(/^Tu possèdes/)).not.toBeInTheDocument()
})

test('C3: the square says what it was worth in brackets, and the progress of what is yours sits under the big amount', () => {
  const first: Snapshot = { ...exampleSnapshot, takenOn: '2026-01-31', entries: [amountEntry('current-line', 102_000)] }
  const state = ready() as Extract<ModelState, { status: 'ready' }>
  state.model.snapshots = [loaded(first, 's-first'), loaded(exampleSnapshot, 's0')]
  mocks.state.current = state
  render(<HomePage />)
  // The year only when it is not this one.
  expect(screen.getByText(/^Un carré vaut 2\s020\s€ \(1\s020\s€ en\sjanvier(\s2026)?\)$/)).toBeInTheDocument()
  const progress = screen.getByTestId('progress')
  expect(within(progress).getByRole('button').textContent).toMatch(/^\+100\s000\s€$/)
  expect(within(progress).getByText(/^depuis janvier(\s2026)?$/)).toBeInTheDocument()
  // C4: set apart from a list, it is touched like the others but carries no dotted underline.
  const figure = within(progress).getByRole('button')
  expect(figure.className).not.toContain('decoration-dotted')
  expect(screen.queryByText(/de plus qu’en/)).toBeNull()
})

test('a pending update shows the banner and the saved snapshot unchanged', () => {
  mocks.state.current = ready({ draftBasedOn: 's0' })
  const { container } = render(<HomePage />)
  expect(screen.getByText(/Mise à jour en cours/)).toBeInTheDocument()
  // Its name says what it resumes, out of the sentence too.
  const resume = screen.getByRole('link', { name: 'Reprendre la mise à jour' })
  expect(resume).toHaveAttribute('href', '/mise-a-jour')
  expect(resume).toHaveTextContent(/^Reprendre$/)
  expect(screen.getByText(/202\s000\s€/)).toBeInTheDocument()
  expect(container.querySelectorAll('[data-square]')).toHaveLength(100)
})

test('a draft based on an older snapshot shows no banner', () => {
  mocks.state.current = ready({ draftBasedOn: 'older' })
  render(<HomePage />)
  expect(screen.queryByText(/Mise à jour en cours/)).not.toBeInTheDocument()
})

test('the resume view of a first launch half done has no « Mettre à jour » at all: « Continuer » is enough', () => {
  const firstLaunch = { complete: false, finished: [] as string[], planned: [] as string[] }
  mocks.state.current = ready({ profile: { ...exampleProfile, firstLaunch } })
  render(<HomePage />)
  expect(screen.queryByRole('button', { name: 'Mettre à jour' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Mettre à jour' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Continuer' })).toBeInTheDocument()
})

test('no « Se déconnecter » on Mon argent: the tabs close the page, after the list', () => {
  mocks.state.current = ready()
  render(<HomePage />)
  expect(screen.queryByRole('button', { name: 'Se déconnecter' })).not.toBeInTheDocument()
  const lastRow = screen.getByRole('link', { name: /Immobilier/ }).closest('li')!
  const tabs = screen.getByRole('navigation', { name: 'Onglets' })
  expect(lastRow.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('with settings that cannot be read, the switch says it only lasts for this visit, and writes nothing', async () => {
  const user = userEvent.setup()
  mocks.state.current = ready({ unreadableSettings: 1 })
  render(<HomePage />)
  const available = screen.getByRole('link', { name: /Argent disponible/ }).closest('li')!
  await user.click(within(available).getByRole('button'))
  expect(screen.getByText('Chiffres en % pour cette visite (ton choix n’a pas pu être enregistré)')).toBeInTheDocument()
  await user.click(within(available).getByRole('button'))
  expect(screen.getByText('Chiffres en euros pour cette visite')).toBeInTheDocument()
  expect(mocks.saveSettings).not.toHaveBeenCalled()
})

test('with readable settings, the switch keeps its usual words', async () => {
  const user = userEvent.setup()
  mocks.state.current = ready()
  render(<HomePage />)
  const available = screen.getByRole('link', { name: /Argent disponible/ }).closest('li')!
  await user.click(within(available).getByRole('button'))
  expect(screen.getByText('Chiffres en % partout · touche pour revenir en €')).toBeInTheDocument()
})

test('touching a figure turns every figure into percent', async () => {
  const user = userEvent.setup()
  mocks.state.current = ready()
  render(<HomePage />)
  const available = screen.getByRole('link', { name: /Argent disponible/ }).closest('li')!
  expect(within(available).getByRole('button')).toHaveTextContent(/€/)

  await user.click(within(available).getByRole('button'))

  for (const row of screen.getAllByRole('listitem').filter((li) => li.querySelector('a[href^="/categorie/"]'))) {
    expect(within(row).getByRole('button')).toHaveTextContent(/\d\s%$/)
  }
})

test('no profile sends to the first launch', () => {
  mocks.state.current = ready({ profile: null })
  render(<HomePage />)
  expect(mocks.replace).toHaveBeenCalledWith('/premier-lancement')
})

test('an unreadable profile says so and offers nothing that writes', () => {
  mocks.state.current = ready({ profile: null, unreadableProfile: 1 })
  render(<HomePage />)
  expect(screen.getByText('Ton profil n’a pas pu être lu sur cet appareil. Rien n’a été effacé.')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Continuer' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /premier/i })).not.toBeInTheDocument()
  expect(mocks.replace).not.toHaveBeenCalled()
})

test('a first launch with two banks left says so', () => {
  mocks.state.current = ready({
    profile: { ...exampleProfile, firstLaunch: { planned: [], finished: ['home'], complete: false } },
  })
  render(<HomePage />)
  expect(screen.getByText('Il te reste 2 banques à ajouter')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Continuer' })).toHaveAttribute('href', '/premier-lancement/etape')
})

test('a first launch in progress lists what has been entered, and draws no grid nor total', () => {
  mocks.state.current = ready({
    profile: { ...exampleProfile, firstLaunch: { planned: [], finished: ['home'], complete: false } },
  })
  const { container } = render(<HomePage />)
  expect(container.querySelectorAll('[data-square]')).toHaveLength(0)
  expect(screen.queryByText('Ce qui est vraiment à toi')).not.toBeInTheDocument()
  expect(screen.queryByText(/202\s000\s€/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Un carré vaut/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Tu possèdes/)).not.toBeInTheDocument()
  const bourso = screen.getByRole('heading', { name: 'BoursoBank' })
  const accounts = within(bourso.closest('section') as HTMLElement).getAllByRole('listitem').map((li) => li.textContent?.replace(/\s/g, ' '))
  expect(accounts).toEqual(['Compte courant8 000 €', 'Livret A12 000 €', 'PEA25 000 €'])
  expect(screen.getByRole('heading', { name: 'Chez toi' })).toBeInTheDocument()
})

test('each step says where it stands: fait, en cours, à faire; a finished step with no account says so', () => {
  const profile: Profile = {
    ...exampleProfile,
    establishments: [...exampleProfile.establishments, { id: 'lcl', name: 'LCL', kind: 'institution', catalogId: 'lcl' }],
    accounts: exampleProfile.accounts.filter((a) => a.establishmentId !== 'home'),
    lines: exampleProfile.lines.filter((l) => !['house-line', 'mortgage-line', 'gold-line'].includes(l.id)),
    firstLaunch: { planned: [], finished: ['home'], complete: false },
  }
  mocks.state.current = ready({ profile })
  render(<HomePage />)
  const status = (name: string) => within(screen.getByRole('heading', { name }).closest('section') as HTMLElement).getByText(/^(fait|en cours|à faire)$/)
  expect(status('Chez toi')).toHaveTextContent('fait')
  expect(status('BoursoBank')).toHaveTextContent('en cours')
  expect(status('Linxea')).toHaveTextContent('à faire')
  expect(status('LCL')).toHaveTextContent('à faire')
  const home = screen.getByRole('heading', { name: 'Chez toi' }).closest('section') as HTMLElement
  expect(within(home).getByText('aucun compte')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Continuer' })).toBeInTheDocument()
  expect(screen.queryByText(/Ce qui est vraiment à toi/)).not.toBeInTheDocument()
})

test('a bank also named « Chez toi » does not collide with the home step', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const profile: Profile = {
    ...exampleProfile,
    establishments: [...exampleProfile.establishments, { id: 'custom', name: 'Chez toi', kind: 'institution' }],
    firstLaunch: { planned: [], finished: ['home'], complete: false },
  }
  mocks.state.current = ready({ profile })
  render(<HomePage />)
  expect(screen.getAllByRole('heading', { name: 'Chez toi' })).toHaveLength(2)
  expect(error).not.toHaveBeenCalled()
  error.mockRestore()
})

test('a first launch with a bank and « Chez toi » left counts steps', () => {
  mocks.state.current = ready({
    profile: { ...exampleProfile, firstLaunch: { planned: [], finished: ['linxea'], complete: false } },
  })
  render(<HomePage />)
  expect(screen.getByText('Il te reste 2 étapes avant ta grille')).toBeInTheDocument()
})

test('a grid ready to be seen offers to see it', () => {
  mocks.state.current = ready({
    profile: { ...exampleProfile, firstLaunch: { planned: [], finished: ['boursobank', 'linxea', 'home'], complete: false } },
  })
  render(<HomePage />)
  expect(screen.getByText('Ta grille est prête.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'La voir' })).toHaveAttribute('href', '/premier-lancement/revelation')
})

test('a model that could not be loaded offers to try again', async () => {
  const user = userEvent.setup()
  const retry = vi.fn()
  mocks.state.current = { status: 'failed', retry }
  render(<HomePage />)
  expect(screen.getByText('Tes chiffres n’ont pas pu être chargés.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Réessayer' }))
  expect(retry).toHaveBeenCalledOnce()
})

test('unreadable snapshots are said, not shown as zero', () => {
  const state = ready()
  if (state.status !== 'ready') throw new Error('unreachable')
  mocks.state.current = { ...state, model: { ...state.model, snapshots: [], unreadable: { ...state.model.unreadable, snapshots: 1 } } }
  render(<HomePage />)
  expect(screen.getByText('Tes chiffres n’ont pas pu être lus sur cet appareil. Rien n’a été effacé.')).toBeInTheDocument()
})

const quotedProfile: Profile = {
  ...exampleProfile,
  lines: exampleProfile.lines.map((l) => (l.id === 'etf' ? { ...l, quoteSymbol: 'CW8.PA' } : l)),
}
const MARKET = { quotes: { 'CW8.PA': { price: 260, currency: 'EUR', asOf: '2026-11-06' } }, rates: null }

test('prices: the board waits for the market, then 260 moves the net, and nothing is written', () => {
  mocks.state.current = ready({ profile: quotedProfile })
  mocks.market.current = { status: 'loading' }
  const { rerender } = render(<HomePage />)
  expect(screen.queryByText(/\d\s?000\s€/)).not.toBeInTheDocument()
  expect(screen.queryByText('Ce qui est vraiment à toi')).not.toBeInTheDocument()

  mocks.market.current = { status: 'ready', market: MARKET, retry: vi.fn() }
  rerender(<HomePage />)
  expect(screen.getByText(/203\s000\s€/)).toBeInTheDocument()
  expect(screen.getByText(/Cours du jour pour tes actions · le reste au 30 septembre/)).toBeInTheDocument()
  expect(mocks.useMarket).toHaveBeenLastCalledWith(['CW8.PA'], { rates: true })
  expect(mocks.addSnapshot).not.toHaveBeenCalled()
  expect(mocks.saveSnapshot).not.toHaveBeenCalled()
  expect(mocks.saveProfile).not.toHaveBeenCalled()
})

test('the wait: the vault opening, then the last prices, in one grid that never starts again', () => {
  vi.useFakeTimers()
  try {
    mocks.state.current = { status: 'loading' }
    mocks.market.current = { status: 'loading' }
    const { rerender } = render(<HomePage />)
    act(() => vi.advanceTimersByTime(333))
    const wait = screen.getByRole('status')
    expect(wait).toHaveTextContent(/^Ouverture de ton coffre…$/)

    mocks.state.current = ready({ profile: quotedProfile })
    rerender(<HomePage />)
    expect(screen.getByRole('status')).toBe(wait)
    expect(wait).toHaveTextContent(/^Derniers cours…$/)

    mocks.market.current = { status: 'ready', market: MARKET, retry: vi.fn() }
    rerender(<HomePage />)
    expect(screen.queryByText('Derniers cours…')).not.toBeInTheDocument()
    expect(screen.getByText(/203\s000\s€/)).toBeInTheDocument()
  } finally {
    vi.useRealTimers()
  }
})

test('prices: with no quoted line, no symbol is asked for', () => {
  mocks.state.current = ready()
  render(<HomePage />)
  expect(mocks.useMarket).toHaveBeenLastCalledWith([], { rates: false })
  expect(screen.getByText(/202\s000\s€/)).toBeInTheDocument()
})

test('prices: a failed price is said under the board', () => {
  mocks.state.current = ready({ profile: quotedProfile })
  mocks.market.current = { status: 'ready', market: { quotes: { 'CW8.PA': null }, rates: null }, retry: vi.fn() }
  render(<HomePage />)
  expect(screen.getByText(/Le prix du jour de « ETF » n’a pas pu être récupéré/)).toBeInTheDocument()
  expect(screen.getByText('Chiffres du 30 septembre')).toBeInTheDocument()
})

test('prices: every amount without a rate draws no net and says why', () => {
  const profile = profileOf([account('cur', 'current')], [line('cur-l', 'cur', { name: 'Revolut', currency: 'USD' })])
  mocks.state.current = ready({ profile, snapshot: snapshotOf([amountEntry('cur-l', 1_000)]) })
  render(<HomePage />)
  expect(screen.getByText('Aucun montant n’est compté : le taux de change de « Revolut » manque.')).toBeInTheDocument()
  expect(screen.queryByText(/0\s€/)).not.toBeInTheDocument()
})

test('while no line follows its price, a hint under the grid links to « Tes titres »', () => {
  mocks.state.current = ready()
  const { container } = render(<HomePage />)
  const hint = screen.getByText(/Le prix de tes actions peut se mettre à jour tout seul/)
  expect(hint).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Les retrouver' })).toHaveAttribute('href', '/titres')
  // After the grid, never above it: it must not push the hundred squares out of the first screen.
  const grid = container.querySelector('[role="img"]')!
  expect(grid.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('no hint once a line follows its price', () => {
  const followed: Profile = {
    ...exampleProfile,
    lines: exampleProfile.lines.map((l) => (l.id === 'etf' ? { ...l, quoteSymbol: 'CW8.PA' } : l)),
  }
  mocks.state.current = ready({ profile: followed })
  render(<HomePage />)
  expect(screen.queryByRole('link', { name: 'Les retrouver' })).toBeNull()
})

test('with the amounts hidden every amount reads « ••• », the percents and the squares stay', () => {
  mocks.state.current = ready()
  setAmountsHidden(true)
  try {
    const { container } = render(<HomePage />)
    expect(screen.queryByText(/€/)).not.toBeInTheDocument()
    expect(screen.getAllByText('•••').length).toBeGreaterThan(3)
    expect(container.querySelectorAll('[data-square]')).toHaveLength(100)
    // What is owned, opened from the amount, is masked too.
    fireEvent.click(within(screen.getByText('Ce qui est vraiment à toi').nextElementSibling as HTMLElement).getByRole('button'))
    expect(screen.getByText(/^Tu possèdes/).textContent).toContain('•••')
    expect(screen.queryByText(/€/)).not.toBeInTheDocument()
  } finally {
    setAmountsHidden(false)
  }
})

// A square touched opens its category's detail, on a phone as on a computer (Nicolas, 9 November
// 2026): `carre-ouvre-le-detail.test.tsx`. The in-place lighting of that morning is gone.

test('the gear opens the settings', () => {
  mocks.state.current = ready()
  render(<HomePage />)
  expect(screen.getByRole('link', { name: 'Réglages' })).toHaveAttribute('href', '/reglages')
})

// The arrival of the grid (planche 1): each time the site is opened or reloaded, never when coming
// back from another tab (Nicolas, 9 November 2026: once per snapshot, he never saw it).
describe('the arrival of the grid', () => {
  const arriving = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('[data-square]')).filter((s) => s.className.includes('animate-square-arrive'))

  beforeEach(() => {
    gridArrival.reset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('plays when the site opens, then not when coming back from another tab', () => {
    mocks.state.current = ready()
    const first = render(<HomePage />)
    expect(arriving(first.container)).toHaveLength(100)
    cleanup()
    const again = render(<HomePage />)
    expect(again.container.querySelectorAll('[data-square]')).toHaveLength(100)
    expect(arriving(again.container)).toHaveLength(0)
  })

  test('plays again when the site is opened again or reloaded, whatever the snapshot', () => {
    mocks.state.current = ready()
    render(<HomePage />)
    cleanup()
    gridArrival.reset()
    const { container } = render(<HomePage />)
    expect(arriving(container)).toHaveLength(100)
  })

  test('keeps nothing on the device', () => {
    const storage = memoryStorage()
    const setItem = vi.spyOn(storage, 'setItem')
    vi.stubGlobal('localStorage', storage)
    mocks.state.current = ready()
    render(<HomePage />)
    expect(setItem).not.toHaveBeenCalled()
  })
})

// The hint that a square can be touched (Nicolas, 10 November 2026): on the first openings, after the
// arrival, the squares of the largest category take the hover look one after the other; never again
// once a square has been touched, nor after three openings.
describe('the hint that a square can be touched', () => {
  // Option B (Nicolas, 10 November 2026): the largest category lit as a touch would light it, and the
  // sentence under the grid in the place of the legend.
  const said = () => screen.queryByText(/^Touche un carré\s: sa catégorie s’ouvre$/)
  const hinted = (container: HTMLElement) => (said() ? container.querySelectorAll('[data-square]:not([data-dim])') : [])
  // The largest category of the example and where its squares are, in the grid's reading order.
  const largest = () => {
    const view = monArgentView((ready() as Extract<ModelState, { status: 'ready' }>).model, '2026-10-01')
    if (view.kind !== 'board' || view.grid.kind !== 'grid') throw new Error('no grid')
    let start = 0
    let best = { from: 0, count: 0 }
    for (const c of view.grid.categories) {
      if (c.squares > best.count) best = { from: start, count: c.squares }
      start += c.squares
    }
    return best
  }
  let storage: Storage

  beforeEach(() => {
    vi.useFakeTimers()
    gridArrival.reset()
    updateEcho.reset()
    storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    gridArrival.reset()
    updateEcho.reset()
  })

  test('after the arrival, the largest category lights as a touch would, the sentence says it, then all comes back', () => {
    mocks.state.current = ready()
    const { container } = render(<HomePage />)
    const { from, count } = largest()
    const squares = Array.from(container.querySelectorAll('[data-square]'))
    const dimmed = () => squares.flatMap((s, i) => (s.hasAttribute('data-dim') ? [i] : []))
    const others = squares.flatMap((_, i) => (i >= from && i < from + count ? [] : [i]))
    act(() => vi.advanceTimersByTime(1300))
    expect(said()).toBeNull()
    expect(dimmed()).toEqual([])
    act(() => vi.advanceTimersByTime(100))
    expect(dimmed()).toEqual(others)
    expect(said()).toBeInTheDocument()
    // The legend keeps its room, hidden under the sentence: nothing below moves.
    expect(screen.getByText(/^Un carré vaut/)).toHaveClass('invisible')
    act(() => vi.advanceTimersByTime(2_200))
    expect(said()).toBeNull()
    expect(dimmed()).toEqual([])
    expect(storage.getItem(SQUARE_HINT_KEY)).toBe('1')
  })

  test('not under the reminder of an update: nothing plays and the opening is not counted', () => {
    const old = { ...exampleSnapshot, takenOn: addDays(todayIso(), -120) }
    mocks.state.current = ready({ snapshot: old, savedAt: '2026-01-15T09:00:00Z' })
    const { container } = render(<HomePage />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    for (let t = 0; t < 3000; t += 50) {
      act(() => vi.advanceTimersByTime(50))
      expect(hinted(container)).toHaveLength(0)
    }
    expect(storage.getItem(SQUARE_HINT_KEY)).toBeNull()
  })

  test('not when coming back from another tab: the grid did not arrive', () => {
    gridArrival.shown()
    mocks.state.current = ready()
    const { container } = render(<HomePage />)
    act(() => vi.advanceTimersByTime(3000))
    expect(hinted(container)).toHaveLength(0)
    expect(storage.getItem(SQUARE_HINT_KEY)).toBeNull()
  })

  test('three openings, then no more', () => {
    mocks.state.current = ready()
    for (let i = 0; i < 3; i++) {
      gridArrival.reset()
      render(<HomePage />)
      act(() => vi.advanceTimersByTime(3000))
      cleanup()
    }
    gridArrival.reset()
    const { container } = render(<HomePage />)
    for (let t = 0; t < 3000; t += 50) {
      act(() => vi.advanceTimersByTime(50))
      expect(hinted(container)).toHaveLength(0)
    }
  })

  test('a square touched once: the hint never plays again on this device', () => {
    mocks.state.current = ready()
    const { container } = render(<HomePage />)
    fireEvent.click(container.querySelectorAll('[data-square]')[0])
    expect(storage.getItem(SQUARE_HINT_KEY)).toBe('touche')
    act(() => vi.advanceTimersByTime(3000))
    cleanup()
    gridArrival.reset()
    const again = render(<HomePage />)
    for (let t = 0; t < 3000; t += 50) {
      act(() => vi.advanceTimersByTime(50))
      expect(hinted(again.container)).toHaveLength(0)
    }
  })

  test('with fewer animations asked, nothing moves and nothing is counted', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    mocks.state.current = ready()
    const { container } = render(<HomePage />)
    for (let t = 0; t < 3000; t += 50) {
      act(() => vi.advanceTimersByTime(50))
      expect(hinted(container)).toHaveLength(0)
    }
    expect(storage.getItem(SQUARE_HINT_KEY)).toBeNull()
  })
})

// The echo of the bank just updated (Nicolas, 10 November 2026): right after an update in which only
// some banks were seen, their lines' squares light once, the others dim and come back.
describe('the echo of an update', () => {
  const TAKEN = '2026-11-07'
  // BoursoBank seen on 7 November; Linxea and « Chez toi » kept 30 September.
  const partial: Snapshot = {
    ...exampleSnapshot,
    takenOn: TAKEN,
    entries: exampleSnapshot.entries.map((e) =>
      ['current-line', 'livret-a-line', 'etf'].includes(e.lineId) ? { ...e, seenOn: TAKEN } : e,
    ),
  }
  const full: Snapshot = { ...exampleSnapshot, takenOn: TAKEN, entries: exampleSnapshot.entries.map((e) => ({ ...e, seenOn: TAKEN })) }
  const grid = () => screen.getByRole('img', { name: /^Ta grille/ })
  const dimmed = (container: HTMLElement) => container.querySelectorAll('[data-square][data-dim]').length
  // The squares of BoursoBank's lines, in the order the grid draws them.
  const bankSquares = () => {
    const view = monArgentView((ready({ snapshot: partial }) as Extract<ModelState, { status: 'ready' }>).model, TAKEN)
    if (view.kind !== 'board' || view.grid.kind !== 'grid') throw new Error('no grid')
    const categories = view.grid.categories
    return ['current-line', 'livret-a-line', 'etf'].flatMap((id) => {
      const range = lineRange(categories, id)
      return range ? Array.from({ length: range.to - range.from }, (_, k) => range.from + k) : []
    })
  }

  beforeEach(() => {
    vi.useFakeTimers()
    updateEcho.reset()
    // Coming back from the update: the grid's arrival has played already.
    gridArrival.shown()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    updateEcho.reset()
    gridArrival.reset()
  })

  test('after a partial update: the bank’s squares stay lit while the rest dims, then everything comes back, once', () => {
    updateEcho.ask()
    mocks.state.current = ready({ snapshot: partial })
    const { container } = render(<HomePage />)
    expect(dimmed(container)).toBe(0)
    act(() => vi.advanceTimersByTime(350))
    expect(grid()).toHaveAttribute('data-echo', 'dim')
    const lit = Array.from(container.querySelectorAll('[data-square]')).flatMap((s, i) => (s.hasAttribute('data-dim') ? [] : [i]))
    expect(lit).toEqual(bankSquares())
    expect(lit.length).toBeGreaterThan(0)
    expect(dimmed(container)).toBe(100 - lit.length)
    // 150 ms to dim, held 350 ms, then 350 ms back: about 850 ms in all.
    act(() => vi.advanceTimersByTime(500))
    expect(grid()).toHaveAttribute('data-echo', 'back')
    expect(dimmed(container)).toBe(0)
    act(() => vi.advanceTimersByTime(350))
    expect(grid()).not.toHaveAttribute('data-echo')
    // Consumed: coming back to Mon argent shows it no more.
    expect(updateEcho.due()).toBe(false)
    cleanup()
    const again = render(<HomePage />)
    act(() => vi.advanceTimersByTime(400))
    expect(grid()).not.toHaveAttribute('data-echo')
    expect(dimmed(again.container)).toBe(0)
  })

  test('taken as soon as Mon argent is reached: loading first, then the board of that same visit plays it once', () => {
    updateEcho.ask()
    mocks.state.current = { status: 'loading' }
    const { container, rerender } = render(<HomePage />)
    expect(updateEcho.due()).toBe(false)
    mocks.state.current = ready({ snapshot: partial })
    rerender(<HomePage />)
    act(() => vi.advanceTimersByTime(350))
    expect(grid()).toHaveAttribute('data-echo', 'dim')
    act(() => vi.advanceTimersByTime(850))
    expect(grid()).not.toHaveAttribute('data-echo')
    // The board drawn again on the same visit (the prices awaited once more): it does not play again.
    mocks.market.current = { status: 'loading', retry: vi.fn() } as unknown as MarketState
    rerender(<HomePage />)
    mocks.market.current = { status: 'ready', market: { quotes: {}, rates: null }, retry: vi.fn() }
    rerender(<HomePage />)
    act(() => vi.advanceTimersByTime(400))
    expect(grid()).not.toHaveAttribute('data-echo')
    expect(dimmed(container)).toBe(0)
  })

  test('a visit that shows no board spends it all the same: the next visit has no echo', () => {
    updateEcho.ask()
    mocks.state.current = { status: 'failed', retry: vi.fn() } as unknown as ModelState
    render(<HomePage />)
    expect(updateEcho.due()).toBe(false)
    cleanup()
    mocks.state.current = ready({ snapshot: partial })
    const { container } = render(<HomePage />)
    act(() => vi.advanceTimersByTime(400))
    expect(grid()).not.toHaveAttribute('data-echo')
    expect(dimmed(container)).toBe(0)
  })

  test('after a full update, no echo', () => {
    updateEcho.ask()
    mocks.state.current = ready({ snapshot: full })
    const { container } = render(<HomePage />)
    act(() => vi.advanceTimersByTime(400))
    expect(grid()).not.toHaveAttribute('data-echo')
    expect(dimmed(container)).toBe(0)
    expect(updateEcho.due()).toBe(false)
  })

  test('without an update just saved, no echo', () => {
    mocks.state.current = ready({ snapshot: partial })
    const { container } = render(<HomePage />)
    act(() => vi.advanceTimersByTime(400))
    expect(grid()).not.toHaveAttribute('data-echo')
    expect(dimmed(container)).toBe(0)
  })

  test('with fewer animations asked, the grid is in its final state at once', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    updateEcho.ask()
    mocks.state.current = ready({ snapshot: partial })
    const { container } = render(<HomePage />)
    for (const step of [0, 350, 500, 350]) {
      act(() => vi.advanceTimersByTime(step))
      expect(grid()).not.toHaveAttribute('data-echo')
      expect(dimmed(container)).toBe(0)
    }
  })
})

// « Montre-moi mes objectifs » (planche 3): a simulation asked for, announced, that comes back alone.
describe('the squares at their goals', () => {
  const shownColours = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('[data-square]')).map((s) => s.getAttribute('data-category'))

  beforeEach(() => {
    vi.useFakeTimers()
    mocks.state.current = ready()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  test('is offered under the goals headline, and nothing is simulated before it is asked', () => {
    const { container } = render(<HomePage />)
    const ask = screen.getByRole('button', { name: 'Montre-moi mes objectifs' })
    expect(ask).toBeInTheDocument()
    expect(screen.queryByText('Si tu étais pile à tes objectifs')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Ta grille/ })).toBeInTheDocument()
    expect(shownColours(container)).toHaveLength(100)
  })

  // Option F (Nicolas, 10 November 2026): where the squares leave from, the places they go to in the
  // grid at the goals, the places filling, then what goes where; nothing ever moves.
  const spots = (container: HTMLElement, spot: 'lit' | 'todo') => container.querySelectorAll(`[data-square][data-spot="${spot}"]`).length
  const dims = (container: HTMLElement) => container.querySelectorAll('[data-square][data-dim]').length
  // Each step is started by the one before: time passes in small steps, as on a phone.
  const wait = (ms: number) => {
    for (let t = 0; t < ms; t += 50) act(() => void vi.advanceTimersByTime(50))
  }
  // Every category in one piece: none comes back once another has started.
  const inBlocks = (cells: Array<string | null>) => cells.every((c, i) => i === 0 || c === cells[i - 1] || !cells.slice(0, i).includes(c))

  test('first where they leave from, then the places at the goals, then they fill, then what goes where', () => {
    const { container } = render(<HomePage />)
    const before = shownColours(container)
    const rows = () => screen.getAllByRole('listitem').map((li) => li.textContent)
    const rowsBefore = rows()
    fireEvent.click(screen.getByRole('button', { name: 'Montre-moi mes objectifs' }))
    expect(screen.getByText('Si tu étais pile à tes objectifs')).toBeInTheDocument()
    expect(screen.getByText('Simulation · ce n’est pas ta situation')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Simulation/ })).toBeInTheDocument()
    // 1. The real grid: the 5 squares that are not in their place seen, every other one dimmed.
    expect(shownColours(container)).toEqual(before)
    expect(spots(container, 'lit')).toBe(5)
    expect(dims(container)).toBe(95)
    expect(screen.getByText(/202\s000\s€/)).toBeInTheDocument()
    expect(rows()).toEqual(rowsBefore)
    // 2. The grid at the goals, in blocks, the home as it was; the 5 places to fill.
    wait(1_250)
    const atGoals = shownColours(container)
    expect(inBlocks(atGoals)).toBe(true)
    expect(atGoals.filter((c) => c === 'property')).toEqual(before.filter((c) => c === 'property'))
    expect(spots(container, 'todo')).toBe(5)
    expect(screen.queryByText(/^environ /)).not.toBeInTheDocument()
    // 3. They fill one after the other, then 4. what goes where.
    wait(600 + 150)
    expect(spots(container, 'lit')).toBeGreaterThan(0)
    expect(spots(container, 'todo')).toBeGreaterThan(0)
    wait(5 * 150 + 350)
    expect(spots(container, 'lit')).toBe(5)
    expect(spots(container, 'todo')).toBe(0)
    expect(screen.getAllByText(/^environ \d/).length).toBeGreaterThan(0)
  })

  test('comes back to the real colours by itself, the label staying until the last square is back', () => {
    const { container } = render(<HomePage />)
    const before = shownColours(container)
    fireEvent.click(screen.getByRole('button', { name: 'Montre-moi mes objectifs' }))
    wait(6_000)
    expect(shownColours(container)).not.toEqual(before)
    wait(1_100)
    // Back to the real colours, every square lit, while the label is still on screen.
    expect(shownColours(container)).toEqual(before)
    expect(dims(container)).toBe(0)
    expect(screen.getByText('Si tu étais pile à tes objectifs')).toBeInTheDocument()
    wait(500)
    expect(screen.queryByText('Si tu étais pile à tes objectifs')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Montre-moi mes objectifs' })).toBeInTheDocument()
  })

  test('while it is on screen, a row under the finger lights nothing: the grid never mixes real and simulated', () => {
    const { container } = render(<HomePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Montre-moi mes objectifs' }))
    const row = screen.getAllByRole('listitem')[0]
    const during = container.innerHTML
    fireEvent.pointerDown(row, { pointerType: 'touch' })
    expect(container.querySelector('[role="img"][aria-label^="Simulation"]')!.innerHTML).toBe(
      new DOMParser().parseFromString(during, 'text/html').querySelector('[role="img"][aria-label^="Simulation"]')!.innerHTML,
    )
    fireEvent.pointerUp(row)
    // Once it is gone, the same touch lights its category again.
    fireEvent.click(screen.getByRole('button', { name: 'Revenir à mes vrais chiffres' }))
    wait(500)
    expect(dims(container)).toBe(0)
    fireEvent.pointerDown(row, { pointerType: 'touch' })
    expect(dims(container)).toBeGreaterThan(0)
  })

  // Its squares are not where their lines are: a touched one would open the wrong category.
  test('while it is on screen, a touched square opens nothing and lights nothing', () => {
    const { container } = render(<HomePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Montre-moi mes objectifs' }))
    const grid = screen.getByRole('img', { name: /^Simulation/ })
    const lit = spots(container, 'lit')
    fireEvent.click(grid.children[0])
    act(() => void vi.advanceTimersByTime(100))
    expect(mocks.push).not.toHaveBeenCalled()
    expect(spots(container, 'lit')).toBe(lit)
    expect(dims(container)).toBe(95)
  })

  test('with fewer animations asked, the grid at the goals is shown at once, then the real one comes back', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    const { container } = render(<HomePage />)
    const before = shownColours(container)
    fireEvent.click(screen.getByRole('button', { name: 'Montre-moi mes objectifs' }))
    const squares = Array.from(container.querySelectorAll<HTMLElement>('[data-square]'))
    expect(squares.every((s) => s.style.transitionDelay === '' && !s.classList.contains('square-motion'))).toBe(true)
    expect(inBlocks(shownColours(container))).toBe(true)
    expect(spots(container, 'lit')).toBe(5)
    expect(screen.getAllByText(/^environ \d/).length).toBeGreaterThan(0)
    wait(4_050)
    expect(shownColours(container)).toEqual(before)
    expect(screen.queryByText('Si tu étais pile à tes objectifs')).not.toBeInTheDocument()
  })

  test('no button when every square is already in its place, nor without goals', () => {
    const state = ready()
    ;(state as Extract<ModelState, { status: 'ready' }>).model.goals = []
    mocks.state.current = state
    render(<HomePage />)
    expect(screen.queryByRole('button', { name: 'Montre-moi mes objectifs' })).not.toBeInTheDocument()
  })
})

describe('the reminder of an update after three months', () => {
  // The example snapshot is of 30 September; here it was also saved that day, a long time ago.
  const OLD = '2026-01-15T09:00:00Z'
  const takenOn = addDays(todayIso(), -120)
  const old = { ...exampleSnapshot, takenOn }

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('over a ready board, a sheet offers the update; « Plus tard » sets it aside for today', async () => {
    mocks.state.current = ready({ snapshot: old, savedAt: OLD })
    render(<HomePage />)
    const sheet = screen.getByRole('dialog', { name: /^Tes chiffres ont \d+\u00A0mois$/ })
    expect(within(sheet).getByRole('link', { name: 'Mettre à jour' })).toHaveAttribute('href', '/mise-a-jour')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Plus tard' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(localStorage.getItem(REMINDER_DISMISSED_KEY)).toBe(todayIso())
  })

  test('with an update under way, the sheet resumes it', () => {
    mocks.state.current = ready({ snapshot: old, savedAt: OLD, draftBasedOn: 's0' })
    render(<HomePage />)
    expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'Reprendre' })).toHaveAttribute('href', '/mise-a-jour')
  })

  test('not while the prices are awaited, then over the board once it is drawn', () => {
    mocks.state.current = ready({ profile: quotedProfile, snapshot: old, savedAt: OLD })
    mocks.market.current = { status: 'loading' }
    const { rerender } = render(<HomePage />)
    expect(screen.queryByRole('dialog')).toBeNull()
    mocks.market.current = { status: 'ready', market: MARKET, retry: vi.fn() }
    rerender(<HomePage />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  test('not when an update cannot be made', () => {
    mocks.state.current = ready({ snapshot: old, savedAt: OLD, unreadableSnapshots: 1 })
    render(<HomePage />)
    // The board is drawn all the same, without « Mettre à jour ».
    expect(screen.getByText('Ce qui est vraiment à toi')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Mettre à jour' })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('not while the vault opens', () => {
    mocks.state.current = { status: 'loading' }
    render(<HomePage />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
