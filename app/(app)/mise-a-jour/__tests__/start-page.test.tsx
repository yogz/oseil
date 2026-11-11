// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { exampleProfile, exampleSnapshot } from '@/lib/model/__tests__/fixtures'
import { markStep, startDraft } from '@/lib/update/draft'
import type { UpdateDraft } from '@/lib/model/types'
import type { UpdateState } from '@/lib/update/use-update'
import StartPage from '../page'

const mocks = vi.hoisted(() => ({
  state: { current: null as unknown },
  show: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  abandon: vi.fn(),
  restart: vi.fn(),
}))

vi.mock('@/components/update/UpdateProvider', () => ({
  useUpdateScreen: () => ({ state: mocks.state.current, current: null, show: mocks.show }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}))

function ready(draft: UpdateDraft = startDraft('s1'), saved = false): UpdateState {
  return {
    status: 'ready',
    session: {
      profile: exampleProfile,
      base: { id: 's1', value: exampleSnapshot, updatedAt: '' },
      draft,
      market: { prices: {}, rates: null },
      failedPrices: [],
      retryMarket: () => {},
      saved,
      change: async () => true,
      save: async () => true,
      abandon: mocks.abandon,
      settled: async () => true,
      resave: async () => true,
      saveError: null,
    },
  }
}

beforeEach(() => {
  for (const m of [mocks.show, mocks.push, mocks.replace, mocks.abandon, mocks.restart]) m.mockReset()
  mocks.abandon.mockResolvedValue(true)
  mocks.restart.mockResolvedValue(true)
  mocks.state.current = ready()
})
afterEach(cleanup)

test('a fresh draft: the title, three rows, « Commencer par Chez toi », no way to abandon', () => {
  render(<StartPage />)
  expect(screen.getByRole('heading', { name: 'Mettre à jour tes chiffres' })).toBeInTheDocument()
  expect(screen.getByText('0 sur 3')).toBeInTheDocument()
  expect(screen.getAllByText('3 lignes')).toHaveLength(2)
  expect(screen.getByRole('button', { name: 'Commencer par Chez toi' })).toBeInTheDocument()
  expect(screen.queryByText('Abandonner cette mise à jour')).not.toBeInTheDocument()
  expect(screen.queryByText('Voir le résultat maintenant')).not.toBeInTheDocument()
  expect(screen.getByText('Tu peux t’arrêter quand tu veux, rien n’est perdu.')).toBeInTheDocument()
})

test('« Fermer » goes to Mon argent', () => {
  render(<StartPage />)
  expect(screen.getByRole('link', { name: 'Fermer' })).toHaveAttribute('href', '/')
})

test('« Fermer » is on the right of the top line, as on every screen of the update; nothing before it', () => {
  render(<StartPage />)
  const close = screen.getByRole('link', { name: 'Fermer' })
  const top = close.parentElement as HTMLElement
  expect(top.lastElementChild).toBe(close)
  expect(top.firstElementChild).not.toBe(close)
})

test('touching a row shows that establishment and goes to the bank screen', async () => {
  render(<StartPage />)
  await userEvent.click(screen.getByRole('button', { name: /Linxea/ }))
  expect(mocks.show).toHaveBeenCalledWith('linxea')
  expect(mocks.push).toHaveBeenCalledWith('/mise-a-jour/banque')
})

test('the main button starts at the next establishment', async () => {
  render(<StartPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Commencer par Chez toi' }))
  expect(mocks.show).toHaveBeenCalledWith('home')
  expect(mocks.push).toHaveBeenCalledWith('/mise-a-jour/banque')
})

test('resumed: « Reprendre avec BoursoBank » and a link to the result', () => {
  mocks.state.current = ready(markStep(startDraft('s1'), 'home', 'done'), true)
  render(<StartPage />)
  expect(screen.getByText('1 sur 3')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Reprendre avec BoursoBank' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Voir le résultat maintenant' })).toHaveAttribute(
    'href',
    '/mise-a-jour/resultat',
  )
})

