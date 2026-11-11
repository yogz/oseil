import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { memoryStorage } from '@/lib/auth/__tests__/memory-storage'
import type { GridCategory } from '@/lib/model/squares'
import { MAX_VISITS, SQUARE_HINT_KEY, hintCategory, squareHint } from '../square-hint'

const category = (id: GridCategory['category'], squares: number): GridCategory => ({
  category: id,
  value: squares * 100,
  squares,
  lines: [],
  tooSmall: [],
})

describe('the memory of the hint', () => {
  let storage: Storage
  beforeEach(() => {
    storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
  })
  afterEach(() => vi.unstubAllGlobals())

  test(`due on a new device, then no more after ${MAX_VISITS} plays`, () => {
    for (let i = 0; i < MAX_VISITS; i++) {
      expect(squareHint.due()).toBe(true)
      squareHint.played()
    }
    expect(squareHint.due()).toBe(false)
  })

  test('a square touched once: never again, and a later play does not undo it', () => {
    squareHint.touched()
    expect(squareHint.due()).toBe(false)
    squareHint.played()
    expect(squareHint.due()).toBe(false)
  })

  test('keeps only a word or a count, under its own key', () => {
    squareHint.played()
    expect(storage.getItem(SQUARE_HINT_KEY)).toBe('1')
    squareHint.touched()
    expect(storage.getItem(SQUARE_HINT_KEY)).toBe('touche')
    expect(storage.length).toBe(1)
  })

  test('a storage that refuses: the hint is due, and nothing breaks', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('refused')
      },
      setItem: () => {
        throw new Error('refused')
      },
    })
    expect(squareHint.due()).toBe(true)
    expect(() => squareHint.played()).not.toThrow()
    expect(() => squareHint.touched()).not.toThrow()
  })
})

// Option B (Nicolas, 10 November 2026): the hint lights the largest category, as a touch would.
describe('the category the hint shows', () => {
  test('is the largest one', () => {
    expect(hintCategory([category('available', 10), category('secured', 20), category('markets', 70)])).toBe('markets')
  })

  test('the first on a tie', () => {
    expect(hintCategory([category('available', 50), category('markets', 50)])).toBe('available')
  })

  test('nothing in the grid: nothing to show', () => {
    expect(hintCategory([])).toBeNull()
    expect(hintCategory([category('gold', 0)])).toBeNull()
  })
})
