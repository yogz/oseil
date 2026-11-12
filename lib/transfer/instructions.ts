// The two text sheets of the file: « Mode d’emploi », for the person, and « Pour une IA »,
// for an assistant asked to fill the template. Every list of words and every column title
// comes from the catalogue and from COLUMNS, the constants the import reads: the
// instructions cannot say a word the import refuses.
import { ACCOUNT_TYPES, BANKS, CATEGORIES, CURRENCIES, GROUP_LABELS, OTHER_BANKS, RANGED_GROUPS, RESIDENCE_LABELS } from '@/lib/catalog'
import { SITE_URL } from '@/lib/app/site-metadata'
import { canHold } from '@/lib/correct/profile-changes'
import type { AccountTypeId, CategoryId } from '@/lib/model/types'
import {
  ACCOUNT_REFUSALS,
  COLUMNS,
  EXAMPLE_BANK,
  FILE_REFUSALS,
  GOAL_REFUSALS,
  HOME_NAME,
  IMPORT_LINK,
  KIND_NAMES,
  PATH_SEPARATOR,
  PURCHASE_IN_EUROS_WORD,
  REFUSALS,
  SETTING_NAMES,
  SETTING_REFUSALS,
  SETTING_VALUES,
  SHEETS,
  SNAPSHOT_REFUSALS,
  dateCell,
  type Column,
} from './format'
import { formatError, type ImportError } from './import-types'
import type { Cell, ColumnFormat, SheetSpec } from './xlsx'

// What the loading could not read, per kind of document (the draft is never in the file).
export type Unreadable = { profile: number; snapshots: number; goals: number; settings: number }

const NB = ' '
const q = (text: string) => `«${NB}${text}${NB}»`
const list = (words: readonly string[]) => words.map(q).join(', ')
const typeLabel = (id: AccountTypeId) => q(ACCOUNT_TYPES[id].label)
const categoryLabel = (id: CategoryId) => q(CATEGORIES[id].label)
const typeIds = Object.keys(ACCOUNT_TYPES) as AccountTypeId[]
const yes = q(SETTING_VALUES.yes)

// The names the site knows (its logos, its words « chez BoursoBank »), as the import matches them:
// a bank written « Credit Agricol » is a stranger to the site.
const KNOWN_BANKS = [...BANKS, ...OTHER_BANKS].map((bank) => bank.name)

// What « Chez toi » may hold: the site's own rule (canHold), so the words cannot drift from the
// import. « Les comptes « Logement », « Or » ou « Crypto » ».
const homeTypes = typeIds
  .filter((id) => canHold({ id: '', name: HOME_NAME, kind: 'home' }, id))
  .sort((a, b) => Number(b === 'home') - Number(a === 'home'))
const HOME_TYPES = `${homeTypes.slice(0, -1).map(typeLabel).join(', ')} ou ${typeLabel(homeTypes.at(-1)!)}`
const no = q(SETTING_VALUES.no)
const RESIDENCES = list(Object.values(RESIDENCE_LABELS))
const MAIN_RESIDENCE = q(RESIDENCE_LABELS.main)

// An account with no line, a bank with no account: the import reads them back from their own row.
const lineTitle = COLUMNS.accounts.find((column) => column.key === 'line')!.title
const EMPTY_ROWS = `Une banque ou un compte encore vide a aussi sa ligne${NB}: le nom de la banque seul, ou les cases du compte avec ${q(lineTitle)} vide.`

// « 2 relevés n’ont pas pu être lus : ils manquent dans ce fichier. »
function missing(count: number, singular: string, plural: string): string {
  return count === 1
    ? `1 ${singular} n’a pas pu être lu${NB}: il manque dans ce fichier.`
    : `${count} ${plural} n’ont pas pu être lus${NB}: ils manquent dans ce fichier.`
}

export function unreadableLines(unreadable: Unreadable): string[] {
  const lines: string[] = []
  if (unreadable.profile > 0) lines.push(`Tes banques et tes comptes n’ont pas pu être lus${NB}: ils manquent dans ce fichier.`)
  if (unreadable.snapshots > 0) lines.push(missing(unreadable.snapshots, 'relevé', 'relevés'))
  if (unreadable.goals > 0) lines.push(missing(unreadable.goals, 'objectif', 'objectifs'))
  if (unreadable.settings > 0) lines.push(`Tes réglages n’ont pas pu être lus${NB}: ils manquent dans ce fichier.`)
  return lines
}

