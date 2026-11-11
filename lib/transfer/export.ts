// The model into sheets: what `writeWorkbook` turns into the exported file, and the
// template a person fills in by hand. Every column comes from COLUMNS, in its order.
import { ACCOUNT_TYPES, CATEGORIES, GOAL_CATEGORIES, GROUP_LABELS, RESIDENCE_LABELS } from '@/lib/catalog'
import { entryValue } from '@/lib/model/situation'
import type {
  Account,
  Establishment,
  GoalAllocation,
  IsoDate,
  Line,
  Profile,
  Settings,
  Snapshot,
} from '@/lib/model/types'
import {
  COLUMNS,
  EXAMPLE_BANK,
  HOME_NAME,
  KIND_NAMES,
  PATH_SEPARATOR,
  PURCHASE_IN_EUROS_WORD,
  SETTING_NAMES,
  SETTING_VALUES,
  SHEETS,
  dateCell,
  normalizeWord,
  type Column,
} from './format'
import { aiNote, guideNote, type Unreadable } from './instructions'
import type { Cell, SheetSpec } from './xlsx'

export type ExportInput = {
  profile: Profile
  snapshots: Snapshot[] // oldest first, as `loadSnapshots` gives them
  goals: GoalAllocation[]
  settings: Settings | null
  // What the loading could not read (the draft aside: it is never in the file).
  unreadable: Unreadable
}

export const TEMPLATE_FILE_NAME = 'modele-mes-chiffres.xlsx'

export const exportFileName = (today: IsoDate): string => `mes-chiffres-${today}.xlsx`

type Kind = keyof typeof COLUMNS
type Values = Partial<Record<string, Cell | undefined>>

// One row in the order of the sheet's columns; what a row does not name stays empty.
const row = (kind: Kind, values: Values): Cell[] =>
  (COLUMNS[kind] as readonly Column[]).map((column) => values[column.key] ?? null)

const table = (kind: Kind, rows: Cell[][]): SheetSpec => ({
  name: SHEETS[kind],
  columns: (COLUMNS[kind] as readonly Column[]).map(({ title, format, width, quiet }) =>
    quiet ? { title, format, width, quiet } : { title, format, width },
  ),
  rows,
})

// Cents into euros, never -0 (a loan paid off).
const euros = (cents: number): number => (cents === 0 ? 0 : cents / 100)

const yesNo = (value: boolean): string => (value ? SETTING_VALUES.yes : SETTING_VALUES.no)

// What finds a line, an account and a bank by their ids.
function lookup(profile: Profile) {
  const establishments = new Map(profile.establishments.map((e) => [e.id, e]))
  const accounts = new Map(profile.accounts.map((a) => [a.id, a]))
  const lines = new Map(profile.lines.map((l) => [l.id, l]))
  const bankName = (establishment: Establishment | undefined) =>
    establishment === undefined ? null : establishment.kind === 'home' ? HOME_NAME : establishment.name
  const accountOf = (id: string): { account: Account; bank: string | null } => {
    const account = accounts.get(id)
    if (!account) throw new Error(`export: unknown account ${id}`)
    return { account, bank: bankName(establishments.get(account.establishmentId)) }
  }
  const lineOf = (id: string): { line: Line; account: Account; bank: string | null } => {
    const line = lines.get(id)
    if (!line) throw new Error(`export: unknown line ${id}`)
    return { line, ...accountOf(line.accountId) }
  }
  const names = (lineId: string): (string | null)[] => {
    const { line, account, bank } = lineOf(lineId)
    return [bank, account.name, line.name]
  }
  // How many lines share a path, compared as the import compares words.
  const pathCounts = new Map<string, number>()
  for (const line of profile.lines) {
    const key = normalizeWord(names(line.id).join(PATH_SEPARATOR))
    pathCounts.set(key, (pathCounts.get(key) ?? 0) + 1)
  }
  const separator = PATH_SEPARATOR.trim()
  // « Banque › Compte › Ligne », or the line's identifier when that path would not find it alone.
  const path = (lineId: string): string => {
    const parts = names(lineId)
    const written = parts.join(PATH_SEPARATOR)
    const ambiguous = parts.some((part) => part?.includes(separator)) || (pathCounts.get(normalizeWord(written)) ?? 0) > 1
    return ambiguous ? lineId : written
  }
  return { accountOf, lineOf, path }
}

