// The copy of the Repères tab. The cushion and the « 3 à 6 mois » line are the spec's own words (the line amended on 10 November 2026: the site states the usual mark, it does not advise);
// the rest is builder copy (constructeur): tutoiement, typographic apostrophe, no emoji, no advice.

import type { Budget } from '@/lib/model/types'
import { homesWords } from '@/lib/screens/words'

export const REPERES_TITLE = 'Repères'
export const CUSHION_TITLE = 'Ton coussin de sécurité'
export const RECOVER_TITLE = 'Ce que tu peux récupérer vite'
export const GOOD_TO_KNOW_TITLE = 'Bon à savoir'
export const WHERE_TITLE = 'Où est ton argent'

export const CUSHION_ZONE = "3 à 6\u00A0mois\u00A0: le repère le plus courant"
export const CUSHION_SETTINGS_UNREADABLE = 'Tes réglages n’ont pas pu être lus\u00A0: le coussin ne peut pas être calculé.'
export const CUSHION_MISSING = 'Indique tes dépenses dans les Réglages pour le calculer.'
export const LIT_KEY = 'récupérable vite'
export const DIM_KEY = 'pas tout de suite'
export const NOTHING_QUICK = 'Rien de ce qui est à toi n’est récupérable vite pour l’instant.'
export const NO_GRID_FOR_QUICK = 'Il n’y a pas encore de grille\u00A0: ce que tu peux récupérer vite apparaîtra avec elle.'
export const NO_FACTS = 'Rien de particulier à signaler pour l’instant.'
export const OWES = 'à rembourser'
export const REPERES_UNREADABLE = 'Une partie de tes chiffres n’a pas pu être lue. Rien n’a été effacé.'
export const REPERES_LOAD_FAILED = 'Tes chiffres n’ont pas pu être chargés.'
export const REPERES_RETRY = 'Réessayer'

// « 5 mois et demi », « un demi-mois », « 2 mois ». Months come in halves.
export function monthsWords(months: number): string {
  const whole = Math.floor(months)
  const half = months - whole >= 0.5
  if (whole === 0) return half ? 'un demi-mois' : 'moins d’un demi-mois'
  return `${whole}\u00A0mois${half ? ' et demi' : ''}`
}

// After the twelfth month of the cushion, what the twelve boxes cannot draw (Nicolas, 11 November
// 2026): « + 7 mois », so the drawing says what the sentence says. Null up to twelve months.
export const CUSHION_BOXES = 12
export function cushionBeyond(months: number): string | null {
  return months > CUSHION_BOXES ? `+\u00A0${monthsWords(months - CUSHION_BOXES)}` : null
}

// `goal`: the months the available money is aimed at, when its goal is in months.
export function cushionSentence(months: number, basis: Budget['basis'], short = false, goal?: number): string {
  const of = basis === 'salary' ? 'revenus' : 'dépenses'
  const aimed = goal === undefined ? '' : `, pour un objectif de ${String(goal).replace('.', ',')}`
  // Nothing available, or under half a month: no « environ », and never « 0 mois ».
  if (short) return `Si tes revenus s’arrêtaient, ton argent disponible ne couvrirait pas un demi-mois de ${of}${aimed}.`
  return `Si tes revenus s’arrêtaient, ton argent disponible couvrirait environ ${monthsWords(months)} de ${of}${aimed}.`
}

