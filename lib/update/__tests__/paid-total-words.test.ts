import { describe, expect, test } from 'vitest'
import { paidTotalWords } from '../paid-total-words'

const TIP = 'Recopie le chiffre de ta banque, souvent appelé « versements » ou « montant investi ».'
const OUT = 'Tu as retiré de l’argent ? Prends le total moins les retraits. Pas sous les yeux ? Laisse vide.'
const DIVIDENDS = 'Il rend aussi juste le partage de tes dividendes.'
const previous = { total: 1_200_000, on: '2026-09-30' }

describe('paidTotalWords', () => {
  test('the label is always the same', () => {
    expect(paidTotalWords({ type: 'life-insurance', previous: null, typed: null }).label).toBe('Total versé depuis l’ouverture')
    expect(paidTotalWords({ type: 'pea', previous, typed: 1 }).label).toBe('Total versé depuis l’ouverture')
  })

  test('no previous total: the hint without its first sentence, nothing deduced', () => {
    const words = paidTotalWords({ type: 'life-insurance', previous: null, typed: 1_500_000 })
    expect(words.hint).toBe(`${TIP} ${OUT}`)
    expect(words.deduced).toBeNull()
  })

  test('a previous total: recalled first, with its short date', () => {
    const words = paidTotalWords({ type: 'pea', previous, typed: null })
    expect(words.hint).toBe(`Au relevé du 30 sept. : 12 000 €. ${TIP} ${DIVIDENDS} ${OUT}`)
    expect(words.deduced).toBeNull()
  })

  test('a share account says the total also sets its dividends right; gold, crypto and insurance do not', () => {
    for (const type of ['pea', 'pea-pme', 'securities'] as const) {
      expect(paidTotalWords({ type, previous: null, typed: null }).hint).toBe(`${TIP} ${DIVIDENDS} ${OUT}`)
    }
    for (const type of ['gold', 'crypto', 'life-insurance', 'per'] as const) {
      expect(paidTotalWords({ type, previous: null, typed: null }).hint).toBe(`${TIP} ${OUT}`)
    }
  })

  test('employee savings: the employer is counted', () => {
    expect(paidTotalWords({ type: 'employee-savings', previous: null, typed: null }).hint).toBe(
      `${TIP} Ton employeur compris. ${OUT}`,
    )
  })

  test('a larger total: paid in since the previous one', () => {
    expect(paidTotalWords({ type: 'life-insurance', previous, typed: 1_260_000 }).deduced).toBe(
      'Soit 600 € versés depuis le 30 sept.',
    )
  })

  test('a smaller total: taken out', () => {
    expect(paidTotalWords({ type: 'life-insurance', previous, typed: 1_000_000 }).deduced).toBe(
      'Soit 2 000 € retirés depuis le 30 sept.',
    )
  })

  test('the same total: nothing paid in', () => {
    expect(paidTotalWords({ type: 'life-insurance', previous, typed: 1_200_000 }).deduced).toBe(
      'Rien versé depuis le 30 sept.',
    )
    // Under a euro of difference reads as nothing too, never « Soit 0 € ».
    expect(paidTotalWords({ type: 'life-insurance', previous, typed: 1_200_040 }).deduced).toBe(
      'Rien versé depuis le 30 sept.',
    )
  })

  test('a date that does not end on a point', () => {
    expect(paidTotalWords({ type: 'pea', previous: { total: 0, on: '2026-05-31' }, typed: 10_000 }).deduced).toBe(
      'Soit 100 € versés depuis le 31 mai',
    )
  })
})
