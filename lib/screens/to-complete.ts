// « À compléter »: the answers that would make the Repères more exact, one row per subject
// (docs/superpowers/specs/2026-11-12-a-completer-design.md, « Les trous »). Pure: no React, no database.
// Each gap reuses the rule of the screen that already finds it; this file only gathers and ranks them.

import type { Model } from '@/lib/app/use-model'
import { RANGED_GROUPS, type RangedCategory } from '@/lib/catalog'
import { entryValue, EntryKindError, MissingRateError } from '@/lib/model/situation'
import type { Account, CategoryId, Cents, IsoDate, Line, Profile, Snapshot } from '@/lib/model/types'
import { purchaseGaps } from '@/lib/model/purchase-gaps'
import { rangingView } from '@/lib/screens/ranging'
import { titlesToFind, TITLES_FROM_REPERES } from '@/lib/screens/titles'
import {
  LOAN_WHY,
  loanWhat,
  PURCHASE_WHY,
  purchaseWhat,
  quoteWhat,
  quoteWhy,
  rangingWhat,
  rangingWhy,
  UNLOCK_WHY,
  unlockWhat,
} from '@/lib/screens/to-complete-words'

// In this order at equal amounts, the order of the spec.
export const GAP_KINDS = ['purchase', 'quote', 'ranging', 'unlock', 'loan'] as const
export type GapKind = (typeof GAP_KINDS)[number]

export type ToCompleteItem = {
  kind: GapKind
  what: string
  why: string
  href: string
  weight: number // cents, for ordering only: never shown
  category?: CategoryId
  lineIds: string[]
}

const sheetOf = (lineId: string) => `/ligne/${encodeURIComponent(lineId)}`
const isOpen = (line: Line) => line.closedOn === undefined

// What a line holds in the latest snapshot, in euro cents. A line missing from it, or that no rate
// converts, weighs nothing: the weight only orders the rows.
function valueOf(profile: Profile, snapshot: Snapshot, lineId: string): Cents {
  const line = profile.lines.find((l) => l.id === lineId)
  const entry = snapshot.entries.find((e) => e.lineId === lineId)
  if (!line || !entry) return 0
  try {
    return entryValue(entry, line, snapshot.fx)
  } catch (error) {
    if (error instanceof MissingRateError || error instanceof EntryKindError) return 0
    throw error
  }
}

function gapsOf(model: Model): ToCompleteItem[] {
  if (model.profile === null || model.snapshots.length === 0) return []
  const profile = model.profile.value
  const latest = model.snapshots[model.snapshots.length - 1].value
  const sum = (lineIds: string[]) => lineIds.reduce((total, id) => total + valueOf(profile, latest, id), 0)
  const openLinesOf = (account: Account) => profile.lines.filter((l) => l.accountId === account.id && isOpen(l)).map((l) => l.id)
  const items: ToCompleteItem[] = []

  // 1. Titles with no purchase price: a price typed wins over « Je ne sais pas », which only hides the gap.
  const noPrice = purchaseGaps(profile, latest)
  if (noPrice.length > 0) {
    items.push({
      kind: 'purchase',
      what: purchaseWhat(noPrice.length),
      why: PURCHASE_WHY,
      href: noPrice.length === 1 ? sheetOf(noPrice[0]) : '/categorie/markets',
      weight: sum(noPrice),
      category: 'markets',
      lineIds: noPrice,
    })
  }

  // 2. Titles that do not follow their price: exactly those /titres lists under « À retrouver ».
  const unfollowed = titlesToFind(profile, latest).map((row) => row.lineId)
  if (unfollowed.length > 0) {
    items.push({
      kind: 'quote',
      what: quoteWhat(unfollowed.length),
      why: quoteWhy(unfollowed.length),
      href: TITLES_FROM_REPERES,
      weight: sum(unfollowed),
      lineIds: unfollowed,
    })
  }

  // 3. Lines never ranged: those the ranging screen has to propose a group for (`reason` set); a stored
  // group, « Je ne sais pas » included, has none.
  for (const category of Object.keys(RANGED_GROUPS) as RangedCategory[]) {
    const never = rangingView(profile, category).rows.filter((row) => row.reason !== null).map((row) => row.lineId)
    if (never.length === 0) continue
    items.push({
      kind: 'ranging',
      what: rangingWhat(category, never.length),
      why: rangingWhy(category),
      href: `/categorie/${category}/ranger`,
      weight: sum(never),
      category,
      lineIds: never,
    })
  }

  // 4. Employee savings with no unlock date, and something in it. A PER has none to give.
  for (const account of profile.accounts) {
    if (account.type !== 'employee-savings' || account.unlockOn !== undefined || account.unlockUnknown) continue
    const open = openLinesOf(account)
    const weight = sum(open)
    if (open.length === 0 || weight === 0) continue
    items.push({ kind: 'unlock', what: unlockWhat(account.name), why: UNLOCK_WHY, href: sheetOf(open[0]), weight, lineIds: open })
  }

  // 5. Loans linked to no home, only when the profile has a home to link them to: a car loan finances none.
  const hasHome = profile.accounts.some((a) => a.type === 'home' && openLinesOf(a).length > 0)
  if (hasHome) {
    for (const account of profile.accounts) {
      if (account.type !== 'loan' || account.financedLineId !== undefined || account.noHome) continue
      const open = openLinesOf(account)
      if (open.length === 0) continue
      items.push({ kind: 'loan', what: loanWhat(account.name), why: LOAN_WHY, href: sheetOf(open[0]), weight: sum(open), lineIds: open })
    }
  }

  return items
}

// The gaps, the biggest amount first; at equal amounts, in the order of GAP_KINDS (stable sort).
// `today` is part of the signature of every view; no gap depends on the day yet.
export function toComplete(model: Model, today: IsoDate): ToCompleteItem[] {
  void today
  return gapsOf(model).sort((a, b) => b.weight - a.weight || GAP_KINDS.indexOf(a.kind) - GAP_KINDS.indexOf(b.kind))
}

// The open gaps that concern this line, or its account (for the line's sheet).
export function lineGaps(model: Model, lineId: string): GapKind[] {
  const concerned = new Set(gapsOf(model).filter((item) => item.lineIds.includes(lineId)).map((item) => item.kind))
  return GAP_KINDS.filter((kind) => concerned.has(kind))
}