// The accepted words, the same lists for the person and for the assistant.
function wordLines(): string[] {
  const ranged = Object.entries(RANGED_GROUPS).map(
    ([category, groups]) => `dans ${categoryLabel(category as CategoryId)}${NB}: ${list(groups.map((id) => GROUP_LABELS[id]))}`,
  )
  return [
    `Banques connues${NB}: ${KNOWN_BANKS.join(', ')}. Une autre banque s’écrit sous son nom usuel.`,
    `Types de compte${NB}: ${list(typeIds.map((id) => ACCOUNT_TYPES[id].label))}.`,
    `Catégories${NB}: ${list(Object.values(CATEGORIES).map((c) => c.label))}.`,
    `Chapitres, ${ranged.join(`${NB}; `)}.`,
    `Types de logement, pour un compte ${typeLabel('home')} seulement${NB}: ${RESIDENCES}. Vide${NB}: ${MAIN_RESIDENCE}.`,
    `Façons de compter${NB}: ${list(Object.values(KIND_NAMES))}.`,
    `Devises${NB}: ${CURRENCIES.map((c) => `${c.code} (${c.words})`).join(', ')}. Vide${NB}: EUR.`,
    `Oui ou non${NB}: ${yes} ou ${no}, vide veut dire non.`,
  ]
}

export function guideNote(unreadable: Unreadable, options: { template?: boolean } = {}): string[] {
  return [
    'Tes chiffres en un fichier',
    `Ce fichier contient tout ton patrimoine${NB}: tes banques, tes comptes, tous tes relevés, tes versements, tes objectifs et tes réglages.`,
    'Il sert à ouvrir tes chiffres dans un tableur, à les montrer à un conseiller, ou à partir ailleurs. C’est aussi ta sauvegarde.',
    `Il est en clair${NB}: quiconque l’ouvre voit tes chiffres. Garde-le en lieu sûr.`,
    ...unreadableLines(unreadable),
    ...(options.template
      ? [
          'Remplis-le sur ordinateur, un onglet après l’autre.',
          `Les lignes de la banque ${q(EXAMPLE_BANK)} sont des exemples${NB}: efface-les ou remplace-les par tes chiffres. Un fichier qui en contient encore est refusé.`,
        ]
      : []),
    `Pour l’importer${NB}: sur un compte neuf, au premier lancement, avec ${q(IMPORT_LINK)}. L’import ne se fait que sur un coffre vide.`,
    `Depuis Numbers, exporte d’abord en Excel${NB}: Partager › Exporter › Excel sur iPhone, Fichier › Exporter vers › Excel sur Mac.`,
    `${q(SHEETS.accounts)}${NB}: une ligne par placement. ${EMPTY_ROWS} ${q(SHEETS.snapshots)}${NB}: une ligne par placement et par relevé. ${q(SHEETS.contributions)}, ${q(SHEETS.goals)} et ${q(SHEETS.settings)} sont facultatifs.`,
    `Une banque nommée ${q(HOME_NAME)} désigne ce que tu gardes toi-même${NB}: ton logement, de l’or, de la crypto sur ton propre portefeuille. Elle ne garde que les comptes ${HOME_TYPES}${NB}; tout le reste se range dans une banque.`,
    `Un crédit s’écrit en négatif dans ${q(SHEETS.snapshots)}${NB}: ce qu’il te reste à rembourser, par exemple -180000.`,
    `Réglages${NB}: ${q(SETTING_NAMES.budget)} (en euros) avec ${q(SETTING_NAMES.basis)} (${list(Object.values(SETTING_VALUES.basis))})${NB}; ${q(SETTING_NAMES.display)} (${list(Object.values(SETTING_VALUES.display))})${NB}; ${q(SETTING_NAMES.hidden)} (${yes} ou ${no}).`,
    `Les mots acceptés, à écrire tels quels (majuscules et accents ne comptent pas)${NB}:`,
    ...wordLines(),
    `L’onglet ${q(SHEETS.ai)} sert à faire remplir ce fichier par ton IA (ChatGPT, Claude, Gemini…).`,
  ]
}

// The example of the « Pour une IA » sheet: two relevés, three lines, one of them a loan.
// Written as is in a template, it imports without an error (a test of the import says so).
const exampleRow = (columns: readonly Column[], values: Record<string, Cell>): Cell[] =>
  columns.map((column) => values[column.key] ?? null)

const homePath = [HOME_NAME, 'Appartement', 'Appartement'].join(PATH_SEPARATOR)
const fund = { bank: 'Ma banque', account: 'PEA', line: 'Fonds monde' }
const home = { bank: HOME_NAME, account: 'Appartement', line: 'Appartement' }
const loan = { bank: 'Ma banque', account: 'Prêt immobilier', line: 'Prêt immobilier' }
const shares = { bank: 'Ma banque', account: 'Compte-titres', line: 'Apple' }

const exampleTable = (kind: 'accounts' | 'snapshots', rows: Record<string, Cell>[]): SheetSpec => ({
  name: SHEETS[kind],
  columns: COLUMNS[kind].map(({ title, format, width }) => ({ title, format, width })),
  rows: rows.map((values) => exampleRow(COLUMNS[kind], values)),
})

