// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { updateEcho } from '@/lib/app/arrival'
import type { UpdateMarket } from '@/lib/market/live'
import { exampleProfile, exampleSnapshot } from '@/lib/model/__tests__/fixtures'
import type { Profile, UpdateDraft } from '@/lib/model/types'
import { confirmLine, markStep, setTakenOn, setValue, startDraft } from '@/lib/update/draft'
import { putAddedLine, setContribution } from '@/lib/update/lines'
import type { UpdateState } from '@/lib/update/use-update'
import ResultPage from '../resultat/page'

const mocks = vi.hoisted(() => ({
  state: null as unknown,
  show: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  today: '2026-11-07',
}))

vi.mock('@/components/update/UpdateProvider', () => ({
  useUpdateScreen: () => ({ state: mocks.state, current: null, show: mocks.show }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }))
vi.mock('@/lib/dates', () => ({ todayIso: () => mocks.today }))

const save = vi.fn()
const change = vi.fn()
const retryMarket = vi.fn()

function ready(draft: UpdateDraft, extra: { saveError?: string | null; profile?: Profile; market?: UpdateMarket } = {}) {
  const state: UpdateState = {
    status: 'ready',
    session: {
      profile: extra.profile ?? exampleProfile,
      base: { id: 's1', value: exampleSnapshot, updatedAt: '' },
      draft,
      market: extra.market ?? { prices: {}, rates: null },
      failedPrices: [],
      retryMarket,
      saved: true,
      change,
      save,
      abandon: async () => true,
      settled: async () => true,
      resave: async () => true,
      saveError: extra.saveError ?? null,
    },
  }
  mocks.state = state
}

function worked(): UpdateDraft {
  let draft = startDraft('s1')
  const today = mocks.today
  draft = setValue(draft, exampleSnapshot, 'livret-a-line', { kind: 'amount', amount: 1_300_000 }, today, {})
  draft = setValue(draft, exampleSnapshot, 'etf', { kind: 'units', units: 100, unitPrice: 260, averagePrice: 200 }, today, {})
  draft = setValue(draft, exampleSnapshot, 'euro-fund', { kind: 'amount', amount: 3_090_000 }, today, {})
  draft = setContribution(draft, 'life', 50_000)
  draft = setValue(draft, exampleSnapshot, 'mortgage-line', { kind: 'amount', amount: 17_890_000 }, today, {})
  draft = confirmLine(draft, 'house-line')
  return ['home', 'boursobank', 'linxea'].reduce((d, step) => markStep(d, step, 'done'), draft)
}

beforeEach(() => {
  save.mockReset().mockResolvedValue(true)
  change.mockReset().mockResolvedValue(true)
  retryMarket.mockReset()
  mocks.show.mockReset()
  mocks.push.mockReset()
  mocks.replace.mockReset()
  ready(worked())
})
afterEach(cleanup)

const norm = (s: string) => s.replace(/[  ]/g, ' ')
const sees = (text: string) => screen.getByText((content) => norm(content) === text)

test('the worked example: what is yours, the change, the square, the split, what moved', () => {
  render(<ResultPage />)
  expect(sees('C’est à jour. Ce qui est vraiment à toi :')).toBeInTheDocument()
  expect(sees('206 000 €')).toBeInTheDocument()
  expect(sees('4 000 € de plus qu’au 30 septembre')).toBeInTheDocument()
  expect(sees('Un carré vaut maintenant 2 060 € (2 020 € au 30 septembre)')).toBeInTheDocument()
  expect(sees('Ton effort')).toBeInTheDocument()
  expect(sees('2 600 €')).toBeInTheDocument()
  expect(sees('Ce qui a changé')).toBeInTheDocument()
  expect(sees('Crédit remboursé 1 100 €')).toBeInTheDocument()
  expect(sees('Le reste n’a pas bougé : or et crypto, immobilier.')).toBeInTheDocument()
  expect(sees('Relevé du 7 novembre')).toBeInTheDocument()
})

// C2 (decided by Nicolas on 9 November 2026): the grid of the snapshot before, then the new one.
describe('the grid, from the last snapshot to this one', () => {
  const colours = () =>
    Array.from(document.querySelectorAll('[data-square]')).map((s) => s.getAttribute('data-category'))
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  test('opens on the last snapshot, then only the squares that change take their new colour; the amounts never roll', () => {
    // 30 000 € more on the Livret A: some squares change category.
    let draft = worked()
    draft = setValue(draft, exampleSnapshot, 'livret-a-line', { kind: 'amount', amount: 4_300_000 }, mocks.today, {})
    ready(draft)
    render(<ResultPage />)
    expect(screen.getByRole('img', { name: 'Ta grille au relevé du 30 septembre' })).toBeInTheDocument()
    const before = colours()
    expect(before).toHaveLength(100)
    // The new figures are there from the start: nothing counts up to them.
    const net = screen.getByText(/^236\s000\s€$/)
    act(() => vi.advanceTimersByTime(1_200))
    expect(net).toHaveTextContent(/^236\s000\s€$/)
    expect(screen.getByRole('img', { name: 'Ta grille au relevé du 7 novembre' })).toBeInTheDocument()
    const after = colours()
    const changed = after.filter((c, i) => c !== before[i]).length
    expect(changed).toBeGreaterThan(0)
    const squares = Array.from(document.querySelectorAll<HTMLElement>('[data-square]'))
    expect(squares.filter((s) => s.style.transitionDelay !== '')).toHaveLength(changed)
  })

  test('with fewer animations asked, the new grid is there at once, with nothing to wait for', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    render(<ResultPage />)
    expect(screen.getByRole('img', { name: 'Ta grille au relevé du 7 novembre' })).toBeInTheDocument()
    const squares = Array.from(document.querySelectorAll<HTMLElement>('[data-square]'))
    expect(squares.every((s) => s.style.transitionDelay === '' && !s.classList.contains('square-motion'))).toBe(true)
  })
})

