// « Tes titres »: the lines already entered that can follow a quote, and the two changes the
// screen makes to the profile. Pure: no React, no database. Every function returns a new object.

import { canFollowPrice, CATEGORIES, CATEGORY_ORDER } from '@/lib/catalog'
import { formatPrice } from '@/lib/format'
import { SYMBOL } from '@/lib/market/types'
import type { AccountTypeId, Profile, Snapshot } from '@/lib/model/types'
import { whereWords } from '@/lib/screens/words'
import { steps } from '@/lib/setup/first-launch'

export type TitleRow = {
  lineId: string
  name: string
  // What « Le retrouver » opens with (C16): the line's name when it says more than its account's
  // (« Amundi World » in « PEA »); empty when it only repeats it, since « PEA » names no title.
  searchText: string
  where: string
  symbol: string | null
  lastPrice: string | null
  accountType: AccountTypeId // what its search shows: coins for a crypto account, titles otherwise
}

// The open units lines of an account Yahoo can price (no gold), establishment by
// establishment in the order of the steps, then in profile order.
export function titleRows(profile: Profile, latest: Snapshot | undefined): TitleRow[] {
  const rows: TitleRow[] = []
  for (const establishment of steps(profile)) {
    for (const account of profile.accounts) {
      if (account.establishmentId !== establishment.id || !canFollowPrice(account.type)) continue
      for (const line of profile.lines) {
        if (line.accountId !== account.id || line.kind !== 'units' || line.closedOn !== undefined) continue
        const entry = latest?.entries.find((e) => e.lineId === line.id)
        rows.push({
          lineId: line.id,
          name: line.name,
          searchText: sameName(line.name, account.name) ? '' : line.name.trim(),
          where: whereWords(line, account, establishment),
          symbol: line.quoteSymbol ?? null,
          lastPrice: entry?.kind === 'units' ? formatPrice(entry.unitPrice, line.currency) : null,
          accountType: account.type,
        })
      }
    }
  }
  return rows
}

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase('fr') === b.trim().toLocaleLowerCase('fr')

function followable(profile: Profile, lineId: string): void {
  // The latest snapshot only fills `lastPrice`: which lines are listed does not depend on it.
  if (!titleRows(profile, undefined).some((row) => row.lineId === lineId)) {
    throw new Error('this line cannot follow a price')
  }
}

export function attachSymbol(profile: Profile, lineId: string, symbol: string): Profile {
  followable(profile, lineId)
  if (!SYMBOL.test(symbol)) throw new Error('not a quote symbol')
  return { ...profile, lines: profile.lines.map((l) => (l.id === lineId ? { ...l, quoteSymbol: symbol } : l)) }
}

export function detachSymbol(profile: Profile, lineId: string): Profile {
  followable(profile, lineId)
  return {
    ...profile,
    lines: profile.lines.map((l) => {
      if (l.id !== lineId) return l
      const { quoteSymbol: _removed, ...rest } = l
      void _removed
      return rest
    }),
  }
}

export function couldFollow(profile: Profile, latest: Snapshot | undefined): { following: number; possible: number } {
  const rows = titleRows(profile, latest)
  return { following: rows.filter((r) => r.symbol !== null).length, possible: rows.length }
}

// « Tes titres » opens from three places (Mon argent, a category, a line's fiche); its way back goes
// to the one it was opened from, and carries its name: « ‹ Placements en bourse ».
export type TitlesBack = { href: string; label: string }
const FROM_MON_ARGENT: TitlesBack = { href: '/', label: 'Mon argent' }

export const titlesFromCategory = (category: string) => `/titres?depuis=categorie/${category}`
export const titlesFromLine = (lineId: string) => `/titres?depuis=ligne/${encodeURIComponent(lineId)}`

// `from` is the `depuis` of the address: anything that is not a category or a line of this profile
// falls back to Mon argent, so an address typed by hand leads nowhere strange.
export function titlesBack(from: string | null, profile: Profile | null): TitlesBack {
  const [kind, ...rest] = (from ?? '').split('/')
  const id = rest.join('/')
  if (kind === 'categorie') {
    const category = CATEGORY_ORDER.find((c) => c === id)
    if (category) return { href: `/categorie/${category}`, label: CATEGORIES[category].label }
  }
  if (kind === 'ligne') {
    const found = profile?.lines.find((l) => l.id === id)
    if (found) return { href: `/ligne/${encodeURIComponent(found.id)}`, label: found.name }
  }
  return FROM_MON_ARGENT
}