// Bank by bank, account by account, line by line, in the profile's order. An account with
// no line and a bank with no account still have their row: a backup loses nothing.
function accountRows(profile: Profile): Cell[][] {
  const find = lookup(profile)
  for (const line of profile.lines) find.accountOf(line.accountId)
  const accountFields = (account: Account) => ({
    bank: find.accountOf(account.id).bank,
    account: account.name,
    type: ACCOUNT_TYPES[account.type].label,
    // Every home says its type, a main residence included: the file reads the same for everyone.
    residence: account.type === 'home' ? RESIDENCE_LABELS[account.residence ?? 'main'] : null,
    unlockOn: account.unlockOn ? dateCell(account.unlockOn) : null,
    slow: account.slow ? SETTING_VALUES.yes : null,
    financedLine: account.financedLineId ? find.path(account.financedLineId) : null,
    accountReference: account.id,
  })
  const lineRow = (account: Account, line: Line) =>
    row('accounts', {
      ...accountFields(account),
      line: line.name,
      category: line.category ? CATEGORIES[line.category].label : null,
      group: line.group ? GROUP_LABELS[line.group] : null,
      kind: KIND_NAMES[line.kind],
      currency: line.currency,
      symbol: line.quoteSymbol ?? null,
      closedOn: line.closedOn ? dateCell(line.closedOn) : null,
      purchase: line.purchase ? ('inEuros' in line.purchase ? PURCHASE_IN_EUROS_WORD : line.purchase.perEuro) : null,
      reference: line.id,
    })
  const accountRowsOf = (account: Account) => {
    const lines = profile.lines.filter((line) => line.accountId === account.id)
    return lines.length === 0 ? [row('accounts', accountFields(account))] : lines.map((line) => lineRow(account, line))
  }
  const known = new Set(profile.establishments.map((e) => e.id))
  return [
    ...profile.establishments.flatMap((establishment) => {
      const accounts = profile.accounts.filter((account) => account.establishmentId === establishment.id)
      return accounts.length === 0
        ? [row('accounts', { bank: establishment.kind === 'home' ? HOME_NAME : establishment.name })]
        : accounts.flatMap(accountRowsOf)
    }),
    // An account whose bank is missing from the profile: written all the same, its bank empty.
    ...profile.accounts.filter((account) => !known.has(account.establishmentId)).flatMap(accountRowsOf),
  ]
}

function snapshotRows(profile: Profile, snapshots: Snapshot[]): Cell[][] {
  const find = lookup(profile)
  return snapshots.flatMap((snapshot, index) =>
    // A relevé with no placement (a first launch finished with no account, an update that closed
    // everything) still has its row, its date and its number only: a backup loses nothing.
    snapshot.entries.length === 0 ? [row('snapshots', { date: dateCell(snapshot.takenOn), number: index + 1 })] :
    snapshot.entries.map((entry) => {
      const { line, account, bank } = find.lineOf(entry.lineId)
      // A loan is kept positive (what is owed); the file writes it negative, so a relevé sums to the net worth.
      const signed = (cents: number) => euros(account.type === 'loan' ? -cents : cents)
      let value: number | null
      try {
        value = signed(entryValue(entry, line, snapshot.fx))
      } catch {
        // A computed column, ignored by the import: empty rather than a false figure.
        value = null
      }
      const arrival = snapshot.arrivals[line.id]
      return row('snapshots', {
        date: dateCell(snapshot.takenOn),
        number: index + 1,
        bank,
        account: account.name,
        line: line.name,
        euroValue: value,
        amount: entry.kind === 'amount' ? signed(entry.amount) : null,
        currencyShown: line.currency,
        units: entry.kind === 'units' ? entry.units : null,
        unitPrice: entry.kind === 'units' ? entry.unitPrice : null,
        averagePrice: entry.kind === 'units' ? entry.averagePrice : null,
        seenOn: entry.seenOn !== snapshot.takenOn ? dateCell(entry.seenOn) : null,
        opened: arrival === undefined ? null : yesNo(arrival === 'opened'),
        fx: line.currency === 'EUR' ? null : (snapshot.fx[line.currency] ?? null),
        reference: line.id,
      })
    }),
  )
}