test('« Enregistrer » saves with today, then replaces the page with Mon argent', async () => {
  render(<ResultPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(save).toHaveBeenCalledWith(mocks.today)
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'))
})

test('while it saves, the result gives its place to the vault locking; a failure brings it back', async () => {
  let finish: (ok: boolean) => void = () => {}
  save.mockImplementationOnce(() => new Promise<boolean>((resolve) => (finish = resolve)))
  ready(worked(), { saveError: 'Pas enregistré.' })
  render(<ResultPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(await screen.findByText('Mise sous clé…', { selector: 'p' }, { timeout: 1000 })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Enregistrer', hidden: true })).not.toBeVisible()
  await act(async () => finish(false))
  expect(screen.queryByText('Mise sous clé…', { selector: 'p' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled()
  expect(screen.getByRole('alert')).toHaveTextContent('Pas enregistré.')
})

test('while it saves, « Fermer » stays: the update always has a way out', async () => {
  save.mockImplementationOnce(() => new Promise<boolean>(() => {}))
  render(<ResultPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  await screen.findByText('Mise sous clé…', { selector: 'p' }, { timeout: 1000 })
  expect(screen.getByRole('link', { name: 'Fermer' })).toBeVisible()
})

// The echo of the bank just updated (Nicolas, 10 November 2026): Mon argent is told, in this tab's
// memory only, that it is reached right after a save.
test('a save tells Mon argent, in the tab’s memory, that an update was just saved', async () => {
  updateEcho.reset()
  const storage = vi.spyOn(Storage.prototype, 'setItem')
  render(<ResultPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'))
  expect(updateEcho.due()).toBe(true)
  expect(storage).not.toHaveBeenCalled()
  storage.mockRestore()
  updateEcho.reset()
})

test('a failed save shows its error and stays on the page', async () => {
  updateEcho.reset()
  save.mockResolvedValue(false)
  ready(worked(), { saveError: 'Pas enregistré.' })
  render(<ResultPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Pas enregistré.')
  expect(updateEcho.due()).toBe(false)
  expect(mocks.replace).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled()
})

test('« changer » then a date before the base: the message, and nothing changed', async () => {
  render(<ResultPage />)
  await userEvent.click(screen.getByRole('button', { name: 'changer' }))
  const field = screen.getByLabelText('Date du relevé')
  expect(field).toHaveAttribute('type', 'date')
  expect(field).toHaveAttribute('min', '2026-09-30')
  expect(field).toHaveAttribute('max', '2026-11-07')
  fireEvent.change(field, { target: { value: '2026-09-01' } })
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(change).not.toHaveBeenCalled()
})

test('a valid date calls change with setTakenOn', async () => {
  render(<ResultPage />)
  await userEvent.click(screen.getByRole('button', { name: 'changer' }))
  fireEvent.change(screen.getByLabelText('Date du relevé'), { target: { value: '2026-10-15' } })
  expect(change).toHaveBeenCalledTimes(1)
  const f = change.mock.calls[0][0] as (d: UpdateDraft) => UpdateDraft
  expect(f(worked())).toEqual(setTakenOn(worked(), '2026-10-15'))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('« ‹ Revenir corriger » goes back to the update', async () => {
  render(<ResultPage />)
  await userEvent.click(screen.getByRole('button', { name: '‹ Revenir corriger' }))
  expect(mocks.push).toHaveBeenCalledWith('/mise-a-jour')
})

test('banks not reviewed are said, a bank skipped after one of its lines was typed included', () => {
  // worked() typed the fonds euros at Linxea; its other line keeps the base's date.
  ready(markStep(worked(), 'linxea', 'skipped'))
  render(<ResultPage />)
  expect(screen.getByText('1 banque non revue : ses chiffres datent du 30 septembre')).toBeInTheDocument()
})

test('a line with no amount: listed with a way back to its bank, and Enregistrer is off', async () => {
  const profile: Profile = {
    ...exampleProfile,
    lines: [
      ...exampleProfile.lines,
      { id: 'new-line', accountId: 'livret-a', name: 'Livret bis', kind: 'amount', currency: 'EUR' },
    ],
  }
  ready(confirmLine(worked(), 'new-line'), { profile })
  render(<ResultPage />)
  const link = screen.getByRole('button', { name: 'Montant à saisir\u00A0: Livret bis (BoursoBank)' })
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  expect(sees('Il manque un montant avant d’enregistrer.')).toBeInTheDocument()
  await userEvent.click(link)
  expect(mocks.show).toHaveBeenCalledWith('boursobank')
  expect(mocks.push).toHaveBeenCalledWith('/mise-a-jour/banque')
})

test('an uncomputable figure: the sentence and the way back', async () => {
  const profile: Profile = {
    ...exampleProfile,
    lines: exampleProfile.lines.map((l) => (l.id === 'etf' ? { ...l, currency: 'USD' as const } : l)),
  }
  ready(worked(), { profile })
  render(<ResultPage />)
  expect(sees('Un de tes chiffres n’a pas pu être calculé.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '‹ Revenir corriger' }))
  expect(mocks.push).toHaveBeenCalledWith('/mise-a-jour')
})

// Review Focus 4: a line in pounds with no rate known. The result says so, « Enregistrer »
// waits, and « Réessayer » asks the market again.
const withPounds = () =>
  putAddedLine(
    exampleProfile,
    worked(),
    {
      accountId: 'pea',
      name: 'UK',
      entry: { kind: 'units', units: 10, unitPrice: 5, averagePrice: null },
      currency: 'GBP',
      arrival: 'existing',
    },
    mocks.today,
  ).draft

test('a rate missing: the sentence, « Réessayer » that asks again, the way back, and no « Enregistrer »', async () => {
  ready(withPounds())
  render(<ResultPage />)
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Le taux du jour des livres sterling n’a pas pu être récupéré : ce relevé ne peut pas encore être enregistré. Rien n’est perdu.',
  )
  expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument()
  expect(screen.queryByText('0 €')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  expect(retryMarket).toHaveBeenCalledTimes(1)
  expect(save).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: '‹ Revenir corriger' }))
  expect(mocks.push).toHaveBeenCalledWith('/mise-a-jour')
})

test('an uncomputable figure offers no « Réessayer »: no rate of today would mend it', () => {
  const profile: Profile = {
    ...exampleProfile,
    lines: exampleProfile.lines.map((l) => (l.id === 'etf' ? { ...l, currency: 'USD' as const } : l)),
  }
  ready(worked(), { profile })
  render(<ResultPage />)
  expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument()
})

// R18: the result reads the market the update read, so it says which rate converted the pounds.
test('the rates of the day: the result says which converted the lines outside euros', () => {
  ready(withPounds(), { market: { prices: {}, rates: { on: '2026-11-06', perEuro: { GBP: 0.83415 } } } })
  render(<ResultPage />)
  expect(sees('Converti en euros au taux de la Banque centrale européenne du 6 novembre.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled()
})

test('euros only: no word on rates', () => {
  render(<ResultPage />)
  expect(screen.queryByText(/Banque centrale européenne/)).not.toBeInTheDocument()
})

test('today’s price in a bank passed: the figures move with it, and « non revue » excepts it', () => {
  const profile: Profile = {
    ...exampleProfile,
    lines: exampleProfile.lines.map((l) => (l.id === 'etf' ? { ...l, quoteSymbol: 'CW8.PA' } : l)),
  }
  const draft = ['home', 'linxea'].reduce((d, step) => markStep(d, step, 'done'), markStep(startDraft('s1'), 'boursobank', 'skipped'))
  ready(draft, { profile, market: { prices: { etf: 260 }, rates: null } })
  render(<ResultPage />)
  expect(sees('1 000 € de plus qu’au 30 septembre')).toBeInTheDocument()
  expect(
    sees('1 banque non revue : ses chiffres datent du 30 septembre, sauf le prix du jour de tes actions'),
  ).toBeInTheDocument()
})

// The update waits for the vault and the market (8 seconds at most), at opening and after
// « Réessayer »: the wait of the site, never a blank screen.
test('loading: « Ouverture de ton coffre… », no figure, and no « Enregistrer »', () => {
  mocks.state = { status: 'loading' } satisfies UpdateState
  vi.useFakeTimers()
  render(<ResultPage />)
  act(() => vi.advanceTimersByTime(333))
  vi.useRealTimers()
  expect(screen.getByRole('status')).toHaveTextContent(/^Ouverture de ton coffre…$/)
  expect(screen.getByText('Ouverture de ton coffre…')).toHaveClass('text-ink-muted')
  expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Fermer' })).toHaveAttribute('href', '/')
})

test('the result has « Fermer » on the right of the top line, and the way back on its left', () => {
  render(<ResultPage />)
  const close = screen.getByRole('link', { name: 'Fermer' })
  expect(close).toHaveAttribute('href', '/')
  const top = close.parentElement as HTMLElement
  expect(top.lastElementChild).toBe(close)
  expect(top.firstElementChild).toHaveTextContent('Revenir corriger')
})

test('any state other than ready sends back to the update; loading does not', () => {
  mocks.state = { status: 'loading' } satisfies UpdateState
  const { unmount } = render(<ResultPage />)
  expect(mocks.replace).not.toHaveBeenCalled()
  unmount()
  mocks.state = { status: 'failed', retry: () => {} } satisfies UpdateState
  const failed = render(<ResultPage />)
  expect(mocks.replace).toHaveBeenCalledWith('/mise-a-jour')
  failed.unmount()
  // A save refused because another device carried the update on: said on the start screen.
  mocks.replace.mockReset()
  mocks.state = { status: 'conflict', message: 'Ta mise à jour a avancé sur un autre appareil.', reload: () => {} } satisfies UpdateState
  render(<ResultPage />)
  expect(mocks.replace).toHaveBeenCalledWith('/mise-a-jour')
})

test.each([
  ['a cleared date', ''],
  ['a date out of range', '2026-09-01'],
])('%s: Enregistrer is disabled and nothing is saved', async (_name, value) => {
  render(<ResultPage />)
  await userEvent.click(screen.getByRole('button', { name: 'changer' }))
  fireEvent.change(screen.getByLabelText('Date du relevé'), { target: { value } })
  const button = screen.getByRole('button', { name: 'Enregistrer' })
  expect(button).toBeDisabled()
  await userEvent.click(button)
  expect(save).not.toHaveBeenCalled()
})

test('a valid date that could not be saved: the field goes back to the saved date', async () => {
  change.mockResolvedValue(false)
  render(<ResultPage />)
  await userEvent.click(screen.getByRole('button', { name: 'changer' }))
  const field = screen.getByLabelText('Date du relevé')
  fireEvent.change(field, { target: { value: '2026-10-15' } })
  await waitFor(() => expect(field).toHaveValue('2026-11-07'))
})

test('the missing-amount sentence describes the disabled button', () => {
  const profile: Profile = {
    ...exampleProfile,
    lines: [
      ...exampleProfile.lines,
      { id: 'new-line', accountId: 'livret-a', name: 'Livret bis', kind: 'amount', currency: 'EUR' },
    ],
  }
  ready(confirmLine(worked(), 'new-line'), { profile })
  render(<ResultPage />)
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toHaveAccessibleDescription(
    'Il manque un montant avant d’enregistrer.',
  )
})
