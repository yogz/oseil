// The words of a line's fiche (lot 4c). The first block is the board's, verbatim (Nicolas, 08/11);
// the rest is builder copy, in the specs' tone, listed to Nicolas at the end of the lot.

import type { CorrectionOutcome } from '@/lib/correct/save'
import type { AccountTypeId, CurrencyCode } from '@/lib/model/types'
import { SAVE_FAILED } from '@/lib/screens/words'

// The board.
export const CORRECT_TITLE = 'Corriger une erreur de saisie'
export const NAME_LABEL = 'Son nom'
export const UNITS_LABEL = 'Ses parts et son prix moyen'
export const PLACE_LABEL = 'Où il est rangé'
export const PRICE_LABEL = 'Son prix du jour'
export const PRICE_AUTOMATIC = 'automatique'
export const OWED_LABEL = 'Ce qui reste à rembourser'
export const FINANCED_LABEL = 'Le bien qu’il finance'
export const AMOUNT_LABEL = 'Son montant'
export const CLOSE_LABEL = 'Fermé ou tout vendu'
export const CLOSE_LOAN = 'Remboursé'
export const CLOSE_HOME = 'Vendu'
export const CLOSE_BULLION = 'Tout vendu'
// One word per kind of line, the same on the fiche and in the update: a loan is repaid, a home is
// sold, gold and crypto are all sold, anything else is closed or all sold.
export function closeWord(type: AccountTypeId): string {
  if (type === 'loan') return CLOSE_LOAN
  if (type === 'home') return CLOSE_HOME
  if (type === 'gold' || type === 'crypto') return CLOSE_BULLION
  return CLOSE_LABEL
}
export const DELETE_LABEL = 'Supprimer, saisi par erreur'
export const CLOSE_EXPLAIN = 'Il passe à zéro à la date que tu choisis. Il reste dans tes anciens relevés.'
export const DELETE_EXPLAIN = 'Il disparaît partout, même de tes anciens relevés.'
export const LOAN_PLACE_EXPLAIN = 'Un crédit se range dans la banque qui te l’a prêté\u00A0: il se met alors à jour avec elle.'
export const LOAN_PLACE_ACTION = 'Le ranger dans sa banque'

// The builder's.
export const NO_HOME = 'aucun'
export const UNLOCK_UNKNOWN = 'à préciser'
export const CLOSED = (day: string) => `Fermé le ${day}.`
export const REOPEN = 'Ce n’était pas fermé'
export const UNFINISHED = (day: string) => `Sa fermeture au ${day} n’est pas allée jusqu’au bout.`
export const FINISH = 'Terminer'
export const LOCKED_UPDATE = 'Une mise à jour est en cours. Termine-la ou abandonne-la avant de corriger une ligne.'
export const RESUME = 'Reprendre la mise à jour'
export const LOCKED_UNREADABLE = 'Une partie de tes chiffres n’a pas pu être lue. Rien ne se corrige tant qu’elle ne l’est pas.'
export const NO_RATE_AMOUNT = 'Son montant en euros n’est pas connu\u00A0: son taux de change manque.'
export const IS_CORRECTION = 'C’est une correction\u00A0: la différence ne compte ni comme de l’argent mis de côté, ni comme un gain des marchés.'
export const CONFIRM_REWRITE = (day: string, n: number) =>
  `Il sortira ${n === 1 ? 'de ton relevé' : `de tes ${n} relevés`} pris depuis le ${day}. Ça ne se défait pas.`
export const CONFIRM_DELETE = 'Il disparaîtra de tous tes relevés. Ça ne se défait pas.'
export const YES_CLOSE = 'Oui, le fermer'
export const YES_DELETE = 'Oui, le supprimer'
export const KEEP = 'Garder la ligne'
export const SINCE = 'Depuis quand\u00A0?'
export const ONLY_LINE = 'C’est la seule ligne d’un de tes relevés\u00A0: corrige-la plutôt que de la supprimer.'
export const TOO_EARLY = 'Avant ce jour, il n’avait jamais de valeur\u00A0: pour l’effacer, supprime-le.'
export const IN_THE_FUTURE = 'Choisis un jour passé ou aujourd’hui.'
export const NO_OTHER_BANK = 'Tu n’as pas d’autre banque ici pour l’instant. En ajouter une viendra avec les Réglages.'
export const NO_OTHER_ACCOUNT = 'Tu n’as pas d’autre compte où le ranger.'
export const OPEN_LINES = 'Voir ses lignes'
export const SHEET_OF = (name: string) => `La fiche de « ${name} »`
export const DEBT_SENTENCE = (gross: string, owed: string) => `${gross} dont ${owed} dus à la banque`
export const CHANGED_MEANWHILE = 'Cette ligne a changé entre-temps\u00A0: rien n’a été modifié.'

