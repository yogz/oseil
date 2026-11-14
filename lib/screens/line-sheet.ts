// What the fiche of one line shows, as words and figures. Pure: no React, no database.

import { categoryDetailView } from '@/lib/screens/category-detail'
import type { Model } from '@/lib/app/use-model'
import { ACCOUNT_TYPES, CATEGORIES, CURRENCIES, GROUP_LABELS, isRanged } from '@/lib/catalog'
import { accountTypeChoices, slowDecidedByType, lineSlow } from '@/lib/correct/account-changes'
import { placeChoices } from '@/lib/correct/profile-changes'
import { recountChoices, recountUnfinished } from '@/lib/correct/recount'
import { closingBounds, closingUnfinished, deleteLine } from '@/lib/correct/snapshot-changes'
import type { StoredSnapshot } from '@/lib/correct/types'
import { currencySymbol, formatDayMonth, formatEurosShown, formatPriceShown, formatRate, formatShortDayMonth, formatUnits } from '@/lib/format'
import { convertible, usablePrices, withPrices } from '@/lib/market/live'
import type { Market } from '@/lib/market/types'
import { lastKnownPrice } from '@/lib/market/words'
import { purchaseCost, type PurchaseCost } from '@/lib/model/purchase-cost'
import { categoryOf, entryValue } from '@/lib/model/situation'
import type { Account, CategoryId, CurrencyCode, GroupId, IsoDate, Line, Residence } from '@/lib/model/types'
import { chapterOf } from '@/lib/screens/chapters'
import { isStale } from '@/lib/update/draft'
import { loweredCategory } from '@/lib/screens/debts'
import {
  AMOUNT_LABEL,
  closeWord,
  DEBT_SENTENCE,
  GROUP_TYPE,
  GROUP_ZONE,
  HISTORY_HREF,
  HISTORY_LABEL,
  NO_HOME,
  NO_RATE_AMOUNT,
  OWED_LABEL,
  PURCHASE_COMPUTED,
  PURCHASE_EUROS,
  PURCHASE_IN_EUROS_VALUE,
  PURCHASE_TYPED,
  purchaseLabel,
  KIND_WORDS,
  UNITS_LABEL,
} from '@/lib/screens/line-words'
import { titleRows } from '@/lib/screens/titles'
import { lineGaps, type GapKind } from '@/lib/screens/to-complete'
import { whereWords } from '@/lib/screens/words'

// « À compléter » on the fiche: a gap this row could fill. `answered: false`, the gap is open and the
// « je ne sais pas » answer is offered; `answered: true`, the person said so, and can change it.
// Absent when there is no gap, answered or not (a real answer wins over the flag).
export type AnswerKind = Exclude<GapKind, 'ranging'>
export type SheetAnswer = { kind: AnswerKind; answered: boolean }

export type SheetRow =
  | { kind: 'name'; value: string }
  | { kind: 'figures'; label: string; value: string; answer?: SheetAnswer } // value: « au 8 nov. »
  | { kind: 'place'; value: string } // « PEA · BoursoBank », « Chez toi »
  | { kind: 'group'; label: string; value: string; group: GroupId } // « Zone » (markets) or « Type » (secured): only a ranged category
  | { kind: 'price'; following: boolean; answer?: SheetAnswer } // only for a line « Tes titres » lists
  | { kind: 'financed'; value: string; answer?: SheetAnswer } // the home line's name, or NO_HOME
  | { kind: 'unlock'; year: number | null; answer?: SheetAnswer } // only for an employee-savings account
  // Not for a home, a PER, employee savings or a loan: their type decides. `wholeAccount`: the account
  // has other open lines, so « Pour tout le compte » is offered.
  | { kind: 'slow'; slow: boolean; wholeAccount: boolean }
  | { kind: 'category'; category: CategoryId; value: string } // any line but a loan's and a home's
  | { kind: 'counted'; value: string } // « parts · $ »: not for a loan or a home
  | { kind: 'accountType'; value: string } // only when another type would take all its lines
  | { kind: 'bank'; value: string } // the account moves whole; not for a home
  | { kind: 'residence'; residence: Residence } // only for a home; absent on the account reads 'main'
  // Only a line in parts in another currency with a purchase price: the rate of its purchases
  // (docs/superpowers/specs/2026-11-11-change-a-l-achat-design.md).
  | {
      kind: 'purchase'
      label: string // « Le dollar à l’achat »
      value: string
      note: string
      source: PurchaseCost['source']
      perEuro: number | null
      currency: CurrencyCode
      words: string // « dollars américains »
    }

