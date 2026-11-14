// « Trouver »: what the person typed, found in the model already open in the browser
// (docs/superpowers/specs/2026-11-14-trouver-design.md). Pure: no React, no database, nothing sent.

import type { Model } from '@/lib/app/use-model'
import { bankAt } from '@/lib/catalog'
import { formatEurosShown, formatWholePercent } from '@/lib/format'
import type { Market } from '@/lib/market/types'
import { missingPurchasePrice } from '@/lib/model/purchase-gaps'
import {
  categoryOf,
  computeSituation,
  entryValue,
  EntryKindError,
  MissingRateError,
  UncategorisedLineError,
  UnknownLineError,
} from '@/lib/model/situation'
import type { Account, CategoryId, Cents, IsoDate, Line, Profile } from '@/lib/model/types'
import { boughtOf, gainFigure, type Bought } from '@/lib/screens/category-detail'
import { loweredCategory } from '@/lib/screens/debts'
import { readStatements, withYear } from '@/lib/screens/evolution'
import {
  ACCOUNTS_TITLE,
  AT_HOME,
  CLOSED,
  correctStatement,
  DETAIL_SEPARATOR,
  FIND_EMPTY,
  FIND_FOOTER,
  FIND_NONE,
  followQuote,
  LESS_THAN_ONE_PERCENT,
  LINES_TITLE,
  moreWords,
  onAccounts,
  SCREEN_ROWS,
  SETTINGS_ROWS,
  SETTINGS_TITLE,
  shareOfYours,
  sinceBought,
  STATEMENTS_TITLE,
  UPDATE_FIGURES,
  WHERE_ANCHOR,
} from '@/lib/screens/find-words'
import { sameHoldings } from '@/lib/screens/holdings'
import { boardSnapshot } from '@/lib/screens/mon-argent'
import { bankAccounts } from '@/lib/screens/settings-words'
import { titlesToFind } from '@/lib/screens/titles'
import { whereWords } from '@/lib/screens/words'

// `hit`: the letters found in `title`, [start, end), to set in bold; null when found by another word.
export type FindRow = {
  kind: 'line' | 'account' | 'bank' | 'statement' | 'setting' | 'action'
  title: string
  hit: [number, number] | null
  where?: string
  amount?: string // absent: no figure to give (a closed line, an account with nothing in the last relevé)
  category?: CategoryId
  href: string
}
export type FindGroup = { title: string; rows: FindRow[]; more: FindRow[]; moreLabel: string | null }
export type FindAnswer = { title: string; amount: string; detail: string | null }
export type FindView =
  | { kind: 'empty'; hint: string }
  | { kind: 'none'; sentence: string }
  | { kind: 'results'; answer: FindAnswer | null; groups: FindGroup[]; actions: FindRow[]; footer: string }

const SHOWN = 5

// Accents, case and the kinds of spaces and apostrophes aside, letter by letter, with where each folded
// letter comes from in the text, so that a hit can be marked in the text as written. A run of spaces is
// one space; « œ » and « æ » are « oe » and « ae ».
const LIGATURES: Record<string, string> = { œ: 'oe', æ: 'ae' }
function fold(text: string): { folded: string; starts: number[]; ends: number[] } {
  let folded = ''
  const starts: number[] = []
  const ends: number[] = []
  let at = 0
  for (const char of text) {
    const lower = char.toLowerCase()
    const plain = /\s/.test(char)
      ? folded.endsWith(' ')
        ? ''
        : ' '
      : char === '’'
        ? "'"
        : (LIGATURES[lower] ?? lower).normalize('NFD').replace(/\p{M}/gu, '')
    for (let i = 0; i < plain.length; i++) {
      starts.push(at)
      ends.push(at + char.length)
    }
    folded += plain
    at += char.length
  }
  return { folded, starts, ends }
}

const foldQuery = (query: string) => fold(query).folded.replace(/ +/g, ' ').trim()

// 0: the text starts with the query, 1: it contains it; null: not found.
type Match = { rank: 0 | 1; hit: [number, number] }
function matchIn(text: string, query: string): Match | null {
  const { folded, starts, ends } = fold(text)
  const index = folded.indexOf(query)
  if (index < 0) return null
  return { rank: index === 0 ? 0 : 1, hit: [starts[index], ends[index + query.length - 1]] }
}

