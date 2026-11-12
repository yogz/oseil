// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Model, ModelState } from '@/lib/app/use-model'
import type { CorrectionState } from '@/lib/correct/save'
import { todayIso } from '@/lib/dates'
import type { MarketState } from '@/lib/market/use-market'
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
import type { Profile, Snapshot, UpdateDraft } from '@/lib/model/types'
import {
  CHANGED_MEANWHILE,
  FINISH,
  LOCKED_UPDATE,
  NO_OTHER_BANK,
  ONLY_LINE,
  REOPEN,
  SINCE,
  TOO_EARLY,
  UNFINISHED,
  YES_CLOSE,
  YES_DELETE,
} from '@/lib/screens/line-words'
import { SAVE_FAILED } from '@/lib/screens/words'
import { startDraft } from '@/lib/update/draft'
import LinePage from '../ligne/[id]/page'
import { plain } from '@/lib/__tests__/plain'

const mocks = vi.hoisted(() => ({
  state: { current: { status: 'loading' } as ModelState },
  params: { current: { id: 'etf' } as { id: string } },
  search: { current: '' },
  replace: vi.fn(),
  saveCorrection: vi.fn(),
  market: { current: { status: 'ready', market: { quotes: {}, rates: null }, retry: vi.fn() } as MarketState },
}))

vi.mock('@/lib/app/use-model', () => ({ useModel: () => mocks.state.current }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useParams: () => mocks.params.current,
  useSearchParams: () => new URLSearchParams(mocks.search.current),
}))
vi.mock('@/lib/market/use-market', () => ({ useMarket: () => mocks.market.current }))
vi.mock('@/lib/correct/save', () => ({ saveCorrection: mocks.saveCorrection }))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props} />,
}))

const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })

function ready(profile: Profile = exampleProfile, snapshot: Snapshot = exampleSnapshot, draft: UpdateDraft | null = null) {
  const model: Model = {
    profile: loaded(profile),
    snapshots: [loaded(snapshot, 's0')],
    goals: [],
    settings: null,
    draft: draft ? loaded(draft, 'd0') : null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
  }
  const reload = vi.fn()
  mocks.state.current = { status: 'ready', model, client: {} as never, dataKey: {} as CryptoKey, reload }
  return reload
}

// What a plan writes, given the example profile as the freshly re-read state.
function planned(profile: Profile = exampleProfile, snapshot: Snapshot = exampleSnapshot) {
  const plan = mocks.saveCorrection.mock.calls[0][2] as (s: CorrectionState) => { writes: { kind: string; value: Profile }[] }
  return plan({ profile: { id: 'p0', value: profile }, snapshots: [{ id: 's0', value: snapshot }] }).writes
}

beforeEach(() => {
  mocks.market.current = { status: 'ready', market: { quotes: {}, rates: null }, retry: vi.fn() }
  mocks.replace.mockReset()
  mocks.saveCorrection.mockReset().mockResolvedValue('saved')
  mocks.params.current = { id: 'etf' }
  mocks.search.current = ''
  ready()
})
afterEach(cleanup)

test('shows the fiche of a fund as on the board', () => {
  render(<LinePage />)
  expect(screen.getByRole('link', { name: '‹ Placements en bourse' })).toHaveAttribute('href', '/categorie/markets')
  expect(screen.getByRole('heading', { name: 'ETF' })).toBeInTheDocument()
  expect(screen.getByText('Corriger une erreur de saisie')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Son nom/ })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Son prix du jour/ })).toHaveAttribute('href', '/titres?depuis=ligne/etf')
  expect(screen.getByText('Il passe à zéro à la date que tu choisis. Il reste dans tes anciens relevés.')).toBeInTheDocument()
  expect(screen.getByText('Il disparaît partout, même de tes anciens relevés.')).toBeInTheDocument()
})

test('an unknown line goes back to Mon argent', () => {
  mocks.params.current = { id: 'nope' }
  render(<LinePage />)
  expect(mocks.replace).toHaveBeenCalledWith('/')
})

test('nothing is drawn while the market loads', () => {
  mocks.market.current = { status: 'loading' }
  render(<LinePage />)
  expect(screen.queryByRole('heading', { name: 'ETF' })).toBeNull()
  expect(mocks.replace).not.toHaveBeenCalled()
})

test('renames the line through a correction re-read at save time', async () => {
  const user = userEvent.setup()
  const reload = ready()
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: /Son nom/ }))
  const field = screen.getByLabelText('Son nom')
  expect(field).toHaveValue('ETF')
  await user.clear(field)
  await user.type(field, 'Fonds Monde ETF')
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

  expect(mocks.saveCorrection).toHaveBeenCalledTimes(1)
  const writes = planned()
  expect(writes).toHaveLength(1)
  expect(writes[0].kind).toBe('profile')
  expect(writes[0].value.lines.find((l) => l.id === 'etf')!.name).toBe('Fonds Monde ETF')
  expect(reload).toHaveBeenCalledTimes(1)
  expect(screen.queryByLabelText('Son nom')).toBeNull()
})

test('refuses an empty name without writing', async () => {
  const user = userEvent.setup()
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: /Son nom/ }))
  await user.clear(screen.getByLabelText('Son nom'))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getByText('Écris un nom.')).toBeInTheDocument()
  expect(mocks.saveCorrection).not.toHaveBeenCalled()
})

test('cancel returns to the fiche and writes nothing', async () => {
  const user = userEvent.setup()
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: /Son nom/ }))
  await user.click(screen.getByRole('button', { name: 'Annuler' }))
  expect(screen.getByRole('button', { name: /Son nom/ })).toBeInTheDocument()
  expect(mocks.saveCorrection).not.toHaveBeenCalled()
})