export type LineSheetView = {
  lineId: string
  category: CategoryId | null // null for a loan
  back: { href: string; label: string }
  name: string
  where: string
  amount: string | null // null: no rate converts it, said by amountNote
  amountNote: string | null
  debt: string | null // « 260 000 € dont 80 000 € dus à la banque », for a line a loan finances
  detail: string
  loanAtHome: boolean
  state:
    | { kind: 'open' }
    | { kind: 'closed'; on: string }
    | { kind: 'closing-unfinished'; on: string }
    | { kind: 'recount-unfinished' } // a snapshot holds it in another kind: « Terminer »
  rows: SheetRow[] // « Cette ligne »; empty unless state is open
  accountTitle: string | null // « PEA · BoursoBank », over « Son compte »; null when it has no row
  accountRows: SheetRow[] // « Son compte »: its type, its bank, the year it unlocks
  close: { label: string; possible: boolean }
  canDelete: boolean // false: the only entry of a snapshot
  locked: 'update-running' | 'unreadable' | null
  // « Ses relevés précédents › »: only when an older relevé holds this line; offered even locked,
  // since a past relevé can be corrected during an update.
  history: { href: string; label: string } | null
}

const backTo = (category: CategoryId) => ({ href: `/categorie/${category}`, label: CATEGORIES[category].label })

