// A whole file into what the vault would hold: the profile, the snapshots, the goals and the
// settings, with a summary for the person to recognise their figures before anything is
// written. Every sheet is read and every error collected, sorted by sheet then by row. Nothing
// is guessed, and nothing here throws: what cannot be read is an error the person can act on.
import { DEFAULT_SETTINGS, parseGoalAllocation, parseSettings } from '@/lib/model/documents'
import { computeSituation } from '@/lib/model/situation'
import type { Budget, Cents, GoalAllocation, GoalShares, IsoDate, Profile, Settings, Snapshot } from '@/lib/model/types'
import { GOAL_CATEGORIES } from '@/lib/catalog'
import { todayIso } from '@/lib/dates'
import {
  COLUMNS,
  HOME_NAME,
  SETTING_NAMES,
  SETTING_VALUES,
  SHEETS,
  normalizeWord,
  readDate,
  readEuros,
  readPercent,
  readYesNo,
  wordLookup,
  type Column,
  type RefusalKey,
} from './format'
import { readAccounts } from './import-accounts'
import { exampleErrors, readSnapshots } from './import-snapshots'
import { NB, isEmpty, q, readTable, refuse, type ImportError, type SheetTable, type TableKind } from './import-types'
import { MAX_IMPORT_BYTES, readWorkbook, type Cell } from './xlsx'

export type ImportedData = {
  profile: Profile
  snapshots: { id: string; value: Snapshot }[] // oldest first, as loadSnapshots gives them
  goals: GoalAllocation[] // in the order of the rows
  settings: Settings
}

export type ImportSummary = {
  // Oldest first; `total` is the net figure Mon argent shows for that snapshot as saved, null for a
  // relevé with no placement: there is no total to show, and a 0 would read as one.
  // `placements` counts the lines the relevé holds.
  relevés: { takenOn: IsoDate; total: Cents | null; placements: number }[]
  banks: number
  bankNames: string[] // as the site names them, « Chez toi » included, in the file's order
  lines: number
  goals: number
  // Open loan lines: none is said on the preview, since a forgotten loan makes a total too high.
  loans: number
  // Open lines in no relevé at all, by name: invisible in Mon argent until an update gives them
  // a figure (the update offers every open line, an empty box for these).
  withoutFigure: string[]
}

export type ImportResult = { ok: true; data: ImportedData; summary: ImportSummary } | { ok: false; errors: ImportError[] }

const NOT_EXCEL = `Ce fichier n’est pas un fichier Excel (.xlsx). Depuis Numbers, exporte d’abord en Excel${NB}: Partager › Exporter › Excel.`
const TOO_BIG = `Ce fichier fait plus de ${MAX_IMPORT_BYTES / (1024 * 1024)}${NB}Mo${NB}: c’est trop pour un fichier de chiffres. Vérifie que c’est le bon fichier.`
// A safety net, not a rule: an error of this code, never of the file. The note does not list it.
const NOT_READ = 'Le fichier n’a pas pu être lu jusqu’au bout. Vérifie-le, puis réessaie.'

const fileError = (key: RefusalKey, message: string): ImportResult => ({ ok: false, errors: [refuse(key, null, null, message)] })

// The file the person chose. Its size is checked before it is opened; a Numbers file, or
// anything that does not open as Excel, is said to be one, with the way to export it.
export async function importFile(file: File, newId?: () => string): Promise<ImportResult> {
  try {
    if (file.size > MAX_IMPORT_BYTES) return fileError('tooBig', TOO_BIG)
    if (/\.numbers$/i.test(file.name.trim())) return fileError('notExcel', NOT_EXCEL)
    let sheets: Map<string, Cell[][]>
    try {
      sheets = await readWorkbook(file)
    } catch {
      return fileError('notExcel', NOT_EXCEL)
    }
    return readImport(sheets, newId)
  } catch {
    return { ok: false, errors: [{ sheet: null, row: null, message: NOT_READ }] }
  }
}

// `today` decides which relevé dates are in the future (the person's own day, by default).
export function readImport(
  sheets: Map<string, Cell[][]>,
  newId: () => string = () => crypto.randomUUID(),
  today: IsoDate = todayIso(),
): ImportResult {
  try {
    return readBook(sheets, newId, today)
  } catch {
    return { ok: false, errors: [{ sheet: null, row: null, message: NOT_READ }] }
  }
}