function contributionRows(profile: Profile, snapshots: Snapshot[]): Cell[][] {
  const find = lookup(profile)
  return snapshots.flatMap((snapshot, index) =>
    Object.entries(snapshot.contributions)
      .filter(([, cents]) => cents !== 0)
      .map(([accountId, cents]) => {
        const { account, bank } = find.accountOf(accountId)
        return row('contributions', {
          date: dateCell(snapshot.takenOn),
          number: index + 1,
          bank,
          account: account.name,
          paid: euros(cents),
          accountReference: account.id,
        })
      }),
  )
}

const goalRows = (goals: GoalAllocation[]): Cell[][] =>
  goals.map((goal) =>
    row('goals', {
      from: dateCell(goal.validFrom),
      ...Object.fromEntries(GOAL_CATEGORIES.map((id) => [id, goal.shares[id]])),
      ...(goal.cushionMonths !== undefined ? { cushionMonths: goal.cushionMonths } : {}),
    }),
  )

function settingRows(settings: Settings | null): Cell[][] {
  if (settings === null) return []
  const setting = (name: string, value: Cell) => row('settings', { name, value })
  return [
    ...(settings.budget === null
      ? []
      : [
          setting(SETTING_NAMES.budget, euros(settings.budget.monthly)),
          setting(SETTING_NAMES.basis, SETTING_VALUES.basis[settings.budget.basis]),
        ]),
    setting(SETTING_NAMES.display, SETTING_VALUES.display[settings.display]),
    setting(SETTING_NAMES.hidden, yesNo(settings.hideAmounts)),
  ]
}

const note = (name: string, lines: string[]): SheetSpec => ({ name, columns: [], rows: [], note: lines })

// Comptes, Relevés, Versements, Objectifs, Réglages, Mode d’emploi, Pour une IA: what an adviser sees first are the figures.
export function exportSheets(input: ExportInput): SheetSpec[] {
  const { profile, snapshots } = input
  return [
    table('accounts', accountRows(profile)),
    table('snapshots', snapshotRows(profile, snapshots)),
    table('contributions', contributionRows(profile, snapshots)),
    table('goals', goalRows(input.goals)),
    table('settings', settingRows(input.settings)),
    note(SHEETS.guide, guideNote(input.unreadable)),
    note(SHEETS.ai, aiNote()),
  ]
}

// The template: the guide first, then the same sheets, with example rows at EXAMPLE_BANK
// in the sheets that name a bank. Objectifs and Réglages have no bank to mark an example
// with: they stay empty, the guide gives their words.
export function templateSheets(): SheetSpec[] {
  const day = dateCell('2026-10-31')
  const bank = EXAMPLE_BANK
  const livret = { bank, account: 'Livret A', line: 'Livret A' }
  const lifeInsurance = { bank, account: 'Assurance-vie', line: 'Fonds euros' }
  const loan = { bank, account: 'Prêt immobilier', line: 'Prêt immobilier' }
  const accounts = [
    row('accounts', { ...livret, type: ACCOUNT_TYPES['livret-a'].label }),
    row('accounts', { ...lifeInsurance, type: ACCOUNT_TYPES['life-insurance'].label, group: GROUP_LABELS['euro-fund'] }),
    row('accounts', { ...loan, type: ACCOUNT_TYPES.loan.label }),
  ]
  const snapshots = [
    row('snapshots', { date: day, ...livret, amount: 12000 }),
    row('snapshots', { date: day, ...lifeInsurance, amount: 25000 }),
    row('snapshots', { date: day, ...loan, amount: -180000 }),
  ]
  const contributions = [row('contributions', { date: day, bank, account: lifeInsurance.account, paid: 500 })]
  return [
    note(SHEETS.guide, guideNote({ profile: 0, snapshots: 0, goals: 0, settings: 0 }, { template: true })),
    table('accounts', accounts),
    table('snapshots', snapshots),
    table('contributions', contributions),
    table('goals', []),
    table('settings', []),
    note(SHEETS.ai, aiNote()),
  ]
}