// A shortcut to add a platform during the update (Nicolas, 10 November 2026): the settings
// refuse it while an update runs, so the update carries it in its draft.
test('« + Ajouter une banque » adds Coinbase to the draft, then opens it', async () => {
  const change = vi.fn(async () => true)
  const state = ready()
  if (state.status !== 'ready') throw new Error('ready')
  mocks.state.current = { ...state, session: { ...state.session, change } }
  render(<StartPage />)

  await userEvent.click(screen.getByRole('button', { name: '+ Ajouter une banque' }))
  await userEvent.type(screen.getByLabelText('Chercher une banque…'), 'coinb')
  await userEvent.click(screen.getByRole('button', { name: 'Coinbase' }))

  expect(change).toHaveBeenCalledTimes(1)
  const applied = (change.mock.calls[0] as unknown as [(d: UpdateDraft) => UpdateDraft])[0](startDraft('s1'))
  const added = applied.added.establishments ?? []
  expect(added).toMatchObject([{ name: 'Coinbase', kind: 'institution', catalogId: 'coinbase' }])
  expect(mocks.show).toHaveBeenCalledWith(added[0].id)
  expect(mocks.push).toHaveBeenCalledWith('/mise-a-jour/banque')
})

test('a bank already in the list is refused with a word, and nothing is written', async () => {
  const change = vi.fn(async () => true)
  const state = ready()
  if (state.status !== 'ready') throw new Error('ready')
  mocks.state.current = { ...state, session: { ...state.session, change } }
  render(<StartPage />)

  await userEvent.click(screen.getByRole('button', { name: '+ Ajouter une banque' }))
  await userEvent.type(screen.getByLabelText('Chercher une banque…'), 'bourso')
  await userEvent.click(screen.getByRole('button', { name: 'BoursoBank' }))

  expect(change).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent('Cette banque est déjà dans ta liste.')
  expect(mocks.push).not.toHaveBeenCalled()
})

test('« Chez toi » is offered only when the profile has none', async () => {
  render(<StartPage />)
  await userEvent.click(screen.getByRole('button', { name: '+ Ajouter une banque' }))
  expect(screen.queryByRole('button', { name: 'Chez toi' })).not.toBeInTheDocument()
})

test('a write that fails keeps the screen and says so', async () => {
  const state = ready()
  if (state.status !== 'ready') throw new Error('ready')
  mocks.state.current = { ...state, session: { ...state.session, change: async () => false } }
  render(<StartPage />)

  await userEvent.click(screen.getByRole('button', { name: '+ Ajouter une banque' }))
  await userEvent.type(screen.getByLabelText('Chercher une banque…'), 'coinb')
  await userEvent.click(screen.getByRole('button', { name: 'Coinbase' }))

  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(mocks.push).not.toHaveBeenCalled()
})

test('every step set: « Voir le résultat »', () => {
  let draft = markStep(startDraft('s1'), 'home', 'done')
  draft = markStep(draft, 'boursobank', 'skipped')
  draft = markStep(draft, 'linxea', 'done')
  mocks.state.current = ready(draft, true)
  render(<StartPage />)
  expect(screen.getByRole('link', { name: 'Voir le résultat' })).toHaveAttribute('href', '/mise-a-jour/resultat')
  expect(screen.queryByText('Voir le résultat maintenant')).not.toBeInTheDocument()
})

