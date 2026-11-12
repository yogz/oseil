// The sheet « Comptes » into a profile: banks, accounts and lines, every cell checked.
// Nothing is guessed: a cell that does not read is an error with its row, and every error
// is collected before anything is returned. The other sheets find their lines and accounts
// through the index returned with the profile.
import {
  ACCOUNT_TYPES,
  BANKS,
  CATEGORIES,
  CURRENCIES,
  GROUP_LABELS,
  OTHER_BANKS,
  RANGED_GROUPS,
  RESIDENCE_LABELS,
  isRanged,
} from '@/lib/catalog'
import { SLOW_BY_TYPE, canHold } from '@/lib/correct/profile-changes'
import { SYMBOL } from '@/lib/market/types'
import { PURCHASE_RATE_MAX, PURCHASE_RATE_MIN, parseProfile } from '@/lib/model/documents'
import type {
  Account,
  AccountTypeId,
  CategoryId,
  CurrencyCode,
  Establishment,
  GroupId,
  IsoDate,
  Line,
  Profile,
  Residence,
} from '@/lib/model/types'
import {
  COLUMNS,
  EXAMPLE_BANK,
  HOME_NAME,
  KIND_NAMES,
  PATH_SEPARATOR,
  PURCHASE_IN_EUROS_WORD,
  SETTING_VALUES,
  SHEETS,
  normalizeWord,
  readDate,
  readDecimal,
  readText,
  readYesNo,
  wordLookup,
  type Column,
  type Read,
  type RefusalKey,
} from './format'
import { NB, isEmpty, q, refuse, type ImportError, type SheetTable, type TableRow } from './import-types'
import type { Cell } from './xlsx'

type Kind = Line['kind']
type Names = { bank: string | null; account: string | null; line?: string | null }

// How the other sheets find what « Comptes » describes: by identifier first, else by names
// compared as words are. A reason, never a guess, when that finds nothing or several.
export type AccountIndex = {
  lineFor(bank: string | null, account: string | null, line: string | null, reference: string | null): Read<Line>
  accountFor(bank: string | null, account: string | null, reference: string | null): Read<Account>
  // Whether « Comptes » gave this line its identifier (a line the site wrote), rather than a drawn id.
  identified(lineId: string): boolean
}

export type AccountsResult = { profile: Profile; index: AccountIndex } | { errors: ImportError[] }

const pairs = <T>(record: Record<string, T>) => Object.entries(record) as [string, T][]
const typeOf = wordLookup(pairs(ACCOUNT_TYPES).map(([id, type]) => [type.label, id as AccountTypeId]))
const categoryOf = wordLookup(pairs(CATEGORIES).map(([id, category]) => [category.label, id as CategoryId]))
// The words of before 12 November 2026 stay read: a file written then still imports.
const groupOf = wordLookup<GroupId>([
  ...pairs(GROUP_LABELS).map(([id, label]): [string, GroupId] => [label, id as GroupId]),
  ['Obligations et prêts', 'bonds'],
  ['Non coté', 'unlisted'],
])
const kindOf = wordLookup(pairs(KIND_NAMES).map(([id, label]) => [label, id as Kind]))
const residenceOf = wordLookup(pairs(RESIDENCE_LABELS).map(([id, label]) => [label, id as Residence]))
const currencyOf = wordLookup(CURRENCIES.map((c): [string, CurrencyCode] => [c.code, c.code]))
// « Épargne salariale » is the establishment the first launch creates under that name
// (lib/setup/first-launch.ts), with this catalogue id.
const EMPLOYEE_SAVINGS = 'employee-savings'
const catalogIdOf = wordLookup<string>([
  ...[...BANKS, ...OTHER_BANKS].map((bank): [string, string] => [bank.name, bank.id]),
  [ACCOUNT_TYPES[EMPLOYEE_SAVINGS].label, EMPLOYEE_SAVINGS],
])

