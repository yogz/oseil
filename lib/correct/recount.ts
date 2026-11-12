// « Compté en »: a line's kind (an amount, parts) or currency corrected, every snapshot that holds it
// following (docs/superpowers/specs/2026-11-11-tout-corriger-depuis-la-fiche-design.md, § 6).
// - A currency corrected keeps the numbers; a snapshot without that currency's rate takes today's.
// - An amount counted in parts takes today's parts; each snapshot keeps its value, its price drawn from it.
// - Parts counted as an amount keep their value; the average price, the followed price and the
//   purchase rate go.
// The latest snapshot is written first, then the older ones, then the profile: a cut leaves the latest
// in the new kind, which `recountUnfinished` sees and `finishRecount` completes. No React, no database.

import { ACCOUNT_TYPES, CURRENCIES } from '@/lib/catalog'
import { categoryOf, entryMinorUnits, toEuroCents } from '@/lib/model/situation'
import type { Cents, CurrencyCode, Line, Profile, SnapshotEntry } from '@/lib/model/types'
import type { Planned, StoredSnapshot, Write } from './types'

type Kind = Line['kind']
export type RecountTarget = { kind: Kind; currency: CurrencyCode; units?: number }
export type RecountPreview = { snapshots: number; before: Cents | null; after: Cents | null; todayRates: number }

const findLine = (profile: Profile, lineId: string) => profile.lines.find((l) => l.id === lineId)
const accountOf = (profile: Profile, line: Line) => profile.accounts.find((a) => a.id === line.accountId)
const entryOf = (entries: SnapshotEntry[], lineId: string) => entries.find((e) => e.lineId === lineId)
const holding = (snapshots: StoredSnapshot[], lineId: string) => snapshots.filter((s) => entryOf(s.value.entries, lineId))
const isRate = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0

// What « Compté en » offers: null for a loan (in euros, an amount) and a home. Never parts for a line one
// of whose snapshots holds a negative amount: a negative price of one part is no snapshot the app reads.
export function recountChoices(
  profile: Profile,
  lineId: string,
  snapshots: StoredSnapshot[] = [],
): { kinds: Kind[]; currencies: CurrencyCode[] } | null {
  const line = findLine(profile, lineId)
  const account = line && accountOf(profile, line)
  if (!line || !account || account.type === 'loan' || account.type === 'home') return null
  const negative = holding(snapshots, lineId).some((s) => {
    const entry = entryOf(s.value.entries, lineId)!
    return entry.kind === 'amount' && entry.amount < 0
  })
  const kinds = (['amount', 'units'] as const).filter(
    (k) => ACCOUNT_TYPES[account.type].lineKinds.includes(k) && (k === line.kind || k === 'amount' || !negative),
  )
  return { kinds, currencies: CURRENCIES.map((c) => c.code) }
}

// One change at a time, the kind or the currency: a recount cut short is then always finished the
// right way, the latest snapshot telling the kind and the profile still telling the currency.
const validTarget = (profile: Profile, line: Line, target: RecountTarget, snapshots: StoredSnapshot[]) => {
  const choices = recountChoices(profile, line.id, snapshots)
  if (!choices || !choices.kinds.includes(target.kind) || !choices.currencies.includes(target.currency)) return false
  if (target.kind !== line.kind && target.currency !== line.currency) return false
  if (target.kind === 'units' && line.kind !== 'units') {
    return typeof target.units === 'number' && Number.isFinite(target.units) && target.units > 0
  }
  return true
}

// One entry in the target kind; one already in it is left as it is.
function converted(entry: SnapshotEntry, kind: Kind, units: number | undefined): SnapshotEntry {
  if (entry.kind === kind) return entry
  if (entry.kind === 'amount') {
    return { lineId: entry.lineId, kind: 'units', units: units!, unitPrice: entry.amount / 100 / units!, averagePrice: null, seenOn: entry.seenOn }
  }
  return { lineId: entry.lineId, kind: 'amount', amount: entryMinorUnits(entry), seenOn: entry.seenOn }
}


// The snapshot writes, the latest first, and how many took today's rate; 'no-rate' when one was needed.
function snapshotWrites(
  snapshots: StoredSnapshot[],
  lineId: string,
  target: RecountTarget,
  units: number | undefined,
  todayRate: number | null,
): { writes: Write[]; todayRates: number } | 'no-rate' {
  const writes: Write[] = []
  let todayRates = 0
  for (const s of [...holding(snapshots, lineId)].reverse()) {
    const entries = s.value.entries.map((e) => (e.lineId === lineId ? converted(e, target.kind, units) : e))
    let fx = s.value.fx
    if (target.currency !== 'EUR' && !isRate(fx[target.currency])) {
      if (todayRate === null || !(todayRate > 0)) return 'no-rate'
      fx = { ...fx, [target.currency]: todayRate }
      todayRates++
    }
    if (fx === s.value.fx && entries.every((e, i) => e === s.value.entries[i])) continue
    writes.push({ kind: 'snapshot', id: s.id, value: { ...s.value, fx, entries } })
  }
  return { writes, todayRates }
}

