// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { GOAL_PRESETS } from '@/lib/catalog'
import type { Model, ModelState } from '@/lib/app/use-model'
import { account, amountEntry, line, profileOf, snapshotOf } from '@/lib/model/__tests__/fixtures'
import type { GoalAllocation, Snapshot } from '@/lib/model/types'
import EvolutionPage from '../evolution/page'

const mocks = vi.hoisted(() => ({
  state: { current: { status: 'loading' } as ModelState },
}))

vi.mock('@/lib/app/use-model', () => ({ useModel: () => mocks.state.current }))
vi.mock('@/lib/model/repository', () => ({ saveSettings: vi.fn().mockResolvedValue('settings-id') }))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}))

const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const goal: GoalAllocation = { schema: 1, validFrom: '2026-01-01', shares: GOAL_PRESETS.balanced.shares }
const plain = (text: string | null) => text?.replace(/[  ]/g, ' ') ?? ''

const profile = profileOf(
  [account('a-liv', 'livret-a'), account('a-per', 'per', { name: 'PER' })],
  [line('liv', 'a-liv', { category: 'available' }), line('per-line', 'a-per')],
)
const snapshot = (takenOn: string, liv: number, per: number): Snapshot => ({
  ...snapshotOf([amountEntry('liv', liv), amountEntry('per-line', per)]),
  takenOn,
})

function ready(snapshots: Snapshot[], unreadableSnapshots = 0): ModelState {
  const model: Model = {
    profile: loaded(profile),
    snapshots: snapshots.map((s, i) => loaded(s, `s${i}`)),
    goals: [loaded(goal, 'g0')],
    settings: null,
    draft: null,
    unreadable: { profile: 0, snapshots: unreadableSnapshots, goals: 0, settings: 0, draft: 0 },
  }
  return { status: 'ready', model, client: {} as never, dataKey: {} as CryptoKey, reload: vi.fn() }
}

beforeEach(() => {
  mocks.state.current = { status: 'loading' }
})
afterEach(cleanup)

// A first launch half done: no curve and no total, whatever was typed. The three tabs say the same
// thing, the words of Mon argent: where the person is, and « Continuer ».
test('a first launch not finished: no curve and no total, where one is, and « Continuer »', () => {
  const state = ready([snapshot('2026-09-30', 10_000, 20_000)])
  if (state.status !== 'ready') throw new Error('not ready')
  const firstLaunch = { complete: false, finished: [] as string[], planned: [] as string[] }
  mocks.state.current = { ...state, model: { ...state.model, profile: loaded({ ...profile, firstLaunch }) } }
  render(<EvolutionPage />)
  expect(screen.getByText('Il te reste 1 banque à ajouter')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Continuer' })).toHaveAttribute('href', '/premier-lancement/etape')
  expect(screen.queryByRole('heading', { name: 'Ta courbe commence ici' })).toBeNull()
  expect(screen.queryByText(/Ta courbe/)).toBeNull()
  expect(screen.queryByTestId('since-first')).toBeNull()
  expect(screen.getByRole('navigation', { name: 'Onglets' })).toBeInTheDocument()
})

test('with one snapshot: the curve begins here, and the update is one tap away', () => {
  mocks.state.current = ready([snapshot('2026-09-30', 10_000, 20_000)])
  render(<EvolutionPage />)
  expect(screen.getByRole('heading', { name: 'Ta courbe commence ici' })).toBeInTheDocument()
  expect(screen.getByText(/30 septembre 2026/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Mettre à jour maintenant' })).toHaveAttribute('href', '/mise-a-jour')
  expect(screen.queryByRole('slider')).toBeNull()
  expect(screen.getByRole('link', { name: 'Évolution' })).toHaveAttribute('aria-current', 'page')
})

test('with a history: the sections come in the order of the spec', () => {
  mocks.state.current = ready([snapshot('2025-06-30', 10_000, 20_000), snapshot('2026-09-30', 12_000, 22_000)])
  render(<EvolutionPage />)
  const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
  expect(headings).toEqual([
    'Depuis ton premier relevé',
    'La courbe',
    'Ta grille, relevé par relevé',
    'Tes objectifs',
    'D’où ça vient',
    'Tes relevés',
  ])
  expect(plain(screen.getByTestId('since-first').textContent)).toContain('+4 000 €')
  expect(screen.getByRole('slider')).toBeInTheDocument()
  expect(screen.getByText('comparé à tes premiers objectifs')).toBeInTheDocument()
})

// Two snapshots 20 € apart on a hundred-square scale of 400 € a square: the curve would be a flat line.
test('a curve that would show nothing is not drawn: the sentence, the wait, the list of snapshots', () => {
  mocks.state.current = ready([snapshot('2026-09-30', 10_000, 20_000), snapshot('2026-11-09', 10_020, 20_000)])
  render(<EvolutionPage />)
  const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
  expect(headings).toEqual(['Depuis ton premier relevé', 'Ta grille, relevé par relevé', 'Tes objectifs', 'D’où ça vient', 'Tes relevés'])
  expect(screen.queryByRole('slider')).toBeNull()
  expect(plain(screen.getByTestId('since-first').textContent)).toMatch(/^\+20 €.*depuis septembre$/)
  expect(screen.getByText('La courbe apparaîtra dès qu’elle montrera quelque chose.')).toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: 'Tes relevés' })).getAllByRole('listitem')).toHaveLength(2)
})