// « A, B et C ».
export function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`
}

// A share of what is his, in words, from 0 to 1. One set of bands for the quick sentence and the home fact.
// Lowercase, ending with what it is a share of: « presque la moitié de ce qui est à toi ».
function shareWords(share: number): string {
  if (share >= 0.999) return 'tout ce qui est à toi'
  if (share >= 0.9) return 'presque tout ce qui est à toi'
  if (share >= 0.7) return 'une grande partie de ce qui est à toi'
  if (share > 0.6) return 'plus de la moitié de ce qui est à toi'
  if (share > 0.5) return 'un peu plus de la moitié de ce qui est à toi'
  if (share >= 0.4) return 'presque la moitié de ce qui est à toi'
  if (share >= 0.3) return 'environ un tiers de ce qui est à toi'
  if (share >= 0.2) return 'environ un quart de ce qui est à toi'
  return 'une petite part de ce qui est à toi'
}

// How much of what is his can be had back quickly, in words (ratio between 0 and 1).
export function quickLead(ratio: number): string {
  const words = shareWords(ratio)
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// The homes held, by pocket: « ton logement », « ton logement en location », « tes logements ».
export type Homes = { chezToi: number; rental: number }
const NO_HOMES: Homes = { chezToi: 0, rental: 0 }
const held = (homes: Homes) => homes.chezToi + homes.rental
const myHomes = (homes: Homes) => homesWords(homes.chezToi, homes.rental)

// `rest`: what is not quick, so that the sentence can name where it is. `homes`: the homes held.
export function quickSentence(
  ratio: number,
  amount: string,
  rest: { homes: Homes; retirement: boolean; employer: boolean; retirementSmall: boolean; slow?: boolean; slowSmall?: boolean },
): string {
  const lead = `${quickLead(ratio)}, ${amount}, en quelques semaines si besoin.`
  const parts: string[] = []
  if (held(rest.homes) > 0) parts.push(`Le reste est dans ${myHomes(rest.homes)}`)
  if (rest.retirement) {
    parts.push(
      parts.length === 0
        ? 'Le reste attend ta retraite'
        : `${rest.retirementSmall ? 'une petite part' : 'une part'} attend ta retraite`,
    )
  }
  if (rest.employer) {
    parts.push(
      parts.length === 0
        ? 'Le reste est bloqué chez ton employeur pour l’instant'
        : 'une petite part est bloquée chez ton employeur pour l’instant',
    )
  }
  if (rest.slow) {
    parts.push(
      parts.length === 0
        ? 'Le reste est difficile à revendre vite'
        : `${rest.slowSmall ? 'une petite part' : 'une part'} est difficile à revendre vite`,
    )
  }
  const sentence = parts.length === 0 ? lead : `${lead} ${joinAnd(parts)}.`
  const homeBuying = homeBuyingSentence(rest.retirement, rest.employer)
  return homeBuying === null ? sentence : `${sentence} ${homeBuying}`
}

// A PER or employee savings can be released early, in some cases, to buy a main home (spec 2026-11-10).
export function homeBuyingSentence(retirement: boolean, employer: boolean): string | null {
  if (!retirement && !employer) return null
  const what = retirement && employer ? 'Le PER et l’épargne salariale peuvent' : retirement ? 'Un PER peut' : 'L’épargne salariale peut'
  return `${what} aussi se débloquer, dans certains cas, pour acheter ta résidence principale.`
}

export function homeFact(share: number, homes: Homes = { chezToi: 1, rental: 0 }): string {
  const words = myHomes(homes)
  const subject = `${words.charAt(0).toUpperCase()}${words.slice(1)} ${held(homes) > 1 ? 'représentent' : 'représente'}`
  return `${subject} ${shareWords(share)}.${share >= 0.3 ? ' C’est courant quand on est propriétaire.' : ''}`
}

const COUNT_WORDS = ['', '', 'deux', 'trois', 'quatre', 'cinq']
export function sameHoldingFact(name: string, accounts: number, total: string): string {
  const count = COUNT_WORDS[accounts] || String(accounts)
  return `Tu détiens « ${name} » sur ${count} comptes différents, ${total} en tout.`
}

// `share`: of what is his outside the homes. `employers`: their names, when they are known.
export function employerFact(share: number, employers: string[], several: boolean, homes: Homes = NO_HOMES): string {
  const part = share < 0.2 ? 'Une petite partie' : 'Une partie'
  const of = held(homes) > 0 ? ` hors de ${myHomes(homes)}` : ''
  const where = several || employers.length > 1 ? 'tes employeurs' : 'ton employeur'
  return `${part} de ce qui est à toi${of} est placée chez ${where}${employers.length > 0 ? `, ${joinAnd(employers)}` : ''}.`
}

// `squares` of the `of` squares of the bourse: the biggest company held directly (spec 2026-11-10, § 6).
export function directShareFact(name: string, squares: number, of: number): string {
  const part = squares >= of ? 'tous tes carrés de bourse' : `${squares} de tes ${of} carrés de bourse`
  return `Ta plus grosse action en direct, ${name}, occupe ${part}.`
}