export const AI_EXAMPLE: SheetSpec[] = [
  exampleTable('accounts', [
    { ...fund, type: ACCOUNT_TYPES.pea.label, group: GROUP_LABELS.world, kind: KIND_NAMES.units },
    { ...home, type: ACCOUNT_TYPES.home.label },
    { ...loan, type: ACCOUNT_TYPES.loan.label, financedLine: homePath },
    { ...shares, type: ACCOUNT_TYPES.securities.label, group: GROUP_LABELS.us, kind: KIND_NAMES.units, currency: 'USD' },
  ]),
  exampleTable('snapshots', [
    { date: dateCell('2026-09-30'), ...fund, units: 20, unitPrice: 500.5 },
    { date: dateCell('2026-09-30'), ...home, amount: 250000 },
    { date: dateCell('2026-09-30'), ...loan, amount: -180000 },
    { date: dateCell('2026-09-30'), ...shares, units: 10, unitPrice: 230, averagePrice: 180, fx: 0.9 },
    { date: dateCell('2026-10-31'), ...fund, units: 20, unitPrice: 512.3, seenOn: dateCell('2026-10-28') },
    { date: dateCell('2026-10-31'), ...home, amount: 250000 },
    { date: dateCell('2026-10-31'), ...loan, amount: -179200 },
    { date: dateCell('2026-10-31'), ...shares, units: 10, unitPrice: 240, averagePrice: 180, fx: 0.92 },
  ]),
]

const pad = (n: number) => String(n).padStart(2, '0')

// A cell as an assistant would type it: dates « 30/09/2026 », a comma for the decimals.
function cellText(cell: Cell): string {
  if (cell instanceof Date) return `${pad(cell.getUTCDate())}/${pad(cell.getUTCMonth() + 1)}/${cell.getUTCFullYear()}`
  if (typeof cell === 'number') return String(cell).replace('.', ',')
  return String(cell)
}

// The example as Markdown tables, one per sheet, with only the columns it fills.
function exampleLines(): string[] {
  return AI_EXAMPLE.flatMap((sheet) => {
    const used = sheet.columns.map((_, at) => at).filter((at) => sheet.rows.some((row) => row[at] !== null))
    const cells = (values: string[]) => `| ${values.join(' | ')} |`
    return [
      `### Onglet ${q(sheet.name)}`,
      [
        cells(used.map((at) => sheet.columns[at].title)),
        cells(used.map(() => '---')),
        ...sheet.rows.map((row) => cells(used.map((at) => (row[at] === null ? '' : cellText(row[at]))))),
      ].join('\n'),
    ]
  })
}

const FORMAT_WORDS: Record<ColumnFormat, string> = {
  text: 'texte',
  euros: 'nombre, virgule pour les centimes',
  number: 'nombre, décimales permises',
  integer: 'nombre entier',
  date: 'date jj/mm/aaaa',
  percent: 'pour cent',
}

const contributionTypes = typeIds.filter((id) => ACCOUNT_TYPES[id].change === 'contributions')
const sameAsAccounts = `comme dans l’onglet ${q(SHEETS.accounts)}, qui doit avoir ce placement.`

