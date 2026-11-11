import { describe, expect, it } from 'vitest'
import { ratesFor, type RateUse } from '../live'
import type { Rates } from '../types'
import {
  NO_RATE,
  unconvertedSentence,
  nothingCountedSentence,
  lastKnownPrice,
  ONLY_EUROS,
  PRICE_FAILED,
  PRICE_OF_THE_DAY,
  RATE_MISSING_SAVE,
  EXCEPT_TODAYS_PRICES,
  ONE_MOMENT,
  currencyWords,
  failedPriceHint,
  failedPricesSentence,
  failedRatesSentence,
  inCurrency,
  missingRateSentence,
  rateNote,
  todaysPriceHint,
} from '../words'

const RATES: Rates = { on: '2026-11-06', perEuro: { USD: 1.1165, GBP: 0.83415, CHF: 0.9143 } }
const TODAY = '2026-11-08'
const BASE_DAY = '30 septembre'

describe('the fixed sentences', () => {
  it('are written as given', () => {
    expect(PRICE_OF_THE_DAY).toBe('prix du jour, retrouvé tout seul')
    expect(PRICE_FAILED).toBe('Le prix du jour n’a pas pu être récupéré\u00A0: recopie celui que montre ta banque.')
    expect(NO_RATE).toBe('taux de change manquant')
    expect(ONLY_EUROS).toBe(
      'Le taux du jour n’a pas pu être récupéré\u00A0: pour l’instant, seuls les euros sont possibles.',
    )
    expect(RATE_MISSING_SAVE).toBe('Un taux de change manque\u00A0: ce relevé ne peut pas encore être enregistré.')
  })
})

describe('currencyWords', () => {
  it('names the currencies offered', () => {
    expect(currencyWords('EUR')).toBe('euros')
    expect(currencyWords('USD')).toBe('dollars américains')
    expect(currencyWords('GBP')).toBe('livres sterling')
    expect(currencyWords('CHF')).toBe('francs suisses')
  })

  it('writes the code of any other currency', () => {
    expect(currencyWords('JPY')).toBe('JPY')
  })
})

describe('failedPricesSentence', () => {
  it('says nothing when every price came', () => {
    expect(failedPricesSentence([], BASE_DAY)).toBeNull()
  })

  it('names one line', () => {
    expect(failedPricesSentence(['Fonds monde'], BASE_DAY)).toBe(
      'Le prix du jour de « Fonds monde » n’a pas pu être récupéré\u00A0: il reste au prix du 30 septembre.',
    )
  })

  it('counts several lines', () => {
    expect(failedPricesSentence(['A', 'B', 'C'], BASE_DAY)).toBe(
      'Le prix du jour de 3 titres n’a pas pu être récupéré\u00A0: ils restent au prix du 30 septembre.',
    )
    expect(failedPricesSentence(['A', 'B'], BASE_DAY)).toBe(
      'Le prix du jour de 2 titres n’a pas pu être récupéré\u00A0: ils restent au prix du 30 septembre.',
    )
  })
})

// F4: a price that came but that no rate converts is not a price that failed.
describe('failedRatesSentence', () => {
  it('says nothing when every price was converted', () => {
    expect(failedRatesSentence([])).toBeNull()
  })

  it('names one line', () => {
    expect(failedRatesSentence(['Fonds monde'])).toBe(
      'Le taux de change pour « Fonds monde » n’a pas pu être récupéré\u00A0: son prix reste celui de ton relevé.',
    )
  })

  it('counts several lines, as the sentence of the prices does', () => {
    expect(failedRatesSentence(['A', 'B'])).toBe(
      'Le taux de change pour 2 titres n’a pas pu être récupéré\u00A0: leurs prix restent ceux de ton relevé.',
    )
  })
})

