// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { ModelState } from '@/lib/app/use-model'
import { setGroups } from '@/lib/correct/profile-changes'
import type { GroupId } from '@/lib/model/types'
import { account, line, profileOf, snapshotOf } from '@/lib/model/__tests__/fixtures'
import RangerPage from '../page'

const mocks = vi.hoisted(() => ({
  state: { current: { status: 'loading' } as ModelState },
  params: { id: 'markets' },
  push: vi.fn(),
  replace: vi.fn(),
  save: vi.fn(),
  reload: vi.fn(),
}))

vi.mock('@/lib/app/use-model', () => ({ useModel: () => mocks.state.current }))
vi.mock('@/lib/correct/save', () => ({ saveCorrection: mocks.save }))
vi.mock('next/navigation', () => ({
  useParams: () => mocks.params,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}))

const profile = profileOf(
  [account('pea', 'pea')],
  [
    line('a', 'pea', { name: 'Amundi MSCI World', kind: 'units' }),
    line('b', 'pea', { name: 'Ma pépite', kind: 'units' }),
    line('c', 'pea', { name: 'Fonds Europe', kind: 'units', group: 'europe' }),
  ],
)

function ready() {
  mocks.state.current = {
    status: 'ready',
    client: {},
    dataKey: {},
    reload: mocks.reload,
    model: {
      profile: { id: 'p', value: profile, updatedAt: '2026-10-01T00:00:00Z' },
      snapshots: [{ id: 's', value: snapshotOf([]), updatedAt: '2026-10-01T00:00:00Z' }],
      goals: [],
      settings: null,
      draft: null,
      unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
    },
  } as unknown as ModelState
}

beforeEach(() => {
  mocks.params.id = 'markets'
  mocks.push.mockReset()
  mocks.replace.mockReset()
  mocks.save.mockReset()
  mocks.reload.mockReset()
  ready()
})
afterEach(cleanup)

test('shows the title, the intro and one named select per line', () => {
  render(<RangerPage />)
  expect(screen.getByRole('heading', { name: 'Ranger par zone' })).toBeInTheDocument()
  expect(screen.getByText(/Une proposition pour chaque ligne/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '‹ Placements en bourse' })).toHaveAttribute('href', '/categorie/markets')
  expect(screen.getByRole('combobox', { name: /Amundi MSCI World/ })).toHaveValue('world')
  expect(screen.getByRole('combobox', { name: /Fonds Europe/ })).toHaveValue('europe')
  const unknown = screen.getByRole('combobox', { name: /Ma pépite/ })
  expect(unknown).toHaveValue('unknown')
  expect(unknown.className).toContain('border-dashed')
  expect(screen.getByRole('combobox', { name: /Amundi MSCI World/ }).className).not.toContain('border-dashed')
  expect(screen.getByRole('button', { name: 'Valider ces 3\u00a0choix' })).toBeInTheDocument()
})

test('nothing is saved before the button; it saves every row with the changes', async () => {
  const user = userEvent.setup()
  mocks.save.mockResolvedValue('saved')
  render(<RangerPage />)
  await user.selectOptions(screen.getByRole('combobox', { name: /Ma pépite/ }), 'us')
  expect(mocks.save).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: 'Valider ces 3\u00a0choix' }))
  expect(mocks.save).toHaveBeenCalledOnce()
  const plan = mocks.save.mock.calls[0][2] as (s: unknown) => { writes: Array<{ kind: string; value: unknown }> }
  const reRead = profileOf([account('pea', 'pea')], [line('a', 'pea', { name: 'A', kind: 'units' })])
  const choices: Array<{ lineId: string; group: GroupId }> = [
    { lineId: 'a', group: 'world' },
    { lineId: 'b', group: 'us' },
    { lineId: 'c', group: 'europe' },
  ]
  expect(plan({ profile: { id: 'p', value: reRead }, snapshots: [] }).writes).toEqual([
    { kind: 'profile', value: setGroups(reRead, choices) },
  ])
  // replace, not push: the back button must not reopen the ranging screen.
  expect(mocks.replace).toHaveBeenCalledWith('/categorie/markets')
  expect(mocks.push).not.toHaveBeenCalled()
})