// What each column holds, by sheet and by column key. A column missing here fails the build of the note.
const HELP: Record<'accounts' | 'snapshots' | 'contributions' | 'settings', Record<string, string>> = {
  accounts: {
    bank: `le nom de l’établissement, écrit comme dans la liste des banques connues plus bas quand il y est (par exemple ${q('Crédit Agricole')}, pas ${q('Credit Agricol')}). ${q(HOME_NAME)} désigne ce que la personne garde elle-même (son logement, de l’or, de la crypto sur son propre portefeuille), et seulement les comptes ${HOME_TYPES}${NB}: tout autre compte se range dans une banque, même quand la personne le détient en direct. Des actions au nominatif pur se rangent dans une banque au nom de la société (par exemple ${q('Air Liquide')}), en ${typeLabel('securities')}.`,
    account: 'le nom du compte. Vide seulement pour une banque encore vide, qui n’a que son nom sur sa ligne.',
    line: `le nom du placement (un fonds, une action), sans son code ISIN ni autre code entre parenthèses${NB}; pour un compte d’une seule ligne, comme un livret, le même nom que le compte. Vide seulement pour un compte encore vide, sans placement.`,
    type: 'un des types de compte de la liste plus bas, écrit exactement. Le même sur toutes les lignes d’un compte.',
    residence: `pour un compte ${typeLabel('home')} seulement, ${RESIDENCES}. Vide${NB}: ${MAIN_RESIDENCE}. Le même sur toutes les lignes du compte.`,
    category: `une des catégories de la liste plus bas. Vide, c’est la catégorie par défaut du type. Obligatoire pour ${typeLabel('other')}, interdite pour ${typeLabel('loan')}.`,
    group: `un des chapitres de la liste plus bas, seulement dans ${Object.keys(RANGED_GROUPS).map((id) => categoryLabel(id as CategoryId)).join(' et ')}.`,
    kind: `${list(Object.values(KIND_NAMES))}. Vide${NB}: la première façon que le type permet (liste plus bas).`,
    currency: `${CURRENCIES.map((c) => c.code).join(', ')}. Vide${NB}: EUR.`,
    symbol: 'le symbole boursier d’un placement en parts que le site suit, par exemple CW8.PA. Vide si inconnu.',
    unlockOn: 'la date où le compte se débloque, s’il est bloqué.',
    slow: `${yes} si l’argent est long à récupérer (non coté, placement bloqué). Vide${NB}: non.`,
    financedLine: `pour un ${typeLabel('loan')} seulement, le logement qu’il finance, écrit Banque › Compte › Ligne, par exemple ${q(homePath)}, ou l’identifiant du logement quand le site l’y a écrit. Ce placement doit être d’un compte ${typeLabel('home')}.`,
    closedOn: 'la date de fermeture du placement, s’il est fermé.',
    purchase: `pour un placement en parts dans une autre devise que l’euro, seulement si tu le connais${NB}: ce que valait 1${NB}€ dans cette devise au moment des achats (par exemple 1,08), ou ${q(PURCHASE_IN_EUROS_WORD)} si le prix moyen d’achat recopié est déjà en euros. Vide${NB}: le site le tire des taux de chaque relevé.`,
    reference: 'écrit par le site. Laisser vide.',
    accountReference: 'écrit par le site, il distingue deux comptes du même nom. Laisser vide.',
  },
  snapshots: {
    date: 'le jour du relevé. Toutes les lignes d’une même date forment un relevé.',
    number: 'laisser vide, sauf pour séparer deux relevés du même jour (alors 1, 2, 3… dans l’ordre des relevés). Un même numéro sur deux dates est refusé.',
    bank: sameAsAccounts,
    account: sameAsAccounts,
    line: sameAsAccounts,
    euroValue: 'calculé par le site. Laisser vide.',
    amount: `la valeur dans la devise de la ligne, obligatoire pour un placement en ${q(KIND_NAMES.amount)}. Négatif pour un ${typeLabel('loan')}, ce qu’il reste à rembourser, par exemple -180000.`,
    currencyShown: `calculé par le site. Laisser vide${NB}; rempli, ce doit être la devise de la ligne dans l’onglet ${q(SHEETS.accounts)}.`,
    units: `le nombre de parts, décimales permises, obligatoire pour un placement en ${q(KIND_NAMES.units)}.`,
    unitPrice: `le prix d’une part dans la devise de la ligne, obligatoire pour un placement en ${q(KIND_NAMES.units)}.`,
    averagePrice: `le prix moyen d’achat d’une part, si le relevé le donne. Vide${NB}: inconnu.`,
    seenOn: `le jour où ce chiffre a été vu, s’il est plus ancien que le relevé. Jamais après la date du relevé. Vide${NB}: la date du relevé.`,
    opened: `${yes} si le placement a été ouvert avec de l’argent neuf ce mois-là, ${no} s’il existait déjà. Ne compte que sur un relevé où la ligne n’était pas au relevé précédent. Vide si on ne sait pas.`,
    fx: `combien vaut une unité de la devise en euros ce jour-là, par exemple 0,92 pour un dollar qui vaut 0,92${NB}€. Obligatoire si la devise n’est pas EUR, vide pour EUR. Le même pour toutes les lignes d’une devise dans un relevé.`,
    reference: 'écrit par le site. Laisser vide.',
  },
  contributions: {
    date: `la date d’un relevé de l’onglet ${q(SHEETS.snapshots)}.`,
    number: `comme dans ${q(SHEETS.snapshots)}.`,
    bank: `comme dans l’onglet ${q(SHEETS.accounts)}, qui doit avoir ce compte.`,
    account: `comme dans l’onglet ${q(SHEETS.accounts)}, qui doit avoir ce compte.`,
    paid: `l’argent versé sur le compte depuis le relevé précédent, en euros${NB}; négatif pour un retrait. Seulement pour les comptes ${contributionTypes.map(typeLabel).join(', ')}.`,
    accountReference: 'écrit par le site. Laisser vide.',
  },
  settings: {
    name: `un de ${list(Object.values(SETTING_NAMES))}.`,
    value: `pour ${q(SETTING_NAMES.budget)}, un montant en euros${NB}; pour ${q(SETTING_NAMES.basis)}, ${list(Object.values(SETTING_VALUES.basis))}${NB}; pour ${q(SETTING_NAMES.display)}, ${list(Object.values(SETTING_VALUES.display))}${NB}; pour ${q(SETTING_NAMES.hidden)}, ${yes} ou ${no}.`,
  },
}