test('« Catégorie par catégorie » is folded: one row opens it, and it folds again', async () => {
  mocks.state.current = ready([snapshot('2025-06-30', 10_000, 20_000), snapshot('2026-09-30', 12_000, 22_000)])
  render(<EvolutionPage />)
  const row = screen.getByRole('button', { name: /^Voir catégorie par catégorie/ })
  expect(row).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('heading', { name: 'Catégorie par catégorie' })).toBeNull()
  await userEvent.click(row)
  expect(screen.getByRole('heading', { name: 'Catégorie par catégorie' })).toBeInTheDocument()
  // Folded, not hidden: « Masquer » is the word of the amounts.
  expect(screen.getByRole('button', { name: /^Replier catégorie par catégorie/ })).toHaveAttribute('aria-expanded', 'true')
  await userEvent.click(screen.getByRole('button', { name: /^Replier catégorie par catégorie/ }))
  expect(screen.queryByRole('heading', { name: 'Catégorie par catégorie' })).toBeNull()
})

test('the gain since the first snapshot is touched to pass in percent, as « 19 € de plus » is on Mon argent', async () => {
  mocks.state.current = ready([snapshot('2025-06-30', 10_000, 20_000), snapshot('2026-09-30', 12_000, 22_000)])
  render(<EvolutionPage />)
  const figure = within(screen.getByTestId('since-first')).getByRole('button')
  expect(plain(figure.textContent)).toBe('+4 000 €')
  await userEvent.click(figure)
  // 4 000 € on 30 000 €.
  expect(plain(figure.textContent)).toBe('+13,3 %')
  await userEvent.click(figure)
  expect(plain(figure.textContent)).toBe('+4 000 €')
})

test('with a history: the date of the figures comes right under the title, as on Mon argent', () => {
  mocks.state.current = ready([snapshot('2025-06-30', 10_000, 20_000), snapshot('2026-09-30', 12_000, 22_000)])
  render(<EvolutionPage />)
  // In reading order, the first thing after the title (B6 puts the title in its own column on a computer).
  const title = screen.getByRole('heading', { level: 1, name: 'Évolution' })
  // The column of the title (the title sits in the row it shares with the magnifier of « Trouver »).
  const after = title.closest('[data-columns] > *')!.nextElementSibling!
  expect(after.querySelector('p')).toHaveTextContent('Chiffres du 30 septembre')
})

test('the gain since the first snapshot has a real space before « sur ce qui est à toi »', () => {
  mocks.state.current = ready([snapshot('2025-06-30', 10_000, 20_000), snapshot('2026-09-30', 12_000, 22_000)])
  render(<EvolutionPage />)
  // What a screen reader reads: no « €sur ».
  expect(plain(screen.getByTestId('since-first').textContent)).toMatch(/€.* sur ce qui est à toi$/)
})

test('says which payments are unknown, under where it comes from', () => {
  mocks.state.current = ready([snapshot('2025-06-30', 10_000, 20_000), snapshot('2026-09-30', 12_000, 22_000)])
  render(<EvolutionPage />)
  const section = screen.getByRole('region', { name: 'D’où ça vient' })
  expect(
    within(section).getByText('Les versements sur ton PER ne sont pas connus : sa variation est comptée dans les marchés.'),
  ).toBeInTheDocument()
  expect(within(section).getByText('Ton effort')).toBeInTheDocument()
})

test('lists the snapshots newest first', () => {
  mocks.state.current = ready([snapshot('2025-06-30', 10_000, 20_000), snapshot('2026-09-30', 12_000, 22_000)])
  render(<EvolutionPage />)
  const rows = within(screen.getByRole('region', { name: 'Tes relevés' })).getAllByRole('listitem')
  expect(rows).toHaveLength(2)
  expect(plain(rows[0].textContent)).toContain('30 septembre 2026')
  expect(plain(rows[0].textContent)).toContain('34 000 €')
  expect(plain(rows[1].textContent)).toContain('30 juin 2025')
})

