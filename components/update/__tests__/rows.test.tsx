// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { PRICE_FAILED, PRICE_OF_THE_DAY } from '@/lib/market/words'
import { account, amountEntry, line, unitsEntry } from '@/lib/model/__tests__/fixtures'
import type { Account, Line, SnapshotEntry } from '@/lib/model/types'
import type { EntryInput } from '@/lib/setup/first-launch'
import { AmountRow } from '../AmountRow'
import { ContributionField } from '../ContributionField'
import { HomeRow } from '../HomeRow'
import { UnitsRow } from '../UnitsRow'
import { plain } from '@/lib/__tests__/plain'

// The day the rows are shown on: an estimate from another year says its year.
const dates = vi.hoisted(() => ({ today: '2026-11-07' }))
vi.mock('@/lib/dates', () => ({ todayIso: () => dates.today }))

afterEach(() => {
  cleanup()
  dates.today = '2026-11-07'
})

type Props = {
  line: Line
  account: Account
  entry: SnapshotEntry | null
  before: SnapshotEntry | null
  confirmed: boolean
  onValue: (entry: EntryInput) => void
  onConfirm: () => void
  priceHint?: string
}

function props(over: Partial<Props> & Pick<Props, 'line' | 'account'>): Props {
  return { entry: null, before: null, confirmed: false, onValue: vi.fn(), onConfirm: vi.fn(), ...over }
}

const livretAccount = account('livret-a', 'livret-a', { name: 'Livret A' })
const livretLine = line('livret-a-line', 'livret-a', { name: 'Livret A' })
const livretBefore = amountEntry('livret-a-line', 10_000)

test('typing an amount then leaving the box commits it, and the row then shows the old value', async () => {
  const user = userEvent.setup()
  const onValue = vi.fn()
  const base = props({ line: livretLine, account: livretAccount, entry: livretBefore, before: livretBefore, onValue })
  const { rerender } = render(<AmountRow {...base} />)
  const box = screen.getByRole('textbox')
  await user.clear(box)
  await user.type(box, '11000')
  await user.tab()
  expect(onValue).toHaveBeenCalledWith({ kind: 'amount', amount: 1_100_000 })
  rerender(<AmountRow {...base} entry={amountEntry('livret-a-line', 11_000)} />)
  expect(screen.getByText('avant : 10 000 €')).toBeTruthy()
})

test('a box left with a number puts it back in the French way: « 11000 » reads « 11 000 »', async () => {
  const user = userEvent.setup()
  render(<AmountRow {...props({ line: livretLine, account: livretAccount, entry: livretBefore, before: livretBefore })} />)
  const box = screen.getByRole('textbox')
  await user.clear(box)
  await user.type(box, '11000')
  expect((box as HTMLInputElement).value).toBe('11000')
  await user.tab()
  expect((box as HTMLInputElement).value).toBe('11\u202f000')
})

test('a box left with something that does not read keeps it as typed, and says so', async () => {
  const user = userEvent.setup()
  render(<AmountRow {...props({ line: livretLine, account: livretAccount, entry: livretBefore, before: livretBefore })} />)
  const box = screen.getByRole('textbox')
  await user.clear(box)
  await user.type(box, '12,345')
  await user.tab()
  expect((box as HTMLInputElement).value).toBe('12,345')
  expect(screen.getByText('Ce montant n’est pas lisible.')).toBeTruthy()
})

test('the price of a part left in its box always has two decimals', async () => {
  const user = userEvent.setup()
  render(<UnitsRow {...props({ line: etfLine, account: peaAccount, entry: etfBefore, before: etfBefore })} />)
  const box = screen.getByLabelText('Combien vaut une part aujourd’hui ?')
  await user.clear(box)
  await user.type(box, '692,3')
  await user.tab()
  expect((box as HTMLInputElement).value).toBe('692,30')
})

test('a contribution since an abbreviated date does not end on two points', () => {
  render(
    <ContributionField account={account('livret-a', 'livret-a', { name: 'Livret A' })} since="2026-09-30" cents={0} onValue={vi.fn()} />,
  )
  expect(document.body.textContent).toContain('Depuis le 30 sept. Pas sûr')
  expect(document.body.textContent).not.toContain('..')
})