// Not required in every row, but required for some: the help says when.
const CONDITIONAL = new Set(['accounts.category', 'snapshots.amount', 'snapshots.units', 'snapshots.unitPrice', 'snapshots.fx'])

function obligation(kind: string, column: Column): string {
  if (column.computed) return 'calculé'
  if (column.quiet) return 'identifiant'
  if (kind === 'accounts' && column.key === 'account') return 'obligatoire sauf pour une banque encore vide'
  if (kind === 'accounts' && column.key === 'line') return 'obligatoire sauf pour un compte encore vide'
  if (kind === 'snapshots' && ['bank', 'account', 'line'].includes(column.key)) {
    return 'obligatoire sauf pour un relevé sans aucun placement'
  }
  if (column.required) return 'obligatoire'
  return CONDITIONAL.has(`${kind}.${column.key}`) ? 'selon le cas' : 'facultatif'
}

function columnLines(kind: keyof typeof COLUMNS): string[] {
  return COLUMNS[kind].map((column: Column) => {
    let help: string | undefined
    if (kind === 'goals') {
      if (column.key === 'from') help = 'la date à partir de laquelle l’objectif vaut.'
      // docs/superpowers/specs/2026-11-11-coussin-objectif-design.md: months, never a percent.
      else if (column.key === 'cushionMonths') {
        help = `vide, tout l’objectif est en pour cent. Rempli, l’argent disponible se vise en mois de dépenses${NB}: de 1 à 24, par demi-mois en dessous de 3 (1, 1,5, 2, 2,5, 3, 4…)${NB}; ${title('goals', 'available')} vaut alors 0, et les autres parts font 100 entre elles.`
      }
      else if (column.key === 'rental') {
        help = `la part visée pour les logements de type ${q(RESIDENCE_LABELS.rental)}, en pour cent comme les autres parts. Vide, ou colonne absente${NB}: 0.`
      } else {
        help = 'la part visée, en pour cent (voir la règle des parts, plus bas).'
      }
    } else {
      help = HELP[kind][column.key]
    }
    if (help === undefined) throw new Error(`instructions: no help for ${kind}.${column.key}`)
    return `${q(column.title)} (${obligation(kind, column)}, ${FORMAT_WORDS[column.format]})${NB}: ${help}`
  })
}

function typeLines(): string[] {
  return typeIds.map((id) => {
    const type = ACCOUNT_TYPES[id]
    const kinds = type.lineKinds.map((kind) => q(KIND_NAMES[kind])).join(' ou ')
    const defaults = type.lineKinds
      .map((kind) => type.defaultCategory[kind])
      .filter((category): category is CategoryId => category !== undefined)
    let category: string
    if (id === 'loan') category = 'pas de catégorie, c’est une dette'
    else if (defaults.length === 0) category = 'pas de catégorie par défaut, la remplir'
    else if (new Set(defaults).size === 1) category = `catégorie par défaut ${categoryLabel(defaults[0])}`
    else
      category = `catégorie par défaut ${type.lineKinds
        .map((kind) => `${categoryLabel(type.defaultCategory[kind]!)} en ${q(KIND_NAMES[kind])}`)
        .join(', ')}`
    // The explanation helps match a bank's words (« livret de développement durable »); those of a
    // loan and of « Autre compte » speak to the person, not of the type.
    const explanation = type.explanation && id !== 'loan' && id !== 'other' ? `, ${type.explanation}` : ''
    return `${q(type.label)}${explanation}${NB}: ${kinds}${NB}; ${category}.`
  })
}

// A column's title, quoted, found by its key.
function title(kind: keyof typeof COLUMNS, key: string): string {
  const column = (COLUMNS[kind] as readonly Column[]).find((c) => c.key === key)
  if (!column) throw new Error(`instructions: no column ${kind}.${key}`)
  return q(column.title)
}

const TABLES = ['accounts', 'snapshots', 'contributions', 'goals', 'settings'] as const

const ROLES: Record<(typeof TABLES)[number], string> = {
  accounts: `obligatoire, une ligne par placement (un livret, un fonds, une action, un logement, un crédit). ${EMPTY_ROWS}`,
  snapshots: `obligatoire, une ligne par placement et par relevé. Un relevé est la photo de tout le patrimoine à une date${NB}: il contient chaque placement que la personne avait alors, jamais une partie seulement. Il faut au moins un relevé.`,
  contributions: 'facultatif, l’argent versé ou retiré entre deux relevés, par compte.',
  goals: 'facultatif, une ligne par objectif de répartition.',
  settings: 'facultatif, deux colonnes. Un réglage absent garde sa valeur par défaut.',
}