// `market`: today's prices, when the browser has them: the same overlay as the category detail.
export function lineSheetView(model: Model, lineId: string, today: IsoDate, market: Market | null): LineSheetView | null {
  if (model.profile === null || model.snapshots.length === 0) return null
  const profile = model.profile.value
  const latest = model.snapshots[model.snapshots.length - 1]
  const saved = latest.value
  const savedEntry = saved.entries.find((e) => e.lineId === lineId)
  if (!savedEntry) return null
  const line = profile.lines.find((l) => l.id === lineId)
  const account = line && profile.accounts.find((a) => a.id === line.accountId)
  const establishment = account && profile.establishments.find((e) => e.id === account.establishmentId)
  if (!line || !account || !establishment) return null

  const isLoan = account.type === 'loan'
  const stored: StoredSnapshot[] = model.snapshots.map((s) => ({ id: s.id, value: s.value }))
  // A recount cut short leaves snapshots that disagree with the line: nothing is computed on them.
  const unfinished = recountUnfinished(profile, stored, lineId)
  const { prices } = market && !unfinished ? usablePrices(profile, saved, market, today) : { prices: {} }
  const { snapshot } = convertible(profile, withPrices(saved, prices))
  const entry = snapshot.entries.find((e) => e.lineId === lineId)
  const day = formatDayMonth(saved.takenOn, today)

  // A loan's amount is what is owed, positive, never in red.
  const gross = entry && !unfinished ? entryValue(entry, line, snapshot.fx) : null
  const amountNote = entry || unfinished ? null : NO_RATE_AMOUNT

  // A line a loan finances: its figure at the top is the one the category detail gives it, what its
  // squares are worth, its value less the loan, the same everywhere. The fiche then says what the
  // whole is and what is owed on it, in the detail's words, the loans of this same snapshot only.
  // « dont » only when the debt fits in it, as in the detail.
  const owed = snapshot.entries.reduce((sum, e) => {
    const loanLine = profile.lines.find((l) => l.id === e.lineId)
    const loan = loanLine && profile.accounts.find((a) => a.id === loanLine.accountId)
    return loanLine && loan?.type === 'loan' && loan.financedLineId === lineId ? sum + entryValue(e, loanLine, snapshot.fx) : sum
  }, 0)
  const amount = gross === null ? null : formatEurosShown(owed > 0 ? gross - owed : gross)
  const debt = gross !== null && owed > 0 && owed <= gross ? DEBT_SENTENCE(formatEurosShown(gross), formatEurosShown(owed)) : null

  const financed = isLoan && account.financedLineId ? profile.lines.find((l) => l.id === account.financedLineId) : undefined

  const parts: string[] = []
  if (isLoan) parts.push('reste à rembourser')
  else if (savedEntry.kind === 'units' && !unfinished) {
    parts.push(`${formatUnits(savedEntry.units)} ${savedEntry.units > 1 ? 'parts' : 'part'}`)
    const price = formatPriceShown(entry?.kind === 'units' ? entry.unitPrice : savedEntry.unitPrice, line.currency)
    // Only a price taken today is « du jour »; any other is the snapshot's own.
    parts.push(Object.hasOwn(prices, line.id) ? `prix du jour ${price}` : lastKnownPrice(price, day))
  }
  parts.push(`relevé du ${day}`)

  const closedOn = line.closedOn
  const state: LineSheetView['state'] = unfinished
    ? { kind: 'recount-unfinished' }
    : closingUnfinished(profile, stored, lineId)
    ? { kind: 'closing-unfinished', on: formatDayMonth(closedOn!, today) }
    : closedOn !== undefined
      ? { kind: 'closed', on: formatDayMonth(closedOn, today) }
      : { kind: 'open' }

  const rows: SheetRow[] = []
  const accountRows: SheetRow[] = []
  const typeLabel = account.type === 'other' ? account.name : ACCOUNT_TYPES[account.type].label
  if (state.kind === 'open') {
    const answers = answersOf(model, lineId, line, account)
    const answer = (kind: AnswerKind) => (answers[kind] ? { answer: answers[kind] } : {})
    const label = isLoan ? OWED_LABEL : line.kind === 'units' ? UNITS_LABEL : AMOUNT_LABEL
    rows.push({ kind: 'name', value: line.name })
    rows.push({ kind: 'figures', label, value: `au ${formatShortDayMonth(saved.takenOn)}`, ...answer('purchase') })
    const own = categoryOf(line, account)
    if (own !== null && placeChoices(profile, lineId).category) {
      rows.push({ kind: 'category', category: own, value: CATEGORIES[own].label })
    }
    if (own !== null && isRanged(own)) {
      const chapter = chapterOf(line, account, own)
      const group: GroupId = chapter === null ? 'unknown' : (chapter as GroupId)
      rows.push({ kind: 'group', label: own === 'markets' ? GROUP_ZONE : GROUP_TYPE, value: GROUP_LABELS[group], group })
    }
    // A line among others of its account goes to another account; an account alone moves by its bank.
    // Its account's name only: its bank is said beside « Son compte ».
    if (placeChoices(profile, lineId).moves === 'line') rows.push({ kind: 'place', value: account.name })
    if (account.type === 'home') rows.push({ kind: 'residence', residence: account.residence ?? 'main' })
    if (!slowDecidedByType(account.type)) {
      const others = profile.lines.some((l) => l.accountId === account.id && l.id !== lineId && l.closedOn === undefined)
      rows.push({ kind: 'slow', slow: lineSlow(line, account), wholeAccount: others })
    }
    if (recountChoices(profile, lineId)) {
      rows.push({ kind: 'counted', value: `${KIND_WORDS[line.kind]} · ${currencySymbol(line.currency)}` })
    }
    const followable = titleRows(profile, undefined).find((row) => row.lineId === lineId)
    if (followable) rows.push({ kind: 'price', following: followable.symbol !== null, ...answer('quote') })
    if (isLoan) rows.push({ kind: 'financed', value: financed?.name ?? NO_HOME, ...answer('loan') })
    if (accountTypeChoices(profile, account.id).length > 0) accountRows.push({ kind: 'accountType', value: typeLabel })
    if (account.type === 'employee-savings') {
      accountRows.push({ kind: 'unlock', year: account.unlockOn ? Number(account.unlockOn.slice(0, 4)) : null, ...answer('unlock') })
    }
    if (account.type !== 'home') accountRows.push({ kind: 'bank', value: establishment.name })
    const paid = purchaseCost(line, model.snapshots.map((s) => s.value))
    if (paid) {
      rows.push({
        kind: 'purchase',
        label: purchaseLabel(line.currency),
        value:
          paid.perEuro === null
            ? PURCHASE_IN_EUROS_VALUE
            : `1\u00A0€\u00A0=\u00A0${formatRate(paid.perEuro, true)}\u00A0${currencySymbol(line.currency)}`,
        note: paid.source === 'computed' ? PURCHASE_COMPUTED : paid.source === 'typed' ? PURCHASE_TYPED : PURCHASE_EUROS,
        source: paid.source,
        perEuro: paid.perEuro,
        currency: line.currency,
        words: CURRENCIES.find((c) => c.code === line.currency)?.words ?? line.currency,
      })
    }
  }

  const unreadable = model.unreadable.profile > 0 || model.unreadable.snapshots > 0
  const draftRunning = model.unreadable.draft > 0 || (model.draft !== null && !isStale(model.draft.value, latest.id))
  const deletion = deleteLine(profile, stored, lineId)

  const category = categoryOf(line, account)
  const where = whereWords(line, account, establishment)
  return {
    lineId,
    category,
    // A loan goes back to the detail that lists it: the category it lowers, on the same snapshot.
    back: backTo(category ?? loweredCategory(profile, snapshot, account)),
    name: listTitle(model, category, lineId, today, market) ?? line.name,
    where: financed ? `${where} · il finance « ${financed.name} »` : where,
    amount,
    amountNote,
    debt,
    detail: parts.join(' · '),
    loanAtHome: isLoan && establishment.kind === 'home',
    state,
    rows,
    accountTitle: accountRows.length > 0 ? `${typeLabel} · ${establishment.name}` : null,
    accountRows,
    close: {
      label: closeWord(account.type),
      possible: closingBounds(stored, lineId, today) !== null,
    },
    canDelete: !('refused' in deletion && deletion.refused === 'only-line'),
    locked: unreadable ? 'unreadable' : draftRunning ? 'update-running' : null,
    history:
      model.snapshots.filter((s) => s.value.entries.some((e) => e.lineId === lineId)).length > 1
        ? { href: HISTORY_HREF, label: HISTORY_LABEL }
        : null,
  }
}