describe('rateNote', () => {
  it('names the day of the ECB rate', () => {
    expect(rateNote(ratesFor(['USD'], {}, RATES), BASE_DAY, TODAY)).toBe(
      'Converti en euros au taux de la Banque centrale européenne du 6 novembre.',
    )
  })

  it('writes the year of a rate from another year', () => {
    const use: RateUse = { fx: { USD: 0.9 }, on: '2025-12-31', answered: true, fromBase: [], missing: [] }
    expect(rateNote(use, BASE_DAY, '2026-01-02')).toBe(
      'Converti en euros au taux de la Banque centrale européenne du 31 décembre 2025.',
    )
  })

  it('says the base snapshot’s rate was kept', () => {
    expect(rateNote(ratesFor(['USD'], { USD: 0.92 }, null), BASE_DAY, TODAY)).toBe(
      'La Banque centrale européenne n’a pas répondu\u00A0: les dollars américains sont convertis au taux de ton relevé du 30 septembre.',
    )
  })

  it('agrees with the currencies kept', () => {
    expect(rateNote(ratesFor(['GBP'], { GBP: 1.19 }, null), BASE_DAY, TODAY)).toBe(
      'La Banque centrale européenne n’a pas répondu\u00A0: les livres sterling sont converties au taux de ton relevé du 30 septembre.',
    )
    expect(rateNote(ratesFor(['USD', 'GBP'], { USD: 0.92, GBP: 1.19 }, null), BASE_DAY, TODAY)).toBe(
      'La Banque centrale européenne n’a pas répondu\u00A0: les dollars américains et les livres sterling sont convertis au taux de ton relevé du 30 septembre.',
    )
    expect(
      rateNote(ratesFor(['USD', 'GBP', 'CHF'], { USD: 0.92, GBP: 1.19, CHF: 1.05 }, null), BASE_DAY, TODAY),
    ).toBe(
      'La Banque centrale européenne n’a pas répondu\u00A0: les dollars américains, les livres sterling et les francs suisses sont convertis au taux de ton relevé du 30 septembre.',
    )
  })

  it('never says the ECB did not answer when it did, without that currency', () => {
    const withoutChf: Rates = { on: '2026-11-06', perEuro: { USD: 1.1 } }
    const note = rateNote(ratesFor(['CHF'], { CHF: 1.05 }, withoutChf), BASE_DAY, TODAY)
    expect(note).toBe(
      'Le taux des francs suisses n’est pas publié aujourd’hui\u00A0: celui de ton relevé du 30 septembre sert à sa place.',
    )
    expect(note).not.toMatch(/n’a pas répondu/)
    expect(rateNote(ratesFor(['CHF', 'GBP'], { CHF: 1.05, GBP: 1.19 }, withoutChf), BASE_DAY, TODAY)).toBe(
      'Les taux des francs suisses et des livres sterling ne sont pas publiés aujourd’hui\u00A0: ceux de ton relevé du 30 septembre servent à leur place.',
    )
  })

  it('tells both when some rates are today’s and others the base snapshot’s', () => {
    const partial: Rates = { on: '2026-11-06', perEuro: { USD: 1.1165 } }
    expect(rateNote(ratesFor(['USD', 'CHF'], { CHF: 1.05 }, partial), BASE_DAY, TODAY)).toBe(
      'Converti en euros au taux de la Banque centrale européenne du 6 novembre. Le taux des francs suisses n’est pas publié aujourd’hui\u00A0: celui de ton relevé du 30 septembre sert à sa place.',
    )
  })

  it('says nothing with euros only', () => {
    expect(rateNote(ratesFor(['EUR'], {}, RATES), BASE_DAY, TODAY)).toBeNull()
    expect(rateNote(ratesFor([], {}, null), BASE_DAY, TODAY)).toBeNull()
  })

  it('leaves a missing rate to missingRateSentence', () => {
    expect(rateNote(ratesFor(['USD'], {}, null), BASE_DAY, TODAY)).toBeNull()
  })
})

describe('missingRateSentence', () => {
  // « Réessayer » follows it on the screen: the sentence says what waits, and promises nothing.
  it('names one currency', () => {
    expect(missingRateSentence(['USD'])).toBe(
      'Le taux du jour des dollars américains n’a pas pu être récupéré\u00A0: ce relevé ne peut pas encore être enregistré. Rien n’est perdu.',
    )
  })

  it('names several', () => {
    expect(missingRateSentence(['USD', 'GBP'])).toBe(
      'Les taux du jour des dollars américains et des livres sterling n’ont pas pu être récupérés\u00A0: ce relevé ne peut pas encore être enregistré. Rien n’est perdu.',
    )
  })

  it('still makes a sentence with no currency named', () => {
    expect(missingRateSentence([])).toBe(
      'Le taux du jour n’a pas pu être récupéré\u00A0: ce relevé ne peut pas encore être enregistré. Rien n’est perdu.',
    )
  })

  it('no longer says to try again later', () => {
    expect(missingRateSentence(['USD'])).not.toMatch(/Réessaie/)
  })
})