// The refusals of REFUSALS are those the import makes, under the same keys (a test makes the
// import produce each one), and the import refuses under no other. One list per group, so that none
// is skimmed over in a block of text.
const REFUSAL_GROUPS: Array<[string, Record<string, string>]> = [
  ['Le fichier', FILE_REFUSALS],
  [`L’onglet ${q(SHEETS.accounts)}`, ACCOUNT_REFUSALS],
  [`Les onglets ${q(SHEETS.snapshots)} et ${q(SHEETS.contributions)}`, SNAPSHOT_REFUSALS],
  [`L’onglet ${q(SHEETS.goals)}`, GOAL_REFUSALS],
  [`L’onglet ${q(SHEETS.settings)}`, SETTING_REFUSALS],
]
function refusalLines(): string[] {
  return REFUSAL_GROUPS.flatMap(([heading, refusals]) => [`### ${heading}`, ...Object.values(refusals).map((r) => `- ${r}`)])
}

// The words for the person, at the top of the sheet « Pour une IA ».
const PERSON_LINES = [
  `Copie tout le texte de cet onglet dans ta conversation avec ton IA (ChatGPT, Claude, Gemini…). Il te demandera ce que tu as déjà (ton propre tableau, des captures d’écran de tes applis de banque, des relevés) et te rendra un fichier à importer.`,
  `Attention${NB}: ce que tu donnes à un assistant part chez lui, en clair.`,
]

// The words for the assistant: the same in the sheet and in the prompt copied from the import
// screen, which carries them whole so that nothing has to be joined (ChatGPT's free plan takes
// three files a day). The person does as little as possible: what they already have comes
// first, the questions come once, at the end, never line by line.
// The points an assistant most often misses, said at the top and again at the end (OpenAI's guide for
// long prompts: instructions at both ends; review of 11 November 2026 by three experts of Claude,
// ChatGPT and Gemini).
const KEEP_IN_MIND = [
  `Rends un seul fichier .xlsx avec tous les onglets, jamais un CSV (il n’a qu’un onglet).`,
  `Fais un seul relevé par défaut, qui contient tous les placements.`,
  `N’oublie pas les crédits${NB}: s’ils manquent, redemande-les une fois avant de rendre le fichier. Ils s’écrivent en négatif.`,
  `Ne devine jamais un montant, une date ni un taux${NB}; dis à la fin ce qui reste sans chiffre.`,
  `Avant de rendre le fichier, vérifie chaque point de ${q('Ce qui fait refuser le fichier')}.`,
]

