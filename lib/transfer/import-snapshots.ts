// The sheets « Relevés » and « Versements » into snapshots, every cell checked against the
// accounts « Comptes » described. An amount comes back as it was written, to the cent;
// nothing is guessed: what does not read, or reads two ways, is an error with its row.
import { ACCOUNT_TYPES } from '@/lib/catalog'
import { todayIso } from '@/lib/dates'
import { parseSnapshot } from '@/lib/model/documents'
import type { Account, AccountTypeId, Arrival, Cents, IsoDate, Line, Profile, Snapshot, SnapshotEntry } from '@/lib/model/types'
import {
  COLUMNS,
  EXAMPLE_BANK,
  KIND_NAMES,
  PATH_SEPARATOR,
  SETTING_VALUES,
  SHEETS,
  normalizeWord,
  readDate,
  readDecimal,
  readEuros,
  readText,
  readYesNo,
  type Column,
  type RefusalKey,
} from './format'
import type { AccountIndex } from './import-accounts'
import { NB, isEmpty, q, refuse, type ImportError, type SheetTable, type TableRow } from './import-types'

// `snapshots`: oldest first. `closedOn`: the closings inferred for lines without identifier
// and without « Fermée le », for the caller to write on the profile's lines.
export type SnapshotsResult = { snapshots: Snapshot[]; closedOn: Record<string, IsoDate> } | { errors: ImportError[] }

type Fail = (key: RefusalKey, row: number | null, message: string) => void

const titleOf = (kind: 'snapshots' | 'contributions', key: string) =>
  q((COLUMNS[kind] as readonly Column[]).find((c) => c.key === key)!.title)
const title = (key: string) => titleOf('snapshots', key)

