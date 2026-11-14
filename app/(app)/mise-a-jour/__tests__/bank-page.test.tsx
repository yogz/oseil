// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { setAmountsHidden } from '@/lib/format'
import type { LinePrices } from '@/lib/market/live'
import { PRICE_FAILED, PRICE_OF_THE_DAY } from '@/lib/market/words'
import { amountEntry, exampleProfile, exampleSnapshot, unitsEntry } from '@/lib/model/__tests__/fixtures'
import type { Profile, Snapshot, UpdateDraft } from '@/lib/model/types'
import { steps } from '@/lib/setup/first-launch'
import { SAVE_FAILED } from '@/lib/setup/use-first-launch'
import { startDraft } from '@/lib/update/draft'
import { addAccount, putAddedLine } from '@/lib/update/lines'
import type { UpdateState } from '@/lib/update/use-update'
import BankPage from '../banque/page'

// The screen read by every component of the page, held outside React so that the
// page and the bank step see the same one, and both re-render when it changes.
const mocks = vi.hoisted(() => {
  let screen: unknown = null
  const listeners = new Set<() => void>()
  return {
    store: {
      get: () => screen,
      set: (next: unknown) => {
        screen = next
        for (const listener of listeners) listener()
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    push: vi.fn(),
    replace: vi.fn(),
  }
})

vi.mock('@/components/update/UpdateProvider', async () => {
  const { useSyncExternalStore } = await import('react')
  return { useUpdateScreen: () => useSyncExternalStore(mocks.store.subscribe, mocks.store.get) }
})
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}))

// What the test holds: the draft, as the real hook keeps it after each change; a write
// that fails keeps the change on screen, unsaved (F1).
type World = {
  profile: Profile
  draft: UpdateDraft
  base: Snapshot
  // What the update read from the market when it opened.
  prices: LinePrices
  failed: string[]
  current: string | null
  fail: boolean
  saveError: string | null
  settled: () => Promise<boolean>
  calls: string[]
}
let world: World

function publish() {
  const state: UpdateState = {
    status: 'ready',
    session: {
      profile: world.profile,
      base: { id: 's1', value: world.base, updatedAt: '' },
      draft: world.draft,
      market: { prices: world.prices, rates: null },
      failedPrices: world.failed,
      retryMarket: () => {},
      saved: true,
      change: async (f) => {
        world.calls.push('change')
        world.draft = f(world.draft)
        world.saveError = world.fail ? SAVE_FAILED : null
        publish()
        return !world.fail
      },
      resave: async () => {
        world.calls.push('resave')
        world.saveError = world.fail ? SAVE_FAILED : null
        publish()
        return !world.fail
      },
      save: async () => true,
      abandon: async () => true,
      settled: () => {
        world.calls.push('settled')
        return world.settled()
      },
      saveError: world.saveError,
    },
  }
  mocks.store.set({
    state,
    current: steps(world.profile).find((e) => e.id === world.current) ?? null,
    show: (id: string) => {
      world.current = id
      publish()
    },
  })
}

function notReady(state: UpdateState) {
  mocks.store.set({ state, current: null, show: vi.fn() })
}