function assistantLines(): string[] {
  return [
    '# Consignes pour l’assistant',
    '## À retenir',
    ...KEEP_IN_MIND.map((line) => `- ${line}`),
    '## Ton but',
    `Créer un fichier Excel (.xlsx) qui s’importe sans erreur dans Oseil, avec ces onglets et ces titres de colonnes exacts, les titres en première ligne. Si on t’a joint le modèle, remplis-le et laisse ${q(SHEETS.guide)} et ${q(SHEETS.ai)} tels quels${NB}; sinon, crée le fichier de zéro.`,
    '## Comment t’y prendre',
    `- Demande d’abord à la personne ce qu’elle a déjà, et prends ce qui lui demande le moins d’effort${NB}: un tableau à elle (Excel, Google Sheets, Numbers, un export d’une autre appli), sinon des captures d’écran de ses applis de banque ou ses relevés en PDF, tous d’un coup, sinon une liste tapée en vrac («${NB}Livret A, environ 12${NB}000${NB}€${NB}»).`,
    `- Dis-lui qu’elle peut masquer ses numéros de compte, son nom et son adresse avant de te les donner${NB}: ils ne servent pas.`,
    `- Un relevé contient tous les placements, jamais une partie. Par défaut, fais-en un seul, daté des chiffres les plus récents${NB}: un chiffre plus ancien (un relevé de banque d’un autre jour, un compte vu le mois d’avant) y entre aussi, avec sa propre date dans ${title('snapshots', 'seenOn')}. Ne crée jamais un relevé par document ou par date de document.`,
    `- Une date plus ancienne ne devient un relevé que si la personne a les chiffres de tout ce qu’elle avait à cette date, souvent dans son propre tableau${NB}: chaque date de ce tableau qui donne tout devient alors un relevé. Sinon, n’en fais pas un relevé.`,
    `- Ne pose pas les questions ligne par ligne. Quand tout est lu, demande en une seule fois ce qui manque encore pour remplir les cases obligatoires, et ce qu’on oublie souvent${NB}: un crédit (immobilier, à la consommation), l’épargne salariale (PEE, PERCOL), une assurance-vie, un PER, des parts d’une société non cotée, un compte dans une autre banque, de l’or ou de la crypto. Ne rien inventer${NB}: une valeur inconnue reste vide quand la colonne le permet, sinon demande-la. Ne devine jamais un montant, une date ni un taux.`,
    `- Les crédits ne se sautent pas${NB}: sans eux, le patrimoine net est faux, trop haut. Si la personne demande le fichier sans avoir répondu sur ses crédits, redemande-le une fois, en une phrase, avant de le rendre.`,
    `- Ce que tu sais exister sans en avoir le chiffre (un crédit sans capital restant dû, un PEE sans valeur, un chiffre dont tu ne connais pas la date) va quand même dans ${q(SHEETS.accounts)}, sans ligne dans ${q(SHEETS.snapshots)}${NB}: Oseil le signale à l’import et le demande à la prochaine mise à jour. Ne le laisse jamais de côté. Termine en disant à la personne lesquels sont sans chiffre.`,
    `- N’y mets aucune ligne de la banque ${q(EXAMPLE_BANK)}${NB}: un fichier qui en contient encore est refusé.`,
    `- Dans le fichier, un montant peut être un nombre (500,5) ou du texte (${q('500,50')}), une date une vraie date Excel ou du texte jj/mm/aaaa${NB}: les deux sont acceptés.`,
    `- Rends un seul fichier .xlsx à télécharger, avec tous les onglets. Jamais de CSV, qui n’a qu’un onglet. Si tu ne peux pas créer de fichier, donne un tableau par onglet, titres en première ligne, et explique à la personne comment les coller dans Google Sheets (un onglet par tableau, nommé comme ici), puis Fichier › Télécharger › Microsoft Excel (.xlsx).`,
    '## Les onglets',
    ...TABLES.map((kind) => `- ${q(SHEETS[kind])}${NB}: ${ROLES[kind]}`),
    ...TABLES.flatMap((kind) => [`## Les colonnes de ${q(SHEETS[kind])}`, ...columnLines(kind).map((line) => `- ${line}`)]),
    '## La règle des parts (onglet Objectifs)',
    `Chaque part est en pour cent, un nombre simple (25 pour 25${NB}%). Les parts d’une ligne font 100, ${title('goals', 'rental')} compris. Une ligne dont le total fait 1 est lue en fractions (0,25 pour 25${NB}%)${NB}; une ligne d’une seule part à 1 et des autres à 0 est refusée, écris alors 100.`,
    '## Les mots acceptés, écrits exactement (majuscules et accents ne comptent pas)',
    ...wordLines().map((line) => `- ${line}`),
    '## Chaque type de compte, ses façons de compter (la première est celle par défaut) et sa catégorie',
    ...typeLines().map((line) => `- ${line}`),
    // Where some investments go (Nicolas, 11 November 2026, after three experts in wealth management):
    // the right held (owner or lender) decides the category; the time to get the money back, « Long ».
    '## Où ranger certains placements',
    `Ce que la personne détient décide de la catégorie (propriétaire d’un bien ou prêteur)${NB}; le temps qu’il faut pour récupérer l’argent décide de ${title('accounts', 'slow')}.`,
    `- Crowdfunding immobilier (obligations ou prêts à un promoteur, par une plateforme)${NB}: un prêt, pas un bien. Catégorie ${categoryLabel('markets')}, dans le compte où il est (${typeLabel('pea-pme')}, ${typeLabel('securities')}), sinon un ${typeLabel('other')}${NB}; ${title('accounts', 'slow')} à ${q(SETTING_VALUES.yes)}, l’argent étant bloqué jusqu’à l’échéance. Sa valeur est le capital qui reste à rembourser, sans les intérêts à venir${NB}; pour un projet en retard ou en défaut, demande à la personne une valeur prudente, ne garde pas le montant de départ.`,
    `- SCPI, SCI, OPCI, club deal où l’on détient des parts, groupement forestier${NB}: de l’immobilier qu’on possède sans y vivre. Écris-le comme un compte ${typeLabel('home')} de type ${q(RESIDENCE_LABELS.rental)}, à son nom (même logé dans une assurance-vie), pour qu’il compte dans l’immobilier en location${NB}; ${title('accounts', 'slow')} à ${q(SETTING_VALUES.yes)}.`,
    `- Private equity, FCPR, FCPI, FIP, obligations, produits structurés${NB}: ${categoryLabel('markets')}${NB}; ${title('accounts', 'slow')} à ${q(SETTING_VALUES.yes)} pour ce qui n’est pas coté.`,
    `- Girardin${NB}: ne l’inscris pas, l’argent ne revient pas (c’est une réduction d’impôt achetée)${NB}; l’inscrire gonflerait le patrimoine.`,
    '## Les règles',
    `- Un compte se reconnaît à Banque + Compte, un placement à Banque + Compte + Ligne. ${title('accounts', 'type')}, ${title('accounts', 'residence')}, ${title('accounts', 'unlockOn')} et ${title('accounts', 'financedLine')} se répètent sur chaque ligne d’un compte, sans changer (une case vide sur une ligne et remplie sur une autre est un changement, sauf dans ${title('accounts', 'residence')}, où une case vide et ${MAIN_RESIDENCE} disent la même chose). ${title('accounts', 'slow')} se dit ligne par ligne.`,
    `- Une nouvelle ligne d’un compte existant n’a pas besoin de l’identifiant${NB}: ses Banque et Compte suffisent, tant qu’un seul compte porte ces noms.`,
    `- Un ${typeLabel('loan')} s’écrit en négatif dans ${q(SHEETS.snapshots)}${NB}: la somme de ${title('snapshots', 'euroValue')} d’un relevé donne alors le patrimoine net.`,
    `- ${title('snapshots', 'fx')} dit combien vaut une unité de la devise en euros${NB}: la valeur en euros est le montant multiplié par le taux.`,
    `- ${title('snapshots', 'number')}${NB}: vide, c’est la date qui fait le relevé. Rempli, c’est le numéro.`,
    `- ${title('snapshots', 'seenOn')}${NB}: jamais après la date du relevé. ${title('snapshots', 'opened')}${NB}: ne compte que sur un relevé où la ligne n’était pas au relevé précédent.`,
    `- Un relevé sans aucun placement s’écrit sur une seule ligne${NB}: sa date et son ${title('snapshots', 'number')} (obligatoire ici), toutes les autres cases vides. Une ligne qui n’a que sa date, sans numéro, est refusée.`,
    `- Un placement absent d’un relevé n’est pas compté à cette date. Un placement fermé porte sa date dans ${title('accounts', 'closedOn')}, qui s’écrit telle quelle, même après le dernier relevé.`,
    `- ${title('accounts', 'financedLine')} désigne un placement d’un compte ${typeLabel('home')}, ouvert ou non.`,
    '## Ce qui fait refuser le fichier',
    ...refusalLines(),
    '## Un petit exemple complet (deux relevés, quatre placements dont un crédit et des actions en dollars)',
    ...exampleLines(),
    '## Avant de rendre le fichier',
    `Relis ${q('Ce qui fait refuser le fichier')} point par point et corrige ce qui ne va pas, sans le demander. Puis rappelle-toi${NB}:`,
    ...KEEP_IN_MIND.slice(0, 4).map((line) => `- ${line}`),
    `Dis enfin à la personne que tu as fait cette vérification, et lesquels de ses placements sont sans chiffre.`,
  ]
}

