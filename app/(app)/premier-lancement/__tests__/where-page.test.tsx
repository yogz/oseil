// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { chooseWhere, type SetupDraft } from '@/lib/setup/first-launch'
import { SAVE_FAILED, UNREADABLE, type FirstLaunch } from '@/lib/setup/use-first-launch'
import WherePage from '../ou/page'
import { plain } from '@/lib/__tests__/plain'

const mocks = vi.hoisted(() => ({
  hook: { current: null as unknown },
  push: vi.fn(),
  replace: vi.fn(),
  apply: vi.fn(),
  retry: vi.fn(),
}))

vi.mock('@/lib/setup/use-first-launch', async (original) => ({
  ...(await original<typeof import('@/lib/setup/use-first-launch')>()),
  useFirstLaunch: () => mocks.hook.current,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}))

const BOURSO = { catalogId: 'boursobank', name: 'BoursoBank' }
const TODAY = /^\d{4}-\d{2}-\d{2}$/

function setHook(parts: Partial<FirstLaunch> & { status: FirstLaunch['status'] }) {
  mocks.hook.current = { draft: null, apply: mocks.apply, saveError: null, retry: mocks.retry, ...parts }
}

beforeEach(() => {
  mocks.push.mockReset()
  mocks.replace.mockReset()
  mocks.apply.mockReset().mockResolvedValue(true)
  mocks.retry.mockReset()
  setHook({ status: 'ready' })
})
afterEach(cleanup)

