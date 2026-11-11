import { describe, expect, test } from 'vitest'
import { account, line } from '@/lib/model/__tests__/fixtures'
import { CHAPTER_LABELS, chapterOf } from '@/lib/screens/chapters'
import type { AccountTypeId } from '@/lib/model/types'

describe('chapterOf', () => {
  test('current accounts', () => {
    expect(chapterOf(line('l', 'a'), account('a', 'current'), 'available')).toBe('current-accounts')
  })

  test.each(['livret-a', 'ldds', 'lep', 'livret-jeune', 'pel-cel', 'other-savings'] as AccountTypeId[])(
    '%s is a savings book',
    (type) => {
      expect(chapterOf(line('l', 'a'), account('a', type), 'available')).toBe('savings-books')
    },
  )

  test('an other account in available', () => {
    expect(chapterOf(line('l', 'a', { category: 'available' }), account('a', 'other'), 'available')).toBe('other')
  })

  test('gold and crypto', () => {
    expect(chapterOf(line('l', 'a'), account('a', 'gold'), 'gold')).toBe('gold-metal')
    expect(chapterOf(line('l', 'a'), account('a', 'crypto'), 'gold')).toBe('crypto')
  })

  test('a ranged line reads its group, or unknown', () => {
    const pea = account('a', 'pea')
    expect(chapterOf(line('l', 'a', { group: 'us' }), pea, 'markets')).toBe('us')
    expect(chapterOf(line('l', 'a'), pea, 'markets')).toBe('unknown')
    expect(chapterOf(line('l', 'a', { group: 'euro-fund' }), account('a', 'life-insurance'), 'secured')).toBe('euro-fund')
  })

  test('a group of another category reads as unknown', () => {
    expect(chapterOf(line('l', 'a', { group: 'bonds' }), account('a', 'pea'), 'markets')).toBe('unknown')
    expect(chapterOf(line('l', 'a', { group: 'us' }), account('a', 'life-insurance'), 'secured')).toBe('unknown')
  })

  test('property has no chapter', () => {
    expect(chapterOf(line('l', 'a'), account('a', 'home'), 'property')).toBeNull()
  })

  test('every chapter has a label', () => {
    expect(CHAPTER_LABELS['current-accounts']).toBe('Comptes courants')
    expect(CHAPTER_LABELS['savings-books']).toBe('Livrets')
    expect(CHAPTER_LABELS['gold-metal']).toBe('Or')
    expect(CHAPTER_LABELS.crypto).toBe('Crypto')
    expect(CHAPTER_LABELS.other).toBe('Autres')
    expect(CHAPTER_LABELS.us).toBe('États-Unis')
  })
})
