import { expect, test } from 'vitest'
import {
  CHANGED_MEANWHILE,
  closeWord,
  IN_THE_FUTURE,
  LOCKED_UNREADABLE,
  LOCKED_UPDATE,
  ONLY_LINE,
  outcomeSentence,
  TOO_EARLY,
} from '@/lib/screens/line-words'
import { SAVE_FAILED } from '@/lib/screens/words'

test('every outcome that is not a success has its sentence', () => {
  expect(outcomeSentence('saved')).toBeNull()
  expect(outcomeSentence('update-running')).toBe(LOCKED_UPDATE)
  expect(outcomeSentence('unreadable')).toBe(LOCKED_UNREADABLE)
  expect(outcomeSentence('not-held')).toBe(CHANGED_MEANWHILE)
  expect(outcomeSentence('not-allowed')).toBe(CHANGED_MEANWHILE)
  expect(outcomeSentence('only-line')).toBe(ONLY_LINE)
  expect(outcomeSentence('too-early')).toBe(TOO_EARLY)
  expect(outcomeSentence('in-the-future')).toBe(IN_THE_FUTURE)
  expect(outcomeSentence('failed')).toBe(SAVE_FAILED)
})

test('a line is closed with one word per kind, the same on the fiche and in the update', () => {
  expect(closeWord('loan')).toBe('Remboursé')
  expect(closeWord('home')).toBe('Vendu')
  expect(closeWord('gold')).toBe('Tout vendu')
  expect(closeWord('crypto')).toBe('Tout vendu')
  expect(closeWord('livret-a')).toBe('Fermé ou tout vendu')
  expect(closeWord('pea')).toBe('Fermé ou tout vendu')
})