test('another outcome shows its sentence and goes nowhere', async () => {
  const user = userEvent.setup()
  mocks.save.mockResolvedValue('update-running')
  render(<RangerPage />)
  await user.click(screen.getByRole('button', { name: 'Valider ces 3\u00a0choix' }))
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(mocks.push).not.toHaveBeenCalled()
  expect(mocks.replace).not.toHaveBeenCalled()
})

test('while it saves, the vault locking takes its place; another outcome brings it back', async () => {
  const user = userEvent.setup()
  let finish: (outcome: string) => void = () => {}
  mocks.save.mockImplementationOnce(() => new Promise<string>((resolve) => (finish = resolve)))
  render(<RangerPage />)
  await user.click(screen.getByRole('button', { name: 'Valider ces 3\u00a0choix' }))
  expect(await screen.findByText('Mise sous clé…', { selector: 'p' }, { timeout: 1000 })).toBeInTheDocument()
  await act(async () => finish('update-running'))
  expect(screen.queryByText('Mise sous clé…', { selector: 'p' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Valider ces 3\u00a0choix' })).toBeVisible()
  expect(screen.getByRole('alert')).toBeInTheDocument()
})

test('a route that is not a ranged category shows nothing to rank and a way back', () => {
  mocks.params.id = 'available'
  render(<RangerPage />)
  expect(screen.getByText('Rien à ranger ici.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '‹ Mon argent' })).toHaveAttribute('href', '/')
})

test('the button keeps its number and « choix » together', () => {
  render(<RangerPage />)
  expect(screen.getByRole('button', { name: /Valider/ }).textContent).toBe('Valider ces 3\u00a0choix')
})

test('a row says where the line is, and its caption is tied to its select', () => {
  render(<RangerPage />)
  const select = screen.getByRole('combobox', { name: /Amundi MSCI World/ })
  const caption = document.getElementById(select.getAttribute('aria-describedby') ?? '')
  expect(caption).not.toBeNull()
  expect(caption!.textContent).toMatch(/^PEA .* · deviné d’après son indice$/)
  const stored = screen.getByRole('combobox', { name: /Fonds Europe/ })
  expect(document.getElementById(stored.getAttribute('aria-describedby') ?? '')?.textContent).toMatch(/^PEA /)
  expect(document.getElementById(stored.getAttribute('aria-describedby') ?? '')?.textContent).not.toContain('·')
})

test('the select reads at 16 px at least, and the screen sits in the shared columns', () => {
  const { container } = render(<RangerPage />)
  expect(screen.getByRole('combobox', { name: /Ma pépite/ }).className).toContain('text-subtitle')
  expect(container.querySelector('[data-columns]')).not.toBeNull()
})

test('while loading, the back link names the category', () => {
  mocks.state.current = { status: 'loading' } as ModelState
  render(<RangerPage />)
  expect(screen.getByRole('link', { name: '‹ Placements en bourse' })).toHaveAttribute('href', '/categorie/markets')
  cleanup()
  mocks.params.id = 'secured'
  render(<RangerPage />)
  expect(screen.getByRole('link', { name: '‹ Épargne sécurisée' })).toHaveAttribute('href', '/categorie/secured')
})

test('secured selects are named « Type de … »', () => {
  mocks.params.id = 'secured'
  mocks.state.current = {
    ...(mocks.state.current as object),
    model: {
      ...(mocks.state.current as unknown as { model: object }).model,
      profile: { id: 'p', value: profileOf([account('life', 'life-insurance')], [line('f', 'life', { name: 'Fonds euros' })]), updatedAt: 'x' },
    },
  } as unknown as ModelState
  render(<RangerPage />)
  expect(screen.getByRole('combobox', { name: 'Type de Fonds euros' })).toBeInTheDocument()
})

test('markets selects are named « Zone de … »', () => {
  render(<RangerPage />)
  expect(screen.getByRole('combobox', { name: 'Zone de Ma pépite' })).toBeInTheDocument()
})

test('one row reads « Valider ce choix »', () => {
  mocks.state.current = {
    ...(mocks.state.current as object),
    model: {
      ...(mocks.state.current as unknown as { model: object }).model,
      profile: { id: 'p', value: profileOf([account('pea', 'pea')], [line('a', 'pea', { kind: 'units' })]), updatedAt: 'x' },
    },
  } as unknown as ModelState
  render(<RangerPage />)
  expect(screen.getByRole('button', { name: 'Valider ce choix' })).toBeInTheDocument()
})
