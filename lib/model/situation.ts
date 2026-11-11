import { ACCOUNT_TYPES, CATEGORY_ORDER } from '@/lib/catalog'
import type { Account, CategoryId, Cents, Line, Profile, Snapshot, SnapshotEntry } from '@/lib/model/types'

export class MissingRateError extends Error {
  constructor(public currency: string) {
    super(`No exchange rate for ${currency}`)
    this.name = 'MissingRateError'
  }
}

export class UnknownLineError extends Error {
  constructor(public lineId: string) {
    super(`Snapshot entry for unknown line ${lineId}`)
    this.name = 'UnknownLineError'
  }
}

export class UncategorisedLineError extends Error {
  constructor(public lineId: string) {
    super(`Line ${lineId} has no category`)
    this.name = 'UncategorisedLineError'
  }
}

export class EntryKindError extends Error {
  constructor(public lineId: string) {
    super(`Entry kind does not match line ${lineId}`)
    this.name = 'EntryKindError'
  }
}

// The value of an entry in hundredths of the line's own currency, rounded as the
// bank shows it. It needs no rate.
export function entryMinorUnits(entry: SnapshotEntry): Cents {
  return Math.round(entry.kind === 'amount' ? entry.amount : entry.units * entry.unitPrice * 100)
}

// Hundredths of the line's own currency into euro cents: rounded first in the line's
// currency, as the bank shows it, then once more with the rate. The one rounding rule:
// a value, a cost or what was spent, all go through here.
export function toEuroCents(minorUnits: number, line: Line, fx: Snapshot['fx']): Cents {
  let rate = 1
  if (line.currency !== 'EUR') {
    const found = fx[line.currency]
    if (found === undefined) throw new MissingRateError(line.currency)
    rate = found
  }
  return Math.round(Math.round(minorUnits) * rate)
}

// The value of an entry in euro cents.
export function entryValue(entry: SnapshotEntry, line: Line, fx: Snapshot['fx']): Cents {
  if (entry.kind !== line.kind) throw new EntryKindError(line.id)
  return toEuroCents(entryMinorUnits(entry), line, fx)
}

// null: a loan has no category, it is a debt.
export function categoryOf(line: Line, account: Account): CategoryId | null {
  if (account.type === 'loan') return null
  return line.category ?? ACCOUNT_TYPES[account.type].defaultCategory[line.kind] ?? null
}

// The two pockets of Immobilier (10 November 2026): « Chez toi » (the main and secondary homes, and a
// property line on an account that is not a home) stays out of the goals; « En location » (the rental
// homes) is steered like the rest. Each is net of its own loans, never of the other's.
export type PocketId = 'chez-toi' | 'location'
// The order the grid fills them in: what is steered first, where one lives last.
export const POCKET_ORDER: readonly PocketId[] = ['location', 'chez-toi']

// The pocket of a property line, read from its account.
export function pocketOf(account: Account): PocketId {
  return account.type === 'home' && account.residence === 'rental' ? 'location' : 'chez-toi'
}

export type LineHolding = { lineId: string; category: CategoryId; value: Cents }
export type Pocket = { value: Cents; lines: LineHolding[] }
export type SituationCategory = {
  category: CategoryId
  // Net of every loan of the category: for Immobilier, the sum of both pockets, a negative one included.
  value: Cents
  lines: LineHolding[]
  // On the Immobilier entry only, both pockets always there (an empty one at 0, with no line).
  pockets?: Record<PocketId, Pocket>
}
export type Situation = {
  owned: Cents
  owed: Cents
  net: Cents
  holdings: LineHolding[] // what each line holds, before any loan is taken off
  categories: SituationCategory[]
}

// Whether the person holds a rental in this snapshot (one under its loans included): what makes the
// screens split Immobilier in two and list the rental goal.
export function holdsRental(situation: Situation): boolean {
  return (situation.categories.find((c) => c.pockets)?.pockets?.location.lines.length ?? 0) > 0
}

export function computeSituation(profile: Profile, snapshot: Snapshot): Situation {
  const lines = new Map(profile.lines.map((l) => [l.id, l]))
  const accounts = new Map(profile.accounts.map((a) => [a.id, a]))

  const holdings: LineHolding[] = []
  const loans: Array<{ financedLineId?: string; value: Cents }> = []
  let owned = 0
  let owed = 0

  for (const entry of snapshot.entries) {
    const line = lines.get(entry.lineId)
    const account = line && accounts.get(line.accountId)
    if (!line || !account) throw new UnknownLineError(entry.lineId)
    const value = entryValue(entry, line, snapshot.fx)
    const category = categoryOf(line, account)
    if (category === null) {
      if (account.type !== 'loan') throw new UncategorisedLineError(line.id)
      owed += value
      loans.push({ financedLineId: account.financedLineId, value })
    } else {
      owned += value
      holdings.push({ lineId: line.id, category, value })
    }
  }

  // A loan lowers the property it finances, or else the available money.
  const categoryAdjustment = new Map<CategoryId, Cents>()
  const adjust = (category: CategoryId, by: Cents) =>
    categoryAdjustment.set(category, (categoryAdjustment.get(category) ?? 0) + by)
  const netHoldings = holdings.map((h) => ({ ...h }))
  for (const loan of loans) {
    const financed = netHoldings.find((h) => h.lineId === loan.financedLineId)
    if (financed) {
      financed.value -= loan.value
    } else {
      adjust('available', -loan.value)
    }
  }

  const sum = (held: LineHolding[]) => held.reduce((s, h) => s + h.value, 0)
  const categories = CATEGORY_ORDER.map((category): SituationCategory => {
    const categoryLines = netHoldings.filter((h) => h.category === category)
    const value = sum(categoryLines) + (categoryAdjustment.get(category) ?? 0)
    if (category !== 'property') return { category, value, lines: categoryLines }
    // A loan never adjusts Immobilier as a whole (an unattached one lowers the available money), so
    // the two pockets add up to the category exactly.
    const inPocket = (pocket: PocketId) =>
      categoryLines.filter((h) => pocketOf(accounts.get(lines.get(h.lineId)!.accountId)!) === pocket)
    const pocket = (id: PocketId): Pocket => {
      const held = inPocket(id)
      return { value: sum(held), lines: held }
    }
    return { category, value, lines: categoryLines, pockets: { 'chez-toi': pocket('chez-toi'), location: pocket('location') } }
  })

  return { owned, owed, net: owned - owed, holdings, categories }
}
