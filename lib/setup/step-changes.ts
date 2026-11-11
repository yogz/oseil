// Changes the « one bank at a time » step makes in one go, composed from the
// first-launch functions so that each is a single save. No React here.

import { parseDecimal, parseEuros } from '@/lib/parse'
import { entryValue, MissingRateError } from '@/lib/model/situation'
import { setResidence } from '@/lib/correct/profile-changes'
import type { AccountTypeId, Cents, CategoryId, CurrencyCode, IsoDate, Line, Residence } from '@/lib/model/types'
import { addAccount, putLine, removeLine, type EntryInput, type SetupDraft } from './first-launch'

// A home's type, as the fiche writes it: a main residence is no mark at all. undefined: nothing to write.
const withResidence = (draft: SetupDraft, accountId: string, residence: Residence | undefined): SetupDraft =>
  residence === undefined ? draft : { ...draft, profile: setResidence(draft.profile, accountId, residence) }

type LineInput = {
  name: string
  category?: CategoryId
  entry: EntryInput
  currency?: CurrencyCode
  quoteSymbol?: string | null
}

const lineExtras = ({ currency, quoteSymbol }: LineInput) => ({
  ...(currency !== undefined ? { currency } : {}),
  ...(quoteSymbol !== undefined ? { quoteSymbol } : {}),
})

export function addSingleLineAccount(
  draft: SetupDraft,
  input: LineInput & { establishmentId: string; type: AccountTypeId; financedLineId?: string; residence?: Residence },
  today: IsoDate,
): SetupDraft {
  const { establishmentId, type, name, financedLineId, category, entry, residence } = input
  const added = addAccount(draft, { establishmentId, type, name, ...(financedLineId !== undefined ? { financedLineId } : {}) })
  return putLine(
    withResidence(added.draft, added.accountId, residence),
    { accountId: added.accountId, name, entry, ...lineExtras(input), ...(category !== undefined ? { category } : {}) },
    today,
  ).draft
}

// `financedLineId: null` unlinks a loan; undefined leaves it as it is. `residence`, a home only:
// undefined leaves its type as it is.
export function editSingleLineAccount(
  draft: SetupDraft,
  input: LineInput & { accountId: string; financedLineId?: string | null; residence?: Residence },
  today: IsoDate,
): SetupDraft {
  const { accountId, name, financedLineId, category, entry, residence } = input
  const line = draft.profile.lines.find((l) => l.accountId === accountId)
  if (!line) throw new Error(`Account without a line: ${accountId}`)
  const put = putLine(draft, { accountId, lineId: line.id, name, entry, ...lineExtras(input), ...(category !== undefined ? { category } : {}) }, today).draft
  const accounts = put.profile.accounts.map((a) => {
    if (a.id !== accountId) return a
    const { financedLineId: previous, ...rest } = a
    const kept = financedLineId === undefined ? previous : (financedLineId ?? undefined)
    return { ...rest, name, ...(kept !== undefined ? { financedLineId: kept } : {}) }
  })
  return withResidence({ ...put, profile: { ...put.profile, accounts } }, accountId, residence)
}

export function removeAccount(draft: SetupDraft, accountId: string): SetupDraft {
  let next = draft
  for (const line of draft.profile.lines.filter((l) => l.accountId === accountId)) next = removeLine(next, line.id)
  const accounts = next.profile.accounts.filter((a) => a.id !== accountId)
  const { [accountId]: _contribution, ...contributions } = next.snapshot.contributions
  void _contribution
  return { profile: { ...next.profile, accounts }, snapshot: { ...next.snapshot, contributions } }
}

// Same rounding as the model: its own entryValue does the work.
export function unitsValue(units: number, unitPrice: number): Cents {
  const line: Line = { id: '', accountId: '', name: '', kind: 'units', currency: 'EUR' }
  return entryValue({ lineId: '', kind: 'units', units, unitPrice, averagePrice: null, seenOn: '' }, line, {})
}

// null: no value entered yet, which is not the same as 0. 'no-rate': a value, but no rate to read it.
export type LineAmount = Cents | null | 'no-rate'

export function lineValue(draft: SetupDraft, lineId: string): LineAmount {
  const entry = draft.snapshot.entries.find((e) => e.lineId === lineId)
  const line = draft.profile.lines.find((l) => l.id === lineId)
  if (!entry || !line) return null
  try {
    return entryValue(entry, line, draft.snapshot.fx)
  } catch (error) {
    if (error instanceof MissingRateError) return 'no-rate'
    throw error
  }
}

// null when no line of the account has a value; 'no-rate' as soon as one line has no rate.
export function accountTotal(draft: SetupDraft, accountId: string): LineAmount {
  const values = draft.profile.lines
    .filter((l) => l.accountId === accountId)
    .map((l) => lineValue(draft, l.id))
    .filter((v): v is Cents | 'no-rate' => v !== null)
  if (values.includes('no-rate')) return 'no-rate'
  return values.length === 0 ? null : (values as Cents[]).reduce((sum, v) => sum + v, 0)
}

// Like removeLine, but a multi-line account stays even when it holds nothing any more.
export function removeLineKeepingAccount(draft: SetupDraft, lineId: string): SetupDraft {
  const line = draft.profile.lines.find((l) => l.id === lineId)
  if (!line) return draft
  const account = draft.profile.accounts.find((a) => a.id === line.accountId)
  const next = removeLine(draft, lineId)
  if (!account || next.profile.accounts.some((a) => a.id === account.id)) return next
  const accounts = [...next.profile.accounts]
  accounts.splice(draft.profile.accounts.findIndex((a) => a.id === account.id), 0, account)
  return { ...next, profile: { ...next.profile, accounts } }
}

// Thousands are grouped with a narrow no-break space, as everywhere on screen (« 23 500 »):
// parseEuros and parseDecimal read it back, since both drop every kind of space.
const NARROW_NBSP = '\u202F'
const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, NARROW_NBSP)

// What a box of euros shows once it is left, or reopened: « 23 500 » or « 1 200,50 ».
export function euroText(cents: Cents): string {
  const sign = cents < 0 ? '-' : ''
  const whole = Math.trunc(Math.abs(cents) / 100)
  const fraction = Math.abs(cents) % 100
  return `${sign}${group(String(whole))}${fraction === 0 ? '' : `,${String(fraction).padStart(2, '0')}`}`
}

// Never an exponent (« 5e-7 »): the text must read back through parseDecimal.
function plainDecimal(value: number): string {
  const plain = String(value)
  return /e/i.test(plain) ? value.toFixed(20).replace(/0+$/, '').replace(/\.$/, '') : plain
}

// A count (parts, units): its own decimals, thousands grouped.
export function decimalText(value: number): string {
  const [whole, fraction] = plainDecimal(value).split('.')
  return `${group(whole)}${fraction === undefined ? '' : `,${fraction}`}`
}

// The price of one part: always two decimals at least (« 692,30 »), more when it has more.
export function priceText(value: number): string {
  const [whole, fraction = ''] = plainDecimal(value).split('.')
  return `${group(whole)},${fraction.padEnd(2, '0')}`
}

// A box of figures put back in the French way when it is left. Text that does not read is left
// as typed: the box says what is wrong with it, it never rewrites it.
export function tidyEuros(text: string): string {
  const cents = parseEuros(text)
  return cents === null ? text : euroText(cents)
}

export function tidyCount(text: string): string {
  const value = parseDecimal(text)
  return value === null ? text : decimalText(value)
}

export function tidyPrice(text: string): string {
  const value = parseDecimal(text)
  return value === null ? text : priceText(value)
}