// Corriger un relevé passé (planche 8B): each row opens its relevé; the square value left the list.
test('each relevé is a link to its page, the latest says so, and no square value is listed', () => {
  mocks.state.current = ready([snapshot('2025-06-30', 10_000, 20_000), snapshot('2026-09-30', 12_000, 22_000)])
  render(<EvolutionPage />)
  const section = screen.getByRole('region', { name: 'Tes relevés' })
  // Évolution's « Tes relevés » is reached from a line's fiche (/evolution#releves).
  expect(section).toHaveAttribute('id', 'releves')
  const links = within(section).getAllByRole('link')
  expect(links.map((l) => l.getAttribute('href'))).toEqual(['/releve/s1', '/releve/s0'])
  expect(plain(links[0].textContent)).toMatch(/^30 septembre 2026\s*le dernier\s*34 000 €\s*›$/)
  expect(plain(links[1].textContent)).toMatch(/^30 juin 2025\s*30 000 €\s*›$/)
  expect(within(section).queryByText(/carré/)).toBeNull()
})

test('an unreadable snapshot is said, with no curve and no « pas encore de relevé »', () => {
  mocks.state.current = ready([snapshot('2025-06-30', 10_000, 20_000), snapshot('2026-09-30', 12_000, 22_000)], 1)
  render(<EvolutionPage />)
  expect(screen.getByText('Une partie de tes chiffres n’a pas pu être lue. Rien n’a été effacé.')).toBeInTheDocument()
  expect(screen.queryByRole('slider')).toBeNull()
  expect(screen.queryByText(/pas encore de relevé/)).toBeNull()
  expect(screen.getByRole('navigation', { name: 'Onglets' })).toBeInTheDocument()
})

test('with one snapshot, its notes are said', () => {
  const broken: Snapshot = { ...snapshotOf([amountEntry('ghost', 1)]), takenOn: '2026-10-31' }
  mocks.state.current = ready([snapshot('2026-09-30', 10_000, 20_000), broken])
  render(<EvolutionPage />)
  expect(screen.getByRole('heading', { name: 'Ta courbe commence ici' })).toBeInTheDocument()
  expect(screen.getByText(/Le relevé du 31 octobre 2026 n’a pas pu être lu/)).toBeInTheDocument()
})

test('two snapshots of the same day: no curve, its sentence, and the rest of the screen stays', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.state.current = ready([snapshot('2026-11-08', 10_000, 20_000), snapshot('2026-11-08', 12_000, 22_000)])
  render(<EvolutionPage />)
  expect(screen.queryByRole('slider')).toBeNull()
  const curve = screen.getByRole('region', { name: 'La courbe' })
  expect(within(curve).getByText('Tes relevés sont tous du même jour : ta courbe se dessinera avec un relevé d’un autre jour.')).toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: 'Tes relevés' })).getAllByRole('listitem')).toHaveLength(2)
  // Rows keyed by snapshot, not by date: React has no duplicate key to complain about.
  expect(error.mock.calls.flat().join(' ')).not.toMatch(/same key/)
  error.mockRestore()
})

test('a failed load offers to try again, and the tab bar stays', () => {
  const retry = vi.fn()
  mocks.state.current = { status: 'failed', retry }
  render(<EvolutionPage />)
  expect(screen.getByRole('alert')).toHaveTextContent('Tes chiffres n’ont pas pu être chargés.')
  expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: 'Onglets' })).toBeInTheDocument()
})