beforeEach(() => {
  mocks.push.mockReset()
  mocks.replace.mockReset()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  world = {
    profile: exampleProfile,
    draft: startDraft('s1'),
    base: exampleSnapshot,
    prices: {},
    failed: [],
    current: 'boursobank',
    fail: false,
    saveError: null,
    settled: async () => true,
    calls: [],
  }
  publish()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// formatEuros writes its spaces as no-break spaces.
const norm = (s: string) => s.replace(/[  ]/g, ' ')
const sees = (text: string) => screen.getByText((content) => norm(content) === text)
const region = (name: string) => screen.getByRole('region', { name })
const heading = () => screen.getByRole('heading', { level: 1 })

test('BoursoBank: its place, the sentence for banks, its lines, and the count of lines verified', async () => {
  render(<BankPage />)
  expect(heading()).toHaveTextContent('BoursoBank')
  expect(screen.getByText('2 sur 3')).toBeInTheDocument()
  expect(screen.getByText('Recopie la valeur que t’affiche ton application BoursoBank.')).toBeInTheDocument()
  expect(screen.getByText('0 ligne sur 3 vérifiée')).toBeInTheDocument()
  // The row follows the line: an amount, a fund in parts.
  expect(within(region('Livret A')).getByLabelText('Combien y a-t-il dessus ?')).toHaveValue('12\u202f000')
  expect(within(region('ETF')).getByLabelText('Combien vaut une part aujourd’hui ?')).toHaveValue('250,00')
  // No account here has two lines: no total to check.
  expect(screen.queryByText(/^Total du compte/)).not.toBeInTheDocument()

  await userEvent.click(within(region('Livret A')).getByRole('button', { name: 'Inchangé' }))
  expect(world.draft.confirmed).toEqual(['livret-a-line'])
  expect(screen.getByText('1 ligne sur 3 vérifiée')).toBeInTheDocument()
})

test('one main exit: untouched, the pill says « Rien n’a changé ici »; once a line is confirmed it says « Suivant »', async () => {
  render(<BankPage />)
  expect(screen.getByRole('button', { name: 'Rien n’a changé ici' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Suivant/ })).not.toBeInTheDocument()
  // « Passer pour cette fois » stays, quiet, below.
  expect(screen.getByRole('button', { name: 'Passer pour cette fois' })).toBeInTheDocument()
  await userEvent.click(within(region('Livret A')).getByRole('button', { name: 'Inchangé' }))
  expect(screen.queryByRole('button', { name: 'Rien n’a changé ici' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Suivant\u00A0: Linxea' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Passer pour cette fois' })).toBeInTheDocument()
})

test('« Rien n’a changé ici » shows on a fresh bank, and goes once a value is typed there', async () => {
  render(<BankPage />)
  expect(screen.getByRole('button', { name: 'Rien n’a changé ici' })).toBeInTheDocument()
  const box = within(region('Livret A')).getByRole('textbox')
  await userEvent.clear(box)
  await userEvent.type(box, '13000')
  await userEvent.tab()
  expect(world.draft.values).toEqual([
    { lineId: 'livret-a-line', kind: 'amount', amount: 1_300_000, seenOn: expect.any(String) },
  ])
  expect(screen.queryByRole('button', { name: 'Rien n’a changé ici' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Suivant\u00A0: Linxea' })).toBeInTheDocument()
  expect(screen.getByText('1 ligne sur 3 vérifiée')).toBeInTheDocument()
})

test('« Rien n’a changé ici » confirms every line, finishes the bank and moves on', async () => {
  render(<BankPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Rien n’a changé ici' }))
  expect(world.draft.confirmed).toEqual(['current-line', 'livret-a-line', 'etf'])
  expect(world.draft.progress).toEqual({ boursobank: 'done' })
  expect(heading()).toHaveTextContent('Linxea')
})

test('« Suivant : Linxea » finishes BoursoBank and shows Linxea', async () => {
  render(<BankPage />)
  await userEvent.click(within(region('Livret A')).getByRole('button', { name: 'Inchangé' }))
  await userEvent.click(screen.getByRole('button', { name: 'Suivant\u00A0: Linxea' }))
  expect(world.draft.progress).toEqual({ boursobank: 'done' })
  expect(heading()).toHaveTextContent('Linxea')
  expect(screen.getByText('3 sur 3')).toBeInTheDocument()
})

test('a value typed then the main exit at once, without leaving the box: the value is kept, then the bank finished', async () => {
  render(<BankPage />)
  const box = within(region('Compte courant')).getByRole('textbox')
  await userEvent.clear(box)
  await userEvent.type(box, '7500')
  // The pill still says « Rien n’a changé ici » when it is touched: the box commits first, and that
  // exit confirms only the lines not typed.
  await userEvent.click(screen.getByRole('button', { name: /^(Rien n’a changé ici$|Suivant)/ }))
  expect(world.draft.values).toEqual([
    { lineId: 'current-line', kind: 'amount', amount: 750_000, seenOn: expect.any(String) },
  ])
  expect(world.draft.progress).toEqual({ boursobank: 'done' })
  expect(heading()).toHaveTextContent('Linxea')
})

test('« Suivant » not saved: the bank stays on screen, with the save error', async () => {
  render(<BankPage />)
  await userEvent.click(within(region('Livret A')).getByRole('button', { name: 'Inchangé' }))
  world.fail = true
  publish()
  await userEvent.click(screen.getByRole('button', { name: 'Suivant\u00A0: Linxea' }))
  expect(heading()).toHaveTextContent('BoursoBank')
  // Kept on screen, unsaved (F1): the next write carries it.
  expect(world.draft.progress).toEqual({ boursobank: 'done' })
  expect(screen.getByRole('alert')).toHaveTextContent(SAVE_FAILED)
  // It can be tried again.
  world.fail = false
  await userEvent.click(screen.getByRole('button', { name: 'Suivant\u00A0: Linxea' }))
  expect(heading()).toHaveTextContent('Linxea')
})

test('an account of several lines: its name once as a title, its lines under it, its total at the end', () => {
  world.current = 'linxea'
  publish()
  render(<BankPage />)
  // Said once, as a title; no line repeats it.
  expect(screen.getAllByText('Assurance-vie')).toHaveLength(1)
  const title = screen.getByRole('heading', { level: 2, name: 'Assurance-vie' })
  const group = title.parentElement!
  expect(within(group).getByRole('region', { name: 'Fonds euros' })).toBeInTheDocument()
  expect(within(group).getByRole('region', { name: 'Unité de compte' })).toBeInTheDocument()
  // The total comes after the lines.
  const total = sees('Total du compte : 35 000 €')
  expect(group.compareDocumentPosition(total) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  // An account of one line keeps the line's own title, with no account title above it.
  world.current = 'boursobank'
  publish()
  expect(screen.queryByRole('heading', { level: 2, name: 'Livret A' })).not.toBeInTheDocument()
})

test('with the amounts hidden, the bank’s total still shows its figure', () => {
  world.current = 'linxea'
  publish()
  setAmountsHidden(true)
  try {
    render(<BankPage />)
    sees('Total du compte : 35 000 €')
  } finally {
    setAmountsHidden(false)
  }
})

test('Linxea, the last step: the total paid in, the account’s total checked against the bank, then the result', async () => {
  world.current = 'linxea'
  publish()
  render(<BankPage />)
  expect(screen.getByText('3 sur 3')).toBeInTheDocument()
  expect(screen.getByLabelText('Total versé depuis l’ouverture')).toHaveValue('')
  expect(screen.queryByLabelText('Combien a été versé dessus ?')).not.toBeInTheDocument()
  sees('Total du compte : 35 000 €')
  expect(
    screen.getByText(
      'C’est bien ce que montre ta banque ? Un écart vient presque toujours d’un achat ou d’une vente oublié.',
    ),
  ).toBeInTheDocument()

  // The total follows what is typed.
  const fund = within(region('Fonds euros')).getByRole('textbox')
  await userEvent.clear(fund)
  await userEvent.type(fund, '31000')
  await userEvent.tab()
  sees('Total du compte : 36 000 €')

  const paid = screen.getByLabelText('Total versé depuis l’ouverture')
  await userEvent.clear(paid)
  await userEvent.type(paid, '18400')
  await userEvent.tab()
  expect(world.draft.paidTotals).toEqual({ life: 1_840_000 })
  expect(world.draft.contributions).toEqual({})

  await userEvent.click(screen.getByRole('button', { name: 'Voir le résultat' }))
  expect(world.draft.progress).toEqual({ linxea: 'done' })
  expect(mocks.push).toHaveBeenCalledWith('/mise-a-jour/resultat')
})

test('« Passer pour cette fois » leaves the bank not reviewed, and moves on', async () => {
  render(<BankPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Passer pour cette fois' }))
  expect(world.draft.progress).toEqual({ boursobank: 'skipped' })
  expect(heading()).toHaveTextContent('Linxea')
})

const FINISH = 'Terminer ici, les autres banques gardent leur date'
const FINISH_UNTOUCHED = 'Rien n’a changé ici, terminer\u00A0: les autres banques gardent leur date'

test('« Terminer ici » finishes this bank, skips the others with no status and goes to the result', async () => {
  world.draft = { ...world.draft, progress: { home: 'done' } }
  publish()
  render(<BankPage />)
  // Nothing touched here: the words say that this bank is confirmed too.
  expect(screen.queryByRole('button', { name: FINISH })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: FINISH_UNTOUCHED }))
  expect(world.calls).toContain('change')
  expect(world.draft.progress).toEqual({ home: 'done', boursobank: 'done', linxea: 'skipped' })
  expect(world.draft.confirmed).toEqual(['current-line', 'livret-a-line', 'etf'])
  expect(mocks.push).toHaveBeenCalledWith('/mise-a-jour/resultat')
  expect(heading()).toHaveTextContent('BoursoBank')
})

test('« Terminer ici » with a value typed marks this bank done without confirming the rest', async () => {
  render(<BankPage />)
  const box = within(region('Livret A')).getByRole('textbox')
  await userEvent.clear(box)
  await userEvent.type(box, '13000')
  await userEvent.tab()
  expect(screen.queryByRole('button', { name: FINISH_UNTOUCHED })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: FINISH }))
  expect(world.draft.progress).toEqual({ boursobank: 'done', home: 'skipped', linxea: 'skipped' })
  expect(world.draft.confirmed).toEqual([])
  expect(mocks.push).toHaveBeenCalledWith('/mise-a-jour/resultat')
})

test('« Terminer ici » is not offered on the last bank, nor when a line has no value yet', () => {
  world.current = 'linxea'
  publish()
  const last = render(<BankPage />)
  expect(screen.queryByRole('button', { name: /terminer/i })).not.toBeInTheDocument()
  last.unmount()
  world.current = 'boursobank'
  world.base = { ...exampleSnapshot, entries: exampleSnapshot.entries.filter((e) => e.lineId !== 'livret-a-line') }
  publish()
  render(<BankPage />)
  expect(screen.queryByRole('button', { name: 'Rien n’a changé ici' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /terminer/i })).not.toBeInTheDocument()
})

test('« Terminer ici » stays on the bank when the save fails', async () => {
  world.fail = true
  render(<BankPage />)
  await userEvent.click(screen.getByRole('button', { name: FINISH_UNTOUCHED }))
  expect(mocks.push).not.toHaveBeenCalled()
})

test('« ‹ Retour » goes to the establishment before; on the first one, back to the start', async () => {
  render(<BankPage />)
  await userEvent.click(screen.getByRole('button', { name: '‹ Retour' }))
  expect(heading()).toHaveTextContent('Chez toi')
  expect(screen.getByText('1 sur 3')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '‹ Retour' })).toHaveAttribute('href', '/mise-a-jour')
})

test('« Fermer » waits for every save, the box just left included, then goes to Mon argent', async () => {
  let finish: (ok: boolean) => void = () => {}
  world.settled = () => new Promise((resolve) => (finish = resolve))
  render(<BankPage />)
  const box = within(region('Livret A')).getByRole('textbox')
  await userEvent.clear(box)
  await userEvent.type(box, '12500')
  await userEvent.click(screen.getByRole('button', { name: 'Fermer' }))
  // The box was committed before the wait began.
  expect(world.calls).toEqual(['change', 'settled'])
  expect(world.draft.values).toEqual([
    { lineId: 'livret-a-line', kind: 'amount', amount: 1_250_000, seenOn: expect.any(String) },
  ])
  expect(mocks.push).not.toHaveBeenCalled()
  finish(true)
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/'))
})

const LEAVE_WITHOUT = 'Ta dernière saisie n’a pas été enregistrée. Touche Fermer encore pour quitter sans elle.'

test('« Fermer » with the last save failed: the first tap stays and says so, the second leaves without it', async () => {
  world.saveError = SAVE_FAILED
  world.settled = async () => false
  publish()
  render(<BankPage />)
  expect(screen.queryByText(LEAVE_WITHOUT)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Fermer' }))
  expect(mocks.push).not.toHaveBeenCalled()
  expect(heading()).toHaveTextContent('BoursoBank')
  // Both said near the top: why « Fermer » stayed, and the save error itself.
  expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual([LEAVE_WITHOUT, SAVE_FAILED])
  // The person is never trapped: the second tap leaves, without waiting again.
  await userEvent.click(screen.getByRole('button', { name: 'Fermer' }))
  expect(mocks.push).toHaveBeenCalledWith('/')
  expect(world.calls).toEqual(['settled'])
})

test('« Fermer », one tap, when everything is saved', async () => {
  render(<BankPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Fermer' }))
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/'))
  expect(screen.queryByText(LEAVE_WITHOUT)).not.toBeInTheDocument()
})

test('« Fermer » after a failed save, then a save that works: the sentence goes, and « Fermer » waits again', async () => {
  world.saveError = SAVE_FAILED
  world.settled = async () => false
  publish()
  render(<BankPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Fermer' }))
  expect(screen.getByText(LEAVE_WITHOUT)).toBeInTheDocument()
  // The connection is back: a new value is saved.
  world.settled = async () => true
  const box = within(region('Livret A')).getByRole('textbox')
  await userEvent.clear(box)
  await userEvent.type(box, '12500')
  await userEvent.tab()
  expect(screen.queryByText(LEAVE_WITHOUT)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Fermer' }))
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/'))
  expect(world.calls).toEqual(['settled', 'change', 'settled'])
})

test('Chez toi: the house, the loan with where to find its figure, the gold; no sentence for banks', async () => {
  world.current = 'home'
  publish()
  render(<BankPage />)
  expect(heading()).toHaveTextContent('Chez toi')
  expect(screen.queryByText(/Recopie la valeur/)).not.toBeInTheDocument()
  expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Maison', 'Crédit', 'Or'])
  expect(
    within(region('Crédit')).getByText(
      'Tu le trouves dans l’application de ta banque ou sur ton tableau d’amortissement.',
    ),
  ).toBeInTheDocument()

  await userEvent.click(within(region('Maison')).getByRole('button', { name: 'C’est toujours ça' }))
  expect(world.draft.confirmed).toEqual(['house-line'])
})

test('the house « Changer » records the value even when it is the same, so its estimate is dated anew', async () => {
  world.current = 'home'
  publish()
  render(<BankPage />)
  await userEvent.click(within(region('Maison')).getByRole('button', { name: 'Changer' }))
  const box = within(region('Maison')).getByRole('textbox')
  await userEvent.clear(box)
  await userEvent.type(box, '300000')
  await userEvent.tab()
  expect(world.draft.values).toEqual([
    { lineId: 'house-line', kind: 'amount', amount: 30_000_000, seenOn: expect.any(String) },
  ])
})

test('a line with no value yet: an empty box that says « montant à saisir », and it can be filled', async () => {
  world.base = { ...exampleSnapshot, entries: exampleSnapshot.entries.filter((e) => e.lineId !== 'livret-a-line') }
  publish()
  render(<BankPage />)
  const livret = region('Livret A')
  const box = within(livret).getByRole('textbox')
  expect(box).toHaveValue('')
  expect(within(livret).getByText('montant à saisir')).toBeInTheDocument()
  await userEvent.type(box, '500')
  await userEvent.tab()
  expect(world.draft.values).toEqual([
    { lineId: 'livret-a-line', kind: 'amount', amount: 50_000, seenOn: expect.any(String) },
  ])
})

test('a value typed on a line that had none: still no « Inchangé », which would drop it', async () => {
  world.base = { ...exampleSnapshot, entries: exampleSnapshot.entries.filter((e) => e.lineId !== 'livret-a-line') }
  publish()
  render(<BankPage />)
  const box = within(region('Livret A')).getByRole('textbox')
  await userEvent.type(box, '500')
  await userEvent.tab()
  expect(world.draft.values.map((e) => e.lineId)).toEqual(['livret-a-line'])
  expect(within(region('Livret A')).queryByRole('button', { name: 'Inchangé' })).not.toBeInTheDocument()
})

test('a house that had no value, once typed: no « C’est toujours ça » nor « Changer », and its box stays', async () => {
  world.current = 'home'
  world.base = { ...exampleSnapshot, entries: exampleSnapshot.entries.filter((e) => e.lineId !== 'house-line') }
  publish()
  render(<BankPage />)
  const box = within(region('Maison')).getByRole('textbox')
  await userEvent.type(box, '250000')
  await userEvent.tab()
  expect(world.draft.values.map((e) => e.lineId)).toEqual(['house-line'])
  const house = region('Maison')
  expect(within(house).queryByRole('button', { name: 'C’est toujours ça' })).not.toBeInTheDocument()
  expect(within(house).queryByRole('button', { name: 'Changer' })).not.toBeInTheDocument()
  expect(within(house).getByRole('textbox')).toBeInTheDocument()
})

test('« Rien n’a changé ici » is not offered while a line of the bank has no value: nothing is known of it', () => {
  world.base = { ...exampleSnapshot, entries: exampleSnapshot.entries.filter((e) => e.lineId !== 'livret-a-line') }
  publish()
  render(<BankPage />)
  expect(screen.queryByRole('button', { name: 'Rien n’a changé ici' })).not.toBeInTheDocument()
  // A value to type, or the bank left for this time.
  expect(screen.getByRole('button', { name: 'Suivant\u00A0: Linxea' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Passer pour cette fois' })).toBeInTheDocument()
})

test('no total for an account while one of its lines has no value: it would leave that line out', async () => {
  world.current = 'linxea'
  world.base = { ...exampleSnapshot, entries: exampleSnapshot.entries.filter((e) => e.lineId !== 'euro-fund') }
  publish()
  render(<BankPage />)
  expect(screen.queryByText(/^Total du compte/)).not.toBeInTheDocument()
  const fund = within(region('Fonds euros')).getByRole('textbox')
  await userEvent.type(fund, '30000')
  await userEvent.tab()
  sees('Total du compte : 35 000 €')
})

test.each([
  { status: 'blocked', message: 'Quelque chose n’a pas pu être lu.', retry: () => {} },
  { status: 'failed', retry: () => {} },
  { status: 'unreadable', message: 'Illisible.', restart: async () => true },
  { status: 'conflict', message: 'Ta mise à jour a avancé sur un autre appareil.', reload: () => {} },
] as UpdateState[])('$status: back to the start of the update, which says why', (state) => {
  notReady(state)
  const { container } = render(<BankPage />)
  expect(container).toBeEmptyDOMElement()
  expect(mocks.replace).toHaveBeenCalledWith('/mise-a-jour')
})

// The update waits for the vault and the market (8 seconds at most): the wait of the site, never a blank screen.
test('loading: « Ouverture de ton coffre… », no move, and a way out', () => {
  notReady({ status: 'loading' })
  vi.useFakeTimers()
  render(<BankPage />)
  act(() => vi.advanceTimersByTime(333))
  vi.useRealTimers()
  expect(screen.getByRole('status')).toHaveTextContent(/^Ouverture de ton coffre…$/)
  expect(screen.getByText('Ouverture de ton coffre…')).toHaveClass('text-ink-muted')
  expect(mocks.replace).not.toHaveBeenCalled()
  expect(screen.getByRole('link', { name: 'Fermer' })).toHaveAttribute('href', '/')
})

test('no establishment on screen: back to the start', () => {
  world.current = null
  publish()
  const { container } = render(<BankPage />)
  expect(container).toBeEmptyDOMElement()
  expect(mocks.replace).toHaveBeenCalledWith('/mise-a-jour')
})

// Lot 4b, decision 7: a line attached to its price opens at today's price (R18: the bank
// screen reads the prices the update read, at every place it shows or keeps a value).
describe('today’s prices', () => {
  const quoted: Profile = {
    ...exampleProfile,
    lines: exampleProfile.lines.map((l) => (l.id === 'etf' ? { ...l, quoteSymbol: 'CW8.PA' } : l)),
  }
  beforeEach(() => {
    world.profile = quoted
    world.prices = { etf: 260 }
    publish()
  })

  test('the ETF opens at today’s 260, says so, recalls the last price, and « Rien n’a changé ici » stays', () => {
    render(<BankPage />)
    const etf = region('ETF')
    expect(within(etf).getByLabelText('Combien vaut une part aujourd’hui ?')).toHaveValue('260,00')
    expect(within(etf).getByLabelText('Combien vaut une part aujourd’hui ?')).toHaveAccessibleDescription(PRICE_OF_THE_DAY)
    expect(within(etf).getByText((c) => norm(c) === 'avant : 250,00 €')).toBeInTheDocument()
    expect(within(etf).getByText((c) => norm(c) === '100 parts = 26 000 €')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rien n’a changé ici' })).toBeInTheDocument()
  })

  test('today’s price typed back over another one is a confirmation, not a value', async () => {
    render(<BankPage />)
    const box = () => within(region('ETF')).getByLabelText('Combien vaut une part aujourd’hui ?')
    await userEvent.clear(box())
    await userEvent.type(box(), '270')
    await userEvent.tab()
    expect(world.draft.values).toEqual([
      { lineId: 'etf', kind: 'units', units: 100, unitPrice: 270, averagePrice: 200, seenOn: expect.any(String) },
    ])
    await userEvent.clear(box())
    await userEvent.type(box(), '260')
    await userEvent.tab()
    expect(world.draft.values).toEqual([])
    expect(world.draft.confirmed).toEqual(['etf'])
  })

  test('the base price typed back over today’s is a value: read at the bank', async () => {
    render(<BankPage />)
    const box = within(region('ETF')).getByLabelText('Combien vaut une part aujourd’hui ?')
    await userEvent.clear(box)
    await userEvent.type(box, '250')
    await userEvent.tab()
    expect(world.draft.values).toEqual([
      { lineId: 'etf', kind: 'units', units: 100, unitPrice: 250, averagePrice: 200, seenOn: expect.any(String) },
    ])
  })

  test('a price that could not be fetched: the last price, and the sentence that says to copy the bank’s', () => {
    world.prices = {}
    world.failed = ['etf']
    publish()
    render(<BankPage />)
    const box = within(region('ETF')).getByLabelText('Combien vaut une part aujourd’hui ?')
    expect(box).toHaveValue('250,00')
    expect(box).toHaveAccessibleDescription(PRICE_FAILED)
  })

  test('the sentence of a price that failed goes once a price is typed', async () => {
    world.prices = {}
    world.failed = ['etf']
    publish()
    render(<BankPage />)
    const box = () => within(region('ETF')).getByLabelText('Combien vaut une part aujourd’hui ?')
    expect(box()).toHaveAccessibleDescription(PRICE_FAILED)
    await userEvent.clear(box())
    await userEvent.type(box(), '255')
    await userEvent.tab()
    expect(world.draft.values.map((e) => e.lineId)).toEqual(['etf'])
    expect(box()).toHaveAccessibleDescription('')
  })

  // F3: with no price of the day, « Inchangé » keeps the base price: the sentence stays until one is typed.
  test('the sentence of a price that failed stays once the line is confirmed « Inchangé »', async () => {
    world.prices = {}
    world.failed = ['etf']
    publish()
    render(<BankPage />)
    await userEvent.click(within(region('ETF')).getByRole('button', { name: 'Inchangé' }))
    expect(world.draft.confirmed).toEqual(['etf'])
    expect(within(region('ETF')).getByLabelText('Combien vaut une part aujourd’hui ?')).toHaveAccessibleDescription(PRICE_FAILED)
  })

  test('a line confirmed at today’s price, read again on a day Yahoo fails: back at the base price, and it is said', () => {
    world.prices = {}
    world.failed = ['etf']
    world.draft = { ...startDraft('s1'), confirmed: ['etf'] }
    publish()
    render(<BankPage />)
    const box = within(region('ETF')).getByLabelText('Combien vaut une part aujourd’hui ?')
    expect(box).toHaveValue('250,00')
    expect(box).toHaveAccessibleDescription(PRICE_FAILED)
  })

  test('a converted price keeps its 4 decimals: the box shows the very price its value is computed from', () => {
    world.prices = { etf: 259.7403 }
    publish()
    render(<BankPage />)
    const etf = region('ETF')
    expect(within(etf).getByLabelText('Combien vaut une part aujourd’hui ?')).toHaveValue('259,7403')
    // 100 × 259,7403 = 25 974,03 €.
    expect(within(etf).getByText((c) => norm(c) === '100 parts = 25 974 €')).toBeInTheDocument()
  })

  test('the total of an account reads today’s price, as its box does', () => {
    world.current = 'linxea'
    world.profile = {
      ...quoted,
      lines: quoted.lines.map((l) => (l.id === 'life-uc' ? { ...l, quoteSymbol: 'LU1681043599.SG' } : l)),
    }
    world.prices = { 'life-uc': 520 }
    publish()
    render(<BankPage />)
    // 30 000 € of the fonds euros, and 10 parts at 520 €.
    sees('Total du compte : 35 200 €')
  })
})

// Lot 4b, decision 14 and Review Focus 4: an account in dollars is checked in dollars, as its
// bank shows it, with no rate needed and nothing thrown.
describe('lines in dollars', () => {
  const revolut: Profile = {
    ...exampleProfile,
    establishments: [...exampleProfile.establishments, { id: 'revolut', name: 'Revolut', kind: 'institution' }],
    accounts: [...exampleProfile.accounts, { id: 'rev', establishmentId: 'revolut', type: 'securities', name: 'Compte-titres' }],
    lines: [
      ...exampleProfile.lines,
      { id: 'rev-cash', accountId: 'rev', name: 'Espèces', kind: 'amount', currency: 'USD' },
      { id: 'rev-apple', accountId: 'rev', name: 'Apple', kind: 'units', currency: 'USD' },
    ],
  }

  test('Revolut: its two lines in dollars, and their total in dollars, with no rate in the base', () => {
    world.profile = revolut
    world.base = { ...exampleSnapshot, fx: {}, entries: [...exampleSnapshot.entries, amountEntry('rev-cash', 200), unitsEntry('rev-apple', 4, 250, 200)] }
    world.current = 'revolut'
    publish()
    render(<BankPage />)
    expect(heading()).toHaveTextContent('Revolut')
    expect(within(region('Espèces')).getByText('en dollars américains')).toBeInTheDocument()
    expect(within(region('Apple')).getByText((c) => norm(c) === '4 parts = 1 000 $US')).toBeInTheDocument()
    expect(screen.getByText(/^Total du compte : 1\s200\s\$US$/)).toBeInTheDocument()
  })

  // Under the price, the sentence first and the currency inside it: no capital after « · ».
  test('Apple’s price could not be fetched: the sentence says to copy the bank’s, in dollars', () => {
    world.profile = revolut
    world.base = { ...exampleSnapshot, entries: [...exampleSnapshot.entries, amountEntry('rev-cash', 200), unitsEntry('rev-apple', 4, 250, 200)] }
    world.failed = ['rev-apple']
    world.current = 'revolut'
    publish()
    render(<BankPage />)
    expect(within(region('Apple')).getByLabelText('Combien vaut une part aujourd’hui ?')).toHaveAccessibleDescription(
      'Le prix du jour n’a pas pu être récupéré\u00A0: recopie celui que montre ta banque, en dollars américains.',
    )
  })

  test('Apple at today’s price: the currency, then that it is the day’s', () => {
    world.profile = revolut
    world.base = { ...exampleSnapshot, entries: [...exampleSnapshot.entries, amountEntry('rev-cash', 200), unitsEntry('rev-apple', 4, 250, 200)] }
    world.prices = { 'rev-apple': 260 }
    world.current = 'revolut'
    publish()
    render(<BankPage />)
    expect(within(region('Apple')).getByLabelText('Combien vaut une part aujourd’hui ?')).toHaveAccessibleDescription(
      'en dollars américains · prix du jour, retrouvé tout seul',
    )
  })

  test('a line in dollars next to one in euros: no total, since no bank shows one', () => {
    world.profile = {
      ...revolut,
      lines: revolut.lines.map((l) => (l.id === 'rev-apple' ? { ...l, currency: 'EUR' as const } : l)),
    }
    world.base = { ...exampleSnapshot, entries: [...exampleSnapshot.entries, amountEntry('rev-cash', 200), unitsEntry('rev-apple', 4, 250, 200)] }
    world.current = 'revolut'
    publish()
    render(<BankPage />)
    expect(screen.queryByText(/^Total du compte/)).not.toBeInTheDocument()
  })

  test('an added account in dollars: its value in dollars, never 0 and never an error', () => {
    const added = addAccount(exampleProfile, startDraft('s1'), {
      establishmentId: 'boursobank',
      type: 'current',
      name: 'Compte US',
      arrival: 'opened',
    })
    world.draft = putAddedLine(
      exampleProfile,
      added.draft,
      { accountId: added.accountId, name: 'Compte US', entry: { kind: 'amount', amount: 20_000 }, currency: 'USD' },
      '2026-11-07',
    ).draft
    publish()
    render(<BankPage />)
    expect(screen.getByRole('button', { name: /^Compte US · 200\s\$US · nouveau$/ })).toBeInTheDocument()
  })
})
