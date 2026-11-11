// The file's vocabulary: sheet names, column titles and order, the words a cell
// may hold, and the readers that turn a cell into a typed value. Export, import,
// the template and the instructions for an AI all read this file, so they cannot
// disagree.
import { ACCOUNT_TYPES, GOAL_CATEGORIES, GOAL_LABELS } from '@/lib/catalog'
import { SLOW_BY_TYPE } from '@/lib/correct/profile-changes'
import type { Cents, GoalCategory, IsoDate } from '@/lib/model/types'
import { MAX_IMPORT_BYTES, type Cell, type ColumnFormat } from './xlsx'

export const SHEETS = {
  guide: 'Mode d’emploi',
  ai: 'Pour une IA',
  accounts: 'Comptes',
  snapshots: 'Relevés',
  contributions: 'Versements',
  goals: 'Objectifs',
  settings: 'Réglages',
} as const

// The establishment of what a person keeps themselves (`kind: 'home'`).
export const HOME_NAME = 'Chez toi'

// Every example row of the template is at this bank: the import recognises it and refuses
// the row, so a forgotten example never puts a false bank in the vault.
export const EXAMPLE_BANK = 'Exemple — à effacer'

// The way into the import, on the first launch's welcome; the template's « Mode d’emploi » names it.
export const IMPORT_LINK = 'Importer un fichier ou passer par ton IA'

// « Logement financé » names a line « Banque › Compte › Ligne ».
export const PATH_SEPARATOR = ' › '

export const SETTING_NAMES = {
  budget: 'Budget mensuel',
  basis: 'Budget calculé sur',
  display: 'Affichage',
  hidden: 'Montants masqués',
} as const

export const SETTING_VALUES = {
  basis: { expenses: 'dépenses', salary: 'salaire' },
  display: { euros: 'euros', percent: 'pour cent' },
  yes: 'oui',
  no: 'non',
} as const

// « Façon de compter ».
export const KIND_NAMES = { amount: 'Montant', units: 'Parts' } as const

export type Column = {
  key: string
  title: string
  format: ColumnFormat
  width: number
  required: boolean
  // Identifiers: a paler header, left empty by hand.
  quiet?: boolean
  // Written by the export for reading, ignored by the import.
  computed?: boolean
}

const col = (
  key: string,
  title: string,
  format: ColumnFormat,
  width: number,
  required = false,
  extra: { quiet?: true; computed?: true } = {},
): Column => ({ key, title, format, width, required, ...extra })

// Columns added after files were already written: a file from before has none of them, so they
// are optional, and the import reads them as absent (a main residence, a rental share of 0).
const ADDED_GOALS: readonly GoalCategory[] = ['rental']

