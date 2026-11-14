// « Tes titres »: the lines already entered that can follow a quote, and the two changes the
// screen makes to the profile. Pure: no React, no database. Every function returns a new object.

import type { Model } from '@/lib/app/use-model'
import { canFollowPrice, CATEGORIES, CATEGORY_ORDER } from '@/lib/catalog'
import { formatPrice, formatPriceShown } from '@/lib/format'
import { isCurrent, priceIn } from '@/lib/market/live'
import { SYMBOL, type Market } from '@/lib/market/types'
import { categoryOf } from '@/lib/model/situation'
import type { AccountTypeId, CategoryId, CurrencyCode, IsoDate, Profile, Snapshot } from '@/lib/model/types'
import {
  about,
  ALL_IN_ORDER,
  CHANGE,
  followedSummary,
  STILL,
  toFindLead,
  UNQUOTED,
  unquotedSummary,
} from '@/lib/screens/titles-words'
import { FIND, NO_PRICE_FOR_NOW, whereWords } from '@/lib/screens/words'
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

// The titles that do not follow their price and were not said « Pas coté »: the quote gap of
// « À compléter » and the section « À retrouver » are this one list.
export function titlesToFind(profile: Profile, latest: Snapshot | undefined): TitleRow[] {
  const unquoted = new Set(profile.lines.filter((l) => l.unquoted).map((l) => l.id))
  return titleRows(profile, latest).filter((row) => row.symbol === null && !unquoted.has(row.lineId))
}

// What « Le retrouver » needs to open and confirm a pick: the line's currency and last price.
export type TitleToFind = TitleRow & {
  caption: string // « PEA chez BoursoBank · son prix ne bouge pas tout seul »
  currency: CurrencyCode
  lastValue: number | null // the price of the latest snapshot, to warn when a pick is far from it
  findLabel: string
  unquotedLabel: string
}

export function titleToFind(profile: Profile, latest: Snapshot | undefined, row: TitleRow): TitleToFind {
  const line = profile.lines.find((l) => l.id === row.lineId)!
  const entry = latest?.entries.find((e) => e.lineId === row.lineId)
  return {
    ...row,
    caption: `${row.where} · ${STILL}`,
    currency: line.currency,
    lastValue: entry?.kind === 'units' ? entry.unitPrice : null,
    findLabel: about(FIND, row.name),
    unquotedLabel: about(UNQUOTED, row.name),
  }
}

export type TitleState = 'followed' | 'unquoted' | 'to-find'
export type StripSquare = { lineId: string; state: TitleState; category: CategoryId }
export type FollowedTitle = { lineId: string; name: string; detail: string; href: string }
export type UnquotedTitle = { lineId: string; name: string; changeLabel: string }
type Folded<T> = { summary: string; rows: T[] } | null

export type TitlesPageView =
  | { kind: 'unreadable' }
  | { kind: 'none' } // no line could follow a price
  | {
      kind: 'titles'
      lead: string
      strip: StripSquare[]
      toFind: TitleToFind[]
      followed: Folded<FollowedTitle>
      unquoted: Folded<UnquotedTitle>
    }

// « Tes titres », the ones to find first. `market`: today's prices, 'loading' while they come, null
// when they could not be had. A followed title's price is the one of the day, or it says it is missing.
export function titlesPageView(model: Model, market: Market | 'loading' | null, today: IsoDate): TitlesPageView {
  if (model.profile === null) return { kind: 'unreadable' }
  const profile = model.profile.value
  const latest = model.snapshots[model.snapshots.length - 1]?.value
  const rows = titleRows(profile, latest)
  if (rows.length === 0) return { kind: 'none' }
  const toFindIds = new Set(titlesToFind(profile, latest).map((r) => r.lineId))
  const lineOf = (lineId: string) => profile.lines.find((l) => l.id === lineId)!
  const stateOf = (row: TitleRow): TitleState =>
    row.symbol !== null ? 'followed' : toFindIds.has(row.lineId) ? 'to-find' : 'unquoted'
  const categoryFor = (lineId: string): CategoryId => {
    const line = lineOf(lineId)
    const account = profile.accounts.find((a) => a.id === line.accountId)!
    return categoryOf(line, account) ?? 'markets'
  }
  const priceOf = (row: TitleRow): string => {
    if (market === 'loading') return '…'
    const quote = market?.quotes[row.symbol!]
    const currency = lineOf(row.lineId).currency
    const value = market && quote && isCurrent(quote, today) ? priceIn(quote, currency, market.rates) : null
    return value === null ? NO_PRICE_FOR_NOW : formatPriceShown(value, currency)
  }

  const followed = rows.filter((r) => stateOf(r) === 'followed')
  const unquoted = rows.filter((r) => stateOf(r) === 'unquoted')
  const toFind = rows.filter((r) => stateOf(r) === 'to-find')
  return {
    kind: 'titles',
    lead: toFind.length === 0 ? ALL_IN_ORDER : toFindLead(toFind.length),
    strip: [...followed, ...unquoted, ...toFind].map((r) => ({ lineId: r.lineId, state: stateOf(r), category: categoryFor(r.lineId) })),
    toFind: toFind.map((r) => titleToFind(profile, latest, r)),
    followed:
      followed.length === 0
        ? null
        : {
            summary: followedSummary(followed.length),
            rows: followed.map((r) => ({
              lineId: r.lineId,
              name: r.name,
              detail: `${r.where} · ${priceOf(r)}`,
              href: `/ligne/${encodeURIComponent(r.lineId)}`,
            })),
          },
    unquoted:
      unquoted.length === 0
        ? null
        : {
            summary: unquotedSummary(unquoted.length),
            rows: unquoted.map((r) => ({ lineId: r.lineId, name: r.name, changeLabel: about(CHANGE, r.name) })),
          },
  }
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
  return {
    ...profile,
    lines: profile.lines.map((l) => {
      if (l.id !== lineId) return l
      const { unquoted: _removed, ...rest } = l // a followed price answers « no quote »
      void _removed
      return { ...rest, quoteSymbol: symbol }
    }),
  }
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

// The symbols whose price the page asks for: the followed titles'.
export function titleSymbols(profile: Profile | null): string[] {
  return profile ? titleRows(profile, undefined).flatMap((row) => (row.symbol ? [row.symbol] : [])) : []
}

export function couldFollow(profile: Profile, latest: Snapshot | undefined): { following: number; possible: number } {
  const rows = titleRows(profile, latest)
  return { following: rows.filter((r) => r.symbol !== null).length, possible: rows.length }
}

// « Tes titres » opens from four places (Mon argent, a category, a line's fiche, the Repères' « À
// compléter »); its way back goes to the one it was opened from, and carries its name: « ‹ Placements en bourse ».
export type TitlesBack = { href: string; label: string }
const FROM_MON_ARGENT: TitlesBack = { href: '/', label: 'Mon argent' }
const FROM_REPERES: TitlesBack = { href: '/reperes', label: 'Repères' }

export const TITLES_FROM_REPERES = '/titres?depuis=reperes'
export const titlesFromCategory = (category: string) => `/titres?depuis=categorie/${category}`
export const titlesFromLine = (lineId: string) => `/titres?depuis=ligne/${encodeURIComponent(lineId)}`

// `from` is the `depuis` of the address: anything that is not a category or a line of this profile
// falls back to Mon argent, so an address typed by hand leads nowhere strange.
export function titlesBack(from: string | null, profile: Profile | null): TitlesBack {
  const [kind, ...rest] = (from ?? '').split('/')
  const id = rest.join('/')
  if (kind === 'reperes' && rest.length === 0) return FROM_REPERES
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