const dayText = (date: IsoDate) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`
const decimalText = (value: number) => String(value).replace('.', ',')
const numberText = (n: number) => `n°${NB}${n}`
const CONTRIBUTION_TYPES = (Object.keys(ACCOUNT_TYPES) as AccountTypeId[]).filter((id) => ACCOUNT_TYPES[id].change === 'contributions')

// What every row of both sheets starts with: the relevé it belongs to.
type Place = { row: number; date: IsoDate; number: number | null }

// The date and the number: undefined when they do not read.
function readPlace(table: TableRow, kind: 'snapshots' | 'contributions', fail: Fail): Place | undefined {
  const row = table.row
  const header = (key: string) => titleOf(kind, key)
  let ok = true
  const date = readDate(table.get('date'))
  if (!date.ok) {
    fail('unreadable', row, `dans ${header('date')}, ${date.reason}.`)
    ok = false
  } else if (date.value === null) {
    fail('missingValue', row, `la case ${header('date')} est vide.`)
    ok = false
  }
  const read = readDecimal(table.get('number'))
  let number: number | null = null
  if (!read.ok || (read.value !== null && (!Number.isInteger(read.value) || read.value < 1))) {
    fail('unreadable', row, `dans ${header('number')}, un nombre entier est attendu, par exemple 2.`)
    ok = false
  } else number = read.value
  return ok && date.ok && date.value !== null ? { row, date: date.value, number } : undefined
}

const EXAMPLE_MESSAGE = 'c’est la ligne d’exemple du modèle. Efface-la ou remplace-la.'
const isExampleRow = (table: TableRow) => {
  const bank = table.get('bank')
  return typeof bank === 'string' && normalizeWord(bank) === normalizeWord(EXAMPLE_BANK)
}

// A row of the template's example bank: refused, and read no further.
function isExample(table: TableRow, fail: Fail): boolean {
  if (!isExampleRow(table)) return false
  fail('example', table.row, EXAMPLE_MESSAGE)
  return true
}

// The example rows of « Relevés » or « Versements » alone: what can still be said of these
// sheets when « Comptes » does not read, so that every example row is listed at once.
export function exampleErrors(table: SheetTable): ImportError[] {
  return table.rows.filter(isExampleRow).map((r) => refuse('example', table.sheet, r.row, EXAMPLE_MESSAGE))
}

// A text cell for the index: null when empty or unreadable (the index then says what is missing).
const name = (table: TableRow, key: string): string | null => {
  const read = readText(table.get(key))
  return read.ok ? read.value : null
}

// A relevé being read. The `…Row` maps remember where a value was first written, for the messages.
type Relevé = {
  key: string
  date: IsoDate
  number: number | null
  firstRow: number
  entries: SnapshotEntry[]
  fx: Record<string, number>
  fxRow: Record<string, number>
  seen: Map<string, number> // line id → row
  arrivals: Record<string, Arrival>
  contributions: Record<string, Cents>
  paidRow: Map<string, number> // account id → row
}

const keyOf = (place: Place) => (place.number === null ? `d:${place.date}` : `n:${place.number}`)

export function readSnapshots(
  relevés: SheetTable,
  versements: SheetTable | null,
  profile: Profile,
  index: AccountIndex,
  today: IsoDate = todayIso(),
): SnapshotsResult {
  const tableErrors = [...relevés.errors, ...(versements?.errors ?? [])]
  if (tableErrors.length > 0) return { errors: tableErrors }
  const errors: ImportError[] = []
  const failIn =
    (sheet: string): Fail =>
    (key, row, message) =>
      errors.push(refuse(key, sheet, row, message))
  const fail = failIn(relevés.sheet)

  if (relevés.rows.length === 0) {
    return { errors: [refuse('noSnapshot', relevés.sheet, null, 'il n’a aucune ligne. Il faut au moins un relevé.')] }
  }

  const accounts = new Map(profile.accounts.map((a) => [a.id, a]))
  const establishments = new Map(profile.establishments.map((e) => [e.id, e]))
  const pathOf = (line: Line) => {
    const account = accounts.get(line.accountId)!
    return [establishments.get(account.establishmentId)?.name ?? '', account.name, line.name].join(PATH_SEPARATOR)
  }

  // The relevés: by number when written, else by date. A number names one date; on a
  // date, either every row is numbered or none is.
  const places = relevés.rows
    .filter((r) => !isExample(r, fail))
    .map((r) => ({ table: r, place: readPlace(r, 'snapshots', fail) }))
  // A relevé says what was seen, never what will be (a ChatGPT file dated one 16/11/2026 on the
  // 10th, from a table filled ahead): said once per date, on its first row.
  const futureDates = new Set<IsoDate>()
  for (const { place } of places) {
    if (!place || place.date <= today || futureDates.has(place.date)) continue
    futureDates.add(place.date)
    fail('futureSnapshot', place.row, `le relevé est daté du ${dayText(place.date)}, après aujourd’hui (${dayText(today)}). Un relevé dit les chiffres vus ce jour-là${NB}: date-le du jour où ils ont été vus.`)
  }
  const numberDate = new Map<number, Place>()
  const numberedDates = new Set<IsoDate>()
  for (const { place } of places) {
    if (!place || place.number === null) continue
    numberedDates.add(place.date)
    const first = numberDate.get(place.number)
    if (!first) numberDate.set(place.number, place)
    else if (first.date !== place.date) {
      fail('snapshotNumber', place.row, `le relevé ${numberText(place.number)} est daté du ${dayText(first.date)} à la ligne ${first.row}. Un même ${title('number')} ne sert qu’à une date.`)
    }
  }
  const byKey = new Map<string, Relevé>()
  const open = (place: Place, key: string): Relevé => {
    let relevé = byKey.get(key)
    if (!relevé) {
      relevé = { key, date: place.date, number: place.number, firstRow: place.row, entries: [], fx: {}, fxRow: {}, seen: new Map(), arrivals: {}, contributions: {}, paidRow: new Map() }
      byKey.set(key, relevé)
    }
    return relevé
  }
  // Rows with nothing but their date and number: read once every other row is.
  const blanks: Array<{ table: TableRow; place: Place; key: string }> = []
  for (const { table, place } of places) {
    if (!place) continue
    if (place.number === null && numberedDates.has(place.date)) {
      fail('snapshotNumber', place.row, `d’autres lignes du ${dayText(place.date)} ont un ${title('number')}. Numérote aussi celle-ci, pour dire de quel relevé elle est.`)
      continue
    }
    if (place.number !== null && numberDate.get(place.number)!.date !== place.date) continue
    const key = keyOf(place)
    if (isBlank(table)) {
      // The export always numbers its relevés. Without a number, a row with only a date is a
      // forgotten placement more likely than an empty relevé (read as one, the latest would close
      // every line without identifier): refused.
      if (place.number === null) {
        fail('emptyRow', place.row, `cette ligne n’a que sa date. Écris le placement et son chiffre, ou, pour un relevé sans aucun placement, son ${title('number')}.`)
      } else blanks.push({ table, place, key })
      continue
    }
    readEntry(table, open(place, key), fail, index, accounts, pathOf)
  }
  // A relevé with no placement is written by the site as one row with its date and number only
  // (a first launch finished with no account, an update that closed everything). Such a row in a
  // relevé that has placements names no line: it is refused as any row without one.
  const placed = new Set(byKey.keys())
  for (const { table, place, key } of blanks) {
    if (placed.has(key)) readEntry(table, byKey.get(key)!, fail, index, accounts, pathOf)
    else open(place, key)
  }

  const ordered = [...byKey.values()].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.number ?? 0) - (b.number ?? 0),
  )

  if (versements) {
    const failV = failIn(versements.sheet)
    for (const table of versements.rows) {
      if (isExample(table, failV)) continue
      const place = readPlace(table, 'contributions', failV)
      readContribution(table, place, ordered, failV, index)
    }
  }

  if (errors.length > 0) return { errors: sortErrors(errors, relevés.sheet) }

  const snapshots: Snapshot[] = []
  for (const relevé of ordered) {
    const snapshot = parseSnapshot({
      schema: 1,
      takenOn: relevé.date,
      fx: relevé.fx,
      entries: relevé.entries,
      contributions: relevé.contributions,
      arrivals: relevé.arrivals,
    })
    // A safety net, not a rule: the checks above make it unreachable, so the note does not list it.
    if (snapshot === null) {
      return {
        errors: [{ sheet: relevés.sheet, row: relevé.firstRow, message: `le site n’a pas pu assembler le relevé du ${dayText(relevé.date)}. Vérifie ses lignes, puis réessaie.` }],
      }
    }
    snapshots.push(snapshot)
  }

  // A line without identifier and without « Fermée le », missing from the last relevé,
  // closed at the first relevé it is missing from after its last appearance. A line with an
  // identifier is the site's: it keeps exactly what « Comptes » says.
  const closedOn: Record<string, IsoDate> = {}
  for (const line of profile.lines) {
    if (line.closedOn !== undefined || index.identified(line.id)) continue
    const last = snapshots.findLastIndex((s) => s.entries.some((e) => e.lineId === line.id))
    if (last !== -1 && last < snapshots.length - 1) closedOn[line.id] = snapshots[last + 1].takenOn
  }
  return { snapshots, closedOn }
}

// Every cell empty but the date and the number.
const isBlank = (table: TableRow) =>
  (COLUMNS.snapshots as readonly Column[]).every((c) => c.key === 'date' || c.key === 'number' || isEmpty(table.get(c.key)))

// Relevés first, then Versements, each in row order.
function sortErrors(errors: ImportError[], first: string): ImportError[] {
  const rank = (e: ImportError) => (e.sheet === first ? 0 : 1)
  return [...errors].sort((a, b) => rank(a) - rank(b) || (a.row ?? 0) - (b.row ?? 0))
}

const AMOUNT_KEYS = ['amount']
const UNIT_KEYS = ['units', 'unitPrice', 'averagePrice']

function readEntry(
  table: TableRow,
  relevé: Relevé,
  fail: Fail,
  index: AccountIndex,
  accounts: Map<string, Account>,
  pathOf: (line: Line) => string,
): void {
  const row = table.row
  const found = index.lineFor(name(table, 'bank'), name(table, 'account'), name(table, 'line'), name(table, 'reference'))
  if (!found.ok) {
    fail('unknownLine', row, found.reason)
    return
  }
  const line = found.value
  const account = accounts.get(line.accountId)!
  const shownLine = q(line.name)
  let ok = true
  const filled = (keys: string[]) => keys.filter((key) => !isEmpty(table.get(key)))

  // The figures of its way of counting, and only those.
  const needed = line.kind === 'amount' ? AMOUNT_KEYS : ['units', 'unitPrice']
  const missing = needed.filter((key) => isEmpty(table.get(key)))
  const stray = filled(line.kind === 'amount' ? UNIT_KEYS : AMOUNT_KEYS)
  const way = `${shownLine} se compte en ${q(KIND_NAMES[line.kind])}`
  if (missing.length > 0) {
    fail('wrongColumns', row, `${way}${NB}: remplis ${missing.map(title).join(', ')}.`)
    ok = false
  }
  if (stray.length > 0) {
    fail('wrongColumns', row, `${way}${NB}: laisse vides ${stray.map(title).join(', ')}.`)
    ok = false
  }

  const decimal = (key: string): number | null | undefined => {
    const read = readDecimal(table.get(key))
    if (!read.ok) {
      fail('unreadable', row, `dans ${title(key)}, ${read.reason}.`)
      return undefined
    }
    if (read.value !== null && read.value < 0) {
      fail('negativeUnits', row, `${title(key)} ne peut pas être négatif.`)
      return undefined
    }
    return read.value
  }

  let entry: SnapshotEntry | undefined
  const seenOn = readSeenOn(table, relevé.date, fail)
  if (line.kind === 'amount') {
    const read = readEuros(table.get('amount'))
    let cents: Cents | null = null
    if (!read.ok || (read.value !== null && !Number.isSafeInteger(read.value))) {
      fail('unreadable', row, `dans ${title('amount')}, un montant est attendu, par exemple 1${NB}200,50.`)
    } else cents = read.value
    if (cents !== null && account.type === 'loan') {
      // A loan is written negative (what is owed, taken off the net worth) and kept positive.
      if (cents > 0) {
        fail('positiveLoan', row, `un crédit s’écrit en négatif (ce qu’il reste à rembourser), par exemple -180${NB}000.`)
        cents = null
      } else cents = cents === 0 ? 0 : -cents
    }
    if (ok && cents !== null && seenOn !== undefined) entry = { lineId: line.id, kind: 'amount', amount: cents, seenOn }
  } else {
    const units = decimal('units')
    const unitPrice = decimal('unitPrice')
    const averagePrice = decimal('averagePrice')
    if (ok && typeof units === 'number' && typeof unitPrice === 'number' && averagePrice !== undefined && seenOn !== undefined) {
      entry = { lineId: line.id, kind: 'units', units, unitPrice, averagePrice, seenOn }
    }
  }

  const rateOk = readRate(table, line, relevé, fail)
  const currencyOk = currencyAgrees(table, line, fail)
  const arrival = readArrival(table, fail)

  const before = relevé.seen.get(line.id)
  if (before !== undefined) {
    fail('duplicateEntry', row, `${q(pathOf(line))} est déjà dans ce relevé, à la ligne ${before}.`)
    return
  }
  relevé.seen.set(line.id, row)
  if (entry === undefined || !rateOk || !currencyOk || arrival === undefined) return
  relevé.entries.push(entry)
  if (arrival !== null) relevé.arrivals[line.id] = arrival
}

// Empty: the relevé's own date. Never after it.
function readSeenOn(table: TableRow, takenOn: IsoDate, fail: Fail): IsoDate | undefined {
  const read = readDate(table.get('seenOn'))
  if (!read.ok) {
    fail('unreadable', table.row, `dans ${title('seenOn')}, ${read.reason}.`)
    return undefined
  }
  if (read.value === null) return takenOn
  if (read.value > takenOn) {
    fail('seenAfter', table.row, `${title('seenOn')} dit ${dayText(read.value)}, après la date du relevé (${dayText(takenOn)}). Un chiffre ne peut pas être vu après son relevé.`)
    return undefined
  }
  return read.value
}

// A rate for every line in another currency than the euro, one per currency in a relevé;
// none for a line in euros. Written into the relevé's fx.
function readRate(table: TableRow, line: Line, relevé: Relevé, fail: Fail): boolean {
  const row = table.row
  const cell = table.get('fx')
  if (line.currency === 'EUR') {
    if (isEmpty(cell)) return true
    fail('rate', row, `${q(line.name)} est en euros${NB}: laisse ${title('fx')} vide.`)
    return false
  }
  const read = readDecimal(cell)
  if (!read.ok) {
    fail('unreadable', row, `dans ${title('fx')}, ${read.reason}.`)
    return false
  }
  if (read.value === null) {
    fail('rate', row, `${q(line.name)} est en ${line.currency}${NB}: remplis ${title('fx')}, ce que vaut 1${NB}${line.currency} en euros ce jour-là.`)
    return false
  }
  if (read.value <= 0) {
    fail('rate', row, `${title('fx')} doit être plus grand que zéro.`)
    return false
  }
  const known = relevé.fx[line.currency]
  if (known === undefined) {
    relevé.fx[line.currency] = read.value
    relevé.fxRow[line.currency] = row
    return true
  }
  if (known === read.value) return true
  fail('rate', row, `le taux de ${line.currency} est ${decimalText(known)} à la ligne ${relevé.fxRow[line.currency]} de ce relevé. Une devise n’a qu’un taux par relevé.`)
  return false
}

// « Devise (calculé) » is written for reading, but when it is filled it must be the line's
// currency: otherwise a figure written in euros would be read, silently, in dollars.
function currencyAgrees(table: TableRow, line: Line, fail: Fail): boolean {
  const cell = table.get('currencyShown')
  if (isEmpty(cell)) return true
  const shown = typeof cell === 'string' ? cell.trim() : String(cell)
  if (normalizeWord(shown) === normalizeWord(line.currency)) return true
  fail('currencyShown', table.row, `${title('currencyShown')} dit ${shown}, mais ${q(line.name)} est en ${line.currency} dans l’onglet ${q(SHEETS.accounts)}. Corrige l’une des deux, ou laisse ${title('currencyShown')} vide.`)
  return false
}

// oui → opened, non → existing, empty → nothing; undefined when the word is not one of them.
function readArrival(table: TableRow, fail: Fail): Arrival | null | undefined {
  const cell = table.get('opened')
  if (isEmpty(cell)) return null
  const read = readYesNo(cell)
  if (read.ok) return read.value ? 'opened' : 'existing'
  const shown = typeof cell === 'string' ? cell.trim() : String(cell)
  fail('unknownWord', table.row, `dans ${title('opened')}, ${q(shown)} n’est pas un mot accepté. Écris ${q(SETTING_VALUES.yes)}, ${q(SETTING_VALUES.no)}, ou laisse vide.`)
  return undefined
}

// A row of « Versements »: its relevé (by number, else by date when that date has only one),
// an account that takes contributions, once per relevé. A zero is not kept: the site never stores one.
function readContribution(table: TableRow, place: Place | undefined, relevés: Relevé[], fail: Fail, index: AccountIndex): void {
  const row = table.row
  const header = (key: string) => titleOf('contributions', key)
  const where = `dans l’onglet ${q(SHEETS.snapshots)}`
  let relevé: Relevé | undefined
  if (place) {
    if (place.number !== null) {
      relevé = relevés.find((r) => r.number === place.number)
      if (!relevé) fail('contributionSnapshot', row, `aucun relevé ne porte le ${numberText(place.number)} ${where}.`)
      else if (relevé.date !== place.date) {
        fail('contributionSnapshot', row, `le relevé ${numberText(place.number)} est daté du ${dayText(relevé.date)} ${where}, pas du ${dayText(place.date)}.`)
        relevé = undefined
      }
    } else {
      const sameDay = relevés.filter((r) => r.date === place.date)
      if (sameDay.length === 1) relevé = sameDay[0]
      else if (sameDay.length === 0) fail('contributionSnapshot', row, `aucun relevé n’est daté du ${dayText(place.date)} ${where}.`)
      else fail('contributionSnapshot', row, `plusieurs relevés sont datés du ${dayText(place.date)}${NB}: écris le ${header('number')} pour dire lequel.`)
    }
  }

  const found = index.accountFor(name(table, 'bank'), name(table, 'account'), name(table, 'accountReference'))
  let account: Account | undefined
  if (!found.ok) fail('unknownLine', row, found.reason)
  else if (ACCOUNT_TYPES[found.value.type].change !== 'contributions') {
    const allowed = CONTRIBUTION_TYPES.map((id) => q(ACCOUNT_TYPES[id].label))
    fail('contributionNotAllowed', row, `un compte ${q(ACCOUNT_TYPES[found.value.type].label)} ne reçoit pas de versements. Seuls les comptes ${allowed.slice(0, -1).join(', ')} et ${allowed.at(-1)} en reçoivent.`)
  } else account = found.value

  const read = readEuros(table.get('paid'))
  let cents: Cents | null = null
  if (!read.ok || (read.value !== null && !Number.isSafeInteger(read.value))) {
    fail('unreadable', row, `dans ${header('paid')}, un montant en euros est attendu, par exemple 1${NB}200,50.`)
  } else if (read.value === null) fail('missingValue', row, `la case ${header('paid')} est vide.`)
  else cents = read.value

  if (!relevé || !account) return
  const before = relevé.paidRow.get(account.id)
  if (before !== undefined) {
    fail('duplicateContribution', row, `ce compte a déjà un versement pour ce relevé, à la ligne ${before}.`)
    return
  }
  relevé.paidRow.set(account.id, row)
  if (cents !== null && cents !== 0) relevé.contributions[account.id] = cents
}