export const COLUMNS = {
  accounts: [
    col('bank', 'Banque', 'text', 18, true),
    col('account', 'Compte', 'text', 22, true),
    col('line', 'Ligne', 'text', 22, true),
    col('type', 'Type de compte', 'text', 18, true),
    col('residence', 'Type de logement', 'text', 20),
    col('category', 'Catégorie', 'text', 20),
    col('group', 'Chapitre', 'text', 16),
    col('kind', 'Façon de compter', 'text', 18),
    col('currency', 'Devise', 'text', 9),
    col('symbol', 'Symbole suivi', 'text', 14),
    col('unlockOn', 'Débloqué le', 'date', 13),
    col('slow', 'Long à récupérer', 'text', 16),
    col('financedLine', 'Logement financé', 'text', 18),
    col('closedOn', 'Fermée le', 'date', 13),
    // Added 11 November 2026 (docs/superpowers/specs/2026-11-11-change-a-l-achat-design.md): a line in another
    // currency, the rate of its purchases typed by the person, or « euros » for an average price in euros.
    col('purchase', 'Taux d’achat (1 € = …)', 'text', 16),
    col('reference', 'Identifiant (laisser vide)', 'text', 16, false, { quiet: true }),
    col('accountReference', 'Identifiant du compte (laisser vide)', 'text', 20, false, { quiet: true }),
  ],
  snapshots: [
    col('date', 'Date du relevé', 'date', 15, true),
    col('number', 'N° du relevé', 'integer', 12),
    col('bank', 'Banque', 'text', 18, true),
    col('account', 'Compte', 'text', 22, true),
    col('line', 'Ligne', 'text', 22, true),
    col('euroValue', 'Valeur en euros (calculé)', 'euros', 18, false, { computed: true }),
    // In the line's currency (« Devise (calculé) » beside it): a plain number, never « € ».
    col('amount', 'Montant', 'number', 16),
    col('currencyShown', 'Devise (calculé)', 'text', 11, false, { computed: true }),
    col('units', 'Parts', 'number', 11),
    col('unitPrice', 'Prix d’une part', 'number', 14),
    col('averagePrice', 'Prix moyen d’achat', 'number', 16),
    col('seenOn', 'Chiffre vu le (si plus ancien)', 'date', 18),
    col('opened', 'Ouverte avec de l’argent neuf', 'text', 18),
    col('fx', 'Taux de change', 'number', 12),
    col('reference', 'Identifiant (laisser vide)', 'text', 16, false, { quiet: true }),
  ],
  contributions: [
    col('date', 'Date du relevé', 'date', 15, true),
    col('number', 'N° du relevé', 'integer', 12),
    col('bank', 'Banque', 'text', 18, true),
    col('account', 'Compte', 'text', 22, true),
    col('paid', 'Versé', 'euros', 14, true),
    col('accountReference', 'Identifiant du compte (laisser vide)', 'text', 20, false, { quiet: true }),
  ],
  goals: [
    col('from', 'À partir du', 'date', 14, true),
    ...GOAL_CATEGORIES.map((id) => col(id, `${GOAL_LABELS[id]} (%)`, 'integer', 22, !ADDED_GOALS.includes(id))),
    // Added 11 November 2026 (docs/superpowers/specs/2026-11-11-coussin-objectif-design.md): empty, every
    // goal in percents; filled, the available money in months of the budget, its share then 0.
    col('cushionMonths', 'Argent disponible (mois)', 'number', 22),
  ],
  settings: [col('name', 'Réglage', 'text', 28, true), col('value', 'Valeur', 'text', 24, true)],
} as const satisfies Record<string, readonly Column[]>

const NB = ' '
const quoted = (text: string) => `«${NB}${text}${NB}»`
const titleOf = (kind: keyof typeof COLUMNS, key: string): string => {
  const column = (COLUMNS[kind] as readonly Column[]).find((c) => c.key === key)
  if (!column) throw new Error(`format: no column ${kind}.${key}`)
  return quoted(column.title)
}
const accountsTitle = (key: string) => titleOf('accounts', key)

// What makes the import refuse a file, in the words the « Pour une IA » sheet lists them.
// The import can only refuse under one of these keys (its error helper takes one), and a
// test makes the import produce each of them: the note and the import cannot drift apart.
// Grouped by the import that makes them, so each group's test can list a case per key.
// The sheet « Comptes » and the reading of a table (shared by every sheet).
// The word of « Taux d’achat » for an average price already in euros.
export const PURCHASE_IN_EUROS_WORD = 'euros'

