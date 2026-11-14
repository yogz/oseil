// Corrections that rewrite snapshots: figures carried forward, closing at a date,
// reopening, finishing an interrupted close, deleting. A correction is not a change:
// no snapshot is created, and no seenOn or takenOn moves. Each returns its writes in
// the order that keeps a cut between two of them harmless. No React, no database here.

import { addDays } from '@/lib/dates'
import type { IsoDate, Line, Profile, Snapshot, SnapshotEntry } from '@/lib/model/types'
import { withoutFinanced } from '@/lib/setup/first-launch'
import type { Figures, Planned, StoredSnapshot, Write } from './types'

type Field = 'amount' | 'units' | 'unitPrice' | 'averagePrice'
const FIELDS: Record<Figures['kind'], Field[]> = {
  amount: ['amount'],
  units: ['units', 'unitPrice', 'averagePrice'],
}
const fieldOf = (source: SnapshotEntry | Figures, field: Field) =>
  (source as Partial<Record<Field, number | null>>)[field]

const entryOf = (snapshot: Snapshot, lineId: string) => snapshot.entries.find((e) => e.lineId === lineId)
const holds = (snapshot: Snapshot, lineId: string) => snapshot.entries.some((e) => e.lineId === lineId)
const findLine = (profile: Profile, lineId: string) => profile.lines.find((l) => l.id === lineId)

function mapLine(profile: Profile, lineId: string, change: (l: Line) => Line): Profile {
  return { ...profile, lines: profile.lines.map((l) => (l.id === lineId ? change(l) : l)) }
}

function withoutClosedOn(line: Line): Line {
  const { closedOn: _removed, ...rest } = line
  void _removed
  return rest
}

// Two readings of a line, field by field: figures typed over one are not written over another.
export function sameEntry(a: SnapshotEntry, b: SnapshotEntry): boolean {
  const fields = (e: SnapshotEntry) => e as Record<string, unknown>
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].every((key) => fields(a)[key] === fields(b)[key])
}

// The figures of the latest snapshot, and of the snapshots before it that carried the
// same figure forward without a break, field by field: correcting the latest alone
// would show the whole typo as a change between the last two snapshots. A field that
// was unknown (an average price never given) is no figure carried forward: only the
// latest snapshot gets it, so nothing earlier gains a value it never had.
export function correctFigures(snapshots: StoredSnapshot[], lineId: string, figures: Figures): Write[] {
  const latest = snapshots.at(-1)
  const last = latest && entryOf(latest.value, lineId)
  if (!last) throw new Error(`The latest snapshot does not hold ${lineId}`)
  if (last.kind !== figures.kind) throw new Error(`Line ${lineId} is not a ${figures.kind} line`)

  const corrected = new Map<number, SnapshotEntry>() // by snapshot index
  for (const field of FIELDS[figures.kind]) {
    const value = fieldOf(figures, field)
    const old = fieldOf(last, field)
    if (value === old) continue
    const oldest = old === null ? snapshots.length - 1 : 0
    for (let i = snapshots.length - 1; i >= oldest; i--) {
      const entry = entryOf(snapshots[i].value, lineId)
      if (!entry || fieldOf(entry, field) !== old) break
      corrected.set(i, { ...(corrected.get(i) ?? entry), [field]: value } as SnapshotEntry)
    }
  }

  return snapshots.flatMap((x, i): Write[] => {
    const entry = corrected.get(i)
    if (!entry) return []
    const entries = x.value.entries.map((e) => (e.lineId === lineId ? entry : e))
    return [{ kind: 'snapshot', id: x.id, value: { ...x.value, entries } }]
  })
}

export type PastCorrection = { writes: Write[]; others: number; latestToo: boolean } | { refused: 'erase' }