test('says an update is running, keeps what was typed, and reads the fiche again: it is then read only', async () => {
  const user = userEvent.setup()
  const reload = ready()
  mocks.saveCorrection.mockResolvedValue('update-running')
  const { rerender } = render(<LinePage />)
  await user.click(screen.getByRole('button', { name: /Son nom/ }))
  const field = screen.getByLabelText('Son nom')
  await user.clear(field)
  await user.type(field, 'Autre')
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getByRole('alert')).toHaveTextContent(plain(LOCKED_UPDATE))
  expect(screen.getByLabelText('Son nom')).toHaveValue('Autre')
  expect(reload).toHaveBeenCalledTimes(1)

  // The re-read model holds the update's draft: the fiche says so, and offers no correction.
  ready(exampleProfile, exampleSnapshot, startDraft('s0'))
  rerender(<LinePage />)
  expect(screen.getByText(plain(LOCKED_UPDATE))).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Reprendre la mise à jour' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Son nom')).toBeNull()
  expect(screen.queryByRole('button', { name: /Son nom/ })).toBeNull()
})

test('says a changed line, and a failed write, stays open, and reads the fiche again each time', async () => {
  const user = userEvent.setup()
  const reload = ready()
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: /Son nom/ }))
  mocks.saveCorrection.mockResolvedValueOnce('not-held')
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getByRole('alert')).toHaveTextContent(plain(CHANGED_MEANWHILE))
  expect(reload).toHaveBeenCalledTimes(1)
  mocks.saveCorrection.mockRejectedValueOnce(new Error('network'))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getByRole('alert')).toHaveTextContent(plain(SAVE_FAILED))
  expect(screen.getByLabelText('Son nom')).toHaveValue('ETF')
  expect(reload).toHaveBeenCalledTimes(2)
})

test('reads the fiche again after every answer short of « saved »', async () => {
  const user = userEvent.setup()
  for (const outcome of ['not-allowed', 'unreadable', 'update-running', 'not-held'] as const) {
    const reload = ready()
    mocks.saveCorrection.mockResolvedValueOnce(outcome)
    const { unmount } = render(<LinePage />)
    await user.click(screen.getByRole('button', { name: /Son nom/ }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(reload).toHaveBeenCalledTimes(1)
    unmount()
  }
})

test('is read only during an update, with a way back to it', () => {
  ready(exampleProfile, exampleSnapshot, startDraft('s0'))
  render(<LinePage />)
  expect(screen.queryByRole('button', { name: /Son nom/ })).toBeNull()
  expect(screen.getByText(/Son nom/)).toBeInTheDocument()
  expect(screen.getByText(plain(LOCKED_UPDATE))).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Reprendre la mise à jour' })).toHaveAttribute('href', '/mise-a-jour')
  expect(screen.queryByText('Supprimer, saisi par erreur')).toBeNull()
  expect(screen.queryByText('Fermé ou tout vendu')).toBeNull()
})

const employee = profileOf(
  [account('pee', 'employee-savings', { name: 'PEE', unlockOn: '2029-01-01' })],
  [line('pee-l', 'pee', { name: 'PEE' })],
)
const employeeSnapshot = snapshotOf([amountEntry('pee-l', 8_400)])

test('corrects the unlock year of employee savings, and refuses an unreadable year', async () => {
  const user = userEvent.setup()
  const reload = ready(employee, employeeSnapshot)
  mocks.params.current = { id: 'pee-l' }
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: /Disponible en/ }))
  const field = screen.getByLabelText('Disponible en (année)')
  expect(field).toHaveValue('2029')

  await user.clear(field)
  await user.type(field, '29')
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getByText('Cette année n’est pas lisible.')).toBeInTheDocument()
  expect(mocks.saveCorrection).not.toHaveBeenCalled()

  await user.clear(field)
  await user.type(field, '2031')
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(planned(employee)[0].value.accounts[0].unlockOn).toBe('2031-01-01')
  expect(reload).toHaveBeenCalledTimes(1)
})

test('clears the unlock year', async () => {
  const user = userEvent.setup()
  ready(employee, employeeSnapshot)
  mocks.params.current = { id: 'pee-l' }
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: /Disponible en/ }))
  await user.click(screen.getByRole('button', { name: 'Effacer l’année' }))
  expect(planned(employee)[0].value.accounts[0]).not.toHaveProperty('unlockOn')
})

const shares = profileOf(
  [account('cur', 'current'), account('shares', 'other', { name: 'OpenAI' })],
  [line('cur-l', 'cur'), line('shares-l', 'shares', { name: 'OpenAI', category: 'markets' })],
)
const sharesSnapshot = snapshotOf([amountEntry('cur-l', 1_000), amountEntry('shares-l', 5_000)])

test('says whether an account is quick to get back, and marks it slow in one profile write on the re-read state', async () => {
  const user = userEvent.setup()
  ready(shares, sharesSnapshot)
  mocks.params.current = { id: 'shares-l' }
  render(<LinePage />)
  expect(screen.getByRole('button', { name: /Récupérable en quelques semaines/ })).toHaveTextContent('oui')
  await user.click(screen.getByRole('button', { name: /Récupérable en quelques semaines/ }))
  expect(screen.getByRole('button', { name: 'Oui' })).toHaveAttribute('aria-pressed', 'true')
  // Oui or Non saves at once (11 November 2026, « tout corriger depuis la fiche »).
  await user.click(screen.getByRole('button', { name: 'Non' }))
  const writes = planned(shares, sharesSnapshot)
  expect(writes).toHaveLength(1)
  expect(writes[0].value.accounts.find((a) => a.id === 'shares')!.slow).toBe(true)
  expect(writes[0].value.accounts.find((a) => a.id === 'cur')).not.toHaveProperty('slow')
})

