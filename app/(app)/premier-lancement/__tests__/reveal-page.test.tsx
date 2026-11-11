// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { account, amountEntry, exampleProfile, exampleSnapshot, line, snapshotOf } from '@/lib/model/__tests__/fixtures'
import { steps, type SetupDraft } from '@/lib/setup/first-launch'
import { UNREADABLE } from '@/lib/setup/use-first-launch'
import type { Profile } from '@/lib/model/types'
import RevelationPage from '../revelation/page'
import { plain } from '@/lib/__tests__/plain'

const mocks = vi.hoisted(() => ({
  first: { current: {} as unknown },
  apply: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  retry: vi.fn(),
}))

vi.mock('@/lib/setup/use-first-launch', async (original) => ({
  ...(await original<typeof import('@/lib/setup/use-first-launch')>()),
  useFirstLaunch: () => mocks.first.current,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }))

function finished(profile: Profile, finishedIds?: string[]): Profile {
  const ids = finishedIds ?? steps(profile).map((e) => e.id)
  return { ...profile, firstLaunch: { planned: [], finished: ids, complete: false } }
}

const exampleDraft: SetupDraft = { profile: finished(exampleProfile), snapshot: exampleSnapshot }

function show(status: string, draft: SetupDraft | null, extra: Record<string, unknown> = {}) {
  mocks.first.current = { status, draft, apply: mocks.apply, saveError: null, retry: mocks.retry, ...extra }
}

beforeEach(() => {
  mocks.apply.mockReset()
  mocks.apply.mockResolvedValue(true)
  mocks.push.mockReset()
  mocks.replace.mockReset()
  mocks.retry.mockReset()
  show('ready', exampleDraft)
})
afterEach(cleanup)

test('the reveal says what is truly yours, the value of a square and each category', () => {
  render(<RevelationPage />)
  expect(screen.getByRole('heading', { level: 1, name: /Voilà ton argent/ })).toBeInTheDocument()
  expect(screen.getByText(/en 100 carrés/)).toBeInTheDocument()
  expect(screen.getByRole('img', { name: /cent carrés/i })).toBeInTheDocument()
  expect(screen.getByText(/Ce qui est vraiment à toi\s*:\s*202\s000\s€\./)).toBeInTheDocument()
  expect(screen.getByText(/Un carré vaut 2\s020\s€\./)).toBeInTheDocument()
  expect(screen.getByText('Immobilier')).toBeInTheDocument()
  expect(screen.getByText('59 carrés')).toBeInTheDocument()
  expect(screen.getByText('1 carré')).toBeInTheDocument()
  expect(mocks.replace).not.toHaveBeenCalled()
})

