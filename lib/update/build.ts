// The new profile and the new snapshot, from the snapshot the update starts from
// and what the draft says changed. A pre-filled box left untouched means
// « inchangé »: the line keeps the value its box opened with (the base one, at
// today's price for a line attached to its price) and the day it was last seen.
// Nothing given is changed. No React, no database here.

import { ACCOUNT_TYPES } from '@/lib/catalog'
import { formatDayMonth } from '@/lib/format'
import { NO_MARKET, ratesFor, type RateUse, type UpdateMarket } from '@/lib/market/live'
import type { Arrival, CurrencyCode, IsoDate, Profile, Snapshot, SnapshotEntry, UpdateDraft } from '@/lib/model/types'
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

  // Only a life insurance, a PER or employee savings takes what was paid in (« Combien a été versé dessus ? »).
  const takesContributions = new Set(
    accounts.filter((a) => ACCOUNT_TYPES[a.type].change === 'contributions').map((a) => a.id),
  )
  const contributions = Object.fromEntries(
    Object.entries(draft.contributions).filter(([accountId, cents]) => cents !== 0 && takesContributions.has(accountId)),
  )

  // Only the currencies of the lines this snapshot holds keep a rate (decision 10).
  const rates = ratesFor(currencies, base.fx, market.rates)
  return {
    profile: { ...profile, establishments, accounts, lines },
    snapshot: { schema: 1, takenOn, fx: rates.fx, entries, contributions, arrivals },
    rates,
  }
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