const LOAN = q(ACCOUNT_TYPES.loan.label)
const title = (key: string) => q((COLUMNS.accounts as readonly Column[]).find((c) => c.key === key)!.title)
const ACCOUNT_KEYS = ['type', 'residence', 'unlockOn', 'slow', 'financedLine', 'accountReference']
const LINE_KEYS = ['category', 'group', 'kind', 'currency', 'symbol', 'closedOn', 'purchase', 'reference']

const pad = (n: number) => String(n).padStart(2, '0')
const dayText = (date: IsoDate) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`

// A cell as the person typed it, for a message.
function shown(cell: Cell): string {
  if (cell instanceof Date) return `${pad(cell.getUTCDate())}/${pad(cell.getUTCMonth() + 1)}/${cell.getUTCFullYear()}`
  if (typeof cell === 'boolean') return cell ? SETTING_VALUES.yes : SETTING_VALUES.no
  return String(cell).trim()
}

// « les lignes 2 et 3 », « les lignes 2, 3 et 5 ».
const rowList = (rows: number[]) =>
  rows.length === 1 ? `la ligne ${rows[0]}` : `les lignes ${rows.slice(0, -1).join(', ')} et ${rows[rows.length - 1]}`
const path = (...names: (string | null)[]) => names.map((name) => name ?? '').join(PATH_SEPARATOR)

// Undefined: the cell did not read (its error is given); null: the cell is empty.
type AccountCells = {
  name: string
  key: string
  reference: string | null | undefined
  type: AccountTypeId | null | undefined
  residence: Residence | null | undefined
  unlockOn: IsoDate | null | undefined
  slow: boolean | undefined
  financed: string | null | undefined
}
type LineCells = {
  name: string
  key: string
  reference: string | null | undefined
  category: CategoryId | null | undefined
  group: GroupId | null | undefined
  kind: Kind | null | undefined
  currency: CurrencyCode | null | undefined
  symbol: string | null | undefined
  closedOn: IsoDate | null | undefined
  purchase: Line['purchase'] | undefined
}
type Row = { row: number; bank: string; bankKey: string; account: AccountCells | null; line: LineCells | null }

type Fail = (key: RefusalKey, row: number | null, message: string) => void

function readRow(table: TableRow, fail: Fail): Row | null {
  const row = table.row
  const cell = (key: string) => table.get(key)
  const text = (key: string): string | null | undefined => {
    const read = readText(cell(key))
    if (read.ok) return read.value
    fail('unreadable', row, `dans ${title(key)}, ${read.reason}.`)
    return undefined
  }
  const unknown = (key: string) =>
    fail('unknownWord', row, `dans ${title(key)}, ${q(shown(cell(key)))} n’est pas un mot accepté. La liste est dans l’onglet ${q(SHEETS.guide)}.`)
  const word = <T>(key: string, lookup: (cell: Cell) => T | undefined): T | null | undefined => {
    if (isEmpty(cell(key))) return null
    const value = lookup(cell(key))
    if (value === undefined) unknown(key)
    return value
  }
  const date = (key: string): IsoDate | null | undefined => {
    const read = readDate(cell(key))
    if (read.ok) return read.value
    fail('unreadable', row, `dans ${title(key)}, ${read.reason}.`)
    return undefined
  }
  const filled = (keys: string[]) => keys.filter((key) => !isEmpty(cell(key))).map(title)

  const bank = text('bank')
  if (bank === undefined) return null
  if (bank === null) {
    fail('missingValue', row, `la case ${title('bank')} est vide.`)
    return null
  }
  const bankKey = normalizeWord(bank)
  if (bankKey === normalizeWord(EXAMPLE_BANK)) {
    fail('example', row, 'c’est la ligne d’exemple du modèle. Efface-la ou remplace-la.')
    return null
  }

  const accountName = text('account')
  const lineName = text('line')
  if (accountName === undefined || lineName === undefined) return null
  if (accountName === null) {
    if (lineName !== null) {
      fail('missingValue', row, `la case ${title('account')} est vide, alors que ${title('line')} est remplie${NB}: un placement appartient à un compte.`)
      return null
    }
    const stray = filled([...ACCOUNT_KEYS, ...LINE_KEYS])
    if (stray.length > 0) {
      fail('strayValue', row, `cette ligne n’a pas de ${title('account')}, mais des cases sont remplies (${stray.join(', ')})${NB}: remplis ${title('account')}, ou efface ces cases.`)
      return null
    }
    return { row, bank, bankKey, account: null, line: null }
  }

  const type = word('type', typeOf)
  if (type === null) fail('missingValue', row, `la case ${title('type')} est vide.`)
  const slowRead = readYesNo(cell('slow'))
  if (!slowRead.ok) unknown('slow')
  const account: AccountCells = {
    name: accountName,
    key: normalizeWord(accountName),
    type,
    residence: word('residence', residenceOf),
    unlockOn: date('unlockOn'),
    slow: slowRead.ok ? slowRead.value : undefined,
    financed: text('financedLine'),
    reference: text('accountReference'),
  }

  if (lineName === null) {
    const stray = filled(LINE_KEYS)
    if (stray.length > 0) {
      fail('strayValue', row, `cette ligne n’a pas de ${title('line')}, mais des cases de placement sont remplies (${stray.join(', ')})${NB}: remplis ${title('line')}, ou efface ces cases.`)
      return null
    }
    return { row, bank, bankKey, account, line: null }
  }

  const category = word('category', categoryOf)
  const group = word('group', groupOf)
  const kind = word('kind', kindOf)
  const currency = word('currency', currencyOf)
  let symbol = text('symbol')
  if (typeof symbol === 'string' && !SYMBOL.test(symbol)) {
    fail('badSymbol', row, `dans ${title('symbol')}, ${q(symbol)} n’est pas un symbole boursier${NB}: des lettres, des chiffres, des points et des tirets, par exemple CW8.PA.`)
    symbol = undefined
  }
  // The rate of purchases: « euros », or what 1 € was worth in the line's currency.
  let purchase: Line['purchase'] | undefined
  const purchaseCell = cell('purchase')
  if (purchaseCell !== undefined && !isEmpty(purchaseCell)) {
    const typed = shown(purchaseCell)
    const rate = readDecimal(purchaseCell)
    const unitsElsewhere = (currency ?? 'EUR') !== 'EUR' && kind !== 'amount'
    if (unitsElsewhere && normalizeWord(typed) === normalizeWord(PURCHASE_IN_EUROS_WORD)) purchase = { inEuros: true }
    else if (unitsElsewhere && rate.ok && rate.value !== null && rate.value >= PURCHASE_RATE_MIN && rate.value <= PURCHASE_RATE_MAX) {
      purchase = { perEuro: rate.value }
    } else {
      fail('badPurchase', row, `dans ${title('purchase')}, ${q(typed)} n’est pas un taux d’achat${NB}: pour un placement en parts dans une autre devise que l’euro, ce que valait 1${NB}€, de 0,01 à 1${NB}000 (par exemple 1,08), ou ${q(PURCHASE_IN_EUROS_WORD)}.`)
    }
  }
  const line: LineCells = {
    name: lineName,
    key: normalizeWord(lineName),
    category,
    group,
    kind,
    currency,
    symbol,
    closedOn: date('closedOn'),
    purchase,
    reference: text('reference'),
  }
  return { row, bank, bankKey, account, line }
}

type AccountRow = Row & { account: AccountCells }
type LineRow = AccountRow & { line: LineCells }
type Group = {
  rows: AccountRow[] // in row order
  reference: string | null
  bankKey: string
  key: string
  type: AccountTypeId | undefined
  financedRow?: LineRow
}

const hasAccount = (row: Row): row is AccountRow => row.account !== null
const hasLine = (row: AccountRow): row is LineRow => row.line !== null

// The account fields repeated on each row of an account: they must not change.
const AGREED = [
  { key: 'type', value: (a: AccountCells) => a.type ?? undefined, show: (v: unknown) => q(ACCOUNT_TYPES[v as AccountTypeId].label) },
  // Empty is « Résidence principale »: the two say the same thing.
  {
    key: 'residence',
    value: (a: AccountCells) => (a.residence === undefined ? undefined : (a.residence ?? 'main')),
    show: (v: unknown) => q(RESIDENCE_LABELS[v as Residence]),
  },
  { key: 'unlockOn', value: (a: AccountCells) => a.unlockOn, show: (v: unknown) => q(dayText(v as IsoDate)) },
  {
    key: 'financedLine',
    value: (a: AccountCells) => (a.financed === undefined || a.financed === null ? a.financed : normalizeWord(a.financed)),
    show: (_v: unknown, a: AccountCells) => q(a.financed!),
  },
] as const

export function readAccounts(table: SheetTable, newId: () => string): AccountsResult {
  if (table.errors.length > 0) return { errors: table.errors }
  const sheet = table.sheet
  const errors: ImportError[] = []
  const fail: Fail = (key, row, message) => errors.push(refuse(key, sheet, row, message))
  if (table.rows.length === 0) {
    return { errors: [refuse('emptyAccounts', sheet, null, 'il n’a aucune ligne. Il faut au moins une banque et ses comptes.')] }
  }

  const rows = table.rows.flatMap((r) => readRow(r, fail) ?? [])

  // Accounts: by their identifier when it is filled, else by Banque + Compte. A row without
  // identifier belongs to the one account with an identifier that has its names, if any.
  const groups: Group[] = []
  const byReference = new Map<string, Group>()
  const byNames = new Map<string, Group>()
  const namesKey = (row: AccountRow) => `${row.bankKey}\u0000${row.account.key}`
  const start = (row: AccountRow, reference: string | null): Group => {
    const group: Group = { rows: [row], reference, bankKey: row.bankKey, key: row.account.key, type: undefined }
    groups.push(group)
    return group
  }
  const accountRows = rows.filter(hasAccount)
  for (const row of accountRows) {
    const reference = row.account.reference
    if (!reference) continue
    const group = byReference.get(reference)
    if (!group) {
      byReference.set(reference, start(row, reference))
    } else if (group.bankKey !== row.bankKey || group.key !== row.account.key) {
      const first = group.rows[0]
      fail('accountDisagrees', row.row, `l’identifiant du compte ${q(reference)} est celui de ${q(path(first.bank, first.account.name))} à la ligne ${first.row}${NB}: un même identifiant ne peut pas désigner un autre compte.`)
    } else {
      group.rows.push(row)
    }
  }
  for (const row of accountRows) {
    if (row.account.reference !== null) continue
    const named = groups.filter((g) => g.reference !== null && g.bankKey === row.bankKey && g.key === row.account.key)
    if (named.length > 1) {
      fail('ambiguousAccount', row.row, `plusieurs comptes s’appellent ${q(path(row.bank, row.account.name))} (${rowList(named.map((g) => g.rows[0].row)).replace(/^les lignes /, 'lignes ')})${NB}: recopie l’identifiant du compte pour dire lequel.`)
    } else if (named.length === 1) {
      named[0].rows.push(row)
    } else {
      const group = byNames.get(namesKey(row))
      if (group) group.rows.push(row)
      else byNames.set(namesKey(row), start(row, null))
    }
  }
  for (const group of groups) group.rows.sort((a, b) => a.row - b.row)
  groups.sort((a, b) => a.rows[0].row - b.rows[0].row)

  // The fields repeated on each row of an account agree.
  for (const group of groups) {
    const first = group.rows[0]
    group.type = group.rows.find((r) => r.account.type)?.account.type ?? undefined
    for (const field of AGREED) {
      // On an account that is not a home, a type is refused once below (residenceNotHome), not twice.
      if (field.key === 'residence' && group.type !== undefined && group.type !== 'home') continue
      const reference = group.rows.find((r) => field.value(r.account) !== undefined)
      if (!reference) continue
      const expected = field.value(reference.account)
      for (const row of group.rows) {
        const value = field.value(row.account)
        if (value === undefined || value === expected) continue
        const said = (v: unknown, a: AccountCells) => (v === null ? 'rien' : field.show(v, a))
        fail('accountDisagrees', row.row, `le compte ${q(path(first.bank, first.account.name))} dit ${said(expected, reference.account)} dans ${title(field.key)} à la ligne ${reference.row}, et ${said(value, row.account)} ici. Ces cases se répètent sans changer sur chaque ligne d’un compte.`)
      }
    }
    if (group.type !== undefined) checkPlacement(group, group.type, fail)
    if (group.type !== undefined && group.type !== 'home') {
      for (const row of group.rows) {
        if (!row.account.residence) continue
        fail('residenceNotHome', row.row, `${title('residence')} ne se remplit que pour un compte ${q(ACCOUNT_TYPES.home.label)}. Ici, c’est un compte ${q(ACCOUNT_TYPES[group.type].label)}.`)
      }
    }
  }

  // Lines: an identifier is used once; two lines of the same names need identifiers.
  const lineRows: { row: LineRow; group: Group }[] = []
  const seenReference = new Map<string, number>()
  for (const group of groups) {
    const byName = new Map<string, LineRow[]>()
    for (const row of group.rows.filter(hasLine)) {
      const reference = row.line.reference
      if (reference) {
        const first = seenReference.get(reference)
        if (first !== undefined) {
          fail('duplicateId', row.row, `l’identifiant ${q(reference)} est déjà celui de la ligne ${first}${NB}: deux placements ne peuvent pas avoir le même.`)
          continue
        }
        seenReference.set(reference, row.row)
      }
      byName.set(row.line.key, [...(byName.get(row.line.key) ?? []), row])
      lineRows.push({ row, group })
    }
    for (const same of byName.values()) {
      if (same.length < 2 || same.every((r) => r.line.reference)) continue
      const message = `${rowList(same.map((r) => r.row))} portent les mêmes Banque, Compte et Ligne, sans identifiant pour les distinguer. Donne un autre nom à l’un des placements.`
      for (const row of same) fail('duplicateLine', row.row, message)
    }
  }
  lineRows.sort((a, b) => a.row.row - b.row.row)

  for (const { row, group } of lineRows) checkLine(row, group.type, fail)

  // « Logement financé »: a loan's, naming a line of a home account, open or closed (a loan
  // keeps the house it financed once sold). By identifier first, else by its path.
  for (const group of groups) {
    for (const row of group.rows) {
      const written = row.account.financed
      if (written === null || written === undefined || group.type === undefined) continue
      if (group.type !== 'loan') {
        fail('financedNotLoan', row.row, `${title('financedLine')} ne se remplit que pour un compte ${LOAN}. Ici, c’est un compte ${q(ACCOUNT_TYPES[group.type].label)}.`)
        continue
      }
      let found = lineRows.filter(({ row: r }) => r.line.reference === written)
      if (found.length === 0) {
        const parts = written.split(PATH_SEPARATOR.trim()).map(normalizeWord)
        found =
          parts.length === 3
            ? lineRows.filter(({ row: r }) => r.bankKey === parts[0] && r.account.key === parts[1] && r.line.key === parts[2])
            : []
      }
      const where = `dans ${title('financedLine')}, ${q(written)}`
      if (found.length === 0) {
        fail('financedLine', row.row, `${where} ne désigne aucun placement de cet onglet. Écris-le Banque › Compte › Ligne, ou recopie son identifiant.`)
      } else if (found.length > 1) {
        fail('financedLine', row.row, `${where} désigne plusieurs placements (${rowList(found.map((f) => f.row.row)).replace(/^les lignes /, 'lignes ')})${NB}: recopie plutôt l’identifiant du logement.`)
      } else if (found[0].group.type !== 'home') {
        fail('financedLine', row.row, `${where} n’est pas un logement${NB}: il désigne un placement d’un compte ${q(ACCOUNT_TYPES.home.label)}.`)
      } else {
        group.financedRow = found[0].row
      }
    }
  }

  if (errors.length > 0) return { errors: sortByRow(errors) }
  return assemble(sheet, rows, groups, lineRows, newId)
}

// Where an account may be, and whether « Long à récupérer » is the person's to say: the
// site's own rules (canHold, SLOW_BY_TYPE), so an import cannot build what the site refuses.
function checkPlacement(group: Group, type: AccountTypeId, fail: Fail): void {
  const first = group.rows[0]
  const label = q(ACCOUNT_TYPES[type].label)
  const establishment = { id: '', ...establishmentOf(first.bank, first.bankKey) }
  if (!canHold(establishment, type)) {
    const home = q(HOME_NAME)
    let message: string
    if (type === 'home') message = `un compte ${label} se range dans ${home}, pas chez ${q(first.bank)}.`
    else if (establishment.kind === 'home') {
      const kept = (['home', 'gold', 'crypto'] as const).map((id) => q(ACCOUNT_TYPES[id].label))
      message = `${home} ne garde que les comptes ${kept[0]}, ${kept[1]} et ${kept[2]}${NB}: un compte ${label} se range dans sa banque.`
    } else message = `un ${LOAN} se range dans une banque qui prête, pas chez ${q(first.bank)}.`
    fail('placementNotAllowed', first.row, message)
  }
  if (!SLOW_BY_TYPE.includes(type)) return
  for (const row of group.rows) {
    if (row.account.slow) {
      fail('slowByType', row.row, `un compte ${label} est long à récupérer ou non selon son type${NB}: laisse ${title('slow')} vide.`)
    }
  }
}

// The rules of a line that depend on its account's type.
function checkLine(row: LineRow, type: AccountTypeId | undefined, fail: Fail): void {
  if (type === undefined) return
  const info = ACCOUNT_TYPES[type]
  const { line } = row
  const kind = line.kind === null ? info.lineKinds[0] : line.kind
  if (kind !== undefined && !info.lineKinds.includes(kind)) {
    const allowed = info.lineKinds.map((k) => q(KIND_NAMES[k])).join(' ou ')
    fail('kindNotAllowed', row.row, `un compte ${q(info.label)} ne se compte pas en ${q(KIND_NAMES[kind])}${NB}: écris ${allowed}.`)
    return
  }
  if (type === 'loan') {
    if (line.category) fail('categoryOnLoan', row.row, `un ${LOAN} n’a pas de catégorie${NB}: laisse ${title('category')} vide.`)
    if (line.group) fail('groupNotAllowed', row.row, `un ${LOAN} n’a pas de chapitre${NB}: laisse ${title('group')} vide.`)
    if (line.currency && line.currency !== 'EUR') {
      fail('loanCurrency', row.row, `un ${LOAN} se compte en euros${NB}: laisse ${title('currency')} vide, ou écris EUR.`)
    }
    return
  }
  const fallback = kind === undefined ? undefined : info.defaultCategory[kind]
  if (line.category === null && kind !== undefined && fallback === undefined) {
    fail('categoryNeeded', row.row, `un compte ${q(info.label)} n’a pas de catégorie par défaut${NB}: remplis ${title('category')}.`)
  }
  const category = line.category === null ? fallback : line.category
  if (!line.group || category === undefined) return
  if (!isRanged(category)) {
    fail('groupNotAllowed', row.row, `la catégorie ${q(CATEGORIES[category].label)} n’a pas de chapitre${NB}: laisse ${title('group')} vide.`)
  } else if (!(RANGED_GROUPS[category] as readonly GroupId[]).includes(line.group)) {
    fail('groupNotAllowed', row.row, `${q(GROUP_LABELS[line.group])} n’est pas un chapitre de la catégorie ${q(CATEGORIES[category].label)}. Les chapitres sont dans l’onglet ${q(SHEETS.guide)}.`)
  }
}

const sortByRow = (errors: ImportError[]) => [...errors].sort((a, b) => (a.row ?? 0) - (b.row ?? 0))

// Ids are drawn in row order; a filled identifier is kept as the id (an export comes back with its ids).
// When `newId` keeps returning taken ids, `exhausted` is called and '' stands in: the
// caller then gives its safety-net error, never a throw.
function idMaker(newId: () => string, taken: Iterable<string>, exhausted: () => void) {
  const used = new Set(taken)
  return () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const id = newId()
      if (!used.has(id)) {
        used.add(id)
        return id
      }
    }
    exhausted()
    return ''
  }
}

// An establishment as the file names it: « Chez toi » is the home, a catalogue name gets its id.
function establishmentOf(bank: string, bankKey: string): Omit<Establishment, 'id'> {
  const home = bankKey === normalizeWord(HOME_NAME)
  const catalogId = home ? undefined : catalogIdOf(bank)
  return {
    name: home ? HOME_NAME : bank,
    kind: home ? 'home' : 'institution',
    ...(catalogId !== undefined ? { catalogId } : {}),
  }
}

function assemble(
  sheet: string,
  rows: Row[],
  groups: Group[],
  lineRows: { row: LineRow; group: Group }[],
  newId: () => string,
): AccountsResult {
  let exhausted = false
  const onExhausted = () => {
    exhausted = true
  }
  const establishmentId = idMaker(newId, [], onExhausted)
  const accountId = idMaker(newId, groups.flatMap((g) => (g.reference ? [g.reference] : [])), onExhausted)
  const lineId = idMaker(newId, lineRows.flatMap(({ row }) => (row.line.reference ? [row.line.reference] : [])), onExhausted)

  const establishments = new Map<string, Establishment>()
  const accounts = new Map<Group, Account>()
  const lines = new Map<LineRow, Line>()
  const groupOf = new Map<AccountRow, Group>(groups.flatMap((g) => g.rows.map((r): [AccountRow, Group] => [r, g])))
  const lineRowSet = new Set(lineRows.map(({ row }) => row))

  for (const row of rows) {
    if (!establishments.has(row.bankKey)) {
      establishments.set(row.bankKey, { id: establishmentId(), ...establishmentOf(row.bank, row.bankKey) })
    }
    if (!hasAccount(row)) continue
    const group = groupOf.get(row)!
    if (!accounts.has(group)) {
      const first = group.rows[0].account
      // A main residence is no mark, as every home was before the types (lib/correct/profile-changes.ts).
      const residence = group.rows.find((r) => r.account.residence)?.account.residence
      accounts.set(group, {
        id: group.reference ?? accountId(),
        establishmentId: establishments.get(group.bankKey)!.id,
        type: group.type!,
        name: first.name,
        ...(first.unlockOn ? { unlockOn: first.unlockOn } : {}),
        // « Long à récupérer » is each line's answer: the account says it when all its rows do.
        ...(group.rows.every((r) => r.account.slow) ? { slow: true as const } : {}),
        ...(residence && residence !== 'main' ? { residence } : {}),
      })
    }
    if (!hasLine(row) || !lineRowSet.has(row)) continue
    const { line } = row
    lines.set(row, {
      id: line.reference ?? lineId(),
      accountId: accounts.get(group)!.id,
      name: line.name,
      kind: line.kind ?? ACCOUNT_TYPES[group.type!].lineKinds[0],
      currency: line.currency ?? 'EUR',
      ...(line.category ? { category: line.category } : {}),
      ...(line.group ? { group: line.group } : {}),
      ...(line.symbol ? { quoteSymbol: line.symbol } : {}),
      ...(line.closedOn ? { closedOn: line.closedOn } : {}),
      ...(line.purchase ? { purchase: line.purchase } : {}),
      ...(row.account.slow && !accounts.get(group)!.slow ? { slow: true } : {}),
    })
  }
  for (const [group, account] of accounts) {
    if (group.financedRow) account.financedLineId = lines.get(group.financedRow)!.id
  }

  const establishmentList = [...establishments.values()]
  const candidate: Profile = {
    schema: 1,
    establishments: establishmentList,
    accounts: [...accounts.values()],
    lines: [...lines.values()],
    firstLaunch: { planned: [], finished: establishmentList.map((e) => e.id), complete: true },
  }
  const profile = exhausted ? null : parseProfile(candidate)
  // A safety net, not a rule: the checks above make it unreachable, so the note does not list it.
  if (profile === null) {
    return { errors: [{ sheet, row: null, message: 'le site n’a pas pu assembler ces comptes. Vérifie l’onglet, puis réessaie.' }] }
  }
  const identified = new Set(lineRows.flatMap(({ row }) => (row.line.reference ? [row.line.reference] : [])))
  return { profile, index: makeIndex(profile, identified) }
}

function makeIndex(profile: Profile, identified: ReadonlySet<string>): AccountIndex {
  const establishments = new Map(profile.establishments.map((e) => [e.id, e]))
  const accountsById = new Map(profile.accounts.map((a) => [a.id, a]))
  const accountNames = (account: Account) => {
    const bank = establishments.get(account.establishmentId)!.name
    return { bank, account: account.name, keys: [normalizeWord(bank), normalizeWord(account.name)] }
  }
  const lineNames = (line: Line) => {
    const names = accountNames(accountsById.get(line.accountId)!)
    return { ...names, line: line.name, keys: [...names.keys, normalizeWord(line.name)] }
  }
  const written = (names: Names) => [names.bank, names.account, ...(names.line === undefined ? [] : [names.line])]
  // The names written beside an identifier, where filled, must be those of the identifier.
  const agree = (keys: string[], names: Names) =>
    written(names).every((name, at) => name === null || name.trim() === '' || normalizeWord(name) === keys[at])
  const missing = (names: Names) => written(names).some((name) => name === null || name.trim() === '')
  const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason })
  const comptes = q(SHEETS.accounts)

  function find<T>(
    items: T[],
    id: (item: T) => string,
    names: (item: T) => { keys: string[]; shown: string },
    given: Names,
    reference: string | null,
    words: { thing: string; things: string; ofThing: string; missingNames: string },
  ): Read<T> {
    if (reference !== null && reference.trim() !== '') {
      const item = items.find((i) => id(i) === reference.trim())
      if (!item) return fail(`${words.ofThing} ${q(reference.trim())} ne désigne aucun ${words.thing} de l’onglet ${comptes}.`)
      const own = names(item)
      if (!agree(own.keys, given)) {
        return fail(`${words.ofThing} ${q(reference.trim())} est celui de ${q(own.shown)} dans l’onglet ${comptes}, pas de ${q(path(...written(given)))}.`)
      }
      return { ok: true, value: item }
    }
    if (missing(given)) return fail(words.missingNames)
    const keys = written(given).map((name) => normalizeWord(name!))
    const found = items.filter((item) => names(item).keys.every((key, at) => key === keys[at]))
    if (found.length === 1) return { ok: true, value: found[0] }
    const shownGiven = q(path(...written(given)))
    return found.length === 0
      ? fail(`le ${words.thing} ${shownGiven} n’existe pas dans l’onglet ${comptes}.`)
      : fail(`plusieurs ${words.things} s’appellent ${shownGiven} dans l’onglet ${comptes}${NB}: recopie l’identifiant pour dire lequel.`)
  }

  return {
    identified: (lineId) => identified.has(lineId),
    lineFor: (bank, account, line, reference) =>
      find(
        profile.lines,
        (l) => l.id,
        (l) => {
          const n = lineNames(l)
          return { keys: n.keys, shown: path(n.bank, n.account, n.line) }
        },
        { bank, account, line },
        reference,
        {
          thing: 'placement',
          things: 'placements',
          ofThing: 'l’identifiant',
          missingNames: `il manque la Banque, le Compte ou la Ligne, et l’identifiant.`,
        },
      ),
    accountFor: (bank, account, reference) =>
      find(
        profile.accounts,
        (a) => a.id,
        (a) => {
          const n = accountNames(a)
          return { keys: n.keys, shown: path(n.bank, n.account) }
        },
        { bank, account },
        reference,
        {
          thing: 'compte',
          things: 'comptes',
          ofThing: 'l’identifiant du compte',
          missingNames: `il manque la Banque ou le Compte, et l’identifiant du compte.`,
        },
      ),
  }
}