// The figures of a chosen relevé, and of its neighbours on both sides that held the same
// figure without a break, field by field, as correctFigures does for the latest. While an
// update is running (`latestLocked`), the latest relevé is the update's base: it is never
// written, the carrying forward stops before it. An unknown old field (null) is corrected
// in the chosen relevé only. On a past relevé, a known figure is never erased.
// `others`: the relevés written besides the chosen one. `latestToo`: the latest is one of them.
// The writes come farthest first, the chosen relevé last: a cut in between leaves the
// unwritten ones still next to the chosen one, so a redo finishes the same correction.
// On the latest relevé itself, this is correctFigures.
export function correctFiguresAt(
  snapshots: StoredSnapshot[],
  snapshotId: string,
  lineId: string,
  figures: Figures,
  options: { latestLocked: boolean },
): PastCorrection {
  const chosen = snapshots.findIndex((x) => x.id === snapshotId)
  if (chosen === -1) throw new Error(`No snapshot ${snapshotId}`)
  const latest = snapshots.length - 1
  if (chosen === latest) {
    if (options.latestLocked) throw new Error('The latest snapshot is locked by the update in progress')
    const writes = correctFigures(snapshots, lineId, figures)
    return { writes, others: Math.max(writes.length - 1, 0), latestToo: false }
  }

  const at = entryOf(snapshots[chosen].value, lineId)
  if (!at) throw new Error(`Snapshot ${snapshotId} does not hold ${lineId}`)
  if (at.kind !== figures.kind) throw new Error(`Line ${lineId} is not a ${figures.kind} line`)
  const fields = FIELDS[figures.kind]
  if (fields.some((field) => fieldOf(figures, field) === null && fieldOf(at, field) !== null)) return { refused: 'erase' }

  const last = options.latestLocked ? latest - 1 : latest
  const corrected = new Map<number, SnapshotEntry>() // by snapshot index
  const correct = (i: number, field: Field, value: number | null | undefined) => {
    const entry = corrected.get(i) ?? entryOf(snapshots[i].value, lineId)!
    corrected.set(i, { ...entry, [field]: value } as SnapshotEntry)
  }
  for (const field of fields) {
    const value = fieldOf(figures, field)
    const old = fieldOf(at, field)
    if (value === old) continue
    correct(chosen, field, value)
    if (old === null) continue
    for (const step of [-1, 1]) {
      for (let i = chosen + step; i >= 0 && i <= last; i += step) {
        const entry = entryOf(snapshots[i].value, lineId)
        if (!entry || fieldOf(entry, field) !== old) break
        correct(i, field, value)
      }
    }
  }

  const order = [...corrected.keys()].sort((a, b) => Math.abs(b - chosen) - Math.abs(a - chosen) || a - b)
  const writes = order.map((i): Write => {
    const x = snapshots[i]
    const entry = corrected.get(i)!
    const entries = x.value.entries.map((e) => (e.lineId === lineId ? entry : e))
    return { kind: 'snapshot', id: x.id, value: { ...x.value, entries } }
  })
  return { writes, others: Math.max(writes.length - 1, 0), latestToo: corrected.has(latest) }
}

// The days a line can be closed on: from the day after the first snapshot that holds
// it, to today. Null when there is none: the line never had a value, only a deletion fits.
export function closingBounds(
  snapshots: StoredSnapshot[],
  lineId: string,
  today: IsoDate,
): { earliest: IsoDate; latest: IsoDate } | null {
  const first = snapshots.find((x) => holds(x.value, lineId))
  if (!first) return null
  const earliest = addDays(first.value.takenOn, 1)
  return earliest > today ? null : { earliest, latest: today }
}

// A line closed on day D is in no snapshot taken that day or after.
const takenSince = (snapshots: StoredSnapshot[], lineId: string, on: IsoDate) =>
  snapshots.filter((x) => x.value.takenOn >= on && holds(x.value, lineId))

// How many snapshots a close on `on` rewrites. More than 0 asks for a confirmation.
export function closingRewrites(snapshots: StoredSnapshot[], lineId: string, on: IsoDate): number {
  return takenSince(snapshots, lineId, on).length
}

// Drops the line's entry and its arrival, and its account's contributions once no
// other line of that account is left in the snapshot. The rates stay.
function withoutLine(profile: Profile, snapshot: Snapshot, line: Line): Snapshot {
  const accountOf = new Map(profile.lines.map((l) => [l.id, l.accountId]))
  const entries = snapshot.entries.filter((e) => e.lineId !== line.id)
  const { [line.id]: _arrival, ...arrivals } = snapshot.arrivals
  void _arrival
  const accountLeft = entries.some((e) => accountOf.get(e.lineId) === line.accountId)
  const contributions = accountLeft
    ? snapshot.contributions
    : Object.fromEntries(Object.entries(snapshot.contributions).filter(([accountId]) => accountId !== line.accountId))
  return { ...snapshot, entries, contributions, arrivals }
}