describe('inCurrency', () => {
  it('says a currency other than the euro', () => {
    expect(inCurrency('USD')).toBe('en dollars américains')
    expect(inCurrency('GBP')).toBe('en livres sterling')
    expect(inCurrency('CHF')).toBe('en francs suisses')
  })

  it('says nothing of the euro, which goes without saying', () => {
    expect(inCurrency('EUR')).toBeNull()
  })
})

describe('the hints under a price', () => {
  it('a price that failed: the sentence first, the currency inside it', () => {
    expect(failedPriceHint('USD')).toBe(
      'Le prix du jour n’a pas pu être récupéré\u00A0: recopie celui que montre ta banque, en dollars américains.',
    )
    expect(failedPriceHint('EUR')).toBe(PRICE_FAILED)
  })

  it('today’s price: the currency, then the price of the day', () => {
    expect(todaysPriceHint('GBP')).toBe('en livres sterling · prix du jour, retrouvé tout seul')
    expect(todaysPriceHint('EUR')).toBe(PRICE_OF_THE_DAY)
  })

  it('never a capital letter after « · »', () => {
    for (const code of ['EUR', 'USD', 'GBP', 'CHF'] as const) {
      for (const hint of [failedPriceHint(code), todaysPriceHint(code)]) expect(hint).not.toMatch(/·\s*\p{Lu}/u)
    }
  })
})

describe('ONE_MOMENT', () => {
  it('is written as given', () => {
    expect(ONE_MOMENT).toBe('Un instant…')
  })
})

describe('EXCEPT_TODAYS_PRICES', () => {
  it('is written as given', () => {
    expect(EXCEPT_TODAYS_PRICES).toBe('sauf le prix du jour de tes actions')
  })
})

describe('every sentence', () => {
  it('uses the typographic apostrophe, and « prix » rather than « cours »', () => {
    const use = ratesFor(['USD', 'GBP'], { USD: 0.92 }, null)
    const sentences = [
      PRICE_OF_THE_DAY,
      PRICE_FAILED,
      NO_RATE,
      ONLY_EUROS,
      RATE_MISSING_SAVE,
      failedPricesSentence(['Fonds monde'], BASE_DAY),
      failedPricesSentence(['A', 'B'], BASE_DAY),
      rateNote(ratesFor(['USD'], {}, RATES), BASE_DAY, TODAY),
      rateNote(use, BASE_DAY, TODAY),
      rateNote(ratesFor(['CHF'], { CHF: 1.05 }, { on: '2026-11-06', perEuro: { USD: 1.1 } }), BASE_DAY, TODAY),
      missingRateSentence(use.missing),
      missingRateSentence(['USD', 'GBP', 'CHF']),
      inCurrency('USD'),
      EXCEPT_TODAYS_PRICES,
    ]
    for (const sentence of sentences) {
      expect(sentence).not.toBeNull()
      expect(sentence).not.toMatch(/'/)
      expect(sentence).not.toMatch(/\bcours\b/i)
    }
  })
})

describe('unconvertedSentence', () => {
  it('says nothing when every line converts', () => {
    expect(unconvertedSentence([])).toBeNull()
  })
  it('names one line, or counts several, and never says 0', () => {
    expect(unconvertedSentence(['Revolut'])).toBe('« Revolut » n’est pas compté\u00A0: son taux de change manque.')
    expect(unconvertedSentence(['A', 'B'])).toBe('2 lignes ne sont pas comptées\u00A0: leur taux de change manque (« A » et « B »).')
    expect(unconvertedSentence(['A', 'B', 'C'])).toBe(
      '3 lignes ne sont pas comptées\u00A0: leur taux de change manque (« A », « B » et « C »).',
    )
  })
})

describe('nothingCountedSentence and lastKnownPrice', () => {
  it('names what is missing', () => {
    expect(nothingCountedSentence(['Revolut'])).toBe('Aucun montant n’est compté\u00A0: le taux de change de « Revolut » manque.')
    expect(nothingCountedSentence(['A', 'B'])).toBe('Aucun montant n’est compté\u00A0: le taux de change de « A » et « B » manque.')
  })
  it('tells a price that is not the day’s', () => {
    expect(lastKnownPrice('250,00 €', '30 septembre')).toBe('dernier prix connu 250,00 €, au 30 septembre')
  })
})