// A row and what orders it: what starts with the text first, then the biggest, then as listed.
type Ranked = { row: FindRow; rank: 0 | 1; value: Cents | null }
function ordered(rows: Ranked[]): FindRow[] {
  return rows
    .map((r, i) => ({ ...r, i }))
    .sort((a, b) => a.rank - b.rank || (b.value ?? -Infinity) - (a.value ?? -Infinity) || a.i - b.i)
    .map((r) => r.row)
}

function groupOf(title: string, rows: FindRow[]): FindGroup | null {
  if (rows.length === 0) return null
  const more = rows.slice(SHOWN)
  return { title, rows: rows.slice(0, SHOWN), more, moreLabel: more.length === 0 ? null : moreWords(more.length) }
}

// The figures Mon argent shows: the last relevé at today's prices, and its big total. Null when there is
// none to give: no relevé, a first launch not finished (no total while banks are missing), or a relevé
// that cannot be read.
function figuresOf(model: Model, profile: Profile, today: IsoDate, market: Market | null) {
  if (model.snapshots.length === 0) return null
  if (profile.firstLaunch && !profile.firstLaunch.complete) return null
  const { shown, inGrid } = boardSnapshot(model, profile, model.snapshots[model.snapshots.length - 1].value, today, market)
  const lines = new Map(profile.lines.map((l) => [l.id, l]))
  try {
    computeSituation(profile, shown)
    const net = computeSituation(profile, inGrid).net
    const values = new Map(shown.entries.map((e) => [e.lineId, entryValue(e, lines.get(e.lineId)!, shown.fx)]))
    const withoutPrice = new Set(missingPurchasePrice(profile, shown))
    const saved = model.snapshots.map((s) => s.value)
    const bought = (lineId: string): Bought => {
      const entry = shown.entries.find((e) => e.lineId === lineId)!
      return boughtOf(lines.get(lineId)!, entry, shown, saved, withoutPrice)
    }
    return { shown, net, values, inGrid: new Set(inGrid.entries.map((e) => e.lineId)), bought }
  } catch (error) {
    if (
      error instanceof UnknownLineError ||
      error instanceof UncategorisedLineError ||
      error instanceof EntryKindError ||
      error instanceof MissingRateError
    ) {
      return null
    }
    throw error
  }
}

// What could be the one answer: a holding, a line, an account or a bank, by the lines it adds up.
type Candidate = { title: string; lineIds: string[]; accounts: number | null; key: string }