test('a slow account reads « non », and « Oui » removes the mark', async () => {
  const user = userEvent.setup()
  const slow = profileOf(
    [account('cur', 'current'), account('shares', 'other', { name: 'OpenAI', slow: true })],
    [line('cur-l', 'cur'), line('shares-l', 'shares', { name: 'OpenAI', category: 'markets' })],
  )
  ready(slow, sharesSnapshot)
  mocks.params.current = { id: 'shares-l' }
  render(<LinePage />)
  expect(screen.getByRole('button', { name: /Récupérable en quelques semaines/ })).toHaveTextContent('non')
  await user.click(screen.getByRole('button', { name: /Récupérable en quelques semaines/ }))
  expect(screen.getByRole('button', { name: 'Non' })).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: 'Oui' }))
  expect(planned(slow, sharesSnapshot)[0].value.accounts.find((a) => a.id === 'shares')).not.toHaveProperty('slow')
})

test('the slow mark follows the re-read profile, not the account on screen', async () => {
  const user = userEvent.setup()
  ready(shares, sharesSnapshot)
  mocks.params.current = { id: 'shares-l' }
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: /Récupérable en quelques semaines/ }))
  // Oui or Non saves at once (11 November 2026, « tout corriger depuis la fiche »).
  await user.click(screen.getByRole('button', { name: 'Non' }))
  const moved = profileOf(
    [account('cur', 'current'), account('shares-bis', 'other', { name: 'OpenAI' })],
    [line('cur-l', 'cur'), line('shares-l', 'shares-bis', { name: 'OpenAI', category: 'markets' })],
  )
  const accounts = planned(moved, sharesSnapshot)[0].value.accounts
  expect(accounts.find((a) => a.id === 'shares-bis')!.slow).toBe(true)
})

test('a home says its type, a home without one reads « Résidence principale »', () => {
  mocks.params.current = { id: 'house-line' }
  render(<LinePage />)
  expect(screen.getByRole('button', { name: /^Type/ })).toHaveTextContent('Résidence principale')
})

test('the type of a home is chosen among three, said to apply to the whole history, and saved in one profile write', async () => {
  const user = userEvent.setup()
  mocks.params.current = { id: 'house-line' }
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: /^Type/ }))
  expect(screen.getByRole('button', { name: 'Résidence principale' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Résidence secondaire' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByText('Il s’applique à tout l’historique, même à tes anciens relevés.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Investissement locatif' }))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  const writes = planned()
  expect(writes).toHaveLength(1)
  expect(writes[0].value.accounts.find((a) => a.id === 'house')!.residence).toBe('rental')
  expect(writes[0].value.accounts.filter((a) => a.id !== 'house').some((a) => 'residence' in a)).toBe(false)
})

test('a rental back to « Résidence principale » loses its mark, as every home had before the types', async () => {
  const user = userEvent.setup()
  const rented: Profile = {
    ...exampleProfile,
    accounts: exampleProfile.accounts.map((a) => (a.id === 'house' ? { ...a, residence: 'rental' as const } : a)),
  }
  ready(rented)
  mocks.params.current = { id: 'house-line' }
  render(<LinePage />)
  expect(screen.getByRole('button', { name: /^Type/ })).toHaveTextContent('Investissement locatif')
  await user.click(screen.getByRole('button', { name: /^Type/ }))
  expect(screen.getByRole('button', { name: 'Investissement locatif' })).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: 'Résidence principale' }))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(planned(rented)[0].value.accounts.find((a) => a.id === 'house')).not.toHaveProperty('residence')
})

test('an account that is not a home has no type of home', () => {
  render(<LinePage />)
  expect(screen.queryByRole('button', { name: /^Type(?! du compte)/ })).toBeNull()
})

const zoned = profileOf(
  [account('cur', 'current'), account('shares', 'other', { name: 'OpenAI' })],
  [line('cur-l', 'cur'), line('shares-l', 'shares', { name: 'OpenAI', category: 'markets' })],
)

test('shows the zone of a markets line, and changes it in one profile write', async () => {
  const user = userEvent.setup()
  ready(zoned, sharesSnapshot)
  mocks.params.current = { id: 'shares-l' }
  render(<LinePage />)
  expect(screen.getByRole('button', { name: /Zone/ })).toHaveTextContent('Je ne sais pas')
  await user.click(screen.getByRole('button', { name: /Zone/ }))
  const select = screen.getByRole('combobox', { name: 'Zone' })
  expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
    'Europe',
    'États-Unis',
    'Japon',
    'Pays émergents',
    'Fonds monde',
    'Non coté',
    'Je ne sais pas',
  ])
  await user.selectOptions(select, 'États-Unis')
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  const writes = planned(zoned, sharesSnapshot)
  expect(writes).toHaveLength(1)
  expect(writes[0].value.lines.find((l) => l.id === 'shares-l')!.group).toBe('us')
})

test('a secured line reads « Type », and cancelling saves nothing', async () => {
  const user = userEvent.setup()
  const secured = profileOf(
    [account('cur', 'current'), account('shares', 'other', { name: 'Fonds' })],
    [line('cur-l', 'cur'), line('shares-l', 'shares', { name: 'Fonds', category: 'secured', group: 'bonds' })],
  )
  ready(secured, sharesSnapshot)
  mocks.params.current = { id: 'shares-l' }
  render(<LinePage />)
  expect(screen.getByRole('button', { name: /^Type(?! du compte)/ })).toHaveTextContent('Obligations et prêts')
  await user.click(screen.getByRole('button', { name: /^Type(?! du compte)/ }))
  expect(screen.getByRole('combobox', { name: 'Type' })).toHaveValue('bonds')
  await user.click(screen.getByRole('button', { name: 'Annuler' }))
  expect(mocks.saveCorrection).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: /^Type(?! du compte)/ })).toBeInTheDocument()
})

test('a line of another category has no zone row', () => {
  ready(zoned, sharesSnapshot)
  mocks.params.current = { id: 'cur-l' }
  render(<LinePage />)
  expect(screen.queryByRole('button', { name: /^(Zone|Type)(?! du compte)/ })).toBeNull()
})