// Planche 4: the grid from one real snapshot to the next.
describe('the grid, snapshot by snapshot', () => {
  const three = () =>
    ready([snapshot('2025-06-30', 30_000, 10_000), snapshot('2026-03-31', 20_000, 20_000), snapshot('2026-09-30', 10_000, 30_000)])
  const region = () => screen.getByRole('region', { name: 'Ta grille, relevé par relevé' })
  const colours = () =>
    Array.from(region().querySelectorAll('[data-square]')).map((s) => s.getAttribute('data-category'))

  beforeEach(() => {
    vi.useFakeTimers()
    mocks.state.current = three()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  test('opens on the latest snapshot and plays nothing by itself', () => {
    render(<EvolutionPage />)
    expect(plain(within(region()).getByText(/^Relevé du/).textContent)).toBe('Relevé du 30 septembre 2026 · le dernier')
    expect(within(region()).getByRole('button', { name: 'Suivant ›' })).toBeDisabled()
    expect(within(region()).getByRole('img', { name: /30 septembre 2026/ })).toBeInTheDocument()
    const before = colours()
    act(() => vi.advanceTimersByTime(10_000))
    expect(colours()).toEqual(before)
  })

  test('« Précédent » shows the snapshot before at once: its date, its amount; the squares stay in their cells', () => {
    render(<EvolutionPage />)
    const latest = colours()
    fireEvent.click(within(region()).getByRole('button', { name: '‹ Précédent' }))
    expect(plain(within(region()).getByText(/^Relevé du/).textContent)).toBe('Relevé du 31 mars 2026')
    expect(plain(region().textContent)).toContain('40 000 €')
    const before = colours()
    expect(before).toHaveLength(100)
    const changed = before.filter((c, i) => c !== latest[i]).length
    expect(changed).toBeGreaterThan(0)
    expect(plain(region().textContent)).toContain(`${changed} carrés changent de couleur`)
    // Only the squares that change wait their turn.
    const squares = Array.from(region().querySelectorAll<HTMLElement>('[data-square]'))
    expect(squares.filter((s) => s.style.transitionDelay !== '')).toHaveLength(changed)
  })

  test('reaching the first snapshot with the keyboard, the focus goes to « Suivant » instead of being lost', () => {
    render(<EvolutionPage />)
    const previous = within(region()).getByRole('button', { name: '‹ Précédent' })
    const next = within(region()).getByRole('button', { name: 'Suivant ›' })
    previous.focus()
    fireEvent.click(previous)
    expect(document.activeElement).toBe(previous)
    fireEvent.click(previous)
    expect(previous).toBeDisabled()
    expect(document.activeElement).toBe(next)
    // And back at the latest, on « Précédent ».
    fireEvent.click(next)
    fireEvent.click(next)
    expect(next).toBeDisabled()
    expect(document.activeElement).toBe(previous)
  })

  test('the header keeps its place from one snapshot to the next: the date and the value of a square each on a line of their own', () => {
    render(<EvolutionPage />)
    const date = within(region()).getByText(/^Relevé du/)
    const square = within(region()).getByText(/^1 carré = /)
    expect(date).toHaveClass('whitespace-nowrap')
    expect(square).toHaveClass('whitespace-nowrap')
    // One above the other, never side by side: the header is always two lines, whatever the date.
    expect(date.parentElement).toBe(square.parentElement)
    expect(date.parentElement).toHaveClass('flex-col')
  })

  test('« Rejouer depuis le début » steps slowly through every snapshot once, and ends on the latest', () => {
    render(<EvolutionPage />)
    fireEvent.click(within(region()).getByRole('button', { name: 'Rejouer depuis le début' }))
    expect(plain(within(region()).getByText(/^Relevé du/).textContent)).toBe('Relevé du 30 juin 2025')
    expect(within(region()).getByRole('button', { name: 'Arrêter' })).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(3_500))
    expect(plain(within(region()).getByText(/^Relevé du/).textContent)).toBe('Relevé du 31 mars 2026')
    act(() => vi.advanceTimersByTime(3_500))
    expect(plain(within(region()).getByText(/^Relevé du/).textContent)).toBe('Relevé du 30 septembre 2026 · le dernier')
    expect(within(region()).getByRole('button', { name: 'Rejouer depuis le début' })).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(10_000))
    expect(plain(within(region()).getByText(/^Relevé du/).textContent)).toBe('Relevé du 30 septembre 2026 · le dernier')
  })

  test('touching « Suivant » during the replay stops it where the person is', () => {
    render(<EvolutionPage />)
    fireEvent.click(within(region()).getByRole('button', { name: 'Rejouer depuis le début' }))
    fireEvent.click(within(region()).getByRole('button', { name: 'Suivant ›' }))
    expect(plain(within(region()).getByText(/^Relevé du/).textContent)).toBe('Relevé du 31 mars 2026')
    act(() => vi.advanceTimersByTime(10_000))
    expect(plain(within(region()).getByText(/^Relevé du/).textContent)).toBe('Relevé du 31 mars 2026')
  })

  test('with fewer animations asked, each snapshot is shown in its final state at once, and nothing replays', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    render(<EvolutionPage />)
    expect(within(region()).queryByRole('button', { name: 'Rejouer depuis le début' })).toBeNull()
    fireEvent.click(within(region()).getByRole('button', { name: '‹ Précédent' }))
    const squares = Array.from(region().querySelectorAll<HTMLElement>('[data-square]'))
    expect(squares.every((s) => s.style.transitionDelay === '' && !s.classList.contains('square-motion'))).toBe(true)
  })
})
