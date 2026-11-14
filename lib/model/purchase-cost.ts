// What a line in another currency cost, in euros, since it was bought
// (docs/superpowers/specs/2026-11-11-change-a-l-achat-design.md). The average purchase price is the one
// the person copies from the broker, in the line's currency; the rate of each purchase is the rate its
// snapshot kept. Pure: it reads the snapshots, writes nothing.
//
// Walking the snapshots in order, with the cost held in the currency and in euros:
// - the first: parts × average price, at the rate of that snapshot;
// - fewer parts: a sale, the cost in both moneys lowered by the share sold (the weighted average price,
//   the French rule for securities); the average rate does not move;
// - then what the cost in the currency gained (parts × average price, before and after): with more parts,
//   a purchase, at the rate of that snapshot; without, a correction, at the average rate of the line.
// A rate typed by the person stands for the whole cost; an average price said to be in euros is the cost.

import { toEuroCents } from './situation'
import type { Cents, Line, Snapshot } from './types'

export type PurchaseCost = {
  cost: Cents // in euro cents, unrounded
  perEuro: number | null // « 1 € = 1,20 $ »: what one euro was worth in the line's currency; null when in euros
  source: 'computed' | 'typed' | 'euros'
}

// Parts compared within a rounding of fractions: 0,1 + 0,2 is 0,3.
const more = (after: number, before: number) => after - before > 1e-9 * Math.max(1, Math.abs(before))
export const fewer = (after: number, before: number) => more(before, after)

// What a cost in the average price's money (hundredths) is in euro cents, rounded like a value: by the
// person's own word first (said in euros, or « 1 € = 1,20 $ »), as purchaseCost below; else at `fx`.
export function costToEuroCents(minorUnits: number, line: Line, fx: Snapshot['fx']): Cents {
  if (line.currency !== 'EUR' && line.purchase) {
    const minor = Math.round(minorUnits)
    return 'inEuros' in line.purchase ? minor : Math.round(minor / line.purchase.perEuro)
  }
  return toEuroCents(minorUnits, line, fx)
}

export function purchaseCost(line: Line, snapshots: readonly Snapshot[]): PurchaseCost | null {
  if (line.currency === 'EUR' || line.kind !== 'units') return null
  let units = 0
  let inCurrency = 0 // cents of the line's currency
  let inEuros = 0 // euro cents
  let seen = false
  for (const snapshot of snapshots) {
    const entry = snapshot.entries.find((e) => e.lineId === line.id)
    if (!entry || entry.kind !== 'units' || entry.averagePrice === null) continue
    const rate = snapshot.fx[line.currency]
    if (rate === undefined) return null
    const cost = entry.units * entry.averagePrice * 100
    if (!seen) {
      units = entry.units
      inCurrency = cost
      inEuros = cost * rate
      seen = true
      continue
    }
    if (fewer(entry.units, units)) {
      const kept = units > 0 ? entry.units / units : 0
      inCurrency *= kept
      inEuros *= kept
    }
    const added = cost - inCurrency
    const average = inCurrency > 0 ? inEuros / inCurrency : rate
    inEuros += added * (more(entry.units, units) ? rate : average)
    inCurrency = cost
    units = entry.units
  }
  if (!seen) return null
  if (line.purchase && 'inEuros' in line.purchase) return { cost: inCurrency, perEuro: null, source: 'euros' }
  if (line.purchase) return { cost: inCurrency / line.purchase.perEuro, perEuro: line.purchase.perEuro, source: 'typed' }
  return { cost: inEuros, perEuro: inEuros > 0 ? inCurrency / inEuros : null, source: 'computed' }
}