const twoHomes = profileOf(
  [account('h1', 'home'), account('h2', 'home'), account('loan', 'loan', { financedLineId: 'h1-l' })],
  [
    line('h1-l', 'h1', { name: 'Maison' }),
    line('h2-l', 'h2', { name: 'Studio' }),
    line('loan-l', 'loan', { name: 'Prêt' }),
  ],
)
const twoHomesSnapshot = snapshotOf([amountEntry('h1-l', 300_000), amountEntry('h2-l', 100_000), amountEntry('loan-l', 80_000)])

test('links a loan to another home, or to none', async () => {
  const user = userEvent.setup()
  ready(twoHomes, twoHomesSnapshot)
  mocks.params.current = { id: 'loan-l' }
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: /Le bien qu’il finance/ }))
  expect(screen.getByRole('button', { name: 'Maison' })).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: 'Studio' }))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(planned(twoHomes)[0].value.accounts.find((a) => a.id === 'loan')!.financedLineId).toBe('h2-l')

  mocks.saveCorrection.mockClear()
  await user.click(screen.getByRole('button', { name: /Le bien qu’il finance/ }))
  await user.click(screen.getByRole('button', { name: 'Aucun' }))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(planned(twoHomes)[0].value.accounts.find((a) => a.id === 'loan')!).not.toHaveProperty('financedLineId')
})

// A profile where the loan's line sits in another account than the one on screen.
const reRead: Profile = {
  ...exampleProfile,
  accounts: [
    ...exampleProfile.accounts.filter((a) => a.id !== 'mortgage'),
    { id: 'mortgage-bis', establishmentId: 'home', type: 'loan', name: 'Crédit', financedLineId: 'house-line' },
  ],
  lines: exampleProfile.lines.map((l) => (l.id === 'mortgage-line' ? { ...l, accountId: 'mortgage-bis' } : l)),
}

test('files the loan held at home in a bank from the nudge, in one profile write that follows the re-read profile', async () => {
  const user = userEvent.setup()
  const reload = ready()
  mocks.params.current = { id: 'mortgage-line' }
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: 'Le ranger dans sa banque' }))
  await user.click(screen.getByRole('button', { name: 'BoursoBank' }))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

  const writes = planned(reRead)
  expect(writes).toHaveLength(1)
  expect(writes[0].kind).toBe('profile')
  const accounts = writes[0].value.accounts
  expect(accounts.find((a) => a.id === 'mortgage-bis')!.establishmentId).toBe('boursobank')
  expect(accounts.some((a) => a.id === 'mortgage')).toBe(false)
  expect(reload).toHaveBeenCalledTimes(1)
})

test('moves a fund to another account in one write', async () => {
  const user = userEvent.setup()
  mocks.params.current = { id: 'life-uc' }
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: /Où il est rangé/ }))
  await user.click(screen.getByRole('button', { name: 'PEA · BoursoBank' }))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

  expect(mocks.saveCorrection).toHaveBeenCalledTimes(1)
  const writes = planned()
  expect(writes).toHaveLength(1)
  expect(writes[0].value.lines.find((l) => l.id === 'life-uc')!.accountId).toBe('pea')
})

test('leaves the category alone when only the place changes', async () => {
  const user = userEvent.setup()
  mocks.params.current = { id: 'life-uc' }
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: /Où il est rangé/ }))
  await user.click(screen.getByRole('button', { name: 'PEA · BoursoBank' }))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(planned()[0].value.lines.find((l) => l.id === 'life-uc')!).not.toHaveProperty('category')
})

test('says there is no other bank yet, and offers nothing to save', async () => {
  const user = userEvent.setup()
  const lone = profileOf([account('livret', 'livret-a')], [line('livret-l', 'livret')])
  ready(lone, snapshotOf([amountEntry('livret-l', 500)]))
  mocks.params.current = { id: 'livret-l' }
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: /Sa banque/ }))
  expect(screen.getByText(plain(NO_OTHER_BANK))).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
})

test('with a single bank, the only fund of a PEA can still change its category, in one write that changes nothing else', async () => {
  const user = userEvent.setup()
  const onePea = profileOf([account('pea', 'pea', { name: 'PEA' })], [line('fund', 'pea', { name: 'Fonds monde', kind: 'units' })])
  ready(onePea, snapshotOf([unitsEntry('fund', 10, 100, null)]))
  mocks.params.current = { id: 'fund' }
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: /Catégorie/ }))
  await user.click(screen.getByRole('button', { name: 'Or et crypto' }))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  const writes = planned(onePea)
  expect(writes).toEqual([{ kind: 'profile', value: { ...onePea, lines: [{ ...onePea.lines[0], category: 'gold' }] } }])
})

// A crypto wallet holding two coins, at BoursoBank: a coin can be filed in the PEA, whose default is the markets.
const withCoins: Profile = {
  ...exampleProfile,
  accounts: [...exampleProfile.accounts, { id: 'wallet', establishmentId: 'boursobank', type: 'crypto', name: 'Crypto' }],
  lines: [
    ...exampleProfile.lines,
    line('btc', 'wallet', { name: 'Bitcoin', kind: 'units' }),
    line('eth', 'wallet', { name: 'Ether', kind: 'units' }),
  ],
}

test('a move never changes the category silently: a coin filed in the PEA stays in gold and crypto', async () => {
  const user = userEvent.setup()
  ready(withCoins, { ...exampleSnapshot, entries: [...exampleSnapshot.entries, unitsEntry('btc', 1, 60_000, null), unitsEntry('eth', 2, 3_000, null)] })
  mocks.params.current = { id: 'btc' }
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: /Où il est rangé/ }))
  await user.click(screen.getByRole('button', { name: 'PEA · BoursoBank' }))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  const moved = planned(withCoins)[0].value.lines.find((l) => l.id === 'btc')!
  expect(moved).toMatchObject({ accountId: 'pea', category: 'gold' })
})