export const ACCOUNT_REFUSALS = {
  badPurchase: 'un taux d’achat illisible, hors de 0,01 à 1 000, ou sur un placement qui n’est pas en parts dans une autre devise que l’euro',
  missingSheet: 'un onglet obligatoire absent',
  missingColumn: 'une colonne obligatoire manquante',
  duplicateColumn: 'deux colonnes du même titre dans un onglet',
  missingValue: 'une case obligatoire vide',
  unknownWord: 'un mot hors des listes',
  unreadable: 'un montant, un nombre ou une date illisible, ou une date impossible',
  example: 'une ligne d’exemple du modèle',
  emptyAccounts: `un onglet ${quoted(SHEETS.accounts)} sans aucune ligne`,
  strayValue: `une ligne de ${quoted(SHEETS.accounts)} sans ${accountsTitle('account')} (ou sans ${accountsTitle('line')}) qui remplit pourtant des cases de compte (ou de placement)`,
  duplicateLine: `deux lignes de ${quoted(SHEETS.accounts)} sur les mêmes Banque, Compte et Ligne, sans identifiant pour les distinguer`,
  duplicateId: 'un même identifiant sur deux placements',
  accountDisagrees: `un compte dont les lignes ne disent pas la même chose dans ${accountsTitle('type')}, ${accountsTitle('residence')}, ${accountsTitle('unlockOn')}, ${accountsTitle('slow')} ou ${accountsTitle('financedLine')}, ou un identifiant de compte sur deux comptes différents`,
  ambiguousAccount: 'une ligne sans identifiant de compte quand plusieurs comptes à identifiant portent ses Banque et Compte',
  categoryNeeded: `une catégorie vide pour un type de compte qui n’en a pas par défaut (${quoted(ACCOUNT_TYPES.other.label)})`,
  categoryOnLoan: `une catégorie sur un ${quoted(ACCOUNT_TYPES.loan.label)}`,
  groupNotAllowed: 'un chapitre qui n’est pas un chapitre de la catégorie du placement',
  kindNotAllowed: 'une façon de compter que le type de compte ne permet pas',
  loanCurrency: `un ${quoted(ACCOUNT_TYPES.loan.label)} dans une autre devise que EUR`,
  badSymbol: `un ${accountsTitle('symbol')} qui n’est pas un symbole boursier`,
  placementNotAllowed: `un compte rangé là où le site ne le range pas${NB}: un ${quoted(ACCOUNT_TYPES.home.label)} ailleurs que dans ${quoted(HOME_NAME)}, dans ${quoted(HOME_NAME)} autre chose qu’un ${quoted(ACCOUNT_TYPES.home.label)}, de l’${quoted(ACCOUNT_TYPES.gold.label)} ou de la ${quoted(ACCOUNT_TYPES.crypto.label)}, un ${quoted(ACCOUNT_TYPES.loan.label)} à l’${quoted(ACCOUNT_TYPES['employee-savings'].label)} ou chez une plateforme de crypto`,
  slowByType: `${accountsTitle('slow')} à ${quoted(SETTING_VALUES.yes)} pour un compte dont le type décide (${SLOW_BY_TYPE.map((id) => quoted(ACCOUNT_TYPES[id].label)).join(', ')})`,
  financedNotLoan: `${accountsTitle('financedLine')} rempli pour un compte qui n’est pas un ${quoted(ACCOUNT_TYPES.loan.label)}`,
  residenceNotHome: `${accountsTitle('residence')} rempli pour un compte qui n’est pas un ${quoted(ACCOUNT_TYPES.home.label)}`,
  financedLine: `${accountsTitle('financedLine')} qui ne désigne aucun placement, en désigne plusieurs, ou désigne un placement qui n’est pas d’un compte ${quoted(ACCOUNT_TYPES.home.label)}`,
} as const

const snapshotsTitle = (key: string) => titleOf('snapshots', key)

