import { expect, test } from 'vitest'
import { cushionBeyond } from '@/lib/screens/reperes-words'

test('up to twelve months, the twelve boxes say it all: nothing more', () => {
  expect(cushionBeyond(5.5)).toBeNull()
  expect(cushionBeyond(12)).toBeNull()
})

test('past twelve months, what the boxes cannot draw, in the words of the sentence', () => {
  expect(cushionBeyond(19)).toBe('+ 7 mois')
  expect(cushionBeyond(18.5)).toBe('+ 6 mois et demi')
  expect(cushionBeyond(12.5)).toBe('+ un demi-mois')
})
