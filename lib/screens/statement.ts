// The page of one relevé, and correcting one of its lines at that relevé
// (docs/superpowers/specs/2026-11-12-corriger-un-releve-design.md). Pure: no React, no database.
// The page reads the relevé exactly as « Tes relevés » does (readStatements): its total and its
// lines are the same lines, at that day's rates, without Chez toi when the setting applies.

import type { Model } from '@/lib/app/use-model'
import { ACCOUNT_TYPES, takesPaidTotal } from '@/lib/catalog'
import type { CorrectionState } from '@/lib/correct/save'
import { correctFiguresAt, setPaidTotalAt } from '@/lib/correct/snapshot-changes'
import type { Figures, Planned, StoredSnapshot } from '@/lib/correct/types'
import { formatEurosShown, formatMoneyShown, formatPriceShown, formatUnits } from '@/lib/format'
import { buildGrid } from '@/lib/model/squares'
import { categoryOf, entryValue } from '@/lib/model/situation'
import type {
  Account,
  AccountTypeId,
  Cents,
  CategoryId,
  CurrencyCode,
  IsoDate,
  Profile,
  Snapshot,
  SnapshotEntry,
} from '@/lib/model/types'
import { steps } from '@/lib/setup/first-launch'
import { isStale } from '@/lib/update/draft'
import { readStatements, withYear } from '@/lib/screens/evolution'
import {
  AMOUNT_LABEL,
  LOCKED_UNREADABLE,
  LOCKED_UPDATE,
  OWED_LABEL,
} from '@/lib/screens/line-words'
import {
  amountThatDay,
  amountTitle,
  averageThatDay,
  correctOn,
  ERASE_REFUSED,
  LOCKED_UPDATE_TOTAL,
  othersToo,
  owedTitle,
  paidTotalOn,
  priceThatDay,
  squareWas,
  STATEMENT_HISTORY,
  STATEMENT_LEAD,
  statementTitle,
  TODAY_CORRECTED,
  TODAY_GONE,
  todayUnchanged,
  unitsAt,
  UNITS_THAT_DAY,
  unitsTitle,
  UPDATE_STOPS,
} from '@/lib/screens/statement-words'

// After a correction, the correction screen goes back to the relevé's page with `?corrige=1`: it then
// says « Corrigé… » in place of its lead, once.
export const CORRECTED_PARAM = 'corrige'
export const correctedHref = (snapshotId: string) => `/releve/${snapshotId}?${CORRECTED_PARAM}=1`

export type StatementLine = { lineId: string; name: string; category: CategoryId | null; figure: string; href: string }
// « Total versé sur Assurance-vie »; `figure` null: none that day, the row says « à recopier » (TOTAL_TO_COPY).
export type StatementTotal = { accountId: string; label: string; figure: string | null; href: string }
export type StatementView =
  | { kind: 'none' }
  | {
      kind: 'ready'
      title: string // « Relevé du 16 novembre 2025 »
      total: string
      squareValue: string | null // « un carré valait 2 214 € »; null when that day had no grid
      lead: string
      banks: Array<{ name: string; lines: StatementLine[]; totals: StatementTotal[] }>
    }

// The accounts of a relevé that take a total paid in, as the update asks for one
// (paidTotalAccounts, lib/update/lines.ts): a contributions account, a cost-basis account with a
// line in amount that day, or one with a total on this relevé or on the relevé just before (`previous`,
// as the update keeps the box when its base had one). Only an account the relevé holds.
function totalsOf(
  profile: Profile,
  snapshot: Snapshot,
  previous: Snapshot | null,
  snapshotId: string,
  establishmentId: string,
): StatementTotal[] {
  return profile.accounts
    .filter((a) => a.establishmentId === establishmentId && takesPaidTotal(a.type))
    .flatMap((account): StatementTotal[] => {
      const ids = new Set(profile.lines.filter((l) => l.accountId === account.id).map((l) => l.id))
      const entries = snapshot.entries.filter((e) => ids.has(e.lineId))
      if (entries.length === 0) return []
      const total = snapshot.paidTotals?.[account.id]
      const asked =
        ACCOUNT_TYPES[account.type].change === 'contributions' ||
        entries.some((e) => e.kind === 'amount') ||
        total !== undefined ||
        previous?.paidTotals?.[account.id] !== undefined
      if (!asked) return []
      return [
        {
          accountId: account.id,
          label: paidTotalOn(account.name),
          figure: total === undefined ? null : formatEurosShown(total),
          href: `/releve/${snapshotId}/total/${account.id}`,
        },
      ]
    })
}