test('« Inchangé » says « Remettre … » once a different value is held: a button says what it does', () => {
  const base = props({ line: livretLine, account: livretAccount, entry: livretBefore, before: livretBefore })
  const { rerender } = render(<AmountRow {...base} />)
  expect(screen.getByRole('button', { name: 'Inchangé' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /^Remettre/ })).toBeNull()
  rerender(<AmountRow {...base} entry={amountEntry('livret-a-line', 11_000)} />)
  expect(screen.queryByRole('button', { name: 'Inchangé' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Remettre 10\u202f000\u00A0€' })).toBeTruthy()
})

test('the same for parts: it says what it puts back', () => {
  const base = props({ line: etfLine, account: peaAccount, entry: etfBefore, before: etfBefore })
  const { rerender } = render(<UnitsRow {...base} />)
  expect(screen.getByRole('button', { name: 'Inchangé' })).toBeTruthy()
  rerender(<UnitsRow {...base} entry={unitsEntry('etf', 100, 260, 200)} />)
  expect(screen.getByRole('button', { name: 'Remettre 100 parts à 250,00\u00A0€' })).toBeTruthy()
})

test('a box left untouched commits nothing', async () => {
  const user = userEvent.setup()
  const onValue = vi.fn()
  render(<AmountRow {...props({ line: livretLine, account: livretAccount, entry: livretBefore, before: livretBefore, onValue })} />)
  await user.click(screen.getByRole('textbox'))
  await user.tab()
  expect(onValue).not.toHaveBeenCalled()
})

test('hiding the page commits a typed value once, without any blur', async () => {
  const user = userEvent.setup()
  const onValue = vi.fn()
  render(<AmountRow {...props({ line: livretLine, account: livretAccount, entry: livretBefore, before: livretBefore, onValue })} />)
  const box = screen.getByRole('textbox')
  await user.clear(box)
  await user.type(box, '11000')
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  expect(onValue).toHaveBeenCalledTimes(1)
  expect(onValue).toHaveBeenCalledWith({ kind: 'amount', amount: 1_100_000 })
})

test('a box emptied then left says it is unreadable and commits nothing', async () => {
  const user = userEvent.setup()
  const onValue = vi.fn()
  render(<AmountRow {...props({ line: livretLine, account: livretAccount, entry: livretBefore, before: livretBefore, onValue })} />)
  await user.clear(screen.getByRole('textbox'))
  await user.tab()
  expect(screen.getByText('Ce montant n’est pas lisible.')).toBeTruthy()
  expect(onValue).not.toHaveBeenCalled()
})

test('a loan cannot be negative', async () => {
  const user = userEvent.setup()
  const onValue = vi.fn()
  const loanAccount = account('mortgage', 'loan', { name: 'Crédit' })
  const loanLine = line('mortgage-line', 'mortgage', { name: 'Crédit' })
  const before = amountEntry('mortgage-line', 180_000)
  render(<AmountRow {...props({ line: loanLine, account: loanAccount, entry: before, before, onValue })} />)
  // A9: the box asks the question; no label above it says it again.
  expect(screen.queryByText('reste à rembourser')).toBeNull()
  expect(screen.getByLabelText('Combien reste-t-il à rembourser ?')).toBeTruthy()
  expect(screen.getByText('Tu le trouves dans l’application de ta banque ou sur ton tableau d’amortissement.')).toBeTruthy()
  const box = screen.getByRole('textbox')
  await user.clear(box)
  await user.type(box, '-5')
  await user.tab()
  expect(screen.getByText('Ce montant ne peut pas être négatif.')).toBeTruthy()
  expect(onValue).not.toHaveBeenCalled()
})

test('« Inchangé » confirms, and is pressed once confirmed', async () => {
  const user = userEvent.setup()
  const onConfirm = vi.fn()
  const base = props({ line: livretLine, account: livretAccount, entry: livretBefore, before: livretBefore, onConfirm })
  const { rerender } = render(<AmountRow {...base} />)
  const button = screen.getByRole('button', { name: 'Inchangé' })
  expect(button.getAttribute('aria-pressed')).toBe('false')
  await user.click(button)
  expect(onConfirm).toHaveBeenCalled()
  rerender(<AmountRow {...base} confirmed />)
  expect(screen.getByRole('button', { name: 'Inchangé' }).getAttribute('aria-pressed')).toBe('true')
})

test('the row is a region named after its line, and shows a different account name', () => {
  render(
    <AmountRow
      {...props({
        line: line('l', 'a', { name: 'Fonds euros' }),
        account: account('a', 'life-insurance', { name: 'Assurance-vie' }),
        entry: livretBefore,
        before: livretBefore,
      })}
    />,
  )
  expect(screen.getByRole('region', { name: 'Fonds euros' })).toBeTruthy()
  expect(screen.getByText('Assurance-vie')).toBeTruthy()
})

const peaAccount = account('pea', 'pea', { name: 'PEA' })
const etfLine = line('etf', 'pea', { name: 'Fonds monde', kind: 'units' })
const etfBefore = unitsEntry('etf', 100, 250, 200)

function sees(text: string) {
  const norm = (s: string) => s.replace(/[  ]/g, ' ')
  return screen.getByText((content) => norm(content) === norm(text))
}

test('a units row shows only the price by default, and the value', async () => {
  const user = userEvent.setup()
  const onValue = vi.fn()
  render(<UnitsRow {...props({ line: etfLine, account: peaAccount, entry: etfBefore, before: etfBefore, onValue })} />)
  expect(screen.getAllByRole('textbox')).toHaveLength(1)
  sees('100 parts = 25 000 €')
  const box = screen.getByLabelText('Combien vaut une part aujourd’hui ?')
  await user.clear(box)
  await user.type(box, '260')
  await user.tab()
  expect(onValue).toHaveBeenCalledWith({ kind: 'units', units: 100, unitPrice: 260, averagePrice: 200 })
})

test('typing over the price recalls « avant », the two other boxes closed, as an amount does (F8)', async () => {
  const user = userEvent.setup()
  render(<UnitsRow {...props({ line: etfLine, account: peaAccount, entry: etfBefore, before: etfBefore })} />)
  expect(screen.queryByText(/^avant :/)).toBeNull()
  const box = screen.getByLabelText('Combien vaut une part aujourd’hui ?')
  await user.clear(box)
  await user.type(box, '260')
  // Lit while typed, before the box is even left.
  sees('avant : 250,00 €')
  expect(screen.getByRole('button', { name: 'Les parts ou le prix moyen ont changé\u00A0?' })).toBeTruthy()
  // Back to the old price: nothing to recall.
  await user.clear(box)
  await user.type(box, '250')
  expect(screen.queryByText(/^avant :/)).toBeNull()
})

test('a price recalled after it was committed: the row shows the old one under the new', () => {
  const now = unitsEntry('etf', 100, 260, 200, '2026-11-07')
  render(<UnitsRow {...props({ line: etfLine, account: peaAccount, entry: now, before: etfBefore })} />)
  sees('avant : 250,00 €')
})

test('the link opens parts and average price, pre-filled', async () => {
  const user = userEvent.setup()
  const onValue = vi.fn()
  render(<UnitsRow {...props({ line: etfLine, account: peaAccount, entry: etfBefore, before: etfBefore, onValue })} />)
  await user.click(screen.getByRole('button', { name: 'Les parts ou le prix moyen ont changé\u00A0?' }))
  expect((screen.getByLabelText('Combien de parts as-tu ?') as HTMLInputElement).value).toBe('100')
  expect((screen.getByLabelText('À quel prix les as-tu achetées, en moyenne ?') as HTMLInputElement).value).toBe('200,00')
  sees('Recopie ce que montre ta banque. Avant : 100 parts à 200,00 €.')
  const parts = screen.getByLabelText('Combien de parts as-tu ?')
  await user.clear(parts)
  await user.type(parts, '120')
  const price = screen.getByLabelText('Combien vaut une part aujourd’hui ?')
  await user.clear(price)
  await user.type(price, '260')
  await user.tab()
  expect(onValue).toHaveBeenLastCalledWith({ kind: 'units', units: 120, unitPrice: 260, averagePrice: 200 })
})

test('gold speaks of units, and an unknown average price is said', async () => {
  const user = userEvent.setup()
  const goldAccount = account('gold', 'gold', { name: 'Or' })
  const goldLine = line('gl', 'gold', { name: 'Or', kind: 'units' })
  const before = unitsEntry('gl', 2, 100, null)
  render(<UnitsRow {...props({ line: goldLine, account: goldAccount, entry: before, before })} />)
  expect(screen.getByLabelText('Combien vaut une unité aujourd’hui ?')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Les parts ou le prix moyen ont changé\u00A0?' }))
  sees('Recopie ce que montre ta banque. Avant : 2 unités à prix moyen inconnu.')
})

const houseAccount = account('house', 'home', { name: 'Maison' })
const houseLine = line('house-line', 'house', { name: 'Maison' })
const houseBefore = amountEntry('house-line', 300_000)

test('a home shows its estimate date, confirms, and opens its box on « Changer »', async () => {
  const user = userEvent.setup()
  const onConfirm = vi.fn()
  const onValue = vi.fn()
  render(<HomeRow {...props({ line: houseLine, account: houseAccount, entry: houseBefore, before: houseBefore, onConfirm, onValue })} />)
  expect(screen.getByText('Dernière estimation le 30 septembre')).toBeTruthy()
  sees('Estimée à 300 000 €. Elle n’a pas besoin d’être réestimée à chaque fois : une fois par an suffit.')
  expect(screen.queryByRole('textbox')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'C’est toujours ça' }))
  expect(onConfirm).toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Changer' }))
  const box = screen.getByRole('textbox')
  await user.clear(box)
  await user.type(box, '300000')
  await user.tab()
  // the same value, still recorded: the estimate date moves
  expect(onValue).toHaveBeenCalledWith({ kind: 'amount', amount: 30_000_000 })
})

test('a contribution takes a minus sign for money taken out', async () => {
  const user = userEvent.setup()
  const onValue = vi.fn()
  render(<ContributionField account={account('life', 'life-insurance')} since="2026-09-30" cents={0} onValue={onValue} />)
  const box = screen.getByLabelText('Combien a été versé dessus ?') as HTMLInputElement
  expect(box.value).toBe('0')
  await user.clear(box)
  await user.type(box, '-2000')
  await user.tab()
  expect(onValue).toHaveBeenCalledWith(-200_000)
})

test('the contribution hint changes for employee savings', () => {
  render(<ContributionField account={account('es', 'employee-savings')} since="2026-09-30" cents={0} onValue={vi.fn()} />)
  sees('Depuis le 30 sept., ton employeur compris. Pas sûr ? Laisse 0 : on comptera tout comme des intérêts, et l’écran le dira. Tu en as retiré ? Écris-le avec un moins devant.')
})

test('an unreadable contribution is refused', async () => {
  const user = userEvent.setup()
  const onValue = vi.fn()
  render(<ContributionField account={account('life', 'life-insurance')} since="2026-09-30" cents={0} onValue={onValue} />)
  const box = screen.getByRole('textbox')
  await user.clear(box)
  fireEvent.blur(box)
  expect(screen.getByText('Ce montant n’est pas lisible.')).toBeTruthy()
  expect(onValue).not.toHaveBeenCalled()
})

// A line with no value yet (no base entry, nothing typed): its boxes are there, empty, to be filled.

test('an amount line with no value: an empty box that says « montant à saisir », and nothing to confirm', async () => {
  const user = userEvent.setup()
  const onValue = vi.fn()
  render(<AmountRow {...props({ line: livretLine, account: livretAccount, onValue })} />)
  const box = screen.getByRole('textbox') as HTMLInputElement
  expect(box.value).toBe('')
  expect(screen.getByText('montant à saisir')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Inchangé' })).toBeNull()
  await user.type(box, '500')
  await user.tab()
  expect(onValue).toHaveBeenCalledWith({ kind: 'amount', amount: 50_000 })
})

test('a units line with no value opens its boxes, empty, and commits once parts and price are there', async () => {
  const user = userEvent.setup()
  const onValue = vi.fn()
  render(<UnitsRow {...props({ line: etfLine, account: peaAccount, onValue })} />)
  const boxes = screen.getAllByRole('textbox') as HTMLInputElement[]
  expect(boxes).toHaveLength(3)
  expect(boxes.map((b) => b.value)).toEqual(['', '', ''])
  expect(screen.getByText('montant à saisir')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Les parts ou le prix moyen ont changé\u00A0?' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Inchangé' })).toBeNull()
  // The price first: the parts are still to come, so nothing is refused yet.
  await user.type(screen.getByLabelText('Combien vaut une part aujourd’hui ?'), '50')
  await user.tab()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(onValue).not.toHaveBeenCalled()
  await user.type(screen.getByLabelText('Combien de parts as-tu ?'), '10')
  await user.tab()
  expect(onValue).toHaveBeenCalledWith({ kind: 'units', units: 10, unitPrice: 50, averagePrice: null })
})

// Keyed on the base: once a value is typed on such a line, « Inchangé » would drop it.
test('a line with no base value, once filled: still nothing to confirm', () => {
  const amount = props({ line: livretLine, account: livretAccount })
  const { rerender } = render(<AmountRow {...amount} />)
  rerender(<AmountRow {...amount} entry={amountEntry('livret-a-line', 500)} />)
  expect(screen.queryByRole('button', { name: 'Inchangé' })).toBeNull()
  cleanup()

  const units = props({ line: etfLine, account: peaAccount })
  const { rerender: again } = render(<UnitsRow {...units} />)
  again(<UnitsRow {...units} entry={unitsEntry('etf', 10, 50, null)} />)
  expect(screen.queryByRole('button', { name: 'Inchangé' })).toBeNull()
  cleanup()

  const home = props({ line: houseLine, account: houseAccount })
  const { rerender: last } = render(<HomeRow {...home} />)
  last(<HomeRow {...home} entry={amountEntry('house-line', 250_000)} />)
  expect(screen.queryByRole('button', { name: 'C’est toujours ça' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Changer' })).toBeNull()
  expect(screen.getByRole('textbox')).toBeTruthy()
})

test('a home estimated in another year says its year (F5)', () => {
  dates.today = '2027-01-15'
  render(<HomeRow {...props({ line: houseLine, account: houseAccount, entry: houseBefore, before: houseBefore })} />)
  expect(screen.getByText('Dernière estimation le 30 septembre 2026')).toBeTruthy()
})

test('a home with no value: its box at once, and neither « C’est toujours ça » nor « Changer »', async () => {
  const user = userEvent.setup()
  const onValue = vi.fn()
  render(<HomeRow {...props({ line: houseLine, account: houseAccount, onValue })} />)
  const box = screen.getByRole('textbox') as HTMLInputElement
  expect(box.value).toBe('')
  expect(screen.getByText('montant à saisir')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'C’est toujours ça' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Changer' })).toBeNull()
  await user.type(box, '250000')
  await user.tab()
  expect(onValue).toHaveBeenCalledWith({ kind: 'amount', amount: 25_000_000 })
})

// Decision 7: a line attached to its price opens at today's price, and recalls the last one.
const quotedEtf = line('etf', 'pea', { name: 'Fonds monde', kind: 'units', quoteSymbol: 'CW8.PA' })
// The wrapper TextField sits in: lit when the box no longer holds the base value.
const lit = (box: HTMLElement) => box.parentElement?.parentElement?.className.includes('[&_input]:border-ink') === true

test('today’s price in the box: 260, lit, « avant : 250,00 € », and said to be the day’s; left as it is, nothing is committed', async () => {
  const user = userEvent.setup()
  const onValue = vi.fn()
  const today = unitsEntry('etf', 100, 260, 200)
  render(
    <UnitsRow
      {...props({ line: quotedEtf, account: peaAccount, entry: today, before: etfBefore, onValue, priceHint: PRICE_OF_THE_DAY })}
    />,
  )
  const box = screen.getByLabelText('Combien vaut une part aujourd’hui ?') as HTMLInputElement
  expect(box.value).toBe('260,00')
  expect(lit(box)).toBe(true)
  sees('avant : 250,00 €')
  expect(screen.getByText(PRICE_OF_THE_DAY)).toBeTruthy()
  sees('100 parts = 26 000 €')
  await user.click(box)
  await user.tab()
  expect(onValue).not.toHaveBeenCalled()
})

test('a price that could not be fetched: the box keeps the last one, and says to copy the bank’s', () => {
  render(
    <UnitsRow {...props({ line: quotedEtf, account: peaAccount, entry: etfBefore, before: etfBefore, priceHint: PRICE_FAILED })} />,
  )
  const box = screen.getByLabelText('Combien vaut une part aujourd’hui ?') as HTMLInputElement
  expect(box.value).toBe('250,00')
  expect(lit(box)).toBe(false)
  expect(screen.getByText(plain(PRICE_FAILED))).toBeTruthy()
})

// Decision 8: a line is entered as its bank shows it, in its own currency.
const revolutAccount = account('revolut', 'current', { name: 'Revolut' })
const dollarsLine = line('cash', 'revolut', { name: 'Dollars', currency: 'USD' })
const dollarsBefore = amountEntry('cash', 1_200)

test('an amount line in dollars: its box says so, and « avant » is written in dollars', async () => {
  const user = userEvent.setup()
  const onValue = vi.fn()
  const base = props({ line: dollarsLine, account: revolutAccount, entry: dollarsBefore, before: dollarsBefore, onValue })
  const { rerender } = render(<AmountRow {...base} />)
  expect(screen.getByText('en dollars américains')).toBeTruthy()
  const box = screen.getByRole('textbox')
  await user.clear(box)
  await user.type(box, '1300')
  await user.tab()
  expect(onValue).toHaveBeenCalledWith({ kind: 'amount', amount: 130_000 })
  rerender(<AmountRow {...base} entry={amountEntry('cash', 1_300)} />)
  expect(screen.getByText(/^avant : 1\s200\s\$US$/)).toBeTruthy()
})

test('an amount line in dollars with no value: both said under its box', () => {
  render(<AmountRow {...props({ line: dollarsLine, account: revolutAccount })} />)
  expect(screen.getByText('montant à saisir · en dollars américains')).toBeTruthy()
})

test('a euro line says nothing of its currency', () => {
  render(<AmountRow {...props({ line: livretLine, account: livretAccount, entry: livretBefore, before: livretBefore })} />)
  expect(screen.queryByText(/^en /)).toBeNull()
})

test('a units line in dollars: its prices and its value in dollars, and its price boxes say so', async () => {
  const user = userEvent.setup()
  const usLine = line('us', 'pea', { name: 'Fonds US', kind: 'units', currency: 'USD' })
  const before = unitsEntry('us', 10, 50, 40)
  render(<UnitsRow {...props({ line: usLine, account: peaAccount, entry: before, before })} />)
  expect(screen.getByText('en dollars américains')).toBeTruthy()
  sees('10 parts = 500 $US')
  const box = screen.getByLabelText('Combien vaut une part aujourd’hui ?')
  await user.clear(box)
  await user.type(box, '55')
  sees('avant : 50,00 $US')
  sees('10 parts = 550 $US')
  await user.click(screen.getByRole('button', { name: 'Les parts ou le prix moyen ont changé\u00A0?' }))
  sees('Recopie ce que montre ta banque. Avant : 10 parts à 40,00 $US.')
  // The price of one part and the average price are in dollars; the number of parts is not.
  expect(screen.getAllByText('en dollars américains')).toHaveLength(2)
})

// The screen words the hint with the currency (todaysPriceHint, failedPriceHint): the row shows it as given.
test('a units line in dollars with a price hint: the hint alone, which says the currency itself', () => {
  const usLine = line('us', 'pea', { name: 'Fonds US', kind: 'units', currency: 'USD', quoteSymbol: 'VOO' })
  const hint = 'Le prix du jour n’a pas pu être récupéré : recopie celui que montre ta banque, en dollars américains.'
  render(
    <UnitsRow
      {...props({ line: usLine, account: peaAccount, entry: unitsEntry('us', 10, 50, 40), before: unitsEntry('us', 10, 50, 40), priceHint: hint })}
    />,
  )
  sees(hint)
  expect(screen.queryByText('en dollars américains')).toBeNull()
})

test('a home in Swiss francs: its estimate in francs, and its box says so', async () => {
  const user = userEvent.setup()
  const chalet = line('chalet', 'house', { name: 'Chalet', currency: 'CHF' })
  const before = amountEntry('chalet', 400_000)
  render(<HomeRow {...props({ line: chalet, account: houseAccount, entry: before, before })} />)
  sees('Estimée à 400 000 CHF. Elle n’a pas besoin d’être réestimée à chaque fois : une fois par an suffit.')
  await user.click(screen.getByRole('button', { name: 'Changer' }))
  expect(screen.getByText('en francs suisses')).toBeTruthy()
})