// docs/superpowers/specs/2026-11-11-tout-corriger-depuis-la-fiche-design.md
test('the category of an amount line, from its own row, its square beside it, in one write', async () => {
  const user = userEvent.setup()
  mocks.params.current = { id: 'livret-a-line' }
  render(<LinePage />)
  const row = screen.getByRole('button', { name: /Catégorie/ })
  expect(row).toHaveTextContent('Argent disponible')
  expect(row.querySelector('[data-category="available"]')).not.toBeNull()
  await user.click(row)
  await user.click(screen.getByRole('button', { name: 'Épargne sécurisée' }))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  const writes = planned()
  expect(writes).toHaveLength(1)
  expect(writes[0].value.lines.find((l) => l.id === 'livret-a-line')!.category).toBe('secured')
})

// Nicolas's case: crowdfunding lines in his PEA.
const crowd = (id: string, name: string) => line(id, 'pea', { name, kind: 'amount', category: 'secured', group: 'unknown' })
const withCrowd: Profile = { ...exampleProfile, lines: [...exampleProfile.lines, crowd('villa', 'VILLA CARMEN'), crowd('reaumur', 'REAUMUR')] }
const crowdSnapshot = { ...exampleSnapshot, entries: [...exampleSnapshot.entries, amountEntry('villa', 1_000), amountEntry('reaumur', 1_000)] }

test('a new PEA-PME from « Où il est rangé », the other crowdfunding line taken along, in one write', async () => {
  const user = userEvent.setup()
  ready(withCrowd, crowdSnapshot)
  mocks.params.current = { id: 'villa' }
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: /Où il est rangé/ }))
  await user.click(screen.getByRole('button', { name: '+ Un nouveau compte' }))
  await user.click(screen.getByRole('button', { name: /PEA-PME/ }))
  expect(screen.getByRole('button', { name: 'REAUMUR' })).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  const writes = planned(withCrowd, crowdSnapshot)
  expect(writes).toHaveLength(1)
  const created = writes[0].value.accounts.find((a) => a.type === 'pea-pme')!
  expect(created).toMatchObject({ establishmentId: 'boursobank', name: 'PEA-PME' })
  for (const id of ['villa', 'reaumur']) expect(writes[0].value.lines.find((l) => l.id === id)!.accountId).toBe(created.id)
  expect(writes[0].value.lines.find((l) => l.id === 'etf')!.accountId).toBe('pea')
})

test('one line slow among others, or the whole account', async () => {
  const user = userEvent.setup()
  ready(withCrowd, crowdSnapshot)
  mocks.params.current = { id: 'villa' }
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: /Récupérable en quelques semaines/ }))
  await user.click(screen.getByRole('button', { name: 'Non' }))
  const line = planned(withCrowd, crowdSnapshot)[0].value
  expect(line.lines.find((l) => l.id === 'villa')!.slow).toBe(true)
  expect(line.accounts.find((a) => a.id === 'pea')).not.toHaveProperty('slow')
})

test('the type of the account, among the ones that take its lines, in one write', async () => {
  const user = userEvent.setup()
  mocks.params.current = { id: 'etf' }
  render(<LinePage />)
  expect(screen.getByText('PEA · BoursoBank')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Type du compte/ }))
  expect(screen.queryByRole('button', { name: /^Livret A/ })).toBeNull()
  await user.click(screen.getByRole('button', { name: /PEA-PME/ }))
  const writes = planned()
  expect(writes).toHaveLength(1)
  expect(writes[0].value.accounts.find((a) => a.id === 'pea')).toMatchObject({ type: 'pea-pme', name: 'PEA-PME' })
})

test('« Compté en »: an amount counted in parts says what follows, then recounts the history', async () => {
  const user = userEvent.setup()
  ready(withCrowd, crowdSnapshot)
  mocks.params.current = { id: 'villa' }
  render(<LinePage />)
  expect(screen.getByRole('button', { name: /Compté en/ })).toHaveTextContent('montant · €')
  await user.click(screen.getByRole('button', { name: /Compté en/ }))
  await user.click(screen.getByRole('button', { name: 'En parts' }))
  await user.type(screen.getByLabelText(/Combien de parts aujourd’hui/), '4')
  expect(plain(screen.getByText(/Ton relevé suivra/).textContent!)).toBe('Ton relevé suivra. Sa valeur ne change pas.')
  await user.click(screen.getByRole('button', { name: 'Recompter' }))
  const writes = planned(withCrowd, crowdSnapshot)
  expect(writes.map((w) => w.kind)).toEqual(['snapshot', 'profile'])
  const entry = (writes[0] as unknown as { value: Snapshot }).value.entries.find((e) => e.lineId === 'villa')!
  expect(entry).toMatchObject({ kind: 'units', units: 4, unitPrice: 250 })
})

test('corrects the parts of a fund through the snapshots re-read at save time', async () => {
  const user = userEvent.setup()
  const reload = ready()
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: /Ses parts et son prix moyen/ }))
  const parts = screen.getByLabelText('Ses parts')
  expect(parts).toHaveValue('100')
  await user.clear(parts)
  await user.type(parts, '120')
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

  // The re-read snapshot differs from the one on screen: the write follows it.
  const reReadSnapshot = snapshotOf([unitsEntry('etf', 100, 250, 200), amountEntry('current-line', 1)])
  const writes = planned(exampleProfile, reReadSnapshot) as unknown as { kind: string; id: string; value: Snapshot }[]
  expect(writes).toHaveLength(1)
  expect(writes[0].kind).toBe('snapshot')
  expect(writes[0].id).toBe('s0')
  expect(writes[0].value.entries.find((e) => e.lineId === 'current-line')).toMatchObject({ amount: 100 })
  expect(writes[0].value.entries.find((e) => e.lineId === 'etf')).toMatchObject({ units: 120, unitPrice: 250, averagePrice: 200 })
  expect(reload).toHaveBeenCalledTimes(1)
})

