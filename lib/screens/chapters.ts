// The chapters of a category's detail: a line sits in one, by its group (ranged categories)
// or by the type of its account (the others). Pure: no React, no database.

import { GROUP_LABELS, RANGED_GROUPS, isRanged } from '@/lib/catalog'
import type { PocketId } from '@/lib/model/situation'
import type { Account, AccountTypeId, CategoryId, GroupId, Line } from '@/lib/model/types'

// The two pockets of Immobilier are its chapters, once the person has a rental (category-detail.ts).
export type ChapterId = GroupId | 'current-accounts' | 'savings-books' | 'gold-metal' | 'crypto' | 'other' | PocketId

// Said under « Fonds monde » in « Placements en bourse » (spec 2026-11-10): a fact with its source and date.
export const WORLD_FUND_NOTE = 'Un fonds qui suit l’indice MSCI World place environ 7\u00A0euros sur 10 aux États-Unis (fiche MSCI du 30\u00A0septembre 2026).'

export const CHAPTER_LABELS: Record<ChapterId, string> = {
  ...GROUP_LABELS,
  'current-accounts': 'Comptes courants',
  'savings-books': 'Livrets',
  'gold-metal': 'Or',
  crypto: 'Crypto',
  other: 'Autres',
  'chez-toi': 'Pour y vivre',
  location: 'En location',
}

const SAVINGS_BOOKS: readonly AccountTypeId[] = ['livret-a', 'ldds', 'lep', 'livret-jeune', 'pel-cel', 'other-savings']

export function chapterOf(line: Line, account: Account, category: CategoryId): ChapterId | null {
  if (category === 'property') return null
  if (isRanged(category)) {
    // A line can keep a group that no longer fits its category (it moved): it then reads as unknown.
    const groups: readonly GroupId[] = RANGED_GROUPS[category]
    return line.group !== undefined && groups.includes(line.group) ? line.group : 'unknown'
  }
  if (account.type === 'current') return 'current-accounts'
  if (SAVINGS_BOOKS.includes(account.type)) return 'savings-books'
  if (account.type === 'gold') return 'gold-metal'
  if (account.type === 'crypto') return 'crypto'
  return 'other'
}
