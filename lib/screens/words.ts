import { ACCOUNT_TYPES, bankAt } from '@/lib/catalog'
import { formatEurosShown } from '@/lib/format'
import type { Account, Cents, Establishment, Line } from '@/lib/model/types'

// `forHomes`: the homes every loan finances, by pocket (null: a loan finances something else, or
// nothing). « ta maison » became « ton logement » on 10 November 2026: a home can be a rental.
export function ownedSentence(
  owned: Cents,
  owed: Cents,
  forHomes: { chezToi: number; rental: number } | null,
): string | null {
  if (owed <= 0) return null
  if (owed > owned) return `Tu possèdes ${formatEurosShown(owned)} et tu dois encore ${formatEurosShown(owed)}.`
  const tail = forHomes ? `prêtés pour ${homesWords(forHomes.chezToi, forHomes.rental)}` : 'encore à rembourser'
  return `Tu possèdes ${formatEurosShown(owned)}, dont ${formatEurosShown(owed)} ${tail}.`
}

// The homes a sentence speaks of: « ton logement », « ton logement en location », « tes logements ».
export function homesWords(chezToi: number, rental: number): string {
  const where = chezToi === 0 && rental > 0 ? ' en location' : ''
  return chezToi + rental > 1 ? `tes logements${where}` : `ton logement${where}`
}

// The two pockets of Immobilier, as Mon argent names its sub-rows and the detail its groups.
export const POCKET_ROW_NAMES = { 'chez-toi': 'Chez toi', location: 'En location' } as const
export const NO_GOAL = 'pas d’objectif'
// A category held, but under half a square: it has none (lib/model/squares.ts).
export const LESS_THAN_A_SQUARE = 'moins d’un carré'

// « Montre-moi mes objectifs » (planche 3): a simulation, asked for and announced as such.
export const GOALS_SHOW = 'Montre-moi mes objectifs'
// The hint of the first openings (lib/app/square-hint.ts), under the grid while it plays.
export const SQUARE_HINT_SENTENCE = 'Touche un carré\u00A0: sa catégorie s’ouvre'
export const GOALS_SHOW_BACK = 'Revenir à mes vrais chiffres'
export const GOALS_SIMULATION_TAG = 'Simulation · ce n’est pas ta situation'
export const GOALS_SIMULATION_TITLE = 'Si tu étais pile à tes objectifs'
// Said on the grid itself while it is simulated: what is drawn is never left unlabelled.
export const GRID_SIMULATION_MARK = 'Simulation'

// C3 (decided by Nicolas on 9 November 2026): what a square is worth, and what it was worth then, in
// brackets; the progress is said in euros of what is yours, under the big amount.
export const squareSentence = (now: string, then: string | null, month: string | null) =>
  then !== null && month !== null ? `Un carré vaut ${now} (${then} en\u00A0${month})` : `Un carré vaut ${now}`
export const progressSince = (month: string) => `depuis ${month}`
// The same, at the end of an update: what a square was worth at the snapshot before, when it moved.
export const resultSquareSentence = (now: string, then: string | null, day: string) =>
  then === null
    ? `Un carré vaut maintenant ${now}, comme au\u00A0${day.replace(' ', '\u00A0')}`
    : `Un carré vaut maintenant ${now} (${then} au\u00A0${day.replace(' ', '\u00A0')})`
export const GOALS_SIMULATION_GRID = 'Simulation\u00A0: ta grille si tu étais pile à tes objectifs'

// A goal in months with no budget to say what a month is (docs/superpowers/specs/2026-11-11-coussin-objectif-design.md).
export const GOALS_NEED_BUDGET = 'Renseigne tes dépenses pour comparer à tes objectifs.'
// The cushion aimed at is more than everything the goals steer (docs/superpowers/specs/2026-11-11-coussin-objectif-design.md).
export const CUSHION_BEYOND_ALL = 'Ton coussin n’est pas encore complet\u00A0: tout ce qui est hors chez toi devrait y aller.'
export const GOALS_NEED_BUDGET_LINK = { href: '/premier-lancement/depenses?depuis=reglages', label: 'Renseigner mes dépenses' }

// The words of the cushion against its goal, judged in months rounded like Repères: having more put
// aside is no fault, so beyond is said without a verdict.
export function cushionGoalWords(held: number, target: number): string {
  if (held > target) return 'au-delà de ton coussin'
  if (held === target) return 'ton coussin est complet'
  return 'ton coussin n’est pas complet'
}

// « 4 mois de dépenses, 6 400 € »: the goal of the available money, in months then in euros.
export function cushionGoalText(cushion: { months: number; euros: string; basis: 'expenses' | 'salary' }): string {
  const months = Number.isInteger(cushion.months) ? String(cushion.months) : String(cushion.months).replace('.', ',')
  return `${months} mois de ${cushion.basis === 'salary' ? 'revenus' : 'dépenses'}, ${cushion.euros}`
}