test('Suivant is inactive until something is chosen', async () => {
  render(<WherePage />)
  expect(screen.getByRole('button', { name: 'Suivant' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Mon logement' }))
  expect(screen.getByRole('button', { name: 'Suivant' })).toBeEnabled()
  await userEvent.click(screen.getByRole('button', { name: 'Mon logement' }))
  expect(screen.getByRole('button', { name: 'Suivant' })).toBeDisabled()
})

test('the twelve banks and five outside items are pressable chips', () => {
  render(<WherePage />)
  expect(screen.getByRole('heading', { level: 1, name: 'Où est ton argent\u00A0?' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '‹ Retour' })).toHaveAttribute('href', '/premier-lancement')
  expect(screen.getByText('En dehors des banques')).toBeInTheDocument()
  for (const name of ['BoursoBank', 'LCL', 'Revolut', 'Mon logement', 'Mon épargne salariale']) {
    expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
  }
})

test('there is no loan chip; a note says where the loan, gold and crypto go', () => {
  render(<WherePage />)
  expect(screen.queryByRole('button', { name: 'Un crédit' })).toBeNull()
  expect(screen.getByRole('button', { name: 'De l’or que tu gardes toi-même' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'De la crypto sur ton propre portefeuille' })).toBeInTheDocument()
  expect(
    screen.getByText(
      'Ton crédit se saisit avec sa banque. L’or et la crypto achetés sur une plateforme (Coinbase, Binance…) se saisissent avec elle, comme une banque.',
    ),
  ).toBeInTheDocument()
})

test('a lot 3 draft planning « loan » opens with Ma maison ticked and sends only what is offered', async () => {
  const draft = chooseWhere(null, { banks: [BOURSO], outside: ['my-home'] }, '2026-11-06')
  setHook({
    status: 'ready',
    draft: { ...draft, profile: { ...draft.profile, firstLaunch: { planned: ['my-home', 'loan'], finished: [], complete: false } } },
  })
  render(<WherePage />)
  expect(screen.getByRole('button', { name: 'Mon logement' })).toHaveAttribute('aria-pressed', 'true')
  await userEvent.click(screen.getByRole('button', { name: 'Suivant' }))
  const change = mocks.apply.mock.calls[0][0] as (d: SetupDraft | null) => SetupDraft
  expect(change(draft).profile.firstLaunch?.planned).toEqual(['my-home'])
})

test('BoursoBank and Ma maison then Suivant applies chooseWhere and goes to the step', async () => {
  render(<WherePage />)
  await userEvent.click(screen.getByRole('button', { name: 'BoursoBank' }))
  await userEvent.click(screen.getByRole('button', { name: 'Mon logement' }))
  expect(screen.getByRole('button', { name: 'BoursoBank' })).toHaveAttribute('aria-pressed', 'true')
  await userEvent.click(screen.getByRole('button', { name: 'Suivant' }))

  expect(mocks.apply).toHaveBeenCalledOnce()
  const change = mocks.apply.mock.calls[0][0] as (d: SetupDraft | null) => SetupDraft
  const draft = change(null)
  expect(draft.profile.establishments.map((e) => e.name)).toEqual(['BoursoBank', 'Chez toi'])
  expect(draft.profile.firstLaunch?.planned).toEqual(['my-home'])
  expect(draft.snapshot.takenOn).toMatch(TODAY)
  expect(mocks.push).toHaveBeenCalledWith('/premier-lancement/etape')
})

test('the usual banks come first; the search only opens behind « Ta banque n’y est pas ? »', async () => {
  render(<WherePage />)
  expect(screen.queryByLabelText('Chercher une autre banque…')).toBeNull()
  const chip = screen.getByRole('button', { name: 'Revolut' })
  const missing = screen.getByRole('button', { name: /^Ta banque n’y est pas\s\?$/ })
  const own = screen.getByRole('button', { name: '+ Ajouter la mienne' })
  expect(chip.compareDocumentPosition(missing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(missing.compareDocumentPosition(own) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  await userEvent.click(missing)
  expect(screen.getByLabelText('Chercher une autre banque…')).toBeInTheDocument()
  // « + Ajouter la mienne » stays in reach under the results.
  expect(screen.getByRole('button', { name: '+ Ajouter la mienne' })).toBeInTheDocument()
})

test('the search does not offer again a bank the chips already show', async () => {
  render(<WherePage />)
  await userEvent.click(screen.getByRole('button', { name: /^Ta banque n’y est pas\s\?$/ }))
  await userEvent.type(screen.getByLabelText('Chercher une autre banque…'), 'crédit')
  // « Crédit Agricole » is a chip above: only one button of that name.
  expect(screen.getAllByRole('button', { name: 'Crédit Agricole' })).toHaveLength(1)
})

test('searching « trade » proposes Trade Republic, which joins the chosen ones once touched', async () => {
  render(<WherePage />)
  await userEvent.click(screen.getByRole('button', { name: /^Ta banque n’y est pas\s\?$/ }))
  await userEvent.type(screen.getByLabelText('Chercher une autre banque…'), 'trade')
  await userEvent.click(screen.getByRole('button', { name: 'Trade Republic' }))
  expect(screen.getByRole('button', { name: 'Trade Republic', pressed: true })).toBeInTheDocument()
  // Chosen, so no longer offered a second time.
  expect(screen.getAllByRole('button', { name: 'Trade Republic' })).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: 'Suivant' }))
  const change = mocks.apply.mock.calls[0][0] as (d: SetupDraft | null) => SetupDraft
  expect(change(null).profile.establishments[0]).toMatchObject({ name: 'Trade Republic', catalogId: 'trade-republic' })
})

test('a bank can be added by hand; empty and duplicate names are refused', async () => {
  render(<WherePage />)
  await userEvent.click(screen.getByRole('button', { name: '+ Ajouter la mienne' }))
  const field = screen.getByLabelText('Le nom de ta banque')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(screen.getByRole('button', { name: 'Suivant' })).toBeDisabled()

  await userEvent.type(field, '  Ma Banque ')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(screen.getByRole('button', { name: 'Ma Banque', pressed: true })).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: '+ Ajouter la mienne' }))
  await userEvent.type(screen.getByLabelText('Le nom de ta banque'), 'ma banque')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(screen.getAllByRole('button', { name: /^Ma Banque$/i })).toHaveLength(1)

  await userEvent.click(screen.getByRole('button', { name: 'Suivant' }))
  const change = mocks.apply.mock.calls[0][0] as (d: SetupDraft | null) => SetupDraft
  expect(change(null).profile.establishments.map((e) => e.name)).toEqual(['Ma Banque'])
})

test('a failed save shows the error under the button and stays', async () => {
  mocks.apply.mockResolvedValue(false)
  setHook({ status: 'ready', saveError: SAVE_FAILED })
  render(<WherePage />)
  await userEvent.click(screen.getByRole('button', { name: 'LCL' }))
  await userEvent.click(screen.getByRole('button', { name: 'Suivant' }))
  expect(mocks.push).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent(SAVE_FAILED)
})

