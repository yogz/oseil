// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Model, ModelState } from '@/lib/app/use-model'
import { account, amountEntry, exampleProfile, exampleSnapshot, line, snapshotOf } from '@/lib/model/__tests__/fixtures'
import { parseGoalAllocation } from '@/lib/model/documents'
import type { GoalAllocation, Profile, Snapshot } from '@/lib/model/types'
import { UNREADABLE } from '@/lib/setup/use-first-launch'
import ObjectifsPage from '../objectifs/page'

const mocks = vi.hoisted(() => ({
  state: { current: {} as unknown },
  addGoal: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  reload: vi.fn(),
  params: { current: new URLSearchParams() },
}))

vi.mock('@/lib/app/use-model', () => ({ useModel: () => mocks.state.current }))
vi.mock('@/lib/model/repository', async (original) => ({
  ...(await original<typeof import('@/lib/model/repository')>()),
  addGoal: mocks.addGoal,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => mocks.params.current,
}))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props} />,
}))

const client = {} as never
const dataKey = {} as CryptoKey
const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })

function ready(profile: Profile, snapshot: Snapshot, unreadable = 0): ModelState {
  const model: Model = {
    profile: loaded(profile),
    snapshots: [loaded(snapshot, 's0')],
    goals: [],
    settings: null,
    draft: null,
    unreadable: { profile: unreadable, snapshots: 0, goals: 0, settings: 0, draft: 0 },
  }
  return { status: 'ready', model, client, dataKey, reload: mocks.reload }
}

beforeEach(() => {
  mocks.addGoal.mockReset()
  mocks.addGoal.mockResolvedValue('g1')
  mocks.push.mockReset()
  mocks.replace.mockReset()
  mocks.reload.mockReset()
  mocks.params.current = new URLSearchParams()
  mocks.state.current = ready(exampleProfile, exampleSnapshot)
})
afterEach(cleanup)

// getByText compares with its text squeezed to plain spaces, so the expected text uses plain spaces too.
const plain = (text: string | null | undefined) => (text ?? '').replace(/[\u202f\u00a0]/g, ' ')
const row = (label: string) => screen.getByText(label).closest('li') as HTMLElement
const value = (label: string) => plain(within(row(label)).getByTestId('value').textContent)
const widths = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-part]')).map((part) => [part.dataset.part, part.style.width])

test('starts from today’s split of the money outside the home, in percent, with no row for the home', () => {
  render(<ObjectifsPage />)
  expect(screen.getByRole('heading', { level: 1, name: 'Tes objectifs' })).toBeInTheDocument()
  expect(plain(screen.getByText(/Comment veux-tu répartir/).textContent)).toBe(
    'Comment veux-tu répartir ton argent hors chez toi (82 000 € aujourd’hui) ?',
  )
  expect(value('Argent disponible')).toBe('24 %')
  expect(value('Épargne sécurisée')).toBe('37 %')
  expect(value('Placements en bourse')).toBe('37 %')
  expect(value('Or et crypto')).toBe('2 %')
  expect(within(row('Argent disponible')).getByText('aujourd’hui 24 %')).toBeInTheDocument()
  expect(screen.queryByText('Immobilier')).not.toBeInTheDocument()
  expect(screen.getByText('100 % répartis')).toBeInTheDocument()
  // One sentence at the bottom, whole; the one about the home sits behind « hors chez toi ».
  expect(screen.getByText('Ce sont des exemples, pas un conseil fait pour toi.')).toBeInTheDocument()
  expect(screen.queryByText(/Chez toi n’a pas d’objectif/)).not.toBeInTheDocument()
  // No rental: no fifth row, no rental note.
  expect(screen.queryByText('Immobilier locatif')).not.toBeInTheDocument()
  expect(screen.queryByText(/Un logement ne se vend pas par carré/)).not.toBeInTheDocument()
  for (const name of ['Ma répartition actuelle', 'Prudent', 'Équilibré', 'Dynamique']) {
    expect(screen.getByRole('button', { name })).toBeInTheDocument()
  }
  expect(screen.getByRole('link', { name: '‹ Retour' })).toHaveAttribute('href', '/premier-lancement/depenses')
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled()
})