// The answers this fiche offers. A flag only hides a gap (lineGaps leaves it out), so the gaps are
// read twice: as they are, and with this line's and its account's flags taken off. A gap of the second
// reading is the row's subject; it is answered when the first one no longer has it.
function answersOf(model: Model, lineId: string, line: Line, account: Account): Partial<Record<AnswerKind, SheetAnswer>> {
  const profile = model.profile!.value
  const bareLine: Line = { ...line }
  delete bareLine.purchaseUnknown
  delete bareLine.unquoted
  const bareAccount: Account = { ...account }
  delete bareAccount.unlockUnknown
  delete bareAccount.noHome
  const bare: Model = {
    ...model,
    profile: {
      ...model.profile!,
      value: {
        ...profile,
        lines: profile.lines.map((l) => (l.id === lineId ? bareLine : l)),
        accounts: profile.accounts.map((a) => (a.id === account.id ? bareAccount : a)),
      },
    },
  }
  const open = new Set(lineGaps(model, lineId))
  const answers: Partial<Record<AnswerKind, SheetAnswer>> = {}
  for (const kind of lineGaps(bare, lineId)) if (kind !== 'ranging') answers[kind] = { kind, answered: !open.has(kind) }
  return answers
}

// The title its category's list gives it (« BoursoBank » for a current account there): the fiche opens on the
// same words that were touched (UI pass, 12 November 2026). Its own name stays in « Son nom ».
function listTitle(model: Model, category: CategoryId | null, lineId: string, today: IsoDate, market: Market | null): string | null {
  if (category === null) return null
  const view = categoryDetailView(model, category, today, market)
  if (!view) return null
  const all = [...(view.chapters?.flatMap((c) => c.lines) ?? []), ...view.lines, ...view.tooSmall, ...view.outOfGrid]
  return all.find((l) => l.lineId === lineId)?.name ?? null
}

