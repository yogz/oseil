import { ACCOUNT_TYPES, takesPaidTotal } from '@/lib/catalog'
import { estimatedInterest, isEstimatedLivret } from '@/lib/model/livret-interest'
import { costToEuroCents, fewer } from '@/lib/model/purchase-cost'
import { entryMinorUnits, entryValue, toEuroCents, UnknownLineError } from '@/lib/model/situation'
import type { Cents, Line, Profile, Snapshot, SnapshotEntry } from '@/lib/model/types'

export type ChangeSplit = {
  effort: Cents
  markets: Cents
  property: Cents
  existingAdded: Cents
  total: Cents
  // The interest of a Livret A, LDDS or LEP estimated from the official rates, already in markets
  // (docs/superpowers/specs/2026-11-14-interets-livrets-design.md).
  estimatedInterest: Cents
}

// Between two snapshots, splits the change in net worth into your effort,
// markets and interest, your home re-estimated, and forgotten accounts added.
export function splitChange(profile: Profile, before: Snapshot, after: Snapshot): ChangeSplit {
  return walk(profile, before, after).split
}

// The change of each account handled as a whole (a contributions account followed in both
// snapshots, or an account with a total paid in on both sides), before what was paid in is
// taken off: what is not paid in is markets.
export function wholeAccountChanges(profile: Profile, before: Snapshot, after: Snapshot): Map<string, Cents> {
  return walk(profile, before, after).wholeAccounts
}

// Both snapshots hold the account's total paid in since the opening: their difference is
// what was paid in between them (docs/superpowers/specs/2026-11-14-total-verse-design.md).
export function hasBothTotals(before: Snapshot, after: Snapshot, accountId: string): boolean {
  return before.paidTotals?.[accountId] !== undefined && after.paidTotals?.[accountId] !== undefined
}

