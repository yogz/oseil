// What « Repères » shows, as words and figures. Pure: no React, no database.

import type { Model } from '@/lib/app/use-model'
import { CATEGORY_ORDER } from '@/lib/catalog'
import { formatDayMonth, formatEurosShown } from '@/lib/format'
import { convertible, usablePrices, withPrices } from '@/lib/market/live'
import type { Market } from '@/lib/market/types'
import { nothingCountedSentence, unconvertedSentence } from '@/lib/market/words'
import { cushion } from '@/lib/model/cushion'
import {
  categoryOf,
  computeSituation,
  entryValue,
  EntryKindError,
  MissingRateError,
  pocketOf,
  UncategorisedLineError,
  UnknownLineError,
  type Situation,
} from '@/lib/model/situation'
import { buildGrid } from '@/lib/model/squares'
import type { Account, CategoryId, Cents, IsoDate, Profile, Snapshot } from '@/lib/model/types'
import { debtsOf } from '@/lib/screens/debts'
import {
  CUSHION_MISSING,
  cushionSentence,
  CUSHION_SETTINGS_UNREADABLE,
  directShareFact,
  employerFact,
  homeFact,
  NOTHING_QUICK,
  quickSentence,
  sameHoldingFact,
  type Homes,
} from '@/lib/screens/reperes-words'
import { pricesDateLabel } from '@/lib/screens/words'

export type ReperesView =
  | { kind: 'none' } // no snapshot, or the first launch is not finished: the page sends to Mon argent
  | { kind: 'unreadable' }
  | {
      kind: 'ready'
      dateLabel: string
      cushion:
        | { sentence: string; months: number; filled: number /* of 12, halves rounded down */; note?: string }
        | { missing: string }
      // lit / total: squares that can be had back quickly over the grid's squares (null: no grid).
      // `squares` is the same grid category by category, for drawing it.
      quick: {
        sentence: string
        lit: number
        total: number
        squares: Array<{ category: CategoryId; lit: number; dim: number }>
      } | null
      facts: string[] // at most 4
      places: Array<{
        id: string
        name: string
        amount: string | null // null: only loans are held here
        scale: number // its amount over the largest one, from 0 to 1: the one scale of every bar
        bar: Array<{ category: CategoryId; share: number }> | null // null for « Chez toi »
        loans: Array<{ id: string; name: string; owed: string }>
      }>
      notes: string[] // lines left out for want of a rate
    }

const DEFAULT_EMPLOYER_PLACE = 'Épargne salariale'
const plainName = (name: string) => name.toLowerCase().replace(/\s+/g, '')

// Quick to get back: not the home, not a PER, employee savings only once their year has come, and
// no account marked slow (unlisted shares, a locked placement).
function isQuick(account: Account, today: IsoDate): boolean {
  if (account.type === 'home' || account.type === 'per') return false
  if (account.type === 'employee-savings') return account.unlockOn !== undefined && account.unlockOn <= today
  return account.slow !== true
}

function situationOf(profile: Profile, snapshot: Snapshot): Situation | null {
  try {
    return computeSituation(profile, snapshot)
  } catch (error) {
    if (
      error instanceof UnknownLineError ||
      error instanceof UncategorisedLineError ||
      error instanceof EntryKindError ||
      error instanceof MissingRateError
    ) {
      return null
    }
    throw error
  }
}