test('abandoning asks first, then erases and goes home', async () => {
  mocks.state.current = ready(markStep(startDraft('s1'), 'home', 'done'), true)
  render(<StartPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Abandonner cette mise à jour' }))
  expect(
    screen.getByText('Ce que tu as saisi pour cette mise à jour sera effacé. Tes chiffres enregistrés ne changent pas.'),
  ).toBeInTheDocument()
  expect(mocks.abandon).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Abandonner' }))
  expect(mocks.abandon).toHaveBeenCalled()
  expect(mocks.replace).toHaveBeenCalledWith('/')
})

test('a failed abandon stays on the page and says so', async () => {
  mocks.abandon.mockResolvedValue(false)
  mocks.state.current = ready(markStep(startDraft('s1'), 'home', 'done'), true)
  render(<StartPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Abandonner cette mise à jour' }))
  await userEvent.click(screen.getByRole('button', { name: 'Abandonner' }))
  expect(mocks.replace).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toBeInTheDocument()
})

test('« Garder » closes the question', async () => {
  mocks.state.current = ready(markStep(startDraft('s1'), 'home', 'done'), true)
  render(<StartPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Abandonner cette mise à jour' }))
  await userEvent.click(screen.getByRole('button', { name: 'Garder' }))
  expect(screen.queryByRole('button', { name: 'Garder' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Abandonner cette mise à jour' })).toBeInTheDocument()
  expect(mocks.abandon).not.toHaveBeenCalled()
})

test('blocked shows its message and « Réessayer »', async () => {
  const retry = vi.fn()
  mocks.state.current = { status: 'blocked', message: 'Quelque chose n’a pas pu être lu.', retry }
  render(<StartPage />)
  expect(screen.getByText('Quelque chose n’a pas pu être lu.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  expect(retry).toHaveBeenCalled()
})

test('failed shows the load failure and « Réessayer »', async () => {
  const retry = vi.fn()
  mocks.state.current = { status: 'failed', retry }
  render(<StartPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  expect(retry).toHaveBeenCalled()
})

test('conflict: another device carried the update on, said as an alert, and « Recharger » reads it again', async () => {
  const reload = vi.fn()
  mocks.state.current = { status: 'conflict', message: 'Ta mise à jour a avancé sur un autre appareil.', reload }
  render(<StartPage />)
  expect(screen.getByRole('alert')).toHaveTextContent('Ta mise à jour a avancé sur un autre appareil.')
  await userEvent.click(screen.getByRole('button', { name: 'Recharger' }))
  expect(reload).toHaveBeenCalled()
})

// Decision 5: « Fermer » is on every screen, the ones that say something went wrong included.
test.each([
  { status: 'blocked', message: 'Quelque chose n’a pas pu être lu.', retry: () => {} },
  { status: 'failed', retry: () => {} },
  { status: 'unreadable', message: 'Illisible.', restart: async () => true },
  { status: 'conflict', message: 'Ta mise à jour a avancé sur un autre appareil.', reload: () => {} },
] as UpdateState[])('$status: « Fermer » goes to Mon argent, as on the ready screen', (state) => {
  mocks.state.current = state
  render(<StartPage />)
  const close = screen.getByRole('link', { name: 'Fermer' })
  expect(close).toHaveAttribute('href', '/')
  // On the right, as on the ready screen: the top line pushes it to its end.
  expect(close.parentElement).toHaveClass('justify-end')
})

// The update waits for the vault and the market (8 seconds at most): the wait of the site, never a blank screen.
test('loading: « Ouverture de ton coffre… », and a way out, on the right', () => {
  mocks.state.current = { status: 'loading' }
  vi.useFakeTimers()
  render(<StartPage />)
  act(() => vi.advanceTimersByTime(333))
  vi.useRealTimers()
  expect(screen.getByRole('status')).toHaveTextContent(/^Ouverture de ton coffre…$/)
  expect(screen.getByText('Ouverture de ton coffre…')).toHaveClass('text-ink-muted')
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  const close = screen.getByRole('link', { name: 'Fermer' })
  expect(close).toHaveAttribute('href', '/')
  expect(close.parentElement).toHaveClass('justify-end')
})

test('unreadable: the sentence, then a confirmation, and only then restart', async () => {
  mocks.state.current = {
    status: 'unreadable',
    message: 'Ta mise à jour en cours n’a pas pu être lue sur cet appareil.',
    restart: mocks.restart,
  }
  render(<StartPage />)
  expect(screen.getByText('Ta mise à jour en cours n’a pas pu être lue sur cet appareil.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Recommencer' }))
  expect(screen.getByText('Ta mise à jour en cours sera effacée. Tes chiffres enregistrés ne changent pas.')).toBeInTheDocument()
  expect(mocks.restart).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Effacer et recommencer' }))
  expect(mocks.restart).toHaveBeenCalled()
})

test('unreadable: « Annuler » erases nothing', async () => {
  mocks.state.current = { status: 'unreadable', message: 'Illisible.', restart: mocks.restart }
  render(<StartPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Recommencer' }))
  await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
  expect(mocks.restart).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Recommencer' })).toBeInTheDocument()
})

test('unreadable: a failed restart says so', async () => {
  mocks.restart.mockResolvedValue(false)
  mocks.state.current = { status: 'unreadable', message: 'Illisible.', restart: mocks.restart }
  render(<StartPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Recommencer' }))
  await userEvent.click(screen.getByRole('button', { name: 'Effacer et recommencer' }))
  expect(await screen.findByText('Ça n’a pas été enregistré. Vérifie ta connexion et réessaie.')).toBeInTheDocument()
})