export function aiNote(): string[] {
  return [...PERSON_LINES, ...assistantLines()]
}

// What the person pastes into ChatGPT or Claude (the import screen's « Copier la consigne »): the
// whole of the assistant's part of « Pour une IA », so no file has to be joined. No figure in it:
// it is the same text for everyone, and Oseil never sends it anywhere.
// The one sentence the import copies (Nicolas, 11 November 2026): the AI reads the whole instructions at
// /consignes-ia.md (app/consignes-ia.md/route.ts). AI_PROMPT stays for an AI that cannot open a link.
export const AI_LINK_PROMPT = `Ouvre ${SITE_URL}/consignes-ia.md et suis ses consignes à la lettre${NB}: elles expliquent comment faire, à partir des relevés que je vais te donner, le fichier Excel à importer dans Oseil. Pour me montrer que tu l’as lue, cite-moi d’abord les noms des onglets du fichier. Si tu ne peux pas l’ouvrir, dis-le-moi sans rien inventer.`

export const AI_PROMPT = [
  `Aide-moi à mettre mon patrimoine dans Oseil, un site de suivi de patrimoine, par un fichier Excel à importer. Voici comment faire.`,
  ...assistantLines(),
].join('\n\n')

// What the person copies from the errors screen back to the AI that made the file: every error,
// not only those shown, and the reminder an AI tends to miss (a line moved in « Comptes » is moved
// in the other sheets too). The errors name the person's own lines; this text is only copied,
// never sent by Oseil.
export function errorsPrompt(errors: ImportError[]): string {
  return [
    `L’import d’Oseil refuse le fichier que tu m’as rendu. Corrige ces points, sans oublier les lignes des autres onglets qui en dépendent${NB}: un placement renommé ou déplacé dans ${q(SHEETS.accounts)} l’est aussi dans ${q(SHEETS.snapshots)} et ${q(SHEETS.contributions)}. Puis rends-moi le fichier corrigé.`,
    errors.map(formatError).join('\n'),
  ].join('\n\n')
}