test('from « prix d’achat manquant », the fiche opens on its figures, the average price ready to type in', async () => {
  const user = userEvent.setup()
  ready(exampleProfile, snapshotOf([unitsEntry('etf', 100, 250, null), amountEntry('current-line', 100)]))
  mocks.search.current = 'modifier=prix-moyen'
  render(<LinePage />)
  const average = screen.getByLabelText(/Son prix moyen/)
  expect(average).toHaveValue('')
  expect(average).toHaveFocus()
  expect(screen.getByLabelText('Ses parts')).toHaveValue('100')
  // The address forgets the request once the form is open: a reload does not open it again.
  expect(mocks.replace).toHaveBeenCalledWith('/ligne/etf')
  await user.type(average, '200')
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  const writes = planned(exampleProfile, snapshotOf([unitsEntry('etf', 100, 250, null), amountEntry('current-line', 100)])) as unknown as {
    value: Snapshot
  }[]
  expect(writes[0].value.entries.find((e) => e.lineId === 'etf')).toMatchObject({ averagePrice: 200 })
})

test('without the address asking for it, the fiche opens with no form', () => {
  render(<LinePage />)
  expect(screen.queryByLabelText(/Son prix moyen/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Ses parts et son prix moyen/ })).toBeInTheDocument()
  expect(mocks.replace).not.toHaveBeenCalled()
})

test('an amount line asked for its average price opens with no form: it has none', () => {
  mocks.params.current = { id: 'livret-a-line' }
  mocks.search.current = 'modifier=prix-moyen'
  render(<LinePage />)
  expect(screen.queryByLabelText(/Son montant/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument()
})

test('corrects an amount, in the currency of the line', async () => {
  const user = userEvent.setup()
  mocks.params.current = { id: 'livret-a-line' }
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: /Son montant/ }))
  const field = screen.getByLabelText('Son montant (EUR)')
  await user.clear(field)
  await user.type(field, '12500')
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  const writes = planned() as unknown as { value: Snapshot }[]
  expect(writes[0].value.entries.find((e) => e.lineId === 'livret-a-line')).toMatchObject({ amount: 1_250_000 })
})

test('the unlock year and the financed home follow the re-read profile, not the account on screen', async () => {
  const user = userEvent.setup()
  ready(employee, employeeSnapshot)
  mocks.params.current = { id: 'pee-l' }
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: /Disponible en/ }))
  await user.clear(screen.getByLabelText('Disponible en (année)'))
  await user.type(screen.getByLabelText('Disponible en (année)'), '2033')
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  const moved = profileOf(
    [account('pee-bis', 'employee-savings', { name: 'PEE', unlockOn: '2029-01-01' })],
    [line('pee-l', 'pee-bis', { name: 'PEE' })],
  )
  const accounts = planned(moved, employeeSnapshot)[0].value.accounts
  expect(accounts).toHaveLength(1)
  expect(accounts[0]).toMatchObject({ id: 'pee-bis', unlockOn: '2033-01-01' })
})

// Runs the plan like saveCorrection does, on a re-read state.
function runPlanOn(state: CorrectionState) {
  mocks.saveCorrection.mockImplementation(async (_c: unknown, _k: unknown, plan: (s: CorrectionState) => { refused?: string }) => {
    const result = plan(state)
    return result.refused ?? 'saved'
  })
}

test('says the line changed meanwhile when the re-read profile no longer holds it', async () => {
  const user = userEvent.setup()
  runPlanOn({
    profile: { id: 'p0', value: { ...exampleProfile, lines: exampleProfile.lines.filter((l) => l.id !== 'life-uc') } },
    snapshots: [{ id: 's0', value: exampleSnapshot }],
  })
  mocks.params.current = { id: 'life-uc' }
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: /Où il est rangé/ }))
  await user.click(screen.getByRole('button', { name: 'PEA · BoursoBank' }))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getByRole('alert')).toHaveTextContent(plain(CHANGED_MEANWHILE))
})

test('says the line changed meanwhile when the re-read snapshot no longer holds it', async () => {
  const user = userEvent.setup()
  runPlanOn({ profile: { id: 'p0', value: exampleProfile }, snapshots: [{ id: 's0', value: snapshotOf([amountEntry('current-line', 1)]) }] })
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: /Ses parts et son prix moyen/ }))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getByRole('alert')).toHaveTextContent(plain(CHANGED_MEANWHILE))
})

test('refuses figures typed over a reading that changed meanwhile, whatever field changed', async () => {
  const user = userEvent.setup()
  // On screen: 100 parts at 250 €, average 200 €, seen on 30 September.
  const changed = [
    unitsEntry('etf', 101, 250, 200),
    unitsEntry('etf', 100, 251, 200),
    unitsEntry('etf', 100, 250, null),
    unitsEntry('etf', 100, 250, 200, '2026-10-01'),
  ]
  for (const entry of changed) {
    const reload = ready()
    mocks.saveCorrection.mockReset()
    runPlanOn({ profile: { id: 'p0', value: exampleProfile }, snapshots: stored([snapshotOf([entry, amountEntry('current-line', 1)])]) })
    const { unmount } = render(<LinePage />)
    await user.click(screen.getByRole('button', { name: /Ses parts et son prix moyen/ }))
    await user.clear(screen.getByLabelText('Ses parts'))
    await user.type(screen.getByLabelText('Ses parts'), '120')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(screen.getByRole('alert')).toHaveTextContent(plain(CHANGED_MEANWHILE))
    expect(reload).toHaveBeenCalledTimes(1)
    unmount()
  }
})