export function findView(model: Model, market: Market | null, query: string, today: IsoDate): FindView {
  const q = foldQuery(query)
  if (q === '') return { kind: 'empty', hint: FIND_EMPTY }

  const profile = model.profile?.value ?? null
  const figures = profile ? figuresOf(model, profile, today, market) : null
  const accounts = new Map((profile?.accounts ?? []).map((a) => [a.id, a]))
  const establishments = new Map((profile?.establishments ?? []).map((e) => [e.id, e]))
  // A loan is what is still owed: it lowers what is yours.
  const valueOf = (lineId: string, account: Account | undefined): Cents | null => {
    const value = figures?.values.get(lineId)
    if (value === undefined) return null
    return account?.type === 'loan' ? -value : value
  }
  const lineById = new Map((profile?.lines ?? []).map((l) => [l.id, l]))
  const accountOfLine = (lineId: string) => accounts.get(lineById.get(lineId)?.accountId ?? '')
  const sum = (ids: string[]) => ids.reduce((s, id) => s + (valueOf(id, accountOfLine(id)) ?? 0), 0)
  const held = (ids: string[]) => ids.filter((id) => figures?.values.has(id))
  const candidates: Candidate[] = []

  // 1. The lines, open or closed; a loan is found by its account.
  const lineRows: Ranked[] = []
  const foundLines: Line[] = []
  const lineIdOf = new Map<FindRow, string>()
  for (const line of profile?.lines ?? []) {
    const account = accounts.get(line.accountId)
    const establishment = account && establishments.get(account.establishmentId)
    if (!account || !establishment || account.type === 'loan') continue
    const match = matchIn(line.name, q)
    if (!match) continue
    foundLines.push(line)
    const value = valueOf(line.id, account)
    const category = categoryOf(line, account)
    const row: FindRow = {
      kind: 'line',
      title: line.name,
      hit: match.hit,
      where: line.closedOn === undefined ? whereWords(line, account, establishment) : `${whereWords(line, account, establishment)}${DETAIL_SEPARATOR}${CLOSED}`,
      ...(value === null ? {} : { amount: formatEurosShown(value) }),
      ...(category === null ? {} : { category }),
      href: `/ligne/${encodeURIComponent(line.id)}`,
    }
    lineIdOf.set(row, line.id)
    lineRows.push({ rank: match.rank, value, row })
  }
  // A holding (lib/screens/holdings.ts) is one answer whichever of its lines is found; a line in amounts is its own.
  const holdings = figures && profile ? sameHoldings(profile, figures.shown) : []
  const inHolding = new Set(holdings.flatMap((h) => h.lineIds))
  const foundIds = new Set(foundLines.map((l) => l.id))
  for (const holding of holdings) {
    if (!holding.lineIds.some((id) => foundIds.has(id))) continue
    candidates.push({ title: holding.name, lineIds: holding.lineIds, accounts: holding.accounts.size, key: '' })
  }
  for (const line of foundLines) {
    if (inHolding.has(line.id) || !figures?.values.has(line.id)) continue
    candidates.push({ title: line.name, lineIds: [line.id], accounts: null, key: '' })
  }

  // 2. The accounts and the banks.
  const accountRows: Ranked[] = []
  for (const account of profile?.accounts ?? []) {
    const establishment = establishments.get(account.establishmentId)
    const match = matchIn(account.name, q)
    if (!match || !establishment) continue
    const ids = held(profile!.lines.filter((l) => l.accountId === account.id).map((l) => l.id))
    const value = ids.length === 0 ? null : sum(ids)
    accountRows.push({
      rank: match.rank,
      value,
      row: {
        kind: 'account',
        title: account.name,
        hit: match.hit,
        where: establishment.kind === 'home' ? AT_HOME : bankAt(establishment),
        ...(value === null ? {} : { amount: formatEurosShown(value) }),
        href: accountHref(profile!, account, ids, figures),
      },
    })
    candidates.push({ title: account.name, lineIds: ids, accounts: null, key: `account:${account.id}` })
  }
  for (const establishment of profile?.establishments ?? []) {
    const match = matchIn(establishment.name, q)
    if (!match) continue
    const own = profile!.accounts.filter((a) => a.establishmentId === establishment.id)
    // As in Repères, « Où est ton argent »: what is held here, its loans aside.
    const ids = held(profile!.lines.filter((l) => own.some((a) => a.id === l.accountId && a.type !== 'loan')).map((l) => l.id))
    const value = ids.length === 0 ? null : sum(ids)
    accountRows.push({
      rank: match.rank,
      value,
      row: {
        kind: 'bank',
        title: establishment.name,
        hit: match.hit,
        where: bankAccounts(own.length),
        ...(value === null ? {} : { amount: formatEurosShown(value) }),
        href: `/reperes#${WHERE_ANCHOR}`,
      },
    })
    const heldOn = new Set(ids.map((id) => lineById.get(id)!.accountId))
    candidates.push({ title: establishment.name, lineIds: ids, accounts: heldOn.size, key: `bank:${establishment.id}` })
  }

  // 3. The relevés of Évolution, by their date written out (« 30 novembre 2025 »), the newest first.
  const statementRows: Ranked[] = []
  // While the first launch is not finished, a relevé is half entered: no total (« Pas de grille partielle »).
  const launching = profile?.firstLaunch !== undefined && !profile.firstLaunch.complete
  if (profile) {
    for (const item of [...readStatements(model, profile).items].reverse()) {
      const title = withYear(item.date)
      const match = matchIn(title, q)
      if (!match) continue
      statementRows.push({
        rank: match.rank,
        value: null,
        row: {
          kind: 'statement',
          title,
          hit: match.hit,
          ...(launching ? {} : { amount: formatEurosShown(item.situation.net) }),
          href: `/releve/${item.id}`,
        },
      })
    }
  }

  // 4. The settings, by their title or another word.
  const byWords = (rows: typeof SETTINGS_ROWS, kind: 'setting' | 'action'): Ranked[] =>
    rows.flatMap((setting) => {
      const match = matchIn(setting.title, q)
      const other = match ? null : setting.terms.map((t) => matchIn(t, q)).find((m) => m !== null)
      if (!match && !other) return []
      return [{ rank: (match ?? other)!.rank, value: null, row: { kind, title: setting.title, hit: match?.hit ?? null, href: setting.href } }]
    })

  // 5. What can be done from here: links to screens that exist.
  const actions: FindRow[] = []
  const act = (title: string, href: string) => {
    if (!actions.some((a) => a.title === title && a.href === href)) actions.push({ kind: 'action', title, hit: null, href })
  }
  const lines = ordered(lineRows)
  if (profile) {
    const toFind = new Set(titlesToFind(profile, model.snapshots[model.snapshots.length - 1]?.value).map((r) => r.lineId))
    for (const row of lines) if (toFind.has(lineIdOf.get(row)!)) act(followQuote(row.title), '/titres')
  }
  if (accountRows.length > 0) act(UPDATE_FIGURES, '/mise-a-jour')
  if (statementRows.length === 1) act(correctStatement(statementRows[0].row.title), statementRows[0].row.href)
  for (const row of ordered(byWords(SCREEN_ROWS, 'action'))) act(row.title, row.href)

  const groups = [
    groupOf(LINES_TITLE, lines),
    groupOf(ACCOUNTS_TITLE, ordered(accountRows)),
    groupOf(STATEMENTS_TITLE, ordered(statementRows)),
    groupOf(SETTINGS_TITLE, ordered(byWords(SETTINGS_ROWS, 'setting'))),
  ].filter((g): g is FindGroup => g !== null)
  if (groups.length === 0 && actions.length === 0) return { kind: 'none', sentence: FIND_NONE }

  return { kind: 'results', answer: answerOf(candidates, figures, sum), groups, actions, footer: FIND_FOOTER }
}

