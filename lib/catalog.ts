import type { AccountTypeId, CategoryId, CurrencyCode, Establishment, GoalCategory, GoalShares, GroupId, Residence } from '@/lib/model/types'

export const GROUP_LABELS: Record<GroupId, string> = {
  'euro-fund': 'Fonds euros',
  'money-market': 'Monétaire',
  // The loans left for « Hors bourse » (docs/superpowers/specs/2026-11-12-frontieres-des-categories-design.md).
  bonds: 'Obligations',
  europe: 'Europe',
  us: 'États-Unis',
  japan: 'Japon',
  emerging: 'Pays émergents',
  world: 'Fonds monde',
  // Metals, rare earths, commodity ETCs and miners' funds (Nicolas, 14 November 2026): not « Or et crypto ».
  commodities: 'Matières premières',
  unlisted: 'Hors bourse (non coté, prêts)',
  unknown: 'Je ne sais pas',
}

export const RANGED_GROUPS = {
  secured: ['euro-fund', 'money-market', 'bonds', 'unknown'],
  markets: ['europe', 'us', 'japan', 'emerging', 'world', 'commodities', 'unlisted', 'unknown'],
} as const satisfies Record<string, readonly GroupId[]>

export type RangedCategory = keyof typeof RANGED_GROUPS

export const isRanged = (category: CategoryId): category is RangedCategory => Object.hasOwn(RANGED_GROUPS, category)

export const CATEGORY_ORDER = ['available', 'secured', 'markets', 'gold', 'property'] as const satisfies readonly CategoryId[]

export const CATEGORIES: Record<CategoryId, { label: string }> = {
  available: { label: 'Argent disponible' },
  secured: { label: 'Épargne sécurisée' },
  markets: { label: 'Placements en bourse' },
  gold: { label: 'Or et crypto' },
  property: { label: 'Immobilier' },
}

// The goal keys, from the most liquid to the least: the one list every reader of a goal goes through.
export const GOAL_CATEGORIES = ['available', 'secured', 'markets', 'gold', 'rental'] as const satisfies readonly GoalCategory[]

export const GOAL_LABELS: Record<GoalCategory, string> = {
  available: CATEGORIES.available.label,
  secured: CATEGORIES.secured.label,
  markets: CATEGORIES.markets.label,
  gold: CATEGORIES.gold.label,
  rental: 'Immobilier locatif',
}

// The colour of a goal key: its category's, the rental taking the property one (no sixth colour).
export const GOAL_COLOR: Record<GoalCategory, CategoryId> = {
  available: 'available',
  secured: 'secured',
  markets: 'markets',
  gold: 'gold',
  rental: 'property',
}

export const RESIDENCE_LABELS: Record<Residence, string> = {
  main: 'Résidence principale',
  secondary: 'Résidence secondaire',
  rental: 'Investissement locatif',
}

// The three types, in the order they are offered: from the home one lives in to the one rented out.
export const RESIDENCES: readonly Residence[] = ['main', 'secondary', 'rental']

// The name proposed for a new home once its type is chosen, until a name is typed in. Not the
// type's own words for a rental: the fiche shows the type on its own row, under the name.
export const RESIDENCE_NAMES: Record<Residence, string> = {
  main: 'Logement',
  secondary: 'Résidence secondaire',
  rental: 'Logement en location',
}

// `at` is what follows « Qu’as-tu » (« au Crédit Agricole », « chez LCL »…).
export const BANKS: readonly { id: string; name: string; at: string }[] = [
  { id: 'credit-agricole', name: 'Crédit Agricole', at: 'au Crédit Agricole' },
  { id: 'bnp-paribas', name: 'BNP Paribas', at: 'chez BNP Paribas' },
  { id: 'societe-generale', name: 'Société Générale', at: 'à la Société Générale' },
  { id: 'credit-mutuel', name: 'Crédit Mutuel', at: 'au Crédit Mutuel' },
  { id: 'la-banque-postale', name: 'La Banque Postale', at: 'à La Banque Postale' },
  { id: 'caisse-d-epargne', name: 'Caisse d’Épargne', at: 'à la Caisse d’Épargne' },
  { id: 'banque-populaire', name: 'Banque Populaire', at: 'à la Banque Populaire' },
  { id: 'lcl', name: 'LCL', at: 'chez LCL' },
  { id: 'cic', name: 'CIC', at: 'au CIC' },
  { id: 'boursobank', name: 'BoursoBank', at: 'chez BoursoBank' },
  { id: 'fortuneo', name: 'Fortuneo', at: 'chez Fortuneo' },
  { id: 'revolut', name: 'Revolut', at: 'chez Revolut' },
]