// The simple corrections.
export const UNLOCK_LABEL = 'Disponible en'
export const UNLOCK_FIELD = 'Disponible en (année)'
export const SAVE = 'Enregistrer'
export const CANCEL = 'Annuler'
export const NAME_EMPTY = 'Écris un nom.'
export const YEAR_UNREADABLE = 'Cette année n’est pas lisible.'
export const CLEAR_YEAR = 'Effacer l’année'
export const NO_HOME_CHOICE = 'Aucun'

// Correcting figures and filing elsewhere.
export const FIGURE_AMOUNT = (label: string, currency: string) => `${label} (${currency})`
export const FIGURE_UNITS = 'Ses parts'
export const FIGURE_PRICE = (currency: string) => `Le prix d’une part (${currency})`
export const FIGURE_AVERAGE = (currency: string) => `Son prix moyen (${currency}, laisse vide si tu ne le sais pas)`
export const SLOW_LABEL = 'Récupérable en quelques semaines'
export const GROUP_ZONE = 'Zone'
export const GROUP_TYPE = 'Type'
// The type of a home (RESIDENCE_LABELS): it describes the home, not a moment, so it holds for every snapshot.
export const RESIDENCE_LABEL = 'Type'
export const RESIDENCE_HISTORY = 'Il s’applique à tout l’historique, même à tes anciens relevés.'
export const SLOW_YES = 'Oui'
export const SLOW_NO = 'Non'
export const CATEGORY_CAPTION = 'Sa catégorie'

// The sentence for what a save answered; null once saved. Tasks 7 and 8 reuse it.
export function outcomeSentence(outcome: CorrectionOutcome | 'failed'): string | null {
  switch (outcome) {
    case 'saved':
      return null
    case 'update-running':
      return LOCKED_UPDATE
    case 'unreadable':
      return LOCKED_UNREADABLE
    case 'not-held':
    case 'not-allowed':
      return CHANGED_MEANWHILE
    case 'only-line':
      return ONLY_LINE
    case 'too-early':
      return TOO_EARLY
    case 'in-the-future':
      return IN_THE_FUTURE
    case 'failed':
      return SAVE_FAILED
  }
}

// The rate of a line's purchases (docs/superpowers/specs/2026-11-11-change-a-l-achat-design.md), in words
// with no « taux » (review of the screens, 11 November 2026): the currency is named.
const CURRENCY_ONE: Partial<Record<CurrencyCode, { the: string; of: string }>> = {
  USD: { the: 'Le dollar', of: 'du dollar' },
  GBP: { the: 'La livre', of: 'de la livre' },
  CHF: { the: 'Le franc suisse', of: 'du franc suisse' },
}
export const purchaseLabel = (currency: CurrencyCode) => `${CURRENCY_ONE[currency]?.the ?? 'La devise'} à l’achat`
export const PURCHASE_COMPUTED = 'calculé par Oseil'
export const PURCHASE_TYPED = 'ton chiffre'
export const PURCHASE_EUROS = 'prix moyen en euros'
export const PURCHASE_IN_EUROS_VALUE = 'en euros'
export const PURCHASE_QUESTION = 'Sur ton relevé de courtier, ton prix moyen d’achat est en\u00A0:'
export const purchaseField = (words: string) => `Quand tu as acheté, 1\u00A0€ valait combien de ${words}\u00A0?`
export const purchaseHelp = (currency: CurrencyCode) =>
  `Oseil prend le cours ${CURRENCY_ONE[currency]?.of ?? 'de la devise'} le jour de chaque relevé\u00A0: exact si tu as acheté ce jour-là, proche sinon. Le chiffre exact est sur l’avis d’achat de ton courtier.`
export const PURCHASE_RESET = 'Revenir au calcul d’Oseil'
export const PURCHASE_UNREADABLE = 'Ce chiffre n’est pas lisible.'
export const purchaseOutOfBounds = (words: string) => `Écris combien de ${words} valait 1\u00A0€, par exemple 1,08.`