// A category the line took from its kind is kept, written: in a life insurance an amount is secured
// and parts are markets, and a recount never moves squares between categories silently.
function recountedLine(profile: Profile, line: Line, target: RecountTarget): Line {
  const next: Line = { ...line, kind: target.kind, currency: target.currency }
  const account = accountOf(profile, line)
  const before = account ? categoryOf(line, account) : null
  if (account && line.category === undefined && before !== null && categoryOf(next, account) !== before) next.category = before
  if (target.kind === 'amount') delete next.quoteSymbol
  if (target.kind === 'amount' || target.currency === 'EUR' || target.currency !== line.currency) delete next.purchase
  return next
}

// Today's euros of the line in the latest snapshot that holds it, before and after; null without a rate.
function latestValue(line: Line, snapshots: StoredSnapshot[], entry?: SnapshotEntry, fx?: Record<string, number>): Cents | null {
  const latest = holding(snapshots, line.id).at(-1)
  const held = entry ?? (latest && entryOf(latest.value.entries, line.id))
  if (!latest || !held) return null
  try {
    return toEuroCents(entryMinorUnits(held), line, fx ?? latest.value.fx)
  } catch {
    return null
  }
}

export function recountPreview(
  profile: Profile,
  snapshots: StoredSnapshot[],
  lineId: string,
  target: RecountTarget,
  todayRate: number | null,
): RecountPreview | 'no-rate' | null {
  const line = findLine(profile, lineId)
  if (!line || !validTarget(profile, line, target, snapshots)) return null
  const planned = snapshotWrites(snapshots, lineId, target, target.units, todayRate)
  if (planned === 'no-rate') return 'no-rate'
  const latest = holding(snapshots, lineId).at(-1)
  const rewritten = planned.writes.find((w) => w.kind === 'snapshot' && w.id === latest?.id)
  const after = rewritten?.kind === 'snapshot' ? rewritten.value : latest?.value
  const afterEntry = after && entryOf(after.entries, lineId)
  return {
    snapshots: holding(snapshots, lineId).length,
    before: latestValue(line, snapshots),
    after: afterEntry ? latestValue(recountedLine(profile, line, target), snapshots, afterEntry, after!.fx) : null,
    todayRates: planned.todayRates,
  }
}

export function recountLine(
  profile: Profile,
  snapshots: StoredSnapshot[],
  lineId: string,
  target: RecountTarget,
  todayRate: number | null,
): Planned {
  const line = findLine(profile, lineId)
  if (!line || line.closedOn !== undefined) return { refused: 'not-held' }
  if (!validTarget(profile, line, target, snapshots)) return { refused: 'not-allowed' }
  const planned = snapshotWrites(snapshots, lineId, target, target.units, todayRate)
  if (planned === 'no-rate') return { refused: 'no-rate' }
  const lines = profile.lines.map((l) => (l.id === lineId ? recountedLine(profile, l, target) : l))
  return { writes: [...planned.writes, { kind: 'profile', value: { ...profile, lines } }] }
}

// A snapshot that holds the line in another kind than the line's: a recount cut short.
export function recountUnfinished(profile: Profile, snapshots: StoredSnapshot[], lineId: string): boolean {
  const line = findLine(profile, lineId)
  if (!line) return false
  return holding(snapshots, lineId).some((s) => entryOf(s.value.entries, lineId)!.kind !== line.kind)
}

// « Terminer »: the latest snapshot says which way, and how many parts.
export function finishRecount(profile: Profile, snapshots: StoredSnapshot[], lineId: string): Planned {
  const line = findLine(profile, lineId)
  const latest = holding(snapshots, lineId).at(-1)
  const entry = latest && entryOf(latest.value.entries, lineId)
  if (!line || !entry || !recountUnfinished(profile, snapshots, lineId)) return { refused: 'not-allowed' }
  const target: RecountTarget = { kind: entry.kind, currency: line.currency, ...(entry.kind === 'units' ? { units: entry.units } : {}) }
  const planned = snapshotWrites(snapshots, lineId, target, target.units, null)
  if (planned === 'no-rate') return { refused: 'no-rate' }
  const lines = profile.lines.map((l) => (l.id === lineId ? recountedLine(profile, l, target) : l))
  return { writes: [...planned.writes, { kind: 'profile', value: { ...profile, lines } }] }
}
