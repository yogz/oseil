// The new profile and the new snapshot, from the snapshot the update starts from
// and what the draft says changed. A pre-filled box left untouched means
// « inchangé »: the line keeps the value its box opened with (the base one, at
// today's price for a line attached to its price) and the day it was last seen.
// Nothing given is changed. No React, no database here.

import { ACCOUNT_TYPES, takesPaidTotal } from '@/lib/catalog'
import { formatDayMonth } from '@/lib/format'
import { NO_MARKET, ratesFor, type RateUse, type UpdateMarket } from '@/lib/market/live'
import type { Arrival, Cents, CurrencyCode, IsoDate, Profile, Snapshot, SnapshotEntry, UpdateDraft } from '@/lib/model/types'
import { prefilledEntry, tidyDraft, withAddedEstablishments } from './draft'

// `rates` says which rate each currency of the new snapshot took (decisions 10 and 11):
// today's, the base snapshot's, or none (`missing`: the snapshot cannot be read yet).
export function buildUpdate(
  profile: Profile,
  base: Snapshot,
  given: UpdateDraft,
  takenOn: IsoDate,
  market: UpdateMarket = NO_MARKET,
): { profile: Profile; snapshot: Snapshot; rates: RateUse } {
  // Leaves out what names a line or an account the profile does not have, and an
  // addition the profile already holds (saved, then the snapshot was not): ids stay unique.
  const draft = tidyDraft(profile, given)

  // An added account left without a line is dropped. A closed line stays, so older
  // snapshots keep its name and a loan can still point at it.
  // A bank added in the update stays, even left empty, as one added in the settings would.
  const establishments = withAddedEstablishments(profile, draft).establishments

  const withLines = new Set(draft.added.lines.map((l) => l.accountId))
  const accounts = [...profile.accounts, ...draft.added.accounts.filter((a) => withLines.has(a.id))]
  const closed = new Set(draft.closed)
  const lines = [
    ...profile.lines.map((l) => (closed.has(l.id) ? { ...l, closedOn: takenOn } : l)),
    ...draft.added.lines,
  ]

  const accountOf = new Map(accounts.map((a) => [a.id, a]))
  const lineAccount = new Map(lines.map((l) => [l.id, l.accountId]))
  const typed = new Map(draft.values.map((e) => [e.lineId, e]))
  const before = new Map(base.entries.map((e) => [e.lineId, e]))
  const confirmed = new Set(draft.confirmed)
  const entries: SnapshotEntry[] = []
  const currencies: CurrencyCode[] = []
  const arrivals: Record<string, Arrival> = {}

  for (const line of lines) {
    if (line.closedOn !== undefined) continue
    const value = typed.get(line.id)
    // Not typed, confirmed or not: the box as it opened, today's price included (decision 7).
    const entry = value ?? prefilledEntry(base, line.id, market.prices)
    if (entry === null) continue
    currencies.push(line.currency)
    const account = accountOf.get(line.accountId)
    // Seen now: typed (an added line always is), confirmed « Inchangé », or in a bank
    // done. The house keeps its estimate date unless « Changer » gave it a value (decision 3).
    const reviewed = confirmed.has(line.id) || (account !== undefined && draft.progress[account.establishmentId] === 'done')
    const seen = value !== undefined || (reviewed && account?.type !== 'home')
    entries.push({ ...entry, seenOn: seen ? takenOn : entry.seenOn })

    // New this period, even when a half-saved update already put it in the profile.
    if (!before.has(line.id)) {
      const arrival = draft.arrivals[line.id] ?? draft.arrivals[line.accountId]
      if (arrival !== undefined) arrivals[line.id] = arrival
    }
  }

  // Only a life insurance, a PER or employee savings takes what was paid in: typed in a draft from before
  // the totals paid in, and still counted.
  const takesContributions = new Set(
    accounts.filter((a) => ACCOUNT_TYPES[a.type].change === 'contributions').map((a) => a.id),
  )
  const contributions = Object.fromEntries(
    Object.entries(draft.contributions).filter(([accountId]) => takesContributions.has(accountId)),
  )

  // The total paid in, as typed, on an account that takes one and still holds a line. With the box left
  // empty, an account the person left as it was keeps its total from the base, as it keeps its figures:
  // no line of it typed anew (nor added), and every line confirmed unchanged (« Rien n’a changé ici »
  // included) or its bank skipped. An account that moved cannot have its total guessed.
  const held = new Set(entries.map((e) => lineAccount.get(e.lineId)))
  const unchanged = (accountId: string, establishmentId: string) => {
    // A line closed now has no entry any more: the account moved, whatever the others say.
    if (profile.lines.some((l) => l.accountId === accountId && closed.has(l.id))) return false
    const own = entries.filter((e) => lineAccount.get(e.lineId) === accountId).map((e) => e.lineId)
    if (own.some((lineId) => typed.has(lineId) && !sameAsBase(typed.get(lineId)!, before.get(lineId)))) return false
    return draft.progress[establishmentId] === 'skipped' || own.every((lineId) => confirmed.has(lineId) || typed.has(lineId))
  }
  const paidTotals: Record<string, Cents> = {}
  for (const account of accounts) {
    if (!takesPaidTotal(account.type) || !held.has(account.id)) continue
    const typedTotal = draft.paidTotals?.[account.id]
    const carried = unchanged(account.id, account.establishmentId) ? base.paidTotals?.[account.id] : undefined
    const total = typedTotal ?? carried
    if (total !== undefined) paidTotals[account.id] = total
  }

  // Only the currencies of the lines this snapshot holds keep a rate (decision 10).
  const rates = ratesFor(currencies, base.fx, market.rates)
  return {
    profile: { ...profile, establishments, accounts, lines },
    snapshot: {
      schema: 1,
      takenOn,
      fx: rates.fx,
      entries,
      contributions,
      // Absent when none: a snapshot without totals reads as before.
      ...(Object.keys(paidTotals).length > 0 && { paidTotals }),
      arrivals,
    },
    rates,
  }
}

// A typed value that says what the base already said (its figures, whatever the day it was seen).
function sameAsBase(entry: SnapshotEntry, held: SnapshotEntry | undefined): boolean {
  if (held === undefined) return false
  if (entry.kind === 'amount') return held.kind === 'amount' && entry.amount === held.amount
  return (
    held.kind === 'units' &&
    entry.units === held.units &&
    entry.unitPrice === held.unitPrice &&
    entry.averagePrice === held.averagePrice
  )
}

// The snapshot's date: from the base snapshot's day, included, to today (decision 8).
// An older one would file the new snapshot behind the base. A base saved from a device
// whose clock is ahead of this one keeps its own day allowed, so the save is never blocked.
export function takenOnRange(base: Snapshot, today: IsoDate): { min: IsoDate; max: IsoDate } {
  return { min: base.takenOn, max: base.takenOn > today ? base.takenOn : today }
}

export function takenOnError(base: Snapshot, takenOn: IsoDate, today: IsoDate): string | null {
  const { min, max } = takenOnRange(base, today)
  if (min <= takenOn && takenOn <= max) return null
  return `Choisis une date entre le ${formatDayMonth(base.takenOn, today)} et aujourd’hui.`
}
