// The result of the update, in figures and in words (planche 21): what is yours now,
// the change since the base snapshot, a square's new value, what moved by category,
// and how the change splits between your effort, the markets and the house
// re-estimated. The result screen is the only place where figures come from a draft.
// No React, no database here.

import { CATEGORIES, CATEGORY_ORDER } from '@/lib/catalog'
import { formatDayMonth, formatEuros } from '@/lib/format'
import type { LinePrices, UpdateMarket } from '@/lib/market/live'
import { missingRateSentence, rateNote } from '@/lib/market/words'
import { splitChange, wholeAccountChanges, type ChangeSplit } from '@/lib/model/change'
import {
  computeSituation,
  EntryKindError,
  MissingRateError,
  UncategorisedLineError,
  UnknownLineError,
  type Situation,
} from '@/lib/model/situation'
import { buildGrid, cellsOf, homeRange } from '@/lib/model/squares'
import type { CategoryId, Cents, IsoDate, Profile, Snapshot, UpdateDraft } from '@/lib/model/types'
import { noGridSentence } from '@/lib/screens/mon-argent'
import { behindEstablishments, notReviewedSentence, type Behind } from '@/lib/screens/seen'
import { buildUpdate, takenOnRange } from './build'

export type SplitPart = 'effort' | 'markets' | 'property'
export type SplitRow = { part: SplitPart | 'existing'; label: string; detail: string; amount: string; loss: boolean }
export type ResultView =
  | { kind: 'error' }
  // A currency of the new snapshot has no rate at all: nothing is computed, « Enregistrer » waits.
  | { kind: 'missing-rate'; sentence: string }
  | {
      kind: 'result'
      net: string
      since: string
      // C3: what a square is worth, what it was worth at the snapshot before (null: the same), and that day.
      square: { value: string; then: string | null; day: string } | null
      // C2: the colours of the hundred squares before and after, in the order of the grid.
      // `beforeHome`, `afterHome`: the squares of « Chez toi » in each grid, in their own green (null without a rental).
      replay: {
        before: CategoryId[]
        after: CategoryId[]
        beforeHome: { from: number; to: number } | null
        afterHome: { from: number; to: number } | null
        beforeDay: string
        afterDay: string
      } | null
      noGridSentence: string | null
      split: { bar: Array<{ part: SplitPart; share: number }> | null; rows: SplitRow[] }
      changes: Array<{ category: CategoryId; name: string; amount: string }>
      loans: string | null
      unchanged: string | null
      notReviewed: string | null
      notes: string[]
      // Open lines with no amount at all: Enregistrer waits for them (R20).
      missing: Array<{ id: string; name: string; establishment: string; establishmentId: string }>
      // Which rates converted the lines outside euros; null when there are none.
      rateNote: string | null
      date: { value: IsoDate; label: string; min: IsoDate; max: IsoDate }
    }

// Whole euros, rounded as formatEuros rounds them: what the screen shows decides
// whether a figure is zero or negative, so a « 0 € » is never red and never listed.
const wholeEuros = (cents: Cents): number => Math.sign(cents) * Math.round(Math.abs(cents) / 100) || 0

const moreOrLess = (cents: Cents): string =>
  `${formatEuros(Math.abs(cents))} ${cents > 0 ? 'de plus' : 'de moins'}`

// What each category holds before any loan is taken off.
function heldByCategory(situation: Situation): Map<CategoryId, Cents> {
  const held = new Map<CategoryId, Cents>()
  for (const h of situation.holdings) held.set(h.category, (held.get(h.category) ?? 0) + h.value)
  return held
}

// `market`: the prices and rates the update read when it opened, the same ones the save uses.
// Required: a result counted without it would show the base prices and say the ECB is silent.
export function resultView(
  profile: Profile,
  base: Snapshot,
  draft: UpdateDraft,
  today: IsoDate,
  market: UpdateMarket,
): ResultView {
  // The day chosen on the result screen, or else the latest one allowed: today, unless
  // the base was dated by a device whose clock is ahead (takenOnRange).
  const range = takenOnRange(base, today)
  const takenOn = draft.takenOn ?? range.max
  const date = { value: takenOn, label: `Relevé du ${formatDayMonth(takenOn, today)}`, ...range }
  try {
    const next = buildUpdate(profile, base, draft, takenOn, market)
    // The merged profile still holds every line of the base (a closed line stays), so both
    // snapshots are read with it. A base entry for a line it does not know throws (R1). The
    // base is read with its own rates: one it cannot be read with is an error, which no rate
    // of today would mend, so it is told before a rate missing for the new snapshot.
    const before = computeSituation(next.profile, base)
    // The new snapshot cannot be read without a rate for each of its currencies: nothing more
    // is computed from it (decision 11).
    if (next.rates.missing.length > 0) {
      return { kind: 'missing-rate', sentence: missingRateSentence(next.rates.missing) }
    }
    const baseDay = formatDayMonth(base.takenOn, today)
    return {
      kind: 'result',
      ...figuresAndWords(next, before, base, today, market.prices),
      rateNote: rateNote(next.rates, baseDay, today),
      date,
    }
  } catch (error) {
    // The errors of the model say the figures cannot be computed; anything else is a bug and goes up.
    if (
      error instanceof MissingRateError ||
      error instanceof UnknownLineError ||
      error instanceof UncategorisedLineError ||
      error instanceof EntryKindError
    ) {
      return { kind: 'error' }
    }
    throw error
  }
}

