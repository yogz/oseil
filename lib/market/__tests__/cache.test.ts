import { describe, expect, it } from 'vitest'
import { createCache } from '../cache'

describe('createCache', () => {
  it('holds a value until its ttl', () => {
    let t = 1000
    const cache = createCache<string>(10, () => t)
    cache.set('a', 'x', 100)
    t = 1099
    expect(cache.get('a')).toBe('x')
    t = 1100
    expect(cache.get('a')).toBeUndefined()
  })

  it('drops the oldest key past max', () => {
    const cache = createCache<number>(2, () => 0)
    cache.set('a', 1, 100)
    cache.set('b', 2, 100)
    cache.set('c', 3, 100)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
  })

  it('clears', () => {
    const cache = createCache<number>(2, () => 0)
    cache.set('a', 1, 100)
    cache.clear()
    expect(cache.get('a')).toBeUndefined()
  })
})