// Found by the search only; their phrase is always « chez {name} ».
export const OTHER_BANKS: readonly { id: string; name: string }[] = [
  { id: 'hello-bank', name: 'Hello bank!' },
  { id: 'monabanq', name: 'Monabanq' },
  { id: 'n26', name: 'N26' },
  { id: 'nickel', name: 'Nickel' },
  { id: 'sumeria', name: 'Sumeria' },
  { id: 'trade-republic', name: 'Trade Republic' },
  { id: 'degiro', name: 'Degiro' },
  { id: 'bourse-direct', name: 'Bourse Direct' },
  { id: 'interactive-brokers', name: 'Interactive Brokers' },
  { id: 'saxo-banque', name: 'Saxo Banque' },
  { id: 'linxea', name: 'Linxea' },
  { id: 'placement-direct', name: 'Placement-direct' },
  { id: 'yomoni', name: 'Yomoni' },
  { id: 'nalo', name: 'Nalo' },
  { id: 'ramify', name: 'Ramify' },
  { id: 'binance', name: 'Binance' },
  { id: 'coinbase', name: 'Coinbase' },
  { id: 'kraken', name: 'Kraken' },
  { id: 'hsbc', name: 'HSBC' },
  { id: 'credit-cooperatif', name: 'Crédit Coopératif' },
  { id: 'axa', name: 'Axa' },
  { id: 'generali', name: 'Generali' },
  { id: 'amundi-epargne-salariale', name: 'Amundi Épargne Salariale' },
  { id: 'natixis-interepargne', name: 'Natixis Interépargne' },
]

const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/'/g, '’').toLowerCase()

export function searchBanks(query: string): { id: string; name: string; at: string }[] {
  const needle = plain(query.trim())
  if (needle === '') return []
  const found = [
    ...BANKS,
    ...OTHER_BANKS.map((b) => ({ ...b, at: `chez ${b.name}` })),
  ]
  return found.filter((b) => plain(b.name).includes(needle)).map(({ id, name, at }) => ({ id, name, at }))
}

export function bankAt(establishment: Establishment): string {
  const { catalogId, name } = establishment
  const bank = catalogId === undefined ? undefined : BANKS.find((b) => b.id === catalogId)
  if (bank) return bank.at
  const other = catalogId === undefined ? undefined : OTHER_BANKS.find((b) => b.id === catalogId)
  return `chez ${other ? other.name : name}`
}

export const OUTSIDE_BANKS: readonly { id: string; label: string; accountType: AccountTypeId }[] = [
  { id: 'my-home', label: 'Mon logement', accountType: 'home' },
  { id: 'other-home', label: 'Un autre logement', accountType: 'home' },
  { id: 'gold', label: 'De l’or que tu gardes toi-même', accountType: 'gold' },
  { id: 'crypto', label: 'De la crypto sur ton propre portefeuille', accountType: 'crypto' },
  { id: 'employee-savings', label: 'Mon épargne salariale', accountType: 'employee-savings' },
]

// Ids a lot 3 profile may still hold in `firstLaunch.planned`: readable, never offered nor written again.
export const LEGACY_OUTSIDE_IDS: readonly string[] = ['loan']

// Establishments whose first thing is crypto: the picker puts « Crédit, or et crypto » first for them.
export const CRYPTO_PLATFORMS: readonly string[] = ['binance', 'coinbase', 'kraken']

// Account types that hold several lines, one per fund or share. Any other type holds one line,
// which carries the account's name.
export const MULTI_LINE_TYPES: readonly AccountTypeId[] = ['life-insurance', 'per', 'pea', 'pea-pme', 'securities', 'employee-savings']

type LineKind = 'amount' | 'units'

export type AccountTypeInfo = {
  label: string
  explanation?: string
  family: 'everyday' | 'investments' | 'retirement' | 'holdings' | 'outside' | 'other'
  lineKinds: readonly LineKind[]
  defaultCategory: Partial<Record<LineKind, CategoryId>>
  change: 'all' | 'cost-basis' | 'contributions' | 'repayment' | 'property'
}

export const FAMILY_LABELS = {
  everyday: 'Comptes et livrets',
  investments: 'Placements',
  retirement: 'Retraite et entreprise',
  holdings: 'Crédit, or et crypto',
} as const

const savings = (label: string, explanation?: string): AccountTypeInfo => ({
  label,
  explanation,
  family: 'everyday',
  lineKinds: ['amount'],
  defaultCategory: { amount: 'available' },
  change: 'all',
})