// Whether an establishment left behind holds a line that took today's price without being
// seen (its box left as it opened): its figures are then old, except that price.
function todaysPriceBehind(next: { profile: Profile; snapshot: Snapshot }, behind: Behind[], prices: LinePrices): boolean {
  const late = new Set(behind.map((b) => b.establishment.id))
  const lines = new Map(next.profile.lines.map((l) => [l.id, l]))
  const accounts = new Map(next.profile.accounts.map((a) => [a.id, a]))
  return next.snapshot.entries.some((entry) => {
    if (!Object.hasOwn(prices, entry.lineId) || entry.seenOn >= next.snapshot.takenOn) return false
    const account = accounts.get(lines.get(entry.lineId)?.accountId ?? '')
    return account !== undefined && late.has(account.establishmentId)
  })
}

// The rows and the bar of a split: shared by the result of the update and by « D'où ça vient »
// (Évolution), so both say the same thing in the same words. `repaid` is what was owed less,
// whole euros decide whether it is shown. `existingDetail` says when the accounts already held
// were added: this time for the update, along the way for Évolution.
export const EXISTING_ADDED_THIS_TIME = 'ajouté cette fois, il ne compte ni dans ton effort ni dans les marchés'

// `euros`: the result is a check inside the update, an entry flow, so its figures always show
// (formatEuros); Évolution is a read-only screen and passes formatEurosShown, which masks.
export function splitView(
  split: ChangeSplit,
  repaid: Cents,
  existingDetail: string,
  euros: (cents: Cents) => string = formatEuros,
): { bar: Array<{ part: SplitPart; share: number }> | null; rows: SplitRow[] } {
  const rows: SplitRow[] = [
    {
      part: 'effort',
      label: 'Ton effort',
      detail: wholeEuros(repaid) > 0 ? 'ce que tu as mis de côté, crédit remboursé compris' : 'ce que tu as mis de côté',
      amount: euros(split.effort),
      loss: false,
    },
    {
      part: 'markets',
      label: 'Les marchés et les intérêts',
      detail: 'ce que ton argent a rapporté tout seul',
      amount: euros(split.markets),
      // « Le crédit n’est jamais en rouge » : only a real loss of the markets is.
      loss: wholeEuros(split.markets) < 0,
    },
  ]
  if (wholeEuros(split.property) !== 0) {
    rows.push({
      part: 'property',
      // A home can be a rental (10 November 2026): « ta maison » would be wrong for it.
      label: 'Ton immobilier réestimé',
      detail: 'une estimation, pas une vente',
      amount: euros(split.property),
      loss: false,
    })
  }
  if (wholeEuros(split.existingAdded) !== 0) {
    rows.push({
      part: 'existing',
      label: 'Ce que tu avais déjà',
      detail: existingDetail,
      amount: euros(split.existingAdded),
      loss: false,
    })
  }

  // Drawn only when no part is negative (decision 10); a part of 0 has no piece.
  const parts = (['effort', 'markets', 'property'] as const).map((part) => ({ part, euros: wholeEuros(split[part]) }))
  const sum = parts.reduce((s, p) => s + p.euros, 0)
  const bar =
    parts.some((p) => p.euros < 0) || sum === 0
      ? null
      : parts.filter((p) => p.euros !== 0).map((p) => ({ part: p.part, share: p.euros / sum }))

  return { bar, rows }
}