function walk(
  profile: Profile,
  before: Snapshot,
  after: Snapshot,
): { split: ChangeSplit; wholeAccounts: Map<string, Cents> } {
  const lines = new Map(profile.lines.map((l) => [l.id, l]))
  const accounts = new Map(profile.accounts.map((a) => [a.id, a]))
  const entriesB = new Map<string, SnapshotEntry>()
  const entriesA = new Map<string, SnapshotEntry>()
  for (const e of before.entries) entriesB.set(e.lineId, e)
  for (const e of after.entries) entriesA.set(e.lineId, e)

  const accountOf = (line: Line) => {
    const account = accounts.get(line.accountId)
    if (!account) throw new UnknownLineError(line.id)
    return account
  }
  const lineOf = (lineId: string) => {
    const line = lines.get(lineId)
    if (!line) throw new UnknownLineError(lineId)
    return line
  }

  // Net contribution of a line: its value in euros, or minus what is owed for a loan.
  const net = (entry: SnapshotEntry | undefined, line: Line, snapshot: Snapshot): Cents => {
    if (!entry) return 0
    const value = entryValue(entry, line, snapshot.fx)
    return accountOf(line).type === 'loan' ? -value : value
  }

  const lineIds = new Set([...entriesB.keys(), ...entriesA.keys()])
  for (const id of lineIds) lineOf(id) // reject unknown lines up front

  // A contributions account present in both snapshots is handled as a whole: what was
  // paid in is effort, the rest of its change is markets. A fund opened in it since is
  // money that entered the account, paid in or moved from another of its funds, so it
  // stays in that change. A fund the person already had (or with no arrival) was there
  // before, only not followed: it stays out of the split, as on any other account.
  const presentB = new Set<string>()
  const presentA = new Set<string>()
  for (const id of entriesB.keys()) presentB.add(lineOf(id).accountId)
  for (const id of entriesA.keys()) presentA.add(lineOf(id).accountId)
  const wholeAccountDelta = new Map<string, Cents>()
  const takesTotal = (accountId: string) => {
    const account = accounts.get(accountId)
    return account !== undefined && takesPaidTotal(account.type) // an unknown account is refused in the loop below
  }
  // Held at both dates, as a contributions account: a closed account keeps the usual withdrawal rule.
  const byTotals = (accountId: string) =>
    takesTotal(accountId) && presentB.has(accountId) && presentA.has(accountId) && hasBothTotals(before, after, accountId)

  // An account opened in the period (absent before, every line of it opened) with a total after:
  // that total is effort, the rest of its value markets.
  const openedWithTotal = new Set<string>()
  for (const accountId of presentA) {
    if (presentB.has(accountId) || !takesTotal(accountId) || after.paidTotals?.[accountId] === undefined) continue
    const lineIds = after.entries.filter((e) => lineOf(e.lineId).accountId === accountId).map((e) => e.lineId)
    if (lineIds.every((lineId) => after.arrivals[lineId] === 'opened')) openedWithTotal.add(accountId)
  }
  const openedValue = new Map<string, Cents>()
  // A livret's balance held at `before`, on its lines present on both sides, in euros.
  const livretBalance = new Map<string, Cents>()

  let effort = 0
  let markets = 0
  let property = 0
  let existingAdded = 0
  let total = 0

  for (const id of lineIds) {
    const line = lineOf(id)
    const account = accountOf(line)
    const change = ACCOUNT_TYPES[account.type].change
    const entryB = entriesB.get(id)
    const entryA = entriesA.get(id)
    const nB = net(entryB, line, before)
    const nA = net(entryA, line, after)
    const delta = nA - nB
    total += delta

    const wholeAccount =
      (change === 'contributions' && presentB.has(account.id) && presentA.has(account.id)) || byTotals(account.id)
    const alreadyHad = !entryB && after.arrivals[id] !== 'opened'
    if (isEstimatedLivret(account.type) && entryB && entryA && line.currency === 'EUR') {
      livretBalance.set(account.id, (livretBalance.get(account.id) ?? 0) + nB)
    }
    if (openedWithTotal.has(account.id)) {
      openedValue.set(account.id, (openedValue.get(account.id) ?? 0) + nA)
    } else if (wholeAccount && !alreadyHad) {
      wholeAccountDelta.set(account.id, (wholeAccountDelta.get(account.id) ?? 0) + delta)
    } else if (entryB && !entryA) {
      effort -= nB
    } else if (!entryB && entryA) {
      if (after.arrivals[id] === 'opened') effort += nA
      else existingAdded += nA
    } else if (change === 'property') {
      property += delta
    } else if (change === 'cost-basis' && entryB?.kind === 'units' && entryA?.kind === 'units') {
      const unitsA = entryA.units
      const unitsB = entryB.units
      let spent: Cents
      if (fewer(unitsA, unitsB)) {
        // A sale: the parts sold leave at the day's price, so markets keep only what the price did
        // and the gain made since the purchase is not turned into effort.
        spent = toEuroCents((unitsA - unitsB) * entryA.unitPrice * 100, line, after.fx)
      } else if (entryA.averagePrice !== null && entryB.averagePrice !== null) {
        // The parts bought, at their cost: in euros by the person's word when given, as purchase-cost.ts.
        spent = costToEuroCents((unitsA * entryA.averagePrice - unitsB * entryB.averagePrice) * 100, line, after.fx)
      } else {
        spent = toEuroCents((unitsA - unitsB) * entryA.unitPrice * 100, line, after.fx)
      }
      effort += spent
      markets += delta - spent
    } else if (line.currency !== 'EUR' && entryB && (change === 'all' || change === 'cost-basis')) {
      // An amount in another currency: what the rate did to the amount held before is markets
      // (its value in the currency, at the new rate less the old one), the rest is effort.
      const rateEffect = toEuroCents(entryMinorUnits(entryB), line, after.fx) - nB
      markets += rateEffect
      effort += delta - rateEffect
    } else {
      // all, repayment, and amount lines of a cost-basis account
      effort += delta
    }
  }

  for (const [accountId, delta] of wholeAccountDelta) {
    const paidIn = byTotals(accountId)
      ? after.paidTotals![accountId] - before.paidTotals![accountId]
      : (after.contributions[accountId] ?? 0)
    effort += paidIn
    markets += delta - paidIn
  }
  for (const [accountId, value] of openedValue) {
    const paidIn = after.paidTotals![accountId]
    effort += paidIn
    markets += value - paidIn
  }

  // The interest paid each 31 December of the period, once per account: it is markets, and the rest of
  // the livret's change stays effort (a withdrawal stays a withdrawal, interest taken off).
  let interest = 0
  for (const [accountId, balance] of livretBalance) {
    const type = accounts.get(accountId)!.type
    if (!isEstimatedLivret(type)) continue
    interest += estimatedInterest(type, balance, before.takenOn, after.takenOn)
  }
  markets += interest
  effort -= interest

  return {
    split: { effort, markets, property, existingAdded, total, estimatedInterest: interest },
    wholeAccounts: wholeAccountDelta,
  }
}