// The snapshots taken on `on` or after that hold the line, oldest first, the latest
// last, without it. A snapshot is never left empty.
function closingWrites(profile: Profile, snapshots: StoredSnapshot[], line: Line, on: IsoDate): Planned {
  const writes: Write[] = []
  for (const x of takenSince(snapshots, line.id, on)) {
    const value = withoutLine(profile, x.value, line)
    if (value.entries.length === 0) return { refused: 'only-line' }
    writes.push({ kind: 'snapshot', id: x.id, value })
  }
  return { writes }
}

// The profile first, then the snapshots: a cut in between leaves a closing the fiche
// can finish (closingUnfinished). Asked again for the same day, it finishes that close
// itself. A loan keeps its link to a sold house, as in the update.
export function closeLine(profile: Profile, snapshots: StoredSnapshot[], lineId: string, on: IsoDate, today: IsoDate): Planned {
  const line = findLine(profile, lineId)
  if (line?.closedOn === on && closingUnfinished(profile, snapshots, lineId)) return finishClosing(profile, snapshots, lineId)
  // Checked first: an unknown line is held by no snapshot, and would otherwise read « too early ».
  if (!line || line.closedOn !== undefined) return { refused: 'not-held' }
  if (on > today) return { refused: 'in-the-future' }
  const bounds = closingBounds(snapshots, lineId, today)
  if (bounds === null || on < bounds.earliest) return { refused: 'too-early' }
  const planned = closingWrites(profile, snapshots, line, on)
  if ('refused' in planned) return planned
  const closed = mapLine(profile, lineId, (l) => ({ ...l, closedOn: on }))
  return { writes: [{ kind: 'profile', value: closed }, ...planned.writes] }
}

// Only a close no snapshot felt: after the latest one.
export function reopenLine(profile: Profile, snapshots: StoredSnapshot[], lineId: string): Planned {
  const closedOn = findLine(profile, lineId)?.closedOn
  const latest = snapshots.at(-1)
  if (closedOn === undefined || (latest !== undefined && closedOn <= latest.value.takenOn)) {
    return { refused: 'not-allowed' }
  }
  return { writes: [{ kind: 'profile', value: mapLine(profile, lineId, withoutClosedOn) }] }
}

// Closed, yet the latest snapshot, taken on its closing day or after, still holds it.
// The update never leaves this: the line it closes is not in the snapshot it saves,
// and that snapshot is the latest. So it is a close cut short.
export function closingUnfinished(profile: Profile, snapshots: StoredSnapshot[], lineId: string): boolean {
  const closedOn = findLine(profile, lineId)?.closedOn
  const latest = snapshots.at(-1)
  if (closedOn === undefined || latest === undefined) return false
  return holds(latest.value, lineId) && latest.value.takenOn >= closedOn
}

// « Terminer »: the snapshot writes of the close, for the line's own closing day.
export function finishClosing(profile: Profile, snapshots: StoredSnapshot[], lineId: string): Planned {
  const line = findLine(profile, lineId)
  const on = line?.closedOn
  if (line === undefined || on === undefined || !closingUnfinished(profile, snapshots, lineId)) {
    return { refused: 'not-allowed' }
  }
  return closingWrites(profile, snapshots, line, on)
}

// « Supprimer, saisi par erreur »: closed on its first snapshot's day, then removed from
// every snapshot, then from the profile. A cut after the close is a close cut short,
// that « Terminer » completes; a cut before the last write leaves a closed line no
// snapshot holds, invisible and harmless.
export function deleteLine(profile: Profile, snapshots: StoredSnapshot[], lineId: string): Planned {
  const line = findLine(profile, lineId)
  if (!line) return { refused: 'not-held' }

  const lines = profile.lines.filter((l) => l.id !== lineId)
  const accountLeft = lines.some((l) => l.accountId === line.accountId)
  const accounts = profile.accounts
    .filter((a) => accountLeft || a.id !== line.accountId)
    .map((a) => (a.financedLineId === lineId ? withoutFinanced(a) : a))
  const removed: Write = { kind: 'profile', value: { ...profile, accounts, lines } }

  const first = snapshots.find((x) => holds(x.value, lineId))
  if (!first) return { writes: [removed] } // no snapshot to rewrite, nothing to cut short
  const on = first.value.takenOn
  const planned = closingWrites(profile, snapshots, line, on)
  if ('refused' in planned) return planned
  const closed = mapLine(profile, lineId, (l) => ({ ...l, closedOn: on }))
  return { writes: [{ kind: 'profile', value: closed }, ...planned.writes, removed] }
}