// `misplaced` is the number of squares held beyond the goal, over the goal shares.
// With Chez toi in the grid, the goals cover only what is outside it: the sentence
// says so, and the squares are no longer counted out of the whole 100.
export function goalHeadline(misplaced: number, withHome: boolean): { headline: string; detail: string | null } {
  const squares = `${misplaced} carré${misplaced > 1 ? 's' : ''}`
  if (withHome) {
    if (misplaced <= 0) return { headline: 'Hors chez toi, pile à tes objectifs.', detail: null }
    return {
      headline: misplaced <= 10 ? 'Hors chez toi, proche de tes objectifs' : 'Hors chez toi, en route vers tes objectifs',
      detail: `À ${squares} près.`,
    }
  }
  if (misplaced <= 0) return { headline: 'Pile à tes objectifs.', detail: null }
  return {
    headline: misplaced <= 10 ? 'Proche de tes objectifs' : 'En route vers tes objectifs',
    detail: `À ${squares} près sur 100.`,
  }
}

export function whereWords(line: Line, account: Account, establishment: Establishment): string {
  const label = account.type === 'other' ? line.name : ACCOUNT_TYPES[account.type].label
  if (account.type === 'employee-savings') {
    return account.unlockOn ? `${label}, disponible en ${account.unlockOn.slice(0, 4)}` : label
  }
  if (account.type === 'per') return `${label}, disponible à la retraite`
  // A rented home sits under « Chez toi » in the banks, but it is not where the person lives.
  if (account.type === 'home' && account.residence === 'rental') return `${label} en location`
  if (establishment.kind === 'home') return `${label}, chez toi`
  return `${label} ${bankAt(establishment)}`
}

// The two dates of Mon argent, in the spec's words. `day` is the snapshot's, already written.
export function pricesDateLabel(day: string): string {
  return `Cours du jour pour tes actions · le reste au ${day}`
}

// « Tes titres »: attaching lines already entered to their price (builder copy, in the spec's tone).
export const TITLES = 'Tes titres'
export const TITLES_INTRO = 'Pour une action, un fonds coté ou une crypto, le prix d’une part peut se mettre à jour tout seul.'
export const FOLLOWING = 'prix automatique'
export const TYPED = 'prix tapé à la main'
export const FIND = 'Le retrouver'
export const STOP = 'Ne plus le suivre'
export const CONFIRM = (today: string, last: string) => `Son prix aujourd’hui\u00A0: ${today}. À ton dernier relevé\u00A0: ${last}.`
export const CONFIRM_NO_LAST = (today: string) => `Son prix aujourd’hui\u00A0: ${today}.`
// « Tes titres » has no box to fill: the price is said missing, and « C’est bien lui » stays allowed.
export const NO_PRICE_FOR_NOW = 'Son prix n’a pas pu être récupéré pour l’instant.'
export const YES = 'C’est bien lui'
export const NO = 'Ce n’est pas lui'
export const HINT = 'Le prix de tes actions peut se mettre à jour tout seul'
export const HINT_LINK = 'Les retrouver'
export const CATEGORY_LINK = 'Le prix de tes titres'
export const NOTHING_TO_FOLLOW = 'Tu n’as aucun titre dont le prix puisse se mettre à jour tout seul.'
export const VERY_DIFFERENT =
  'Ces deux prix sont très éloignés. Vérifie que c’est bien le bon fonds, et pas une autre part du même.'
export const UPDATE_RUNNING =
  'Une mise à jour est en cours. Termine-la ou abandonne-la avant de rattacher un titre\u00A0: son prix s’y règle déjà.'
export const SAVE_FAILED = 'Ça n’a pas pu être enregistré. Rien n’a changé\u00A0: tu peux réessayer.'
export const UNREADABLE_PROFILE = 'Ton profil n’a pas pu être lu. Rien n’a été effacé.'

// The reminder of an update, after three months without one (spec of the reminder, planche A).
export const REMINDER_TITLE = (months: number) => `Tes chiffres ont ${months}\u00A0mois`
export const REMINDER_SENTENCE = (date: string) =>
  `Ils datent du ${date}. Un tour de tes banques, et ils seront de nouveau justes.`
export const REMINDER_UPDATE = 'Mettre à jour'
export const REMINDER_RESUME = 'Reprendre'
export const REMINDER_LATER = 'Plus tard'

// The page of the link « Ne plus recevoir ce rappel », opened from the e-mail without signing in.
export const STOP_REMINDER_TITLE = 'Le rappel par e-mail'
export const STOP_REMINDER_SENTENCE = 'Un e-mail quand tes chiffres n’ont pas été mis à jour depuis six mois.'
export const STOP_REMINDER_BUTTON = 'Ne plus recevoir ce rappel'
export const STOP_REMINDER_DONE = 'C’est noté, plus de rappel par e-mail.'
export const STOP_REMINDER_DONE_NOTE = 'Tu peux le remettre quand tu veux, dans les Réglages.'
export const STOP_REMINDER_FAILED = 'Ça n’a pas marché. Vérifie ta connexion et réessaie.'

// Two prices of the same share are never apart by a third; further, the pick may be another listing.
export function veryDifferent(today: number, last: number): boolean {
  if (!(today > 0) || !(last > 0)) return false
  const ratio = today / last
  return ratio > 4 / 3 || ratio < 3 / 4
}