const TABLES: TableKind[] = ['accounts', 'snapshots', 'contributions', 'goals', 'settings']
const REQUIRED = new Set<TableKind>(['accounts', 'snapshots'])

// The file's errors, then each sheet's in the order of the file, each by row (a whole-sheet error first).
const SHEET_RANK = new Map<string | null, number>([[null, 0], ...TABLES.map((kind, index): [string, number] => [SHEETS[kind], index + 1])])
const sortErrors = (errors: ImportError[]) =>
  [...errors].sort(
    (a, b) => (SHEET_RANK.get(a.sheet) ?? TABLES.length + 1) - (SHEET_RANK.get(b.sheet) ?? TABLES.length + 1) || (a.row ?? 0) - (b.row ?? 0),
  )

function readBook(book: Map<string, Cell[][]>, newId: () => string, today: IsoDate): ImportResult {
  // Sheets are found by name, compared as words are; the others (the two notes, a summary a
  // tableur adds) are not read.
  const cells = new Map<TableKind, Cell[][]>()
  const errors: ImportError[] = []
  for (const kind of TABLES) {
    const names = [...book.keys()].filter((name) => normalizeWord(name) === normalizeWord(SHEETS[kind]))
    if (names.length > 1) {
      errors.push(refuse('duplicateSheet', SHEETS[kind], null, `il y a deux onglets de ce nom (${names.map(q).join(' et ')}). Garde-en un seul.`))
    } else if (names.length === 1) cells.set(kind, book.get(names[0])!)
  }
  if (errors.length > 0) return { ok: false, errors: sortErrors(errors) }

  const table = (kind: TableKind) => readTable(kind, cells.get(kind), REQUIRED.has(kind))
  const relevés = table('snapshots')
  const versements = table('contributions')
  const goals = readGoals(table('goals'))
  const settings = readSettings(table('settings'))
  if ('errors' in goals) errors.push(...goals.errors)
  if ('errors' in settings) errors.push(...settings.errors)

  const accounts = readAccounts(table('accounts'), newId)
  let read: { profile: Profile; snapshots: Snapshot[] } | undefined
  if ('errors' in accounts) {
    // Without the accounts, a relevé's line cannot be found: what can still be said of these
    // sheets is said now, rather than one import later.
    errors.push(...accounts.errors, ...relevés.errors, ...versements.errors)
    if (relevés.errors.length === 0) errors.push(...exampleErrors(relevés))
    if (versements.errors.length === 0) errors.push(...exampleErrors(versements))
  } else {
    const result = readSnapshots(relevés, versements, accounts.profile, accounts.index, today)
    if ('errors' in result) errors.push(...result.errors)
    else {
      const { closedOn } = result
      const profile: Profile = {
        ...accounts.profile,
        lines: accounts.profile.lines.map((line) => (closedOn[line.id] ? { ...line, closedOn: closedOn[line.id] } : line)),
      }
      read = { profile, snapshots: result.snapshots }
    }
  }

  if (errors.length > 0 || read === undefined || 'errors' in goals || 'errors' in settings) {
    return { ok: false, errors: sortErrors(errors) }
  }
  const { profile } = read
  const data: ImportedData = {
    profile,
    snapshots: read.snapshots.map((value) => ({ id: newId(), value })),
    goals: goals.goals,
    settings: settings.settings,
  }
  return { ok: true, data, summary: summaryOf(data) }
}

function summaryOf(data: ImportedData): ImportSummary {
  const { profile } = data
  const typeOf = new Map(profile.accounts.map((a) => [a.id, a.type]))
  const figured = new Set(data.snapshots.flatMap(({ value }) => value.entries.map((e) => e.lineId)))
  return {
    // computeSituation is what Mon argent's big figure is made of (`situation.net`, in
    // lib/screens/mon-argent.ts), here on the snapshot as saved, without today's prices.
    relevés: data.snapshots.map(({ value }) => ({
      takenOn: value.takenOn,
      total: value.entries.length === 0 ? null : computeSituation(profile, value).net,
      placements: value.entries.length,
    })),
    banks: profile.establishments.length,
    bankNames: profile.establishments.map((e) => (e.kind === 'home' ? HOME_NAME : e.name)),
    lines: profile.lines.length,
    goals: data.goals.length,
    loans: profile.lines.filter((l) => l.closedOn === undefined && typeOf.get(l.accountId) === 'loan').length,
    withoutFigure: profile.lines.filter((l) => l.closedOn === undefined && !figured.has(l.id)).map((l) => l.name),
  }
}

