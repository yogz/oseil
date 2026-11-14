// Which titles have no purchase price: one rule for the markets page, « À compléter » and the bank
// update. Pure: no React, no database.

import { categoryOf } from '@/lib/model/situation'
import type { Profile, Snapshot } from '@/lib/model/types'

// The titles of « Placements en bourse » whose purchase price is missing in this snapshot: the units
// lines with no average price, or with a cost of zero (0 units, or an average price of 0), which leaves
// no percent to give. Such a line is counted « sans prix » and says « prix d’achat manquant », like a
// line with no price (decided on review, 10 November 2026: one rule, no third kind of line). The same
// rule finds the gaps of « À compléter » (lib/screens/to-complete.ts). A markets amount line is « sans
// prix » on the page too, but it is left out of this list: it can never take a purchase price.
export function missingPurchasePrice(profile: Profile, snapshot: Snapshot): string[] {
  const lines = new Map(profile.lines.map((l) => [l.id, l]))
  const accounts = new Map(profile.accounts.map((a) => [a.id, a]))
  return snapshot.entries
    .filter((entry) => {
      const line = lines.get(entry.lineId)
      const account = line && accounts.get(line.accountId)
      if (!line || !account || entry.kind !== 'units' || categoryOf(line, account) !== 'markets') return false
      return entry.averagePrice === null || entry.units * entry.averagePrice <= 0
    })
    .map((entry) => entry.lineId)
}

// The purchase prices still to give: `missingPurchasePrice`, less the closed lines and those answered
// « Je ne sais pas » (a price typed wins over that answer, which only hides the gap). The purchase gap
// of « À compléter », the row of the markets page and the words of the bank update all read it.
export function purchaseGaps(profile: Profile, snapshot: Snapshot): string[] {
  const lines = new Map(profile.lines.map((l) => [l.id, l]))
  return missingPurchasePrice(profile, snapshot).filter((id) => {
    const line = lines.get(id)
    return line !== undefined && line.closedOn === undefined && !line.purchaseUnknown
  })
}