// The relevé as « Tes relevés » lists it, with the profile; null when the list leaves it out.
function listed(model: Model, snapshotId: string) {
  if (model.unreadable.profile > 0 || model.unreadable.snapshots > 0 || !model.profile) return null
  const profile = model.profile.value
  const item = readStatements(model, profile).items.find((i) => i.id === snapshotId)
  return item ? { profile, item } : null
}

// `today` is not read yet: a relevé's date is always said with its year.
export function statementView(model: Model, snapshotId: string, today: IsoDate): StatementView {
  void today
  const found = listed(model, snapshotId)
  if (!found) return { kind: 'none' }
  const { profile, item } = found
  const { snapshot, situation } = item
  const grid = buildGrid(situation)

  // The banks in the order of the update, each account and line in the profile's order (linesOf):
  // only the lines this relevé holds, a line closed since included.
  const banks = steps(profile).flatMap((establishment) => {
    const lines = profile.accounts
      .filter((a) => a.establishmentId === establishment.id)
      .flatMap((account) =>
        profile.lines
          .filter((l) => l.accountId === account.id)
          .flatMap((line): StatementLine[] => {
            const entry = snapshot.entries.find((e) => e.lineId === line.id)
            if (!entry) return []
            return [
              {
                lineId: line.id,
                name: line.name,
                category: categoryOf(line, account),
                figure: formatEurosShown(entryValue(entry, line, snapshot.fx)),
                href: `/releve/${snapshotId}/ligne/${line.id}`,
              },
            ]
          }),
      )
    // The totals are read on the relevé as stored: none belongs to Chez toi, which the list may leave out.
    const index = model.snapshots.findIndex((s) => s.id === snapshotId)
    const stored = model.snapshots[index].value
    const previous = index > 0 ? model.snapshots[index - 1].value : null
    return lines.length === 0
      ? []
      : [{ name: establishment.name, lines, totals: totalsOf(profile, stored, previous, snapshotId, establishment.id) }]
  })

  return {
    kind: 'ready',
    title: statementTitle(withYear(item.date)),
    total: formatEurosShown(situation.net),
    squareValue: grid.kind === 'grid' ? squareWas(formatEurosShown(Math.round(grid.squareValue))) : null,
    lead: STATEMENT_LEAD,
    banks,
  }
}

export type StatementLineView =
  | { kind: 'none' }
  | {
      kind: 'ready'
      snapshotId: string
      lineId: string
      back: { href: string; label: string } // « ‹ Relevé du 16 novembre 2025 »
      title: string // « Son montant au 16 novembre 2025 »
      // The field labels, said of that day; only those of the entry's kind are used.
      labels: { amount: string; units: string; price: string; average: string }
      submit: string // « Corriger le 16 novembre 2025 »
      history: string
      // The relevé's own entry, as stored (in its own kind and currency): the form opens on it.
      entry: SnapshotEntry
      currency: CurrencyCode
      accountType: AccountTypeId
      // The line at the latest relevé, before anything is typed; null on the latest relevé itself.
      // correctionPreview says it again once figures are typed (« Aujourd’hui aussi… »).
      today: string | null
      isLatest: boolean
      // The latest relevé is the update's base while one runs; an unreadable draft blocks everything.
      locked: { kind: 'update-running' | 'unreadable'; message: string } | null
    }