const OPTIONAL_GOALS = new Set(COLUMNS.goals.filter((column) => !column.required).map((column) => column.key))
const titleOf = (kind: 'goals' | 'settings', key: string) => q((COLUMNS[kind] as readonly Column[]).find((c) => c.key === key)!.title)
const decimalText = (value: number) => String(value).replace('.', ',')
// Float noise after a multiplication (0.15 × 100): a share this close to a whole number is that number.
const near = (value: number, target: number) => Math.abs(value - target) < 1e-9

// « Objectifs »: a row per goal, shares in plain percent summing to 100, or a row of
// fractions summing to 1 (« 25 % » typed in a tableur is kept as 0,25), unless one share is
// exactly 1 (then 1 % and 100 % read alike, and the row is refused). Whole percents only.
export function readGoals(table: SheetTable): { goals: GoalAllocation[] } | { errors: ImportError[] } {
  if (table.errors.length > 0) return { errors: table.errors }
  const errors: ImportError[] = []
  const fail = (key: RefusalKey, row: number, message: string) => errors.push(refuse(key, table.sheet, row, message))
  const goals: GoalAllocation[] = []
  for (const r of table.rows) {
    const row = r.row
    const date = readDate(r.get('from'))
    if (!date.ok) fail('unreadable', row, `dans ${titleOf('goals', 'from')}, ${date.reason}.`)
    else if (date.value === null) fail('missingValue', row, `la case ${titleOf('goals', 'from')} est vide.`)
    const values = new Map<string, number>()
    for (const category of GOAL_CATEGORIES) {
      const cell = r.get(category)
      const read = readPercent(cell)
      if (!read.ok) fail('unreadable', row, `dans ${titleOf('goals', category)}, ${read.reason}.`)
      // An optional share (a column added since, absent from an older file) is 0 when empty.
      else if (read.value === null && !OPTIONAL_GOALS.has(category)) {
        fail('missingValue', row, `la case ${titleOf('goals', category)} est vide. Écris 0 pour une part nulle.`)
      } else values.set(category, read.value ?? 0)
    }
    if (values.size < GOAL_CATEGORIES.length || !date.ok || date.value === null) continue
    const total = [...values.values()].reduce((sum, value) => sum + value, 0)
    // One share at 1 and the others at 0 reads as 1 % as well as 100 %: refused, never guessed.
    if ([...values.values()].some((value) => value === 1) && near(total, 1)) {
      fail('goalFraction', row, 'écris les pourcentages en nombres simples, par exemple 100 et non 1.')
      continue
    }
    const scale = near(total, 1) ? 100 : 1
    const shares = {} as GoalShares
    let whole = true
    for (const category of GOAL_CATEGORIES) {
      const share = values.get(category)! * scale
      if (near(share, Math.round(share))) shares[category] = Math.round(share)
      else {
        whole = false
        fail('goalShare', row, `dans ${titleOf('goals', category)}, ${decimalText(Number(share.toPrecision(12)))} n’est pas un nombre entier${NB}: écris des pour cent entiers, par exemple 25.`)
      }
    }
    if (!whole) continue
    const sum = GOAL_CATEGORIES.reduce((acc, category) => acc + shares[category], 0)
    if (sum !== 100) {
      fail('goalTotal', row, `les parts font ${decimalText(Number((total * scale).toPrecision(12)))} en tout${NB}: il en faut 100.`)
      continue
    }
    const goal = parseGoalAllocation({ schema: 1, validFrom: date.value, shares })
    // A safety net: the checks above make it unreachable.
    if (goal === null) errors.push({ sheet: table.sheet, row, message: 'le site n’a pas pu lire cet objectif. Vérifie la ligne, puis réessaie.' })
    else goals.push(goal)
  }
  return errors.length > 0 ? { errors } : { goals }
}

const SETTING_LIST = Object.values(SETTING_NAMES)
const settingOf = wordLookup((Object.entries(SETTING_NAMES) as [keyof typeof SETTING_NAMES, string][]).map(([key, name]) => [name, key]))
const basisOf = wordLookup((Object.entries(SETTING_VALUES.basis) as [Budget['basis'], string][]).map(([key, word]) => [word, key]))
const displayOf = wordLookup((Object.entries(SETTING_VALUES.display) as [Settings['display'], string][]).map(([key, word]) => [word, key]))
const either = (words: readonly string[]) => `${words.slice(0, -1).map(q).join(', ')} ou ${q(words.at(-1)!)}`
const shownCell = (cell: Cell) => (typeof cell === 'string' ? cell.trim() : String(cell))

