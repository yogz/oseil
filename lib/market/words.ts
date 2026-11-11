import { CURRENCIES } from '@/lib/catalog'
import { formatDayMonth } from '@/lib/format'
import type { CurrencyCode, IsoDate } from '@/lib/model/types'
import type { RateUse } from './live'

// All the copy of lot 4b, builder copy (constructeur): tutoiement, typographic
// apostrophe, « prix » rather than « cours ».

export const PRICE_OF_THE_DAY = 'prix du jour, retrouvé tout seul'
const COPY_THE_BANKS = 'Le prix du jour n’a pas pu être récupéré\u00A0: recopie celui que montre ta banque'
export const PRICE_FAILED = `${COPY_THE_BANKS}.`
export const NO_RATE = 'taux de change manquant'
export const ONLY_EUROS = 'Le taux du jour n’a pas pu être récupéré\u00A0: pour l’instant, seuls les euros sont possibles.'
export const RATE_MISSING_SAVE = 'Un taux de change manque\u00A0: ce relevé ne peut pas encore être enregistré.'
/** While a screen waits for the market (8 seconds at most): never a blank screen. */
export const ONE_MOMENT = 'Un instant…'
/** Ends « 1 banque non revue : … » when that bank's shares took today's price all the same. */
export const EXCEPT_TODAYS_PRICES = 'sauf le prix du jour de tes actions'

// « Réessayer » follows the sentence on the screen: it says what waits, and promises nothing.
const WAITS = 'ce relevé ne peut pas encore être enregistré. Rien n’est perdu.'

/** « dollars américains »; the code itself for a currency outside CURRENCIES. */
export function currencyWords(code: CurrencyCode): string {
  return CURRENCIES.find((c) => c.code === code)?.words ?? code
}

/** Under a box: « en dollars américains ». Null for the euro, which goes without saying. */
export function inCurrency(code: CurrencyCode): string | null {
  return code === 'EUR' ? null : `en ${currencyWords(code)}`
}

/** Under the price of a line at today's price: « en dollars américains · prix du jour, retrouvé tout seul ». */
export function todaysPriceHint(code: CurrencyCode): string {
  const currency = inCurrency(code)
  return currency === null ? PRICE_OF_THE_DAY : `${currency} · ${PRICE_OF_THE_DAY}`
}

/**
 * Under the price of a line whose price of the day could not be had: the sentence first, the
 * currency inside it (« …, en dollars américains. »), so no capital letter follows « · ».
 */
export function failedPriceHint(code: CurrencyCode): string {
  const currency = inCurrency(code)
  return currency === null ? PRICE_FAILED : `${COPY_THE_BANKS}, ${currency}.`
}

const isFeminine = (code: CurrencyCode) => CURRENCIES.find((c) => c.code === code)?.feminine === true