test('a plan that fails for another reason says the save failed, not a change', async () => {
  const user = userEvent.setup()
  mocks.params.current = { id: 'life-uc' }
  // The re-read profile no longer lets this line go to the PEA: moveLine throws.
  runPlanOn({
    profile: { id: 'p0', value: { ...exampleProfile, accounts: exampleProfile.accounts.filter((a) => a.id !== 'pea') } },
    snapshots: [{ id: 's0', value: exampleSnapshot }],
  })
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: /Où il est rangé/ }))
  await user.click(screen.getByRole('button', { name: 'PEA · BoursoBank' }))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getByRole('alert')).toHaveTextContent(plain(SAVE_FAILED))
})

const withClosedOn = (lineId: string, closedOn: string): Profile => ({
  ...exampleProfile,
  lines: exampleProfile.lines.map((l) => (l.id === lineId ? { ...l, closedOn } : l)),
})
const profileWrite = () => planned().find((w) => w.kind === 'profile')!

test('closes a line after the last snapshot with no confirmation, and reloads', async () => {
  const user = userEvent.setup()
  const reload = ready()
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: 'Fermé ou tout vendu' }))
  expect(screen.getByLabelText(plain(SINCE))).toHaveValue(todayIso())
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(mocks.saveCorrection).toHaveBeenCalledTimes(1)
  expect(profileWrite().value.lines.find((l) => l.id === 'etf')!.closedOn).toBe(todayIso())
  expect(reload).toHaveBeenCalledTimes(1)
})

// The model the fiche reads, with several snapshots, oldest first (s0, s1…).
function readyWith(profile: Profile, snapshots: Snapshot[]) {
  const reload = ready(profile)
  const model = (mocks.state.current as Extract<ModelState, { status: 'ready' }>).model
  model.snapshots = snapshots.map((x, i) => loaded(x, `s${i}`))
  return reload
}
const second = { ...exampleSnapshot, takenOn: '2026-10-15' }
const stored = (snapshots: Snapshot[]) => snapshots.map((value, i) => ({ id: `s${i}`, value }))

// Closes the fund on the 10th of October: the snapshot of the 15th is rewritten, so it asks first.
async function closeOnTheTenth(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Fermé ou tout vendu' }))
  fireEvent.change(screen.getByLabelText(plain(SINCE)), { target: { value: '2026-10-10' } })
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  await user.click(screen.getByRole('button', { name: YES_CLOSE }))
}

test('asks before closing on a day a snapshot was taken, and says how many it changes', async () => {
  const user = userEvent.setup()
  readyWith(exampleProfile, [exampleSnapshot, second])
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: 'Fermé ou tout vendu' }))
  fireEvent.change(screen.getByLabelText(plain(SINCE)), { target: { value: '2026-10-10' } })
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getByText('Il sortira de ton relevé pris depuis le 10 octobre. Ça ne se défait pas.')).toBeInTheDocument()
  expect(mocks.saveCorrection).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Oui, le fermer' }))
  expect(mocks.saveCorrection).toHaveBeenCalledTimes(1)
})

test('a close that takes the line out of its snapshots goes back to the category, as a deletion does', async () => {
  const user = userEvent.setup()
  const reload = readyWith(exampleProfile, [exampleSnapshot, second])
  render(<LinePage />)
  await closeOnTheTenth(user)
  expect(mocks.replace).toHaveBeenCalledWith('/categorie/markets')
  expect(mocks.replace).not.toHaveBeenCalledWith('/')
  expect(reload).not.toHaveBeenCalled()
})

test('a close cut short in its confirmation reads the fiche again: it then shows the close unfinished, the sentence kept', async () => {
  const user = userEvent.setup()
  const reload = readyWith(exampleProfile, [exampleSnapshot, second])
  mocks.saveCorrection.mockRejectedValueOnce(new Error('network'))
  const { rerender } = render(<LinePage />)
  await closeOnTheTenth(user)
  // Said inside the confirmation step, which stays.
  expect(screen.getByRole('alert')).toHaveTextContent(plain(SAVE_FAILED))
  expect(screen.getByRole('button', { name: YES_CLOSE })).toBeInTheDocument()
  expect(reload).toHaveBeenCalledTimes(1)
  expect(mocks.replace).not.toHaveBeenCalled()

  // The re-read: the profile was written (closed on the 10th), the snapshot of the 15th was not.
  readyWith(withClosedOn('etf', '2026-10-10'), [exampleSnapshot, second])
  rerender(<LinePage />)
  expect(screen.getByText(UNFINISHED('10 octobre'))).toBeInTheDocument()
  // The profile was written: « Rien n’a changé » would be false, UNFINISHED already tells the truth.
  expect(screen.queryByText(SAVE_FAILED)).toBeNull()
  expect(screen.getByRole('button', { name: FINISH })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: YES_CLOSE })).toBeNull()
})

test('« Oui, le fermer » again on a close cut short finishes it, then goes back to the category', async () => {
  const user = userEvent.setup()
  const reload = readyWith(exampleProfile, [exampleSnapshot, second])
  // What is re-read at save time: the profile already closed on the 10th, the snapshot of the 15th still holding it.
  const cut = { profile: { id: 'p0', value: withClosedOn('etf', '2026-10-10') }, snapshots: stored([exampleSnapshot, second]) }
  runPlanOn(cut)
  render(<LinePage />)
  await closeOnTheTenth(user)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(mocks.replace).toHaveBeenCalledWith('/categorie/markets')
  expect(reload).not.toHaveBeenCalled()
  // It wrote only the snapshot left, without the line.
  const plan = mocks.saveCorrection.mock.calls[0][2] as (s: CorrectionState) => { writes: { kind: string; id?: string; value: Snapshot }[] }
  const writes = plan(cut).writes
  expect(writes.map((w) => w.id ?? w.kind)).toEqual(['s1'])
  expect(writes[0].value.entries.some((e) => e.lineId === 'etf')).toBe(false)
})

test('refuses a day before the first snapshot without writing', async () => {
  const user = userEvent.setup()
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: 'Fermé ou tout vendu' }))
  fireEvent.change(screen.getByLabelText(plain(SINCE)), { target: { value: '2026-09-30' } })
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getByText(plain(TOO_EARLY))).toBeInTheDocument()
  expect(mocks.saveCorrection).not.toHaveBeenCalled()
})