test('« Continuer » completes the first launch then goes to the goals, and stays disabled', async () => {
  render(<RevelationPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Continuer' }))
  expect(mocks.apply).toHaveBeenCalledTimes(1)
  const change = mocks.apply.mock.calls[0][0] as (d: SetupDraft | null) => SetupDraft
  expect(change(exampleDraft).profile.firstLaunch?.complete).toBe(true)
  expect(mocks.push).toHaveBeenCalledWith('/premier-lancement/depenses')
  expect(screen.getByRole('button', { name: 'Continuer' })).toBeDisabled()
})

test('a failed save stays on the screen, shows the error and lets the person try again', async () => {
  mocks.apply.mockResolvedValue(false)
  show('ready', exampleDraft, { saveError: 'Ça n’a pas été enregistré. Vérifie ta connexion et réessaie.' })
  render(<RevelationPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Continuer' }))
  expect(mocks.push).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent('Ça n’a pas été enregistré.')
  expect(screen.getByRole('button', { name: 'Continuer' })).toBeEnabled()
})

test('without a grid it says why and goes straight to the expenses', async () => {
  show('ready', { profile: exampleDraft.profile, snapshot: snapshotOf([]) })
  render(<RevelationPage />)
  expect(screen.getByText(/aucun montant n’est saisi/)).toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Continuer' }))
  expect(mocks.push).toHaveBeenCalledWith('/premier-lancement/depenses')
})

test('with everything in the home the goals screen still comes next, to say there is nothing to split', async () => {
  const profile = finished({
    ...exampleProfile,
    accounts: [account('h', 'home', { establishmentId: 'home' })],
    lines: [line('hl', 'h', { category: 'property' })],
  })
  show('ready', { profile, snapshot: snapshotOf([amountEntry('hl', 100_000)]) })
  render(<RevelationPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Continuer' }))
  expect(mocks.push).toHaveBeenCalledWith('/premier-lancement/depenses')
})

test('steps still unfinished send back to the steps', () => {
  show('ready', { profile: finished(exampleProfile, ['boursobank']), snapshot: exampleSnapshot })
  render(<RevelationPage />)
  expect(mocks.replace).toHaveBeenCalledWith('/premier-lancement/etape')
  expect(screen.queryByRole('button', { name: 'Continuer' })).not.toBeInTheDocument()
})

test('blocked, failed and loading states', async () => {
  show('blocked', exampleDraft)
  const { rerender } = render(<RevelationPage />)
  expect(screen.getByRole('alert')).toHaveTextContent(plain(UNREADABLE))
  expect(screen.queryByRole('button', { name: 'Continuer' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  expect(mocks.retry).toHaveBeenCalledOnce()
  mocks.retry.mockReset()
  show('failed', null)
  rerender(<RevelationPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  expect(mocks.retry).toHaveBeenCalled()
  show('loading', null)
  rerender(<RevelationPage />)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test('« Revenir corriger » reopens the last step and goes back to the steps', async () => {
  render(<RevelationPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Revenir corriger' }))
  expect(mocks.apply).toHaveBeenCalledTimes(1)
  const change = mocks.apply.mock.calls[0][0] as (d: SetupDraft | null) => SetupDraft
  expect(change(exampleDraft).profile.firstLaunch?.finished).toEqual(['home', 'boursobank'])
  expect(change(exampleDraft).profile.firstLaunch?.complete).toBe(false)
  expect(mocks.replace).toHaveBeenCalledWith('/premier-lancement/etape')
  expect(mocks.push).not.toHaveBeenCalled()
})

test('a reopening that fails stays on the reveal', async () => {
  mocks.apply.mockResolvedValue(false)
  render(<RevelationPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Revenir corriger' }))
  expect(mocks.replace).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Revenir corriger' })).toBeEnabled()
})

test('once the first launch is complete there is nothing left to reopen', () => {
  const profile = { ...exampleDraft.profile, firstLaunch: { ...exampleDraft.profile.firstLaunch!, complete: true } }
  show('ready', { profile, snapshot: exampleSnapshot })
  render(<RevelationPage />)
  expect(screen.queryByRole('button', { name: 'Revenir corriger' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Continuer' })).toBeInTheDocument()
})

test('a rental under its loan is said by its own sentence, the home keeps its squares', () => {
  const profile: Profile = {
    ...exampleProfile,
    accounts: [
      ...exampleProfile.accounts,
      { id: 'flat', establishmentId: 'home', type: 'home', name: 'Studio', residence: 'rental' },
      { id: 'flat-loan', establishmentId: 'boursobank', type: 'loan', name: 'Crédit studio', financedLineId: 'flat-line' },
    ],
    lines: [
      ...exampleProfile.lines,
      line('flat-line', 'flat', { name: 'Studio' }),
      line('flat-loan-line', 'flat-loan', { name: 'Crédit studio' }),
    ],
  }
  const snapshot = {
    ...exampleSnapshot,
    entries: [...exampleSnapshot.entries, amountEntry('flat-line', 100_000), amountEntry('flat-loan-line', 150_000)],
  }
  show('ready', { profile: finished(profile), snapshot })
  render(<RevelationPage />)
  expect(
    screen.getByText('Ton logement en location vaut moins que ce qu’il reste à rembourser : pas de carré pour l’instant.'),
  ).toBeInTheDocument()
  expect(screen.getByText('La grille montre ce qui est positif.')).toBeInTheDocument()
  expect(screen.getByText('Immobilier')).toBeInTheDocument()
})

test('a category left out of the grid is said, with what the grid shows', () => {
  const snapshot = {
    ...exampleSnapshot,
    entries: exampleSnapshot.entries.map((e) => (e.lineId === 'house-line' ? amountEntry('house-line', 100_000) : e)),
  }
  show('ready', { profile: exampleDraft.profile, snapshot })
  render(<RevelationPage />)
  expect(
    screen.getByText('Ton immobilier vaut moins que ce qu’il reste à rembourser : il n’a pas de carré pour l’instant.'),
  ).toBeInTheDocument()
  expect(screen.getByText('La grille montre ce qui est positif.')).toBeInTheDocument()
  expect(screen.queryByText('Immobilier')).not.toBeInTheDocument()
})

test('with every category positive, nothing is said about what is left out', () => {
  render(<RevelationPage />)
  expect(screen.queryByText('La grille montre ce qui est positif.')).not.toBeInTheDocument()
})

test('« Plus tard » in the header goes home', async () => {
  render(<RevelationPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Plus tard' }))
  expect(mocks.push).toHaveBeenCalledWith('/')
})

test('« Plus tard » is disabled while the save runs, and does not leave', async () => {
  mocks.apply.mockReturnValue(new Promise(() => {}))
  render(<RevelationPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Continuer' }))
  const later = screen.getByRole('button', { name: 'Plus tard' })
  expect(later).toBeDisabled()
  await userEvent.click(later)
  expect(mocks.push).not.toHaveBeenCalled()
})

test('« Plus tard » is disabled while the last step is being reopened', async () => {
  mocks.apply.mockReturnValue(new Promise(() => {}))
  render(<RevelationPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Revenir corriger' }))
  const later = screen.getByRole('button', { name: 'Plus tard' })
  expect(later).toBeDisabled()
  await userEvent.click(later)
  expect(mocks.push).not.toHaveBeenCalled()
})