// A page of a category: the one holding most of the account; a loan, the one it lowers. With no figure,
// the fiche of its first line, or else « Où est ton argent ».
function accountHref(profile: Profile, account: Account, ids: string[], figures: ReturnType<typeof figuresOf>): string {
  if (figures && account.type === 'loan' && ids.length > 0) return `/categorie/${loweredCategory(profile, figures.shown, account)}`
  const byCategory = new Map<CategoryId, Cents>()
  for (const id of ids) {
    const category = categoryOf(profile.lines.find((l) => l.id === id)!, account)
    const value = figures!.values.get(id)!
    if (category !== null && value > 0) byCategory.set(category, (byCategory.get(category) ?? 0) + value)
  }
  const biggest = [...byCategory].sort((a, b) => b[1] - a[1])[0]
  if (biggest) return `/categorie/${biggest[0]}`
  const first = profile.lines.find((l) => l.accountId === account.id)
  return first ? `/ligne/${encodeURIComponent(first.id)}` : `/reperes#${WHERE_ANCHOR}`
}

// The answer at the top: only when what is found is one holding, one line, one account or one bank (the
// same lines found twice, a line and its account of the same name, are one), with a figure to give.
function answerOf(
  candidates: Candidate[],
  figures: ReturnType<typeof figuresOf>,
  sum: (ids: string[]) => Cents,
): FindAnswer | null {
  if (!figures) return null
  const keyOf = (c: Candidate) => (c.lineIds.length > 0 ? [...c.lineIds].sort().join('|') : c.key)
  const unique = [...new Map(candidates.map((c) => [keyOf(c), c])).values()]
  // The first found of the same lines names them: a holding or a line before its account, its bank.
  const one = unique.length === 1 ? candidates.find((c) => keyOf(c) === keyOf(unique[0]))! : null
  if (!one || one.lineIds.length === 0) return null
  const total = sum(one.lineIds)
  const parts: string[] = []
  if (one.accounts !== null && one.accounts > 1) parts.push(onAccounts(one.accounts))
  // Of the big figure of Mon argent: only for what it counts (not a home left out of the grid), and never
  // above 100 % (loans elsewhere make the net smaller than what is held here).
  const percent = figures.net > 0 ? (total / figures.net) * 100 : 0
  if (total > 0 && percent <= 100 && one.lineIds.every((id) => figures.inGrid.has(id))) {
    parts.push(shareOfYours(percent < 0.5 ? LESS_THAN_ONE_PERCENT : formatWholePercent(Math.round(percent))))
  }
  // The gain only when every line of it has one: a part of it would read as the whole.
  const bought = one.lineIds.map(figures.bought)
  if (bought.every((b) => b !== null)) {
    const gain = gainFigure(bought)
    if (gain) parts.push(sinceBought(gain.figure.percent))
  }
  return { title: one.title, amount: formatEurosShown(total), detail: parts.length === 0 ? null : parts.join(DETAIL_SEPARATOR) }
}

