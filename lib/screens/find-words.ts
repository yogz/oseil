// The words of « Trouver » (docs/superpowers/specs/2026-11-14-trouver-design.md), and the anchors its
// rows lead to. The pages put these ids on their sections; this file is their one source.

export const FIND_LABEL = 'Trouver'
export const FIND_CLOSE = 'Fermer'
export const FIND_EMPTY = 'Une action, un compte, un mois, un réglage.'
export const FIND_NONE = 'Rien ne porte ce nom chez toi.'
export const FIND_FOOTER = 'Tout se cherche sur ton téléphone, rien ne part.'
export const FIND_LOAD_FAILED = 'Tes chiffres n’ont pas pu être chargés.'
export const FIND_RETRY = 'Réessayer'

export const LINES_TITLE = 'Tes lignes'
export const ACCOUNTS_TITLE = 'Tes comptes'
export const STATEMENTS_TITLE = 'Tes relevés'
export const SETTINGS_TITLE = 'Dans les réglages'
export const ACTIONS_TITLE = 'Ce que tu peux faire'

export const CLOSED = 'fermée'
export const AT_HOME = 'chez toi'

// « Voir l’autre », « Voir les 3 autres »: the rows of a group beyond the first five.
export const moreWords = (count: number) => (count === 1 ? 'Voir l’autre' : `Voir les ${count} autres`)

// The line under the answer: « sur 2 comptes · 12 % de ce qui est à toi · +8,2 % depuis l’achat ».
export const onAccounts = (count: number) => `sur ${count} comptes`
export const shareOfYours = (percent: string) => `${percent} de ce qui est à toi`
export const LESS_THAN_ONE_PERCENT = 'moins de 1 %'
export const sinceBought = (percent: string) => `${percent} depuis l’achat`
export const DETAIL_SEPARATOR = ' · '

export const followQuote = (name: string) => `Relier « ${name} » à son cours`
export const UPDATE_FIGURES = 'Mettre à jour tes chiffres'
export const correctStatement = (date: string) => `Corriger le relevé du ${date}`
export const TITLES_SCREEN = 'Tes titres et leurs cours'

// The anchors: one per section of the Réglages, and « Où est ton argent » in Repères.
export const SETTINGS_ANCHORS = {
  goals: 'objectifs',
  spending: 'depenses',
  banks: 'banques',
  display: 'affichage',
  data: 'mes-chiffres',
  reminder: 'rappel',
  account: 'compte',
} as const
export const WHERE_ANCHOR = 'ou-est-ton-argent'

const IN_SETTINGS = 'dans les Réglages'
const inSettings = (what: string) => `${what}, ${IN_SETTINGS}`

// The settings and screens « Trouver » knows. Each row says where it lands; `terms`: other words that
// find it. Searched as typed, accents and case aside.
export const SETTINGS_ROWS: ReadonlyArray<{ title: string; terms: readonly string[]; href: string }> = [
  { title: inSettings('Tes objectifs'), terms: ['objectif', 'répartition'], href: `/reglages#${SETTINGS_ANCHORS.goals}` },
  {
    title: inSettings('Tes dépenses et tes revenus'),
    terms: ['dépenses', 'revenus', 'salaire', 'budget'],
    href: `/reglages#${SETTINGS_ANCHORS.spending}`,
  },
  { title: inSettings('L’apparence'), terms: ['apparence', 'thème', 'sombre', 'clair'], href: `/reglages#${SETTINGS_ANCHORS.display}` },
  {
    title: inSettings('Masquer les montants'),
    terms: ['masquer', 'cacher', 'montants'],
    href: `/reglages#${SETTINGS_ANCHORS.display}`,
  },
  { title: inSettings('Face ID'), terms: ['face id', 'faceid', 'clé d’accès'], href: `/reglages#${SETTINGS_ANCHORS.account}` },
  { title: inSettings('Ton mot de passe'), terms: ['mot de passe'], href: `/reglages#${SETTINGS_ANCHORS.account}` },
  { title: inSettings('Ta clé de secours'), terms: ['clé de secours', 'secours'], href: `/reglages#${SETTINGS_ANCHORS.account}` },
  { title: inSettings('Le rappel par e-mail'), terms: ['rappel', 'e-mail', 'email', 'mail'], href: `/reglages#${SETTINGS_ANCHORS.reminder}` },
  {
    title: inSettings('Télécharger mes chiffres'),
    terms: ['télécharger', 'fichier', 'excel', 'export'],
    href: `/reglages#${SETTINGS_ANCHORS.data}`,
  },
  { title: 'Confidentialité', terms: ['vie privée', 'données'], href: '/confidentialite' },
  { title: 'Supprimer mon compte', terms: ['supprimer', 'effacer'], href: '/reglages/supprimer' },
]

// The screens « Trouver » offers as shortcuts in « Ce que tu peux faire » when they are typed.
export const SCREEN_ROWS: ReadonlyArray<{ title: string; terms: readonly string[]; href: string }> = [
  { title: TITLES_SCREEN, terms: ['titres', 'cours'], href: '/titres' },
  { title: UPDATE_FIGURES, terms: ['mise à jour', 'mettre à jour'], href: '/mise-a-jour' },
]
