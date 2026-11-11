import { describe, expect, test } from 'vitest'
import { account, line } from '@/lib/model/__tests__/fixtures'
import { goalHeadline, homesWords, ownedSentence, pricesDateLabel, whereWords } from '@/lib/screens/words'

// Intl writes narrow and no-break spaces; the tests compare with plain ones.
const plain = (text: string | null) => text?.replace(new RegExp('[\\u202f\\u00a0]', 'g'), ' ') ?? null

describe('ownedSentence', () => {
  test('says nothing when nothing is owed', () => {
    expect(ownedSentence(100_000, 0, null)).toBeNull()
  })
  test('names the home when every loan finances one', () => {
    expect(plain(ownedSentence(38_200_000, 18_000_000, { chezToi: 1, rental: 0 }))).toBe(
      'Tu possèdes 382 000 €, dont 180 000 € prêtés pour ton logement.',
    )
  })
  test('does not say « dont » when the debt exceeds what is owned', () => {
    expect(plain(ownedSentence(100_000, 300_000, null))).toBe('Tu possèdes 1 000 € et tu dois encore 3 000 €.')
  })
  test('otherwise speaks of what is left to repay', () => {
    expect(plain(ownedSentence(38_200_000, 18_000_000, null))).toBe(
      'Tu possèdes 382 000 €, dont 180 000 € encore à rembourser.',
    )
  })
})

describe('homesWords', () => {
  test('one home, one rental, several', () => {
    expect(homesWords(1, 0)).toBe('ton logement')
    expect(homesWords(0, 1)).toBe('ton logement en location')
    expect(homesWords(2, 0)).toBe('tes logements')
    expect(homesWords(0, 2)).toBe('tes logements en location')
    expect(homesWords(1, 1)).toBe('tes logements')
  })
})

describe('goalHeadline', () => {
  describe('without a home in the grid, the goals cover the whole grid', () => {
    test('on target', () => {
      expect(goalHeadline(0, false)).toEqual({ headline: 'Pile à tes objectifs.', detail: null })
    })
    test('close, with singular and plural', () => {
      expect(goalHeadline(1, false)).toEqual({ headline: 'Proche de tes objectifs', detail: 'À 1 carré près sur 100.' })
      expect(goalHeadline(10, false)).toEqual({ headline: 'Proche de tes objectifs', detail: 'À 10 carrés près sur 100.' })
    })
    test('on the way beyond ten', () => {
      expect(goalHeadline(11, false)).toEqual({ headline: 'En route vers tes objectifs', detail: 'À 11 carrés près sur 100.' })
    })
  })

  describe('with Chez toi in the grid, the goals cover what is outside it', () => {
    test('on target', () => {
      expect(goalHeadline(0, true)).toEqual({ headline: 'Hors chez toi, pile à tes objectifs.', detail: null })
    })
    test('close, with singular and plural, and no « sur 100 »', () => {
      expect(goalHeadline(1, true)).toEqual({ headline: 'Hors chez toi, proche de tes objectifs', detail: 'À 1 carré près.' })
      expect(goalHeadline(10, true)).toEqual({ headline: 'Hors chez toi, proche de tes objectifs', detail: 'À 10 carrés près.' })
    })
    test('on the way beyond ten', () => {
      expect(goalHeadline(11, true)).toEqual({
        headline: 'Hors chez toi, en route vers tes objectifs',
        detail: 'À 11 carrés près.',
      })
    })
  })
})

describe('whereWords', () => {
  const bank = { id: 'e', name: 'BoursoBank', kind: 'institution' as const, catalogId: 'boursobank' }
  test('type and bank', () => {
    expect(whereWords(line('l', 'a'), account('a', 'pea'), bank)).toBe('PEA chez BoursoBank')
  })
  test('at home', () => {
    const home = { id: 'h', name: 'Chez toi', kind: 'home' as const }
    expect(whereWords(line('l', 'a'), account('a', 'home'), home)).toBe('Logement, chez toi')
    expect(whereWords(line('l', 'a'), account('a', 'home', { residence: 'secondary' }), home)).toBe('Logement, chez toi')
  })
  test('a rental home is not « chez toi »', () => {
    const home = { id: 'h', name: 'Chez toi', kind: 'home' as const }
    expect(whereWords(line('l', 'a'), account('a', 'home', { residence: 'rental' }), home)).toBe('Logement en location')
  })
  test('employee savings with and without an unlock date', () => {
    const est = { id: 's', name: 'Épargne salariale', kind: 'institution' as const, catalogId: 'employee-savings' }
    expect(whereWords(line('l', 'a'), account('a', 'employee-savings', { unlockOn: '2029-03-01' }), est)).toBe(
      'Épargne salariale, disponible en 2029',
    )
    expect(whereWords(line('l', 'a'), account('a', 'employee-savings'), est)).toBe('Épargne salariale')
  })
  test('PER', () => {
    expect(whereWords(line('l', 'a'), account('a', 'per'), bank)).toBe('PER, disponible à la retraite')
  })
})

describe('pricesDateLabel', () => {
  test('the spec’s sentence, with the snapshot’s day', () => {
    expect(pricesDateLabel('30 septembre')).toBe('Cours du jour pour tes actions · le reste au 30 septembre')
  })
})
