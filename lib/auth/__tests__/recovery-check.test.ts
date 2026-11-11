import { expect, test } from 'vitest'
import { GROUP_ORDINALS, groupMatches, nextGroup } from '../recovery-check'

const DISPLAY = '0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ'

test('names each of the eight groups', () => {
  expect(GROUP_ORDINALS).toEqual([
    'premier',
    'deuxième',
    'troisième',
    'quatrième',
    'cinquième',
    'sixième',
    'septième',
    'huitième',
  ])
})

test('accepts the asked group, whatever its case and spacing', () => {
  expect(groupMatches(DISPLAY, 2, '89AB')).toBe(true)
  expect(groupMatches(DISPLAY, 2, ' 89 ab ')).toBe(true)
  expect(groupMatches(DISPLAY, 4, 'ghjk')).toBe(true)
})

test('reads O as 0 and I or L as 1, like the key itself', () => {
  expect(groupMatches(DISPLAY, 0, 'O123')).toBe(true)
  expect(groupMatches('1100-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ', 0, 'il00')).toBe(true)
})

test('refuses another group, or a part of the right one', () => {
  expect(groupMatches(DISPLAY, 2, '4567')).toBe(false)
  expect(groupMatches(DISPLAY, 2, '89A')).toBe(false)
  expect(groupMatches(DISPLAY, 2, '89ABC')).toBe(false)
  expect(groupMatches(DISPLAY, 2, '')).toBe(false)
})

test('picks any of the eight groups the first time', () => {
  const seen = new Set<number>()
  for (let i = 0; i < 8; i++) seen.add(nextGroup(null, () => i / 8))
  expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
})

test('never asks the same group twice in a row', () => {
  for (let previous = 0; previous < 8; previous++) {
    for (let i = 0; i < 7; i++) {
      const next = nextGroup(previous, () => i / 7)
      expect(next).not.toBe(previous)
      expect(next).toBeGreaterThanOrEqual(0)
      expect(next).toBeLessThan(8)
    }
  }
})