// « Réglages »: DEFAULT_SETTINGS, overridden by the rows present. A budget goes with its basis.
export function readSettings(table: SheetTable): { settings: Settings } | { errors: ImportError[] } {
  if (table.errors.length > 0) return { errors: table.errors }
  const errors: ImportError[] = []
  const fail = (key: RefusalKey, row: number, message: string) => errors.push(refuse(key, table.sheet, row, message))
  const seen = new Map<keyof typeof SETTING_NAMES, number>()
  let monthly: Cents | undefined
  let basis: Budget['basis'] | undefined
  let display: Settings['display'] | undefined
  let hidden: boolean | undefined
  for (const r of table.rows) {
    const row = r.row
    const nameCell = r.get('name')
    const value = r.get('value')
    if (isEmpty(nameCell)) {
      fail('missingValue', row, `la case ${titleOf('settings', 'name')} est vide.`)
      continue
    }
    const key = settingOf(nameCell)
    if (key === undefined) {
      const names = `${SETTING_LIST.slice(0, -1).map(q).join(', ')} et ${q(SETTING_LIST.at(-1)!)}`
      fail('unknownWord', row, `${q(shownCell(nameCell))} n’est pas un réglage. Les réglages sont ${names}.`)
      continue
    }
    const name = SETTING_NAMES[key]
    const before = seen.get(key)
    if (before !== undefined) {
      fail('duplicateSetting', row, `${q(name)} est déjà réglé à la ligne ${before}.`)
      continue
    }
    seen.set(key, row)
    if (isEmpty(value)) {
      fail('missingValue', row, `la case ${titleOf('settings', 'value')} est vide.`)
      continue
    }
    const unknown = (words: readonly string[]) =>
      fail('unknownWord', row, `pour ${q(name)}, ${q(shownCell(value))} n’est pas un mot accepté. Écris ${either(words)}.`)
    if (key === 'budget') {
      const read = readEuros(value)
      if (!read.ok || read.value === null || !Number.isSafeInteger(read.value)) {
        fail('unreadable', row, `dans ${titleOf('settings', 'value')}, un montant en euros est attendu, par exemple 1${NB}200,50.`)
      } else if (read.value <= 0) fail('budgetAmount', row, 'le budget mensuel doit être plus grand que zéro.')
      else monthly = read.value
    } else if (key === 'basis') {
      basis = basisOf(value)
      if (basis === undefined) unknown(Object.values(SETTING_VALUES.basis))
    } else if (key === 'display') {
      display = displayOf(value)
      if (display === undefined) unknown(Object.values(SETTING_VALUES.display))
    } else {
      const read = readYesNo(value)
      if (read.ok) hidden = read.value
      else unknown([SETTING_VALUES.yes, SETTING_VALUES.no])
    }
  }
  // Both rows or none: the row that is there says what it is missing.
  const budgetRow = seen.get('budget')
  const basisRow = seen.get('basis')
  if (budgetRow !== undefined && basisRow === undefined) {
    fail('budgetPair', budgetRow, `${q(SETTING_NAMES.budget)} va avec ${q(SETTING_NAMES.basis)}${NB}: ajoute la ligne qui manque, ou efface celle-ci.`)
  } else if (basisRow !== undefined && budgetRow === undefined) {
    fail('budgetPair', basisRow, `${q(SETTING_NAMES.basis)} va avec ${q(SETTING_NAMES.budget)}${NB}: ajoute la ligne qui manque, ou efface celle-ci.`)
  }
  if (errors.length > 0) return { errors: [...errors].sort((a, b) => (a.row ?? 0) - (b.row ?? 0)) }
  const settings = parseSettings({
    ...DEFAULT_SETTINGS,
    ...(monthly !== undefined && basis !== undefined ? { budget: { basis, monthly } } : {}),
    ...(display !== undefined ? { display } : {}),
    ...(hidden !== undefined ? { hideAmounts: hidden } : {}),
  })
  // A safety net: the checks above make it unreachable.
  if (settings === null) return { errors: [{ sheet: table.sheet, row: null, message: 'le site n’a pas pu lire ces réglages. Vérifie l’onglet, puis réessaie.' }] }
  return { settings }
}
