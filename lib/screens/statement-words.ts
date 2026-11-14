// The words of a relevé's page and of correcting a line at that relevé
// (docs/superpowers/specs/2026-11-12-corriger-un-releve-design.md, planches 8B to 8D). Nicolas's words,
// verbatim, except where a comment says the builder's.

export const LAST_STATEMENT = 'le dernier'
export const statementTitle = (date: string) => `Relevé du ${date}`
export const squareWas = (amount: string) => `un carré valait ${amount}`
export const STATEMENT_LEAD = 'Les chiffres de ce jour-là. Les corriger change ta courbe, pas tes chiffres d’aujourd’hui.'
export const STATEMENT_CORRECTED = 'Corrigé. Ta courbe et D’où ça vient en tiennent compte.'

export const amountTitle = (date: string) => `Son montant au ${date}`
export const unitsTitle = (date: string) => `Ses parts et son prix moyen au ${date}`
// The builder's: a loan, as its fiche says it (OWED_LABEL).
export const owedTitle = (date: string) => `Ce qui reste à rembourser au ${date}`
// The fiche's field labels (FIGURE_* in line-words.ts), said of that day.
export const amountThatDay = (label: string, currency: string) => `${label} ce jour-là (${currency})`
export const UNITS_THAT_DAY = 'Ses parts ce jour-là'
export const priceThatDay = (currency: string) => `Le prix d’une part ce jour-là (${currency})`
export const averageThatDay = (currency: string) => `Son prix moyen ce jour-là (${currency}, laisse vide si tu ne le sais pas)`
export const correctOn = (date: string) => `Corriger le ${date}`
export const STATEMENT_HISTORY = 'Ce relevé fait partie de ton histoire : ta courbe et D’où ça vient vont bouger.'

export const todayUnchanged = (figure: string) => `Aujourd’hui : ${figure}, inchangé`
export const TODAY_GONE = 'Aujourd’hui : la ligne n’existe plus'
export const TODAY_CORRECTED = 'Aujourd’hui aussi : ce chiffre était le même, il est corrigé.'
// The builder's: how a figure in parts is said on one line.
export const unitsAt = (units: string, plural: boolean, price: string) => `${units} ${plural ? 'parts' : 'part'} à ${price}`

export const othersToo = (n: number) =>
  n === 1
    ? 'Ce chiffre est le même dans 1 autre relevé : on le corrige aussi.'
    : `Ce chiffre est le même dans ${n} autres relevés : on les corrige aussi.`
// The builder's: while an update runs, the carrying forward stops before the latest relevé.
export const UPDATE_STOPS =
  'Une mise à jour est en cours : ton dernier relevé n’est pas corrigé. Corrige ce chiffre dans ta mise à jour.'
export const ERASE_REFUSED = 'Un chiffre de ce jour-là ne peut pas être effacé.'