export const ACCOUNT_TYPES: Record<AccountTypeId, AccountTypeInfo> = {
  current: savings('Compte courant'),
  'livret-a': savings('Livret A'),
  ldds: savings('LDDS', 'livret de développement durable et solidaire'),
  lep: savings('LEP', 'livret d’épargne populaire'),
  'livret-jeune': savings('Livret jeune'),
  'pel-cel': savings('PEL ou CEL', 'plan ou compte d’épargne logement'),
  'other-savings': savings('Autre livret'),
  'life-insurance': {
    label: 'Assurance-vie',
    family: 'investments',
    lineKinds: ['amount', 'units'],
    defaultCategory: { amount: 'secured', units: 'markets' },
    change: 'contributions',
  },
  per: {
    label: 'PER',
    explanation: 'plan d’épargne retraite',
    family: 'retirement',
    lineKinds: ['amount', 'units'],
    defaultCategory: { amount: 'secured', units: 'markets' },
    change: 'contributions',
  },
  'employee-savings': {
    label: 'Épargne salariale',
    explanation: 'l’épargne proposée par ton entreprise (PEE, PERCOL)',
    family: 'retirement',
    lineKinds: ['amount', 'units'],
    defaultCategory: { amount: 'markets', units: 'markets' },
    change: 'contributions',
  },
  pea: {
    label: 'PEA',
    explanation: 'plan d’épargne en actions',
    family: 'investments',
    lineKinds: ['units', 'amount'],
    defaultCategory: { amount: 'markets', units: 'markets' },
    change: 'cost-basis',
  },
  // Its own envelope beside the PEA (Nicolas, 11 November 2026): counted exactly as a PEA.
  'pea-pme': {
    label: 'PEA-PME',
    explanation: 'plan d’épargne en actions pour les PME et les ETI',
    family: 'investments',
    lineKinds: ['units', 'amount'],
    defaultCategory: { amount: 'markets', units: 'markets' },
    change: 'cost-basis',
  },
  securities: {
    label: 'Compte-titres',
    family: 'investments',
    lineKinds: ['units', 'amount'],
    defaultCategory: { amount: 'markets', units: 'markets' },
    change: 'cost-basis',
  },
  gold: {
    label: 'Or',
    family: 'holdings',
    lineKinds: ['units', 'amount'],
    defaultCategory: { amount: 'gold', units: 'gold' },
    change: 'cost-basis',
  },
  crypto: {
    label: 'Crypto',
    family: 'holdings',
    lineKinds: ['units', 'amount'],
    defaultCategory: { amount: 'gold', units: 'gold' },
    change: 'cost-basis',
  },
  home: {
    label: 'Logement',
    family: 'outside',
    lineKinds: ['amount'],
    defaultCategory: { amount: 'property' },
    change: 'property',
  },
  // A loan is a debt: no category, it is subtracted from the property it finances.
  loan: {
    label: 'Crédit',
    explanation: 'ce qu’il te reste à rembourser',
    family: 'holdings',
    lineKinds: ['amount'],
    defaultCategory: {},
    change: 'repayment',
  },
  // The person picks the category themselves.
  other: {
    label: 'Autre compte',
    explanation: 'Je ne trouve pas mon compte',
    family: 'other',
    lineKinds: ['amount', 'units'],
    defaultCategory: {},
    change: 'all',
  },
}

// Yahoo has the price of a listed share or fund, and of a crypto (since 11 November 2026, decided
// by Nicolas); not of a gold coin or bar.
export function canFollowPrice(type: AccountTypeId): boolean {
  return ACCOUNT_TYPES[type].lineKinds.includes('units') && type !== 'gold'
}

// The currencies a line can be in. Adding one is one line here, as long as the
// ECB publishes it. `feminine` makes the sentences agree (« les livres sterling
// sont converties »).
export const CURRENCIES: readonly { code: CurrencyCode; words: string; feminine?: true }[] = [
  { code: 'EUR', words: 'euros' },
  { code: 'USD', words: 'dollars américains' },
  { code: 'GBP', words: 'livres sterling', feminine: true },
  { code: 'CHF', words: 'francs suisses' },
]

// Example goals, in percent, order: available, secured, markets, gold, rental.
// Examples replaced on 2026-11-10 (spec 2026-11-10-criteres-des-experts, § 1); first validated by Nicolas on 2026-11-06.
// The rental share is 0 in each (spec 2026-11-10-immobilier-locatif).
// The months a cushion may aim at: by halves under 3, then whole months, up to two years.
export const CUSHION_MONTHS: readonly number[] = [1, 1.5, 2, 2.5, ...Array.from({ length: 22 }, (_, i) => i + 3)]

// The examples with a budget: the cushion in months, then the other shares of what it leaves — today's
// examples without their available share, brought back to 100
// (docs/superpowers/specs/2026-11-11-coussin-objectif-design.md).
export const CUSHION_PRESETS: Record<'prudent' | 'balanced' | 'dynamic', { months: number; shares: GoalShares }> = {
  prudent: { months: 6, shares: { available: 0, secured: 75, markets: 25, gold: 0, rental: 0 } },
  balanced: { months: 4, shares: { available: 0, secured: 33, markets: 60, gold: 7, rental: 0 } },
  dynamic: { months: 3, shares: { available: 0, secured: 17, markets: 72, gold: 11, rental: 0 } },
}

export const GOAL_PRESETS: Record<'prudent' | 'balanced' | 'dynamic', { label: string; shares: GoalShares }> = {
  prudent: { label: 'Prudent', shares: { available: 40, secured: 45, markets: 15, gold: 0, rental: 0 } },
  balanced: { label: 'Équilibré', shares: { available: 25, secured: 25, markets: 45, gold: 5, rental: 0 } },
  dynamic: { label: 'Dynamique', shares: { available: 10, secured: 15, markets: 65, gold: 10, rental: 0 } },
}