// `market`: today's prices and rates, when the browser has them. Null or absent: the snapshot as saved.
export function reperesView(model: Model, today: IsoDate, market: Market | null = null): ReperesView {
  if (model.unreadable.profile > 0 || model.unreadable.snapshots > 0) return { kind: 'unreadable' }
  if (!model.profile || model.snapshots.length === 0) return { kind: 'none' }
  const profile = model.profile.value
  if (profile.firstLaunch && !profile.firstLaunch.complete) return { kind: 'none' }

  const latest = model.snapshots[model.snapshots.length - 1].value
  // The last saved snapshot, its quoted lines at today's prices; a line no rate converts is left out and said.
  const { prices } = market ? usablePrices(profile, latest, market, today) : { prices: {} }
  const { snapshot: shown, names: unconverted } = convertible(profile, withPrices(latest, prices))
  const nothingCounted = shown.entries.length === 0 && latest.entries.length > 0
  const situation = situationOf(profile, shown)
  if (situation === null) return { kind: 'unreadable' }
  const tookPrice = shown.entries.some((e) => Object.hasOwn(prices, e.lineId))
  const dateLabel =
    tookPrice && latest.takenOn < today
      ? pricesDateLabel(formatDayMonth(latest.takenOn, today))
      : `Chiffres du ${formatDayMonth(latest.takenOn, today)}`

  const lines = new Map(profile.lines.map((l) => [l.id, l]))
  const accounts = new Map(profile.accounts.map((a) => [a.id, a]))
  const accountOf = (lineId: string) => accounts.get(lines.get(lineId)!.accountId)!

  // 1. The cushion: never 0 months for want of a budget.
  const available = situation.categories.find((c) => c.category === 'available')?.value ?? 0
  const budget = model.settings?.value.budget ?? null
  const covered = nothingCounted ? null : cushion(available, budget)
  // Lines left out for want of a rate that belong to « disponible »: the cushion says so too.
  const leftOutAvailable = unconverted.filter((name) =>
    latest.entries.some((e) => {
      const l = lines.get(e.lineId)
      return l?.name === name && !shown.entries.some((s) => s.lineId === e.lineId) && categoryOf(l, accountOf(l.id)) === 'available'
    }),
  )
  const availableNote = unconvertedSentence(leftOutAvailable)
  const cushionView: Extract<ReperesView, { kind: 'ready' }>['cushion'] = covered
    ? {
        sentence: cushionSentence(covered.months, covered.basis, available <= 0 || available / budget!.monthly < 0.5),
        months: covered.months,
        filled: Math.min(12, Math.floor(covered.months)),
        ...(availableNote ? { note: availableNote } : {}),
      }
    : {
        missing: nothingCounted
          ? nothingCountedSentence(unconverted)
          : !budget && model.unreadable.settings > 0
            ? CUSHION_SETTINGS_UNREADABLE
            : CUSHION_MISSING,
      }

  // The homes held in the snapshot, by pocket: « ton logement », « ton logement en location », or
  // « tes logements » from two.
  const homeAccounts = new Set(shown.entries.map((e) => accountOf(e.lineId)).filter((a) => a.type === 'home'))
  const rentals = [...homeAccounts].filter((a) => pocketOf(a) === 'location').length
  const homesHeld: Homes = { chezToi: homeAccounts.size - rentals, rental: rentals }

  // 2. What can be had back quickly, from the squares of the grid.
  const grid = buildGrid(situation)
  let quick: Extract<ReperesView, { kind: 'ready' }>['quick'] = null
  if (grid.kind === 'grid') {
    let lit = 0
    let total = 0
    let outside: Cents = 0
    let home = 0
    let retirement = 0
    let slow = 0
    const squares: Array<{ category: CategoryId; lit: number; dim: number }> = []
    for (const category of grid.categories) {
      let litHere = 0
      for (const l of category.lines) {
        const account = accountOf(l.lineId)
        if (isQuick(account, today)) {
          litHere += l.squares
        } else {
          outside += l.value
          if (account.type === 'home') home += l.value
          else if (account.type === 'per') retirement += l.value
          else if (account.type !== 'employee-savings') slow += l.value
        }
      }
      // Squares that no line holds (a category lowered by a loan) stay lit.
      litHere += Math.max(0, category.squares - category.lines.reduce((s, l) => s + l.squares, 0))
      lit += litHere
      total += category.squares
      squares.push({ category: category.category, lit: litHere, dim: category.squares - litHere })
    }
    const value = grid.total - outside
    const employer = outside - home - retirement - slow
    quick = {
      sentence:
        value <= 0
          ? NOTHING_QUICK
          : quickSentence(lit / total, formatEurosShown(value), {
              homes: home > 0 ? homesHeld : { chezToi: 0, rental: 0 },
              retirement: retirement > 0,
              employer: employer > 0,
              retirementSmall: retirement / grid.total < 0.15,
              slow: slow > 0,
              slowSmall: slow / grid.total < 0.15,
            }),
      lit,
      total,
      squares,
    }
  }

  // 3. Bon à savoir: the home, the same holding twice, the employer, the biggest share.
  const facts: string[] = []
  // The home is read net of its loan, as the grid reads it.
  const homeNet = situation.categories
    .flatMap((c) => c.lines)
    .filter((h) => accountOf(h.lineId).type === 'home')
    .reduce((s, h) => s + h.value, 0)
  if (situation.net > 0 && homeNet > 0) facts.push(homeFact(homeNet / situation.net, homesHeld))

  const held = new Map<string, { name: string; accounts: Set<string>; total: Cents }>()
  for (const entry of shown.entries) {
    const l = lines.get(entry.lineId)!
    if (l.kind !== 'units' || accountOf(l.id).type === 'loan') continue
    const key = plainName(l.name)
    const found = held.get(key) ?? { name: l.name, accounts: new Set<string>(), total: 0 }
    found.accounts.add(l.accountId)
    found.total += entryValue(entry, l, shown.fx)
    held.set(key, found)
  }
  const several = [...held.values()].filter((h) => h.accounts.size > 1).sort((a, b) => b.total - a.total)[0]
  if (several) facts.push(sameHoldingFact(several.name, several.accounts.size, formatEurosShown(several.total)))

  const employerHoldings = situation.holdings.filter((h) => accountOf(h.lineId).type === 'employee-savings')
  const employerValue = employerHoldings.reduce((s, h) => s + h.value, 0)
  // The share is of what is his outside the homes.
  const outsideHomes = situation.net - homeNet
  if (employerValue > 0 && outsideHomes > 0) {
    const employerAccounts = new Map(employerHoldings.map((h) => [accountOf(h.lineId).id, accountOf(h.lineId)]))
    const names: string[] = []
    for (const a of employerAccounts.values()) {
      const place = profile.establishments.find((e) => e.id === a.establishmentId)
      const named =
        place && place.name !== DEFAULT_EMPLOYER_PLACE ? place.name : a.name.replace(/^(PEE|PERCO[L]?)\b\s*/i, '').trim()
      if (named && !names.includes(named)) names.push(named)
    }
    facts.push(employerFact(employerValue / outsideHomes, names, names.length === 0 && employerAccounts.size > 1, homesHeld))
  }

  // The biggest company held directly. The nature comes from today's quotes (`kind`), not from the
  // prices in use: a price too old to count still says what the title is.
  if (grid.kind === 'grid') {
    const markets = grid.categories.find((c) => c.category === 'markets')
    const bySymbol = new Map<string, { name: string; top: Cents; squares: number; value: Cents }>()
    for (const gridLine of markets?.lines ?? []) {
      const l = lines.get(gridLine.lineId)!
      if (!l.quoteSymbol || market?.quotes[l.quoteSymbol]?.kind !== 'action') continue
      const found = bySymbol.get(l.quoteSymbol) ?? { name: l.name, top: -Infinity, squares: 0, value: 0 }
      if (gridLine.value > found.top) {
        found.name = l.name
        found.top = gridLine.value
      }
      found.squares += gridLine.squares
      found.value += gridLine.value
      bySymbol.set(l.quoteSymbol, found)
    }
    const biggest = [...bySymbol.values()].sort((a, b) => b.squares - a.squares || b.value - a.value)[0]
    if (markets && biggest && biggest.squares >= 1) facts.push(directShareFact(biggest.name, biggest.squares, markets.squares))
  }

  // 4. Where the money is: each establishment, its holdings by category, its loans under it.
  const debts = new Map(debtsOf(profile, shown).map((d) => [d.lineId, d.value]))
  const raw = profile.establishments.flatMap((establishment) => {
    const byCategory = new Map<CategoryId, Cents>() // what is positive: the bar
    const loans: Array<{ id: string; name: string; owed: Cents }> = []
    let amount = 0 // an overdrawn account counts here
    let held = 0
    for (const entry of shown.entries) {
      const l = lines.get(entry.lineId)!
      const account = accountOf(l.id)
      if (account.establishmentId !== establishment.id) continue
      if (account.type === 'loan') {
        const owed = debts.get(l.id) ?? 0
        if (owed > 0) loans.push({ id: l.id, name: account.name, owed })
        continue
      }
      const value = entryValue(entry, l, shown.fx)
      const category = categoryOf(l, account)
      if (category === null) continue
      held += 1
      amount += value
      if (value > 0) byCategory.set(category, (byCategory.get(category) ?? 0) + value)
    }
    if (held === 0 ? loans.length === 0 : amount === 0 && loans.length === 0) return []
    const positive = [...byCategory.values()].reduce((s, v) => s + v, 0)
    return [{ establishment, byCategory, loans, amount: held === 0 ? null : amount, positive }]
  })
  // The largest first, « Chez toi » last.
  raw.sort(
    (a, b) =>
      Number(a.establishment.kind === 'home') - Number(b.establishment.kind === 'home') ||
      (b.amount ?? -Infinity) - (a.amount ?? -Infinity),
  )
  // The scale is the largest of the establishments that have a bar: « Chez toi » has none.
  const largest = Math.max(0, ...raw.filter((p) => p.establishment.kind !== 'home').map((p) => p.positive))
  const places = raw.map((p) => ({
    id: p.establishment.id,
    name: p.establishment.name,
    amount: p.amount === null ? null : formatEurosShown(p.amount),
    scale: p.establishment.kind === 'home' || largest === 0 ? 0 : p.positive / largest,
    bar:
      p.establishment.kind === 'home'
        ? null
        : CATEGORY_ORDER.filter((c) => p.byCategory.has(c)).map((category) => ({
            category,
            share: p.byCategory.get(category)! / p.positive,
          })),
    loans: p.loans.map((loan) => ({ id: loan.id, name: loan.name, owed: formatEurosShown(loan.owed) })),
  }))

  const note = nothingCounted ? null : unconvertedSentence(unconverted)
  return {
    kind: 'ready',
    dateLabel,
    cushion: cushionView,
    quick,
    facts: facts.slice(0, 4),
    places,
    notes: note ? [note] : [],
  }
}