test('says the line changed meanwhile when the close is refused on the re-read state', async () => {
  const user = userEvent.setup()
  runPlanOn({ profile: { id: 'p0', value: withClosedOn('etf', '2026-10-05') }, snapshots: [{ id: 's0', value: exampleSnapshot }] })
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: 'Fermé ou tout vendu' }))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getByRole('alert')).toHaveTextContent(plain(CHANGED_MEANWHILE))
})

test('reopens a line closed after the last snapshot', async () => {
  const user = userEvent.setup()
  const reload = ready(withClosedOn('etf', '2026-10-05'))
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: REOPEN }))
  expect(mocks.saveCorrection).toHaveBeenCalledTimes(1)
  const plan = mocks.saveCorrection.mock.calls[0][2] as (s: CorrectionState) => { writes: { kind: string; value: Profile }[] }
  const writes = plan({ profile: { id: 'p0', value: withClosedOn('etf', '2026-10-05') }, snapshots: [{ id: 's0', value: exampleSnapshot }] }).writes
  expect(writes[0].value.lines.find((l) => l.id === 'etf')!.closedOn).toBeUndefined()
  expect(reload).toHaveBeenCalledTimes(1)
})

test('finishes an interrupted close, then goes back to the category the line has left', async () => {
  const user = userEvent.setup()
  const profile = withClosedOn('etf', '2026-09-30')
  const reload = ready(profile)
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: FINISH }))
  expect(mocks.saveCorrection).toHaveBeenCalledTimes(1)
  const plan = mocks.saveCorrection.mock.calls[0][2] as (s: CorrectionState) => { writes: { kind: string; value: Snapshot }[] }
  const writes = plan({ profile: { id: 'p0', value: profile }, snapshots: [{ id: 's0', value: exampleSnapshot }] }).writes
  const snapshot = writes.find((w) => w.kind === 'snapshot')!.value
  expect(snapshot.entries.some((e) => e.lineId === 'etf')).toBe(false)
  expect(mocks.replace).toHaveBeenCalledWith('/categorie/markets')
  expect(reload).not.toHaveBeenCalled()
})

test('says why a reopen or a finish could not be done, and reads the fiche again', async () => {
  const user = userEvent.setup()
  const reload = ready(withClosedOn('etf', '2026-10-05'))
  // Re-read: someone reopened it already.
  runPlanOn({ profile: { id: 'p0', value: exampleProfile }, snapshots: [{ id: 's0', value: exampleSnapshot }] })
  const { unmount } = render(<LinePage />)
  await user.click(screen.getByRole('button', { name: REOPEN }))
  expect(screen.getByRole('alert')).toHaveTextContent(plain(CHANGED_MEANWHILE))
  expect(reload).toHaveBeenCalledTimes(1)
  unmount()

  // « Terminer », refused: the close was finished meanwhile.
  const reloadAgain = ready(withClosedOn('etf', '2026-09-30'))
  runPlanOn({ profile: { id: 'p0', value: withClosedOn('etf', '2026-09-30') }, snapshots: stored([snapshotOf([amountEntry('current-line', 1)])]) })
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: FINISH }))
  expect(screen.getByRole('alert')).toHaveTextContent(plain(CHANGED_MEANWHILE))
  expect(reloadAgain).toHaveBeenCalledTimes(1)
  expect(mocks.replace).not.toHaveBeenCalled()
})

test('deletes after confirmation, then goes back to the category', async () => {
  const user = userEvent.setup()
  const reload = ready()
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: 'Supprimer, saisi par erreur' }))
  expect(mocks.saveCorrection).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: YES_DELETE }))
  expect(mocks.saveCorrection).toHaveBeenCalledTimes(1)
  // The delete closes, empties the snapshots, then removes the line: the last profile write is the removal.
  const last = planned().filter((w) => w.kind === 'profile').at(-1)!
  expect(last.value.lines.some((l) => l.id === 'etf')).toBe(false)
  expect(mocks.replace).toHaveBeenCalledWith('/categorie/markets')
  expect(reload).not.toHaveBeenCalled()
})

test('refuses to delete the only line of a snapshot', async () => {
  const user = userEvent.setup()
  ready(exampleProfile, snapshotOf([unitsEntry('etf', 100, 250, 200)]))
  render(<LinePage />)
  await user.click(screen.getByRole('button', { name: 'Supprimer, saisi par erreur' }))
  expect(screen.getByText(plain(ONLY_LINE))).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: YES_DELETE })).toBeNull()
})

test('labels the exit « Remboursé » for a loan, and « Vendu » for a house', () => {
  mocks.params.current = { id: 'mortgage-line' }
  const { unmount } = render(<LinePage />)
  expect(screen.getByRole('button', { name: 'Remboursé' })).toBeInTheDocument()
  unmount()
  mocks.params.current = { id: 'house-line' }
  render(<LinePage />)
  expect(screen.getByRole('button', { name: 'Vendu' })).toBeInTheDocument()
})

test('the fiche of a financed house says its loan under its amount, never in red', () => {
  mocks.params.current = { id: 'house-line' }
  render(<LinePage />)
  const sentence = screen.getByText(/dont 180\s000\s€ dus à la banque$/)
  expect(sentence.textContent?.replace(/[\u00a0\u202f]/g, ' ')).toBe('300 000 € dont 180 000 € dus à la banque')
  expect(sentence.className).not.toContain('text-loss')
})

test('replaces the exit with a sentence when the line was entered today, and still offers deletion', () => {
  ready(exampleProfile, { ...exampleSnapshot, takenOn: todayIso() })
  render(<LinePage />)
  expect(screen.getByText(plain(TOO_EARLY))).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Fermé ou tout vendu' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Supprimer, saisi par erreur' })).toBeInTheDocument()
})
