// What a bank screen of the update writes, to check against the bank (« C’est bien ce
// que montre ta banque ? »): a line's value and an account's total, both in their own
// currency, as the bank shows them (« 1 200 $US »). They need no rate, so they never show
// 0 for a missing one and never throw while a screen draws. No React, no database here.

import { formatMoney } from '@/lib/format'
import type { LinePrices } from '@/lib/market/live'
import { entryMinorUnits } from '@/lib/model/situation'
import type { Cents, CurrencyCode, Line, Snapshot, SnapshotEntry, UpdateDraft } from '@/lib/model/types'
import { currentEntry, type UpdateLine } from './draft'

// One line's value in its own currency, written for a screen. Null for an entry not of
// its line's kind, which has no value to show.
export function ownValue(entry: SnapshotEntry, line: Line): string | null {
  return entry.kind === line.kind ? formatMoney(entryMinorUnits(entry), line.currency) : null
}

// The open lines' boxes added up, in hundredths of their one currency (decision 14). None
// when they hold several currencies, when one has no value yet (a total that leaves a line
// out would look right and be wrong), or when a value is not of its line's kind.
export function shownTotal(
  rows: UpdateLine[],
  base: Snapshot,
  draft: UpdateDraft,
  prices: LinePrices,
): { minor: Cents; currency: CurrencyCode } | null {
  const open = rows.filter((r) => !r.closed)
  if (open.length === 0) return null
  const { currency } = open[0].line
  let minor = 0
  for (const { line } of open) {
    if (line.currency !== currency) return null
    const entry = currentEntry(base, draft, line.id, prices)
    if (entry === null || entry.kind !== line.kind) return null
    minor += entryMinorUnits(entry)
  }
  return { minor, currency }
}