test('while the choice is saved, the vault locking takes its place; a failure brings it back', async () => {
  let finish: (ok: boolean) => void = () => {}
  mocks.apply.mockImplementationOnce(() => new Promise<boolean>((resolve) => (finish = resolve)))
  setHook({ status: 'ready', saveError: SAVE_FAILED })
  render(<WherePage />)
  await userEvent.click(screen.getByRole('button', { name: 'LCL' }))
  await userEvent.click(screen.getByRole('button', { name: 'Suivant' }))
  expect(await screen.findByText('Mise sous clé…', { selector: 'p' }, { timeout: 1000 })).toBeInTheDocument()
  await act(async () => finish(false))
  expect(screen.queryByText('Mise sous clé…', { selector: 'p' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Suivant' })).toBeVisible()
  expect(screen.getByRole('alert')).toHaveTextContent(SAVE_FAILED)
})

test('a choice saved keeps the wait until the next step: the picker never flashes back', async () => {
  let finish: (ok: boolean) => void = () => {}
  mocks.apply.mockImplementationOnce(() => new Promise<boolean>((resolve) => (finish = resolve)))
  render(<WherePage />)
  await userEvent.click(screen.getByRole('button', { name: 'LCL' }))
  await userEvent.click(screen.getByRole('button', { name: 'Suivant' }))
  await screen.findByText('Mise sous clé…', { selector: 'p' }, { timeout: 1000 })
  await act(async () => finish(true))
  expect(mocks.push).toHaveBeenCalledWith('/premier-lancement/etape')
  expect(screen.getByText('Mise sous clé…', { selector: 'p' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Suivant' })).not.toBeInTheDocument()
})

test('coming back pre-selects the banks and outside items already chosen', () => {
  const draft = chooseWhere(
    null,
    { banks: [{ catalogId: 'boursobank', name: 'BoursoBank' }, { name: 'Ma Banque' }], outside: ['gold'] },
    '2026-11-06',
  )
  setHook({ status: 'ready', draft })
  render(<WherePage />)
  expect(screen.getByRole('button', { name: 'BoursoBank' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Ma Banque' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'De l’or que tu gardes toi-même' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'LCL' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('button', { name: 'Suivant' })).toBeEnabled()
})

test('blocked says why, offers to read again, and nothing that writes', async () => {
  setHook({ status: 'blocked' })
  render(<WherePage />)
  expect(screen.getByRole('alert')).toHaveTextContent(plain(UNREADABLE))
  expect(screen.queryByRole('button', { name: 'Suivant' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'BoursoBank' })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  expect(mocks.retry).toHaveBeenCalledOnce()
})

test('failed offers to try again; loading shows only the title', async () => {
  setHook({ status: 'failed' })
  const { unmount } = render(<WherePage />)
  expect(screen.getByRole('alert')).toHaveTextContent('Tes chiffres n’ont pas pu être chargés.')
  await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  expect(mocks.retry).toHaveBeenCalledOnce()
  unmount()

  setHook({ status: 'loading' })
  render(<WherePage />)
  expect(screen.getByRole('heading', { level: 1, name: 'Où est ton argent\u00A0?' })).toBeInTheDocument()
  // Nothing that writes; only the way out, since the Réglages cannot be reached from here.
  expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Se déconnecter'])
})

test('a first launch already complete goes to Mon argent, and offers nothing that writes', () => {
  const draft = chooseWhere(null, { banks: [{ catalogId: 'boursobank', name: 'BoursoBank' }], outside: [] }, '2026-11-06')
  setHook({
    status: 'ready',
    draft: { ...draft, profile: { ...draft.profile, firstLaunch: { ...draft.profile.firstLaunch!, complete: true } } },
  })
  render(<WherePage />)
  expect(mocks.replace).toHaveBeenCalledWith('/')
  expect(screen.queryByRole('button', { name: 'Suivant' })).toBeNull()
})

test('a first launch in progress stays here', () => {
  const draft = chooseWhere(null, { banks: [{ catalogId: 'boursobank', name: 'BoursoBank' }], outside: [] }, '2026-11-06')
  setHook({ status: 'ready', draft })
  render(<WherePage />)
  expect(mocks.replace).not.toHaveBeenCalled()
})

test('« Plus tard » is absent on a first visit', () => {
  render(<WherePage />)
  expect(screen.queryByRole('button', { name: 'Plus tard' })).not.toBeInTheDocument()
})

test('« Plus tard » shows once the saved profile has an establishment, and goes home', async () => {
  setHook({ status: 'ready', draft: chooseWhere(null, { banks: [BOURSO], outside: [] }, '2026-11-06') })
  render(<WherePage />)
  await userEvent.click(screen.getByRole('button', { name: 'Plus tard' }))
  expect(mocks.push).toHaveBeenCalledWith('/')
})

test('« Plus tard » is disabled while « Suivant » saves, and does not leave', async () => {
  mocks.apply.mockReturnValue(new Promise(() => {}))
  setHook({ status: 'ready', draft: chooseWhere(null, { banks: [BOURSO], outside: [] }, '2026-11-06') })
  render(<WherePage />)
  await userEvent.click(screen.getByRole('button', { name: 'Suivant' }))
  const later = screen.getByRole('button', { name: 'Plus tard' })
  expect(later).toBeDisabled()
  await userEvent.click(later)
  expect(mocks.push).not.toHaveBeenCalled()
})