// The sheets « Relevés » and « Versements ».
export const SNAPSHOT_REFUSALS = {
  noSnapshot: 'aucun relevé',
  emptyRow: `une ligne de ${quoted(SHEETS.snapshots)} qui n’a que sa date, sans placement ni ${snapshotsTitle('number')}`,
  snapshotNumber: `un même ${snapshotsTitle('number')} sur deux dates, ou une date dont certaines lignes ont un numéro et d’autres non`,
  unknownLine: `une ligne de ${quoted(SHEETS.snapshots)} ou de ${quoted(SHEETS.contributions)} dont le placement ou le compte n’est pas dans ${quoted(SHEETS.accounts)}, ou y en désigne plusieurs`,
  wrongColumns: `un placement en ${quoted(KIND_NAMES.amount)} sans ${snapshotsTitle('amount')} ou avec des parts, un placement en ${quoted(KIND_NAMES.units)} sans ses parts et leur prix ou avec un ${snapshotsTitle('amount')}`,
  negativeUnits: 'un nombre de parts ou un prix négatif',
  positiveLoan: 'un crédit positif',
  seenAfter: 'un chiffre vu après la date de son relevé',
  futureSnapshot: 'un relevé daté après aujourd’hui',
  rate: 'une devise sans taux, un taux sur une ligne en EUR, un taux nul ou négatif, ou deux taux pour une devise dans un relevé',
  duplicateEntry: 'un même placement deux fois dans un relevé',
  contributionSnapshot: `un versement dont le relevé n’est pas dans ${quoted(SHEETS.snapshots)}, ou une date qui a plusieurs relevés sans le ${snapshotsTitle('number')}`,
  contributionNotAllowed: 'un versement sur un compte qui n’en reçoit pas',
  duplicateContribution: 'deux versements pour un même compte dans un relevé',
  currencyShown: `un ${snapshotsTitle('currencyShown')} rempli qui n’est pas la devise de la ligne dans ${quoted(SHEETS.accounts)}`,
} as const

// The file as a whole.
export const FILE_REFUSALS = {
  notExcel: 'un fichier qui n’est pas un fichier Excel (.xlsx)',
  tooBig: `un fichier de plus de ${MAX_IMPORT_BYTES / (1024 * 1024)}${NB}Mo`,
  duplicateSheet: 'deux onglets du même nom (majuscules et accents ne comptent pas)',
} as const

// The sheet « Objectifs ».
export const GOAL_REFUSALS = {
  goalTotal: 'des objectifs dont le total ne fait pas 100',
  goalShare: 'une part d’objectif qui n’est pas un nombre entier de pour cent',
  goalFraction: 'une ligne d’objectifs d’une seule part à 1 et des autres à 0 (1 ou 100 pour cent, on ne sait pas)',
  cushionMonths: 'un nombre de mois pour l’argent disponible qui n’est pas proposé (de 1 à 24, par demi-mois en dessous de 3)',
  cushionShare: 'des mois pour l’argent disponible avec, en plus, une part en pour cent pour lui',
} as const

// The sheet « Réglages ».
export const SETTING_REFUSALS = {
  duplicateSetting: 'un même réglage écrit deux fois',
  budgetPair: 'un budget sans sa base, ou l’inverse',
  budgetAmount: 'un budget mensuel nul ou négatif',
} as const

export const REFUSALS = {
  ...FILE_REFUSALS,
  ...ACCOUNT_REFUSALS,
  ...SNAPSHOT_REFUSALS,
  ...GOAL_REFUSALS,
  ...SETTING_REFUSALS,
} as const

export type RefusalKey = keyof typeof REFUSALS