test('with goals already saved, the page opens on them, under « Mes objectifs », not on today’s split', async () => {
  const state = ready(exampleProfile, exampleSnapshot)
  if (state.status !== 'ready') throw new Error('ready expected')
  const saved: GoalAllocation = { schema: 1, validFrom: '2026-10-01', shares: { available: 10, secured: 15, markets: 70, gold: 5, rental: 0 } }
  state.model.goals = [loaded(saved, 'g0')]
  mocks.state.current = state
  render(<ObjectifsPage />)
  const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed')
  expect(pressed('Mes objectifs')).toBe('true')
  expect(pressed('Ma répartition actuelle')).toBe('false')
  expect(value('Argent disponible')).toBe('10 %')
  expect(value('Épargne sécurisée')).toBe('15 %')
  expect(value('Placements en bourse')).toBe('70 %')
  expect(value('Or et crypto')).toBe('5 %')
  // Today's split stays one touch away.
  await userEvent.click(screen.getByRole('button', { name: 'Ma répartition actuelle' }))
  expect(value('Argent disponible')).toBe('24 %')
  await userEvent.click(screen.getByRole('button', { name: 'Mes objectifs' }))
  expect(value('Or et crypto')).toBe('5 %')
})

// Pinned before the editor learnt about rentals (task 4a): a goal saved with four keys, as every goal in
// production, opens on four rows for a person without a rental, and saves with a rental at 0.
test('a goal saved with four keys, no rental: four rows, the same bar, saved as it was', async () => {
  const state = ready(exampleProfile, exampleSnapshot)
  if (state.status !== 'ready') throw new Error('ready expected')
  const saved = parseGoalAllocation({ schema: 1, validFrom: '2026-10-01', shares: { available: 10, secured: 15, markets: 70, gold: 5 } })!
  state.model.goals = [loaded(saved, 'g0')]
  mocks.state.current = state
  render(<ObjectifsPage />)
  const rows = screen.getAllByTestId('value').map((v) => v.closest('li')!.querySelector('span.flex-1')!.firstChild!.textContent)
  expect(rows).toEqual(['Argent disponible', 'Épargne sécurisée', 'Placements en bourse', 'Or et crypto'])
  expect(screen.getAllByTestId('value').map((v) => plain(v.textContent))).toEqual(['10 %', '15 %', '70 %', '5 %'])
  expect(widths()).toEqual([
    ['share', '10%'],
    ['share', '15%'],
    ['share', '70%'],
    ['share', '5%'],
  ])
  expect(plain(screen.getByRole('img').getAttribute('aria-label'))).toBe(
    'Tes objectifs : Argent disponible 10 %, Épargne sécurisée 15 %, Placements en bourse 70 %, Or et crypto 5 %',
  )
  expect(screen.queryByText('Immobilier locatif')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(mocks.addGoal.mock.calls[0][2].shares).toEqual({ available: 10, secured: 15, markets: 70, gold: 5, rental: 0 })
})

test('without goals saved, there is no « Mes objectifs » choice', () => {
  render(<ObjectifsPage />)
  expect(screen.queryByRole('button', { name: 'Mes objectifs' })).not.toBeInTheDocument()
})

test('« hors chez toi » opens, with one touch, why Chez toi has no goal; a second touch folds it', async () => {
  render(<ObjectifsPage />)
  const word = screen.getByRole('button', { name: 'hors chez toi' })
  expect(word).toHaveAttribute('aria-expanded', 'false')
  await userEvent.click(word)
  expect(word).toHaveAttribute('aria-expanded', 'true')
  expect(
    screen.getByText('Chez toi n’a pas d’objectif : ses mensualités et ses réestimations ne fausseront plus ton écart.'),
  ).toBeInTheDocument()
  await userEvent.click(word)
  expect(screen.queryByText(/Chez toi n’a pas d’objectif/)).not.toBeInTheDocument()
})

// A home and a rental: 30 000 € of cash, 300 000 € at home, a rental worth 70 000 €.
const withRental = (): Profile => ({
  ...exampleProfile,
  accounts: [account('c', 'current'), account('h', 'home'), account('r', 'home', { residence: 'rental' })],
  lines: [line('cash', 'c'), line('home', 'h'), line('rent', 'r')],
})
const rentalSnapshot = () => snapshotOf([amountEntry('cash', 30_000), amountEntry('home', 300_000), amountEntry('rent', 70_000)])
const labels = () => screen.getAllByTestId('value').map((v) => v.closest('li')!.querySelector('span.flex-1')!.firstChild!.textContent)
const RENTAL_NOTE = 'Un logement ne se vend pas par carré : cet objectif guide surtout où va ton argent neuf.'

test('with a rental: a fifth row « Immobilier locatif », last, its note under it, in the bar and the sum', async () => {
  mocks.state.current = ready(withRental(), rentalSnapshot())
  render(<ObjectifsPage />)
  expect(plain(screen.getByText(/Comment veux-tu répartir/).textContent)).toBe(
    'Comment veux-tu répartir ton argent hors chez toi (100 000 € aujourd’hui) ?',
  )
  expect(labels()).toEqual(['Argent disponible', 'Épargne sécurisée', 'Placements en bourse', 'Or et crypto', 'Immobilier locatif'])
  expect(value('Immobilier locatif')).toBe('70 %')
  expect(within(row('Immobilier locatif')).getByText('aujourd’hui 70 %')).toBeInTheDocument()
  // The note sits right under the rental row, discreet.
  const note = screen.getByText(RENTAL_NOTE)
  expect(row('Immobilier locatif').nextElementSibling).toBe(note.closest('li'))
  expect(plain(screen.getByRole('img').getAttribute('aria-label'))).toBe('Tes objectifs : Argent disponible 30 %, Épargne sécurisée 0 %, Placements en bourse 0 %, Or et crypto 0 %, Immobilier locatif 70 %')
  expect(widths()).toEqual([
    ['share', '30%'],
    ['share', '70%'],
  ])
  await userEvent.click(screen.getByRole('button', { name: 'Moins de Immobilier locatif' }))
  expect(screen.getByText('Il reste 1 % à placer')).toBeInTheDocument()
  // At 0, the row stays: it is the person's, the sum must still be seen.
  await userEvent.click(screen.getByRole('button', { name: 'Équilibré' }))
  expect(value('Immobilier locatif')).toBe('0 %')
  expect(labels()).toHaveLength(5)
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(mocks.addGoal.mock.calls[0][2].shares).toEqual({ available: 25, secured: 25, markets: 45, gold: 5, rental: 0 })
})

test('a goal with a rental share, the last rental closed: the fifth row stays and the sum is 100', async () => {
  const state = ready(exampleProfile, exampleSnapshot)
  if (state.status !== 'ready') throw new Error('ready expected')
  const saved: GoalAllocation = { schema: 1, validFrom: '2026-10-01', shares: { available: 20, secured: 20, markets: 40, gold: 5, rental: 15 } }
  state.model.goals = [loaded(saved, 'g0')]
  mocks.state.current = state
  render(<ObjectifsPage />)
  expect(labels()).toHaveLength(5)
  expect(value('Immobilier locatif')).toBe('15 %')
  expect(within(row('Immobilier locatif')).getByText('aujourd’hui 0 %')).toBeInTheDocument()
  expect(screen.getByText('100 % répartis')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(mocks.addGoal.mock.calls[0][2].shares).toEqual(saved.shares)
})

test('the bar shows the draft: one segment per category, as wide as its percent, nothing unplaced', () => {
  render(<ObjectifsPage />)
  expect(screen.getByRole('img', { name: /^Tes objectifs\u00A0: Argent disponible 24/ })).toBeInTheDocument()
  expect(widths()).toEqual([
    ['share', '24%'],
    ['share', '37%'],
    ['share', '37%'],
    ['share', '2%'],
  ])
  expect(document.querySelector('[data-squares]')).toBeNull()
})

test('the example chosen is shown as chosen, to the eye and to VoiceOver, until a « − » or a « + » is touched', async () => {
  render(<ObjectifsPage />)
  const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed')
  // The page opens on today's split.
  expect(pressed('Ma répartition actuelle')).toBe('true')
  expect(pressed('Équilibré')).toBe('false')
  await userEvent.click(screen.getByRole('button', { name: 'Équilibré' }))
  expect(pressed('Équilibré')).toBe('true')
  expect(pressed('Ma répartition actuelle')).toBe('false')
  await userEvent.click(screen.getByRole('button', { name: 'Prudent' }))
  expect(pressed('Prudent')).toBe('true')
  expect(pressed('Équilibré')).toBe('false')
  // Touching « − » makes the shares the person's own: no example is chosen any more.
  await userEvent.click(screen.getAllByRole('button', { name: /^Moins de/ })[0])
  for (const name of ['Ma répartition actuelle', 'Prudent', 'Équilibré', 'Dynamique']) expect(pressed(name)).toBe('false')
})

test('« Équilibré » gives 25/25/45/5 and saves exactly those shares, then goes to the expenses', async () => {
  render(<ObjectifsPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Équilibré' }))
  expect(value('Argent disponible')).toBe('25 %')
  expect(value('Épargne sécurisée')).toBe('25 %')
  expect(value('Placements en bourse')).toBe('45 %')
  expect(value('Or et crypto')).toBe('5 %')
  // Today’s split stays written under each name.
  expect(within(row('Placements en bourse')).getByText('aujourd’hui 37 %')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(mocks.addGoal).toHaveBeenCalledTimes(1)
  const [, , goal] = mocks.addGoal.mock.calls[0] as [unknown, unknown, GoalAllocation]
  expect(mocks.addGoal.mock.calls[0][0]).toBe(client)
  expect(parseGoalAllocation(goal)).not.toBeNull()
  expect(goal.shares).toEqual({ available: 25, secured: 25, markets: 45, gold: 5, rental: 0 })
  expect(mocks.push).toHaveBeenCalledWith('/')
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
})

test('« Prudent » gives 40/45/15/0 and saves a 0 % for « Or et crypto »', async () => {
  render(<ObjectifsPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Prudent' }))
  expect(value('Or et crypto')).toBe('0 %')
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  const [, , goal] = mocks.addGoal.mock.calls[0] as [unknown, unknown, GoalAllocation]
  expect(goal.shares).toEqual({ available: 40, secured: 45, markets: 15, gold: 0, rental: 0 })
})

test('two minus leave 2 % to place, drawn as an outline, and « Enregistrer » is disabled', async () => {
  render(<ObjectifsPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Équilibré' }))
  await userEvent.click(within(row('Placements en bourse')).getByRole('button', { name: /Moins/ }))
  await userEvent.click(within(row('Épargne sécurisée')).getByRole('button', { name: /Moins/ }))
  expect(screen.getByText('Il reste 2 % à placer')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  expect(widths()).toEqual([
    ['share', '25%'],
    ['share', '24%'],
    ['share', '44%'],
    ['share', '5%'],
    ['unplaced', '2%'],
  ])
  // All the plus are open while percents remain; once placed they close.
  await userEvent.click(within(row('Or et crypto')).getByRole('button', { name: /Plus/ }))
  await userEvent.click(within(row('Or et crypto')).getByRole('button', { name: /Plus/ }))
  expect(value('Or et crypto')).toBe('7 %')
  expect(screen.getByText('100 % répartis')).toBeInTheDocument()
  expect(within(row('Or et crypto')).getByRole('button', { name: /Plus/ })).toBeDisabled()
})

test('a minus is disabled at 0', async () => {
  render(<ObjectifsPage />)
  await userEvent.click(within(row('Or et crypto')).getByRole('button', { name: /Moins/ }))
  await userEvent.click(within(row('Or et crypto')).getByRole('button', { name: /Moins/ }))
  expect(value('Or et crypto')).toBe('0 %')
  expect(within(row('Or et crypto')).getByRole('button', { name: /Moins/ })).toBeDisabled()
})

test('a failed save says so and stays', async () => {
  mocks.addGoal.mockRejectedValue(new Error('network'))
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  render(<ObjectifsPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Ça n’a pas été enregistré. Vérifie ta connexion et réessaie.')
  expect(mocks.push).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled()
  expect(spy).toHaveBeenCalled()
  spy.mockRestore()
})

test('« Plus tard » goes to the expenses without saving', async () => {
  render(<ObjectifsPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Plus tard' }))
  expect(mocks.addGoal).not.toHaveBeenCalled()
  expect(mocks.push).toHaveBeenCalledWith('/')
})

test('everything in the home: nothing to split, « Continuer » and no skip', async () => {
  const profile: Profile = {
    ...exampleProfile,
    accounts: [account('h', 'home')],
    lines: [line('hl', 'h', { category: 'property' })],
  }
  mocks.state.current = ready(profile, snapshotOf([amountEntry('hl', 100_000)]))
  render(<ObjectifsPage />)
  expect(screen.getByText('Tout ton argent est dans ton logement : il n’y a rien à répartir pour l’instant.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Plus tard' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Continuer' }))
  expect(mocks.push).toHaveBeenCalledWith('/')
  expect(mocks.addGoal).not.toHaveBeenCalled()
})

test('everything in two homes of Chez toi: « dans tes logements »', () => {
  const profile: Profile = {
    ...exampleProfile,
    accounts: [account('h', 'home'), account('s', 'home', { residence: 'secondary' })],
    lines: [line('hl', 'h', { category: 'property' }), line('sl', 's', { category: 'property' })],
  }
  mocks.state.current = ready(profile, snapshotOf([amountEntry('hl', 100_000), amountEntry('sl', 50_000)]))
  render(<ObjectifsPage />)
  expect(screen.getByText('Tout ton argent est dans tes logements : il n’y a rien à répartir pour l’instant.')).toBeInTheDocument()
})

test('opened from the settings: back, « Plus tard » and the save return there, never to the expenses', async () => {
  mocks.params.current = new URLSearchParams('depuis=reglages')
  render(<ObjectifsPage />)
  expect(screen.getByRole('link', { name: '‹ Retour' })).toHaveAttribute('href', '/reglages')
  await userEvent.click(screen.getByRole('button', { name: 'Plus tard' }))
  expect(mocks.push).toHaveBeenLastCalledWith('/reglages')
  await userEvent.click(screen.getByRole('button', { name: 'Équilibré' }))
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(mocks.addGoal).toHaveBeenCalledTimes(1)
  expect(mocks.push).toHaveBeenLastCalledWith('/reglages')
  expect(mocks.push).not.toHaveBeenCalledWith('/premier-lancement/depenses')
})

test('unreadable, failed and loading states', async () => {
  mocks.state.current = ready(exampleProfile, exampleSnapshot, 1)
  const { rerender } = render(<ObjectifsPage />)
  expect(screen.getByRole('alert')).toHaveTextContent(plain(UNREADABLE))
  expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  expect(mocks.reload).toHaveBeenCalledOnce()
  mocks.reload.mockReset()
  mocks.state.current = { status: 'failed', retry: mocks.reload }
  rerender(<ObjectifsPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  expect(mocks.reload).toHaveBeenCalled()
  mocks.state.current = { status: 'loading' }
  rerender(<ObjectifsPage />)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

// ---- The available money in months (docs/superpowers/specs/2026-11-11-coussin-objectif-design.md) ----

// The example's state with a budget of 2 500 € of expenses a month, and an optional goal in force.
function withBudget(goal?: GoalAllocation): ModelState {
  const state = ready(exampleProfile, exampleSnapshot) as Extract<ModelState, { status: 'ready' }>
  state.model.settings = loaded({ schema: 1, budget: { basis: 'expenses', monthly: 2_500_00 }, display: 'euros', hideAmounts: false })
  if (goal) state.model.goals = [loaded(goal, 'g0')]
  return state
}
const monthsText = () => plain(screen.getByTestId('cushion').textContent)

test('with a budget, the available money is aimed at in months, the four others in percents of the rest', () => {
  mocks.state.current = withBudget()
  render(<ObjectifsPage />)
  // 24 % of 82 000 € is 19 680 €: about 8 months of 2 500 €.
  expect(monthsText()).toBe('Argent disponible : garder 8 mois de dépenses, soit 20 000 €')
  expect(screen.queryByText('aujourd’hui 24 %')).toBeNull()
  expect(value('Épargne sécurisée')).toBe('49 %')
  expect(value('Placements en bourse')).toBe('49 %')
  expect(value('Or et crypto')).toBe('2 %')
})

test('an example sets its months and its shares of the rest', async () => {
  mocks.state.current = withBudget()
  render(<ObjectifsPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Prudent' }))
  expect(monthsText()).toBe('Argent disponible : garder 6 mois de dépenses, soit 15 000 €')
  expect(value('Épargne sécurisée')).toBe('75 %')
  expect(value('Placements en bourse')).toBe('25 %')
})

test('more months, then saving: the goal is written in months, its available share at 0', async () => {
  mocks.state.current = withBudget()
  render(<ObjectifsPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Plus de mois' }))
  expect(monthsText()).toBe('Argent disponible : garder 9 mois de dépenses, soit 22 500 €')
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  const saved = mocks.addGoal.mock.calls[0][2] as GoalAllocation
  expect(saved.cushionMonths).toBe(9)
  expect(saved.shares).toEqual({ available: 0, secured: 49, markets: 49, gold: 2, rental: 0 })
  expect(parseGoalAllocation(saved)).toEqual(saved)
})

test('beyond a year, a line says that money loses to inflation, and saving still works', async () => {
  mocks.state.current = withBudget({ schema: 1, validFrom: '2026-01-01', shares: { available: 0, secured: 49, markets: 49, gold: 2, rental: 0 }, cushionMonths: 12 })
  render(<ObjectifsPage />)
  expect(screen.queryByText(/perd face à l’inflation/)).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Plus de mois' }))
  expect(screen.getByText(/perd face à l’inflation/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled()
})

test('a goal saved in percents opens in months, filled with what its share is worth today', () => {
  // 15 % of 82 000 € is 12 300 €: about 5 months.
  mocks.state.current = withBudget({ schema: 1, validFrom: '2026-01-01', shares: { available: 15, secured: 35, markets: 45, gold: 5, rental: 0 } })
  render(<ObjectifsPage />)
  expect(monthsText()).toBe('Argent disponible : garder 5 mois de dépenses, soit 12 500 €')
})

test('without a budget, the screen of today, and a way to give one', () => {
  render(<ObjectifsPage />)
  expect(screen.queryByTestId('cushion')).toBeNull()
  expect(value('Argent disponible')).toBe('24 %')
  expect(screen.getByRole('link', { name: 'Renseigner tes dépenses pour viser ton argent disponible en mois' })).toHaveAttribute(
    'href',
    '/premier-lancement/depenses',
  )
})

// « aujourd’hui » on the same basis as the shares set: parts of what the cushion leaves.
test('in months, « aujourd’hui » tells the share of the rest, like the value beside it', () => {
  mocks.state.current = withBudget()
  render(<ObjectifsPage />)
  expect(within(row('Épargne sécurisée')).getByText('aujourd’hui 49 %')).toBeInTheDocument()
  expect(within(row('Or et crypto')).getByText('aujourd’hui 2 %')).toBeInTheDocument()
})

// A goal in months and no budget: never offered back as « 0 % » of available money, which saving would make true.
test('a goal in months without a budget is not offered as 0 %, and says what it needs', () => {
  const state = ready(exampleProfile, exampleSnapshot) as Extract<ModelState, { status: 'ready' }>
  state.model.goals = [loaded({ schema: 1, validFrom: '2026-01-01', shares: { available: 0, secured: 49, markets: 49, gold: 2, rental: 0 }, cushionMonths: 4 }, 'g0')]
  mocks.state.current = state
  render(<ObjectifsPage />)
  expect(screen.queryByRole('button', { name: 'Mes objectifs' })).toBeNull()
  expect(value('Argent disponible')).toBe('24 %')
  expect(plain(screen.getByText(/Ton objectif vise/).textContent)).toBe(
    'Ton objectif vise 4 mois de côté pour ton argent disponible : renseigne tes dépenses pour le garder.',
  )
})