function figuresAndWords(
  next: { profile: Profile; snapshot: Snapshot },
  before: Situation,
  base: Snapshot,
  today: IsoDate,
  prices: LinePrices,
): Omit<Extract<ResultView, { kind: 'result' }>, 'kind' | 'date' | 'rateNote'> {
  const after = computeSituation(next.profile, next.snapshot)
  const split = splitChange(next.profile, base, next.snapshot)
  const baseDay = formatDayMonth(base.takenOn, today)

  // Changes are differences of the euros shown, not rounded raw differences: two figures
  // shown as 202 050 € and 202 050 € never read « +1 € ».
  const shownChange = (a: Cents, b: Cents): Cents => (wholeEuros(a) - wholeEuros(b)) * 100
  const netChange = shownChange(after.net, before.net)
  const since = wholeEuros(netChange) === 0 ? `Autant qu’au ${baseDay}` : `${moreOrLess(netChange)} qu’au ${baseDay}`

  const gridBefore = buildGrid(before)
  const gridAfter = buildGrid(after)
  let square: Extract<ResultView, { kind: 'result' }>['square'] = null
  let replay: Extract<ResultView, { kind: 'result' }>['replay'] = null
  if (gridBefore.kind === 'grid' && gridAfter.kind === 'grid') {
    // C3: what a square was worth is said beside what it is worth, not the difference of the two.
    const moved = shownChange(gridAfter.squareValue, gridBefore.squareValue)
    square = {
      value: formatEuros(Math.round(gridAfter.squareValue)),
      then: wholeEuros(moved) === 0 ? null : formatEuros(wholeEuros(gridBefore.squareValue) * 100),
      day: baseDay,
    }
    // C2: the grid of the snapshot before, then the new one, square by square (as in Évolution).
    replay = {
      before: cellsOf(gridBefore),
      after: cellsOf(gridAfter),
      beforeHome: homeRange(gridBefore.categories),
      afterHome: homeRange(gridAfter.categories),
      beforeDay: baseDay,
      afterDay: formatDayMonth(next.snapshot.takenOn, today),
    }
  }

  // What is owed went down: repaid, and counted in the effort.
  const repaid = before.owed - after.owed
  const loans =
    wholeEuros(repaid) > 0
      ? `Crédit remboursé ${formatEuros(repaid)}`
      : wholeEuros(repaid) < 0
        ? `Crédit en plus ${formatEuros(-repaid)}`
        : null

  const splitShown = splitView(split, repaid, EXISTING_ADDED_THIS_TIME)

  // « Ce qui a changé »: by category, before loans; the biggest change first, then the usual order.
  const heldBefore = heldByCategory(before)
  const heldAfter = heldByCategory(after)
  const held = CATEGORY_ORDER.filter((c) => heldBefore.has(c) || heldAfter.has(c)).map((category) => ({
    category,
    change: (heldAfter.get(category) ?? 0) - (heldBefore.get(category) ?? 0),
  }))
  const moved = held
    .filter((c) => wholeEuros(c.change) !== 0)
    .sort(
      (a, b) =>
        Math.abs(wholeEuros(b.change)) - Math.abs(wholeEuros(a.change)) ||
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
    )
  const changes = moved.map(({ category, change }) => ({
    category,
    name: CATEGORIES[category].label,
    amount: change > 0 ? `+${formatEuros(change)}` : formatEuros(change),
  }))

  const still = held.filter((c) => wholeEuros(c.change) === 0).map((c) => CATEGORIES[c.category].label.toLowerCase())
  const unchanged =
    changes.length === 0 && loans === null
      ? `Rien n’a bougé depuis le ${baseDay}.`
      : still.length > 0
        ? `Le reste n’a pas bougé\u00A0: ${still.join(', ')}.`
        : null

  // Planche 21, « l’écran le dira »: an account whose value moved with nothing noted as paid in.
  const whole = wholeAccountChanges(next.profile, base, next.snapshot)
  const notes = next.profile.accounts
    .filter((a) => wholeEuros(whole.get(a.id) ?? 0) !== 0 && !Object.hasOwn(next.snapshot.contributions, a.id))
    .map(
      (a) =>
        `Rien n’est noté comme versé sur « ${a.name} »\u00A0: tout ce qui a bougé y est compté dans les marchés et les intérêts.`,
    )

  const withAmount = new Set(next.snapshot.entries.map((e) => e.lineId))
  const accountOf = new Map(next.profile.accounts.map((a) => [a.id, a]))
  const establishmentOf = new Map(next.profile.establishments.map((e) => [e.id, e]))
  const missing = next.profile.lines
    .filter((l) => l.closedOn === undefined && !withAmount.has(l.id))
    .flatMap((l) => {
      const establishment = establishmentOf.get(accountOf.get(l.accountId)?.establishmentId ?? '')
      return establishment ? [{ id: l.id, name: l.name, establishment: establishment.name, establishmentId: establishment.id }] : []
    })

  // The base is the snapshot before the new one: what was not seen since it was not reviewed.
  const behind = behindEstablishments(next.profile, next.snapshot, base)

  return {
    net: formatEuros(after.net),
    since,
    square,
    replay,
    noGridSentence: gridAfter.kind === 'none' ? noGridSentence(after) : null,
    split: splitShown,
    changes,
    loans,
    unchanged,
    notReviewed: notReviewedSentence(behind, today, todaysPriceBehind(next, behind, prices)),
    notes,
    missing,
  }
}