// Trim, lower case, no accents, inner spaces collapsed, curly and straight apostrophes equal.
export function normalizeWord(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’‘ʼ`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// Finds the value of a word written in a cell; undefined when the cell is not one of the labels.
export function wordLookup<T>(entries: [label: string, value: T][]): (cell: Cell) => T | undefined {
  const map = new Map(entries.map(([label, value]) => [normalizeWord(label), value]))
  return (cell) => (typeof cell === 'string' ? map.get(normalizeWord(cell)) : undefined)
}

export type Read<T> = { ok: true; value: T } | { ok: false; reason: string }
type Reader<T> = (cell: Cell) => Read<T | null>

const empty = (cell: Cell) => cell === null || (typeof cell === 'string' && cell.trim() === '')
const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason })

// Spaces of every width (thin, no-break…) and the euro sign are dropped; « , » is the decimal mark.
function parseNumber(text: string): number | null {
  const plain = text.replace(/[\s   €]/g, '').replace(/^−/, '-')
  return /^[+-]?\d+([.,]\d+)?$/.test(plain) ? Number(plain.replace(',', '.')) : null
}

function numberOf(cell: Cell): number | null | undefined {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : undefined
  if (typeof cell === 'string') return parseNumber(cell) ?? undefined
  return undefined
}

export const readText: Reader<string> = (cell) => {
  if (empty(cell)) return { ok: true, value: null }
  if (typeof cell === 'string') return { ok: true, value: cell.trim() }
  if (typeof cell === 'number') return { ok: true, value: String(cell) }
  return fail('un texte est attendu')
}

export const readEuros: Reader<Cents> = (cell) => {
  if (empty(cell)) return { ok: true, value: null }
  const euros = numberOf(cell)
  if (euros === undefined || euros === null) return fail('un montant en euros est attendu, par exemple 1 200,50')
  // toPrecision drops the float noise (1.005 * 100) before rounding half away from zero.
  const cents = Math.round(Number((Math.abs(euros) * 100).toPrecision(12))) * Math.sign(euros)
  return { ok: true, value: cents === 0 ? 0 : cents }
}

export const readDecimal: Reader<number> = (cell) => {
  if (empty(cell)) return { ok: true, value: null }
  const value = numberOf(cell)
  if (value === undefined || value === null) return fail('un nombre est attendu, par exemple 12,5')
  return { ok: true, value: value === 0 ? 0 : value }
}

// Plain numbers: the caller checks the range (and spots a row written as fractions, like 0.25).
export const readPercent: Reader<number> = (cell) => {
  if (empty(cell)) return { ok: true, value: null }
  const value = typeof cell === 'string' ? numberOf(cell.replace('%', '')) : numberOf(cell)
  if (value === undefined || value === null || value < 0) return fail('un pourcentage est attendu, par exemple 25')
  return { ok: true, value: value === 0 ? 0 : value }
}

const iso = (year: number, month: number, day: number): IsoDate | null => {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date.toISOString().slice(0, 10)
}

// The cell of a date: midnight UTC, the day `readDate` reads back.
export const dateCell = (date: IsoDate): Date => new Date(`${date}T00:00:00.000Z`)

// Excel counts days from 30 December 1899 (which absorbs its 1900 leap-year bug for any recent date).
const EXCEL_EPOCH = Date.UTC(1899, 11, 30)

export const readDate: Reader<IsoDate> = (cell) => {
  if (empty(cell)) return { ok: true, value: null }
  const bad = fail('une date est attendue, par exemple 05/11/2026')
  let value: IsoDate | null = null
  if (cell instanceof Date) {
    const year = cell.getUTCFullYear()
    value = Number.isNaN(cell.getTime()) || year < 1000 || year > 9999 ? null : cell.toISOString().slice(0, 10)
  } else if (typeof cell === 'number') {
    // Only a plausible serial is a date: 20000 is 1954, 73051 is 2100. A bare 2026 is a year, not a day.
    if (!Number.isFinite(cell) || cell < 20000 || cell >= 73051) return fail('ce nombre n’est pas une date')
    value = new Date(EXCEL_EPOCH + Math.floor(cell) * 86_400_000).toISOString().slice(0, 10)
  } else if (typeof cell === 'string') {
    const text = cell.trim()
    const french = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text)
    const standard = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
    if (french) value = iso(Number(french[3]), Number(french[2]), Number(french[1]))
    else if (standard) value = iso(Number(standard[1]), Number(standard[2]), Number(standard[3]))
  }
  return value === null ? bad : { ok: true, value }
}

// Empty means no. Always a boolean, never null.
export function readYesNo(cell: Cell): Read<boolean> {
  if (typeof cell === 'boolean') return { ok: true, value: cell }
  if (empty(cell)) return { ok: true, value: false }
  const word = typeof cell === 'string' ? normalizeWord(cell) : ''
  if (word === SETTING_VALUES.yes) return { ok: true, value: true }
  if (word === SETTING_VALUES.no) return { ok: true, value: false }
  return fail('« oui » ou « non » est attendu')
}
