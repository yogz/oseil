import type { Cents, CurrencyCode, IsoDate } from '@/lib/model/types'

// One formatter per currency, made the first time it is needed.
const moneyFormats = new Map<CurrencyCode, Intl.NumberFormat>()
const priceFormats = new Map<CurrencyCode, Intl.NumberFormat>()

function formatterFor(
  formats: Map<CurrencyCode, Intl.NumberFormat>,
  currency: CurrencyCode,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  let format = formats.get(currency)
  if (!format) {
    format = new Intl.NumberFormat('fr-FR', { style: 'currency', currency, ...options })
    formats.set(currency, format)
  }
  return format
}

const units = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 8 })
const percent1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

// Same narrow no-break space as shareLabel in lib/model/squares.ts.
const NARROW_NBSP = ' '

// Dates are written from their calendar parts, never through a Date in the
// device's time zone, so a day never shifts.
function utcDate(date: IsoDate): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const dayMonthYear = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const shortDayMonth = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const shortMonthYear = new Intl.DateTimeFormat('fr-FR', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

// « janv. 2024 »: the month of a snapshot, under the curve of Évolution.
export function formatShortMonthYear(date: IsoDate): string {
  return shortMonthYear.format(utcDate(date))
}

// « 440 k€ », « 1,2 M€ »: a value of the right axis of the curve, short enough for its room.
export function formatEurosCompact(cents: number): string {
  const euros = Math.round(cents / 100)
  if (Math.abs(euros) >= 1_000_000) {
    return withMinus(`${(euros / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}\u00A0M€`)
  }
  return withMinus(`${Math.round(euros / 1_000).toLocaleString('fr-FR')}\u00A0k€`)
}

const monthYear = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

// French typography writes a loss with the minus sign (−), not the hyphen Intl gives (-): « −1 000 € »
// (the review of the figures, 11 November 2026). Only what is shown: a field never reads one back.
function withMinus(text: string): string {
  return text.replace(/^-/, '\u2212')
}

// Intl writes "-0" for -0 and for tiny negatives rounded to zero; a zero has no sign.
function withoutNegativeZero(text: string): string {
  return /^[-\u2212]0(,0)?$/.test(text) ? text.slice(1) : text
}

// « Masquer les montants »: read-only screens ask for it by name (formatEurosShown,
// formatMoneyShown); the plain formatters never mask, so an entry flow always shows its figures.
// The flag is set once the settings are read (see useModel), and set again on every render where
// useModel is ready: it is module state, it outlives the screen that set it. The example
// (lib/example/views.ts) sets it to false before formatting its invented person; any other screen
// that formats amounts without useModel must set it itself, or it shows the last account's choice.
export const HIDDEN_AMOUNT = '•••'
let amountsHidden = false
export function setAmountsHidden(hidden: boolean): void {
  amountsHidden = hidden
}

function formatWhole(cents: Cents, currency: CurrencyCode): string {
  // Symmetric rounding: -150 cents gives -2 €, like 150 gives 2 €. `|| 0` drops -0.
  const whole = Math.sign(cents) * Math.round(Math.abs(cents) / 100) || 0
  return withMinus(formatterFor(moneyFormats, currency, { maximumFractionDigits: 0 }).format(whole))
}

// Whole units, in hundredths of `currency` (« 1 200 $US »). Never masked.
export function formatMoney(cents: Cents, currency: CurrencyCode): string {
  return formatWhole(cents, currency)
}

export function formatEuros(cents: Cents): string {
  return formatWhole(cents, 'EUR')
}

// The same, for a read-only screen: « ••• » when the person asked to hide the amounts.
export function formatMoneyShown(cents: Cents, currency: CurrencyCode): string {
  return amountsHidden ? HIDDEN_AMOUNT : formatWhole(cents, currency)
}

export function formatEurosShown(cents: Cents): string {
  return formatMoneyShown(cents, 'EUR')
}

// The price of one part, with its cents (« 10,39 £GB »).
export function formatPrice(value: number, currency: CurrencyCode = 'EUR'): string {
  return formatterFor(priceFormats, currency, {}).format(value)
}

// The same, for a read-only screen: « ••• » when the amounts are hidden. A price is an amount too:
// with the number of parts beside it, it gives away what a line is worth.
export function formatPriceShown(value: number, currency: CurrencyCode = 'EUR'): string {
  return amountsHidden ? HIDDEN_AMOUNT : formatPrice(value, currency)
}

export function formatUnits(value: number): string {
  return withoutNegativeZero(units.format(value))
}

export function formatPercent1(value: number): string {
  return `${withMinus(withoutNegativeZero(percent1.format(value)))}${NARROW_NBSP}%`
}

// A whole percent, 0 included: a goal of 0 % is a goal, not « moins de 1 % ».
export function formatWholePercent(value: number): string {
  return `${value}${NARROW_NBSP}%`
}

// The first of a month is written « 1er » in French.
function withOrdinalFirst(text: string): string {
  return text.replace(/^1 /, '1er ')
}

export function formatDayMonth(date: IsoDate, today: IsoDate): string {
  const sameYear = date.slice(0, 4) === today.slice(0, 4)
  return withOrdinalFirst((sameYear ? dayMonth : dayMonthYear).format(utcDate(date)))
}

export function formatShortDayMonth(date: IsoDate): string {
  return withOrdinalFirst(shortDayMonth.format(utcDate(date)))
}

export function formatMonthYear(date: IsoDate): string {
  return monthYear.format(utcDate(date))
}