// « a », « a et b », « a, b et c ».
function listed(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`
}

/** `day` is the snapshot's date, already written (« 30 septembre »). */
export function failedPricesSentence(names: string[], day: string): string | null {
  if (names.length === 0) return null
  if (names.length === 1) {
    return `Le prix du jour de « ${names[0]} » n’a pas pu être récupéré\u00A0: il reste au prix du ${day}.`
  }
  return `Le prix du jour de ${names.length} titres n’a pas pu être récupéré\u00A0: ils restent au prix du ${day}.`
}

/** The price came, but no rate converts it into the line's currency: not a price that failed. */
export function failedRatesSentence(names: string[]): string | null {
  if (names.length === 0) return null
  if (names.length === 1) {
    return `Le taux de change pour « ${names[0]} » n’a pas pu être récupéré\u00A0: son prix reste celui de ton relevé.`
  }
  return `Le taux de change pour ${names.length} titres n’a pas pu être récupéré\u00A0: leurs prix restent ceux de ton relevé.`
}

/**
 * Which rates a conversion used. `baseDay` is the base snapshot's date, already
 * written. Null when nothing was converted; a missing rate is told by missingRateSentence.
 */
export function rateNote(use: RateUse, baseDay: string, today: IsoDate): string | null {
  const sentences: string[] = []
  if (use.on !== null) {
    sentences.push(`Converti en euros au taux de la Banque centrale européenne du ${formatDayMonth(use.on, today)}.`)
  }
  if (use.fromBase.length > 0 && use.answered) {
    // The ECB answered, without these currencies: no failure to tell.
    const of = listed(use.fromBase.map((c) => `des ${currencyWords(c)}`))
    sentences.push(
      use.fromBase.length === 1
        ? `Le taux ${of} n’est pas publié aujourd’hui\u00A0: celui de ton relevé du ${baseDay} sert à sa place.`
        : `Les taux ${of} ne sont pas publiés aujourd’hui\u00A0: ceux de ton relevé du ${baseDay} servent à leur place.`,
    )
  } else if (use.fromBase.length > 0) {
    const currencies = listed(use.fromBase.map((c) => `les ${currencyWords(c)}`))
    const converted = use.fromBase.every(isFeminine) ? 'converties' : 'convertis'
    sentences.push(
      `La Banque centrale européenne n’a pas répondu\u00A0: ${currencies} sont ${converted} au taux de ton relevé du ${baseDay}.`,
    )
  }
  return sentences.length > 0 ? sentences.join(' ') : null
}

export function missingRateSentence(currencies: CurrencyCode[]): string {
  if (currencies.length === 0) return `Le taux du jour n’a pas pu être récupéré\u00A0: ${WAITS}`
  const of = listed(currencies.map((c) => `des ${currencyWords(c)}`))
  if (currencies.length === 1) return `Le taux du jour ${of} n’a pas pu être récupéré\u00A0: ${WAITS}`
  return `Les taux du jour ${of} n’ont pas pu être récupérés\u00A0: ${WAITS}`
}

/** Lines left out of the totals because no rate converts them; their names, as the person typed them. */
export function unconvertedSentence(names: string[]): string | null {
  if (names.length === 0) return null
  if (names.length === 1) return `« ${names[0]} » n’est pas compté\u00A0: son taux de change manque.`
  return `${names.length} lignes ne sont pas comptées\u00A0: leur taux de change manque (${listed(names.map((n) => `« ${n} »`))}).`
}

/** Every amount was left out for want of a rate: the total is not 0, it is unknown. */
export function nothingCountedSentence(names: string[]): string {
  return `Aucun montant n’est compté\u00A0: le taux de change de ${listed(names.map((n) => `« ${n} »`))} manque.`
}

/** A price that is the snapshot's own, not the day's. `price` and `day` are already written. */
export function lastKnownPrice(price: string, day: string): string {
  return `dernier prix connu ${price}, au ${day}`
}

// Attaching a line to its price, and choosing its currency (forms).
export const FOLLOW_PRICE = 'Suivre son prix automatiquement'
export const SEARCH_LABEL = 'Son nom ou son code ISIN'
export const SEARCH_LABEL_CRYPTO = 'Son nom ou son symbole'
export const SEARCH_BUTTON = 'Chercher'
// Said under « Chercher » when the box opened already holding the line's name.
export const SEARCH_NOTHING_SENT = 'Rien ne part tant que tu n’as pas touché Chercher.'
export const NOT_FOUND = 'Je ne le trouve pas'
export const NOTHING_FOUND = 'Rien trouvé. Essaie son code ISIN\u00A0: deux lettres puis dix caractères, comme LU1681043599.'
export const NOTHING_FOUND_CRYPTO = 'Rien trouvé. Essaie son symbole, comme BTC ou ETH.'
export const SEARCH_FAILED = 'La recherche n’a pas répondu. Réessaie dans un moment, ou remplis le prix toi-même.'
// A coin has no market to name (« Bitcoin »), a share has one (« Airbus, Paris »).
export const FOLLOWED = (name: string, exchange: string) =>
  `Son prix se mettra à jour tout seul\u00A0: ${exchange === '' ? name : `${name}, ${exchange}`}.`
export const CURRENCY_CHANGED = 'Devise changée\u00A0: cherche de nouveau le prix du jour.'
export const NO_PRICE_YET = 'Son prix du jour n’a pas pu être récupéré\u00A0: remplis-le toi-même.'
/** Followed by the button « changer ». `words` comes from currencyWords. */
export const CURRENCY_LINE = (words: string) => `En ${words}`