const stored = (model: Model): StoredSnapshot[] => model.snapshots.map((s) => ({ id: s.id, value: s.value }))

// While an update runs, its base is the latest relevé (UpdateDraft.basedOn).
const updateRunning = (model: Model) => {
  const latest = model.snapshots.at(-1)
  return model.draft !== null && latest !== undefined && !isStale(model.draft.value, latest.id)
}

// « Aujourd’hui : 43 913 €, inchangé »: the line's figure at the latest relevé, in its own currency.
function todaySentence(model: Model, lineId: string): string {
  const latest = model.snapshots.at(-1)!.value
  const entry = latest.entries.find((e) => e.lineId === lineId)
  const line = model.profile!.value.lines.find((l) => l.id === lineId)!
  // Closed after the latest relevé, it is still in it: closed is gone all the same.
  if (!entry || line.closedOn !== undefined) return TODAY_GONE
  const currency = line.currency
  if (entry.kind === 'amount') return todayUnchanged(formatMoneyShown(entry.amount, currency))
  return todayUnchanged(unitsAt(formatUnits(entry.units), entry.units > 1, formatPriceShown(entry.unitPrice, currency)))
}

export function statementLineView(model: Model, snapshotId: string, lineId: string, today: IsoDate): StatementLineView {
  const page = statementView(model, snapshotId, today)
  if (page.kind !== 'ready' || !page.banks.some((b) => b.lines.some((l) => l.lineId === lineId))) return { kind: 'none' }
  const profile = model.profile!.value
  const loaded = model.snapshots.find((s) => s.id === snapshotId)!
  const entry = loaded.value.entries.find((e) => e.lineId === lineId)!
  const line = profile.lines.find((l) => l.id === lineId)!
  const account = profile.accounts.find((a) => a.id === line.accountId)!
  const date = withYear(loaded.value.takenOn)
  const isLatest = model.snapshots.at(-1)!.id === snapshotId
  const isLoan = account.type === 'loan'

  return {
    kind: 'ready',
    snapshotId,
    lineId,
    back: { href: `/releve/${snapshotId}`, label: page.title },
    title: entry.kind === 'units' ? unitsTitle(date) : isLoan ? owedTitle(date) : amountTitle(date),
    labels: {
      amount: amountThatDay(isLoan ? OWED_LABEL : AMOUNT_LABEL, line.currency),
      units: UNITS_THAT_DAY,
      price: priceThatDay(line.currency),
      average: averageThatDay(line.currency),
    },
    submit: correctOn(date),
    history: STATEMENT_HISTORY,
    entry,
    currency: line.currency,
    accountType: account.type,
    today: isLatest ? null : todaySentence(model, lineId),
    isLatest,
    locked:
      model.unreadable.draft > 0
        ? { kind: 'unreadable', message: LOCKED_UNREADABLE }
        : isLatest && updateRunning(model)
          ? { kind: 'update-running', message: LOCKED_UPDATE }
          : null,
  }
}

export type CorrectionPreview =
  | { refused: 'erase' | 'locked' | 'unreadable'; message: string }
  | {
      others: number // the relevés corrected besides this one: what the save must find again
      latestToo: boolean // the latest relevé is one of them (« Aujourd’hui aussi… »): the save checks it too
      othersSentence: string | null // « Ce chiffre est le même dans 2 autres relevés : on les corrige aussi. »
      today: string | null // « Aujourd’hui : …, inchangé », or « Aujourd’hui aussi : … corrigé. »; null on the latest
      lockedNote: string | null // an update runs and the same figure would have reached the latest relevé
    }

