// Which category a loan lowers, read from one place by Mon argent, the category detail and the
// fiche of a line. Pure: no React, no database.

import { categoryOf, entryValue } from '@/lib/model/situation'
import type { Account, CategoryId, Cents, Profile, Snapshot } from '@/lib/model/types'

// The rule of computeSituation: the category of the line the loan finances when the snapshot holds
// that line, the available money otherwise. `snapshot` is the one the figures come from: today's
// prices on the last saved snapshot, a line no rate converts left out (as `convertible` does).
export function loweredCategory(profile: Profile, snapshot: Snapshot, loan: Account): CategoryId {
  const financed = profile.lines.find((l) => l.id === loan.financedLineId)
  const account = financed && profile.accounts.find((a) => a.id === financed.accountId)
  if (!financed || !account || !snapshot.entries.some((e) => e.lineId === financed.id)) return 'available'
  // A loan has no category: one that « finances » another loan lowers the available money.
  return categoryOf(financed, account) ?? 'available'
}

// The loans of the snapshot, each with the category it lowers and what it still owes.
export function debtsOf(profile: Profile, snapshot: Snapshot): Array<{ lineId: string; category: CategoryId; value: Cents }> {
  return snapshot.entries.flatMap((entry) => {
    const line = profile.lines.find((l) => l.id === entry.lineId)
    const account = line && profile.accounts.find((a) => a.id === line.accountId)
    if (!line || account?.type !== 'loan') return []
    return [{ lineId: line.id, category: loweredCategory(profile, snapshot, account), value: entryValue(entry, line, snapshot.fx) }]
  })
}