// What the screen says of the figures typed, before saving: a dry run of the correction itself, so
// what is announced is what will be written. The latest relevé, while an update runs, is refused;
// an unreadable draft (perhaps an update) refuses every relevé.
export function correctionPreview(model: Model, snapshotId: string, lineId: string, figures: Figures): CorrectionPreview {
  if (model.unreadable.draft > 0) return { refused: 'unreadable', message: LOCKED_UNREADABLE }
  const snapshots = stored(model)
  const latestLocked = updateRunning(model)
  const isLatest = snapshots.at(-1)?.id === snapshotId
  if (isLatest && latestLocked) return { refused: 'locked', message: LOCKED_UPDATE }
  const result = correctFiguresAt(snapshots, snapshotId, lineId, figures, { latestLocked })
  if ('refused' in result) return { refused: 'erase', message: ERASE_REFUSED }
  // Unlocked, would the same figure have reached the latest relevé?
  const wouldReach =
    latestLocked && !isLatest && (() => {
      const free = correctFiguresAt(snapshots, snapshotId, lineId, figures, { latestLocked: false })
      return !('refused' in free) && free.latestToo
    })()
  return {
    others: result.others,
    latestToo: result.latestToo,
    othersSentence: result.others === 0 ? null : othersToo(result.others),
    today: isLatest ? null : result.latestToo ? TODAY_CORRECTED : todaySentence(model, lineId),
    lockedNote: wouldReach ? UPDATE_STOPS : null,
  }
}

export type StatementTotalView =
  | { kind: 'none' }
  | {
      kind: 'ready'
      snapshotId: string
      account: Account
      back: { href: string; label: string } // « ‹ Relevé du 16 novembre 2025 »
      title: string // « Total versé sur Assurance-vie »
      // The total of the relevé just before this one, recalled under the box; null when none was typed.
      previous: { total: Cents; on: IsoDate } | null
      // This relevé's own total, as stored: the box opens on it, and the save checks it is still there.
      current: Cents | null
      isLatest: boolean
      locked: { kind: 'update-running' | 'unreadable'; message: string } | null
    }

// Copying or correcting the total paid in on an account at one relevé (planche 10D): only an account
// the relevé's page shows a row for.
export function statementTotalView(model: Model, snapshotId: string, accountId: string, today: IsoDate): StatementTotalView {
  const page = statementView(model, snapshotId, today)
  if (page.kind !== 'ready' || !page.banks.some((b) => b.totals.some((t) => t.accountId === accountId))) return { kind: 'none' }
  const account = model.profile!.value.accounts.find((a) => a.id === accountId)!
  const index = model.snapshots.findIndex((s) => s.id === snapshotId)
  const before = index > 0 ? model.snapshots[index - 1].value : null
  const previousTotal = before?.paidTotals?.[accountId]
  const isLatest = index === model.snapshots.length - 1
  return {
    kind: 'ready',
    snapshotId,
    account,
    back: { href: `/releve/${snapshotId}`, label: page.title },
    title: paidTotalOn(account.name),
    previous: before && previousTotal !== undefined ? { total: previousTotal, on: before.takenOn } : null,
    current: model.snapshots[index].value.paidTotals?.[accountId] ?? null,
    isLatest,
    locked:
      model.unreadable.draft > 0
        ? { kind: 'unreadable', message: LOCKED_UNREADABLE }
        : isLatest && updateRunning(model)
          ? { kind: 'update-running', message: LOCKED_UPDATE_TOTAL }
          : null,
  }
}

// The save of a total, planned again on the state read just before writing: the relevé must still hold
// the total the screen opened on (`held`), and the latest relevé is never written while an update runs.
export function planPaidTotal(
  state: CorrectionState,
  snapshotId: string,
  accountId: string,
  held: Cents | null,
  cents: Cents | null,
): Planned {
  const found = state.snapshots.find((s) => s.id === snapshotId)
  if (!found || (found.value.paidTotals?.[accountId] ?? null) !== held) return { refused: 'not-held' }
  if (state.updateRunning && state.snapshots.at(-1)?.id === snapshotId) return { refused: 'update-running' }
  return { writes: setPaidTotalAt(state.snapshots, snapshotId, accountId, cents) }
}
