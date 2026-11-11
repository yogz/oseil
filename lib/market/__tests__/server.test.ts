import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarketUnavailableError } from '../types'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  matchesFor,
  QUOTES_DEADLINE_MS,
  RATES_CALLS_PER_MINUTE,
  SEARCH_CALLS_PER_MINUTE,
  UPSTREAM_CALLS_PER_MINUTE,
  quotesFor,
  ratesNow,
  resetMarketCaches,
} from '../server'

function chartResponse(price = 100): Response {
  return new Response(
    JSON.stringify({
      chart: { result: [{ meta: { regularMarketPrice: price, currency: 'EUR', regularMarketTime: 1793982902 } }] },
    }),
  )
}

function mockFetch(impl: (url: string) => Promise<Response> | Response) {
  return vi.fn(async (url: string) => impl(url)) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-08T10:00:00Z'))
  resetMarketCaches()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('quotesFor', () => {
  it('asks once per distinct symbol', async () => {
    const fetcher = mockFetch(() => chartResponse())
    const quotes = await quotesFor(['CW8.PA', 'CW8.PA'], fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(quotes['CW8.PA']).toEqual({ price: 100, currency: 'EUR', asOf: '2026-11-06' })
  })

  it('coalesces simultaneous requests for one symbol (R13)', async () => {
    let release: (r: Response) => void = () => {}
    const fetcher = mockFetch(() => new Promise<Response>((resolve) => (release = resolve)))
    const first = quotesFor(['CW8.PA'], fetcher)
    const second = quotesFor(['CW8.PA'], fetcher)
    await vi.advanceTimersByTimeAsync(0)
    release(chartResponse())
    const [a, b] = await Promise.all([first, second])
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(a['CW8.PA']).toEqual(b['CW8.PA'])
    expect(a['CW8.PA']).not.toBeNull()
  })

  it('keeps a price 10 minutes', async () => {
    const fetcher = mockFetch(() => chartResponse())
    await quotesFor(['CW8.PA'], fetcher)
    vi.advanceTimersByTime(599_000)
    await quotesFor(['CW8.PA'], fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2_000)
    await quotesFor(['CW8.PA'], fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('keeps a not-found 10 minutes', async () => {
    const fetcher = mockFetch(() => new Response('{}', { status: 404 }))
    expect((await quotesFor(['NOPE'], fetcher)).NOPE).toBeNull()
    vi.advanceTimersByTime(599_000)
    await quotesFor(['NOPE'], fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('keeps a failure as null for 60 seconds only', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetcher = mockFetch(() => new Response('{}', { status: 500 }))
    expect((await quotesFor(['CW8.PA'], fetcher))['CW8.PA']).toBeNull()
    vi.advanceTimersByTime(59_000)
    await quotesFor(['CW8.PA'], fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2_000)
    await quotesFor(['CW8.PA'], fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('never has more than 6 requests in flight', async () => {
    let current = 0
    let peak = 0
    const fetcher = mockFetch(async () => {
      current++
      peak = Math.max(peak, current)
      await new Promise((resolve) => setTimeout(resolve, 10))
      current--
      return chartResponse()
    })
    const symbols = Array.from({ length: 20 }, (_, i) => `S${i}`)
    const run = quotesFor(symbols, fetcher)
    await vi.runAllTimersAsync()
    const quotes = await run
    expect(Object.keys(quotes)).toHaveLength(20)
    expect(fetcher).toHaveBeenCalledTimes(20)
    expect(peak).toBe(6)
  })

  it('clears the in-flight entry after an unexpected error (R13)', async () => {
    const broken = vi.fn(async () => ({
      get status(): number {
        throw new TypeError('boom')
      },
    })) as unknown as typeof fetch
    await expect(quotesFor(['CW8.PA'], broken)).rejects.toThrow('boom')
    const fetcher = mockFetch(() => chartResponse())
    const quotes = await quotesFor(['CW8.PA'], fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(quotes['CW8.PA']).not.toBeNull()
  })

  it('keeps the other prices when one answer has an absurd time', async () => {
    const absurd = JSON.stringify({
      chart: { result: [{ meta: { regularMarketPrice: 5, currency: 'EUR', regularMarketTime: 1e13 } }] },
    })
    const fetcher = mockFetch((url) => (url.includes('BAD') ? new Response(absurd) : chartResponse()))
    const quotes = await quotesFor(['BAD.PA', 'CW8.PA'], fetcher)
    expect(quotes).toEqual({ 'BAD.PA': null, 'CW8.PA': { price: 100, currency: 'EUR', asOf: '2026-11-06' } })
  })

  // F8: the route answers before the browser's 8 s give up, whatever Yahoo does.
  describe('the overall deadline', () => {
    const PRICE = { price: 100, currency: 'EUR', asOf: '2026-11-06' }
    const FIRST = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']
    // Each symbol answers after its delay on the fake clock. Six take 4 s; LATE waits its turn,
    // then takes 3 s more: it would answer at 7 s, after the deadline.
    function slow(delays: Record<string, number>, late: () => Response = () => chartResponse()) {
      return mockFetch((url) => {
        const symbol = decodeURIComponent(url.split('/chart/')[1].split('?')[0])
        return new Promise<Response>((resolve) =>
          setTimeout(() => resolve(symbol === 'LATE' ? late() : chartResponse()), delays[symbol] ?? 4_000),
        )
      })
    }

    it('answers at 6,5 s: a symbol not finished by then is null', async () => {
      expect(QUOTES_DEADLINE_MS).toBe(6_500)
      const fetcher = slow({ LATE: 3_000 })
      let quotes: Record<string, unknown> | null = null
      void quotesFor([...FIRST, 'LATE'], fetcher).then((q) => (quotes = q))
      await vi.advanceTimersByTimeAsync(6_499)
      expect(quotes).toBeNull()
      await vi.advanceTimersByTimeAsync(1)
      expect(quotes).toEqual({ ...Object.fromEntries(FIRST.map((s) => [s, PRICE])), LATE: null })
    })

    it('keeps no failure for a late symbol: its request goes on, and fills the cache when it answers', async () => {
      const fetcher = slow({ LATE: 3_000 })
      const first = quotesFor([...FIRST, 'LATE'], fetcher)
      await vi.advanceTimersByTimeAsync(6_500)
      expect((await first).LATE).toBeNull()
      // Asked again before it answers: the request in flight, not a null kept as a failure.
      const again = quotesFor(['LATE'], fetcher)
      await vi.advanceTimersByTimeAsync(500)
      expect((await again).LATE).toEqual(PRICE)
      expect((await quotesFor(['LATE'], fetcher)).LATE).toEqual(PRICE)
      expect(fetcher).toHaveBeenCalledTimes(7)
    })

    it('starts no request once it has answered', async () => {
      // Six take 7 s each: at 6,5 s nothing has answered, and the seventh was never sent.
      const fetcher = slow({ ...Object.fromEntries(FIRST.map((s) => [s, 7_000])) })
      const run = quotesFor([...FIRST, 'NEXT'], fetcher)
      await vi.advanceTimersByTimeAsync(6_500)
      expect(Object.values(await run)).toEqual(Array(7).fill(null))
      await vi.advanceTimersByTimeAsync(10_000)
      expect(fetcher).toHaveBeenCalledTimes(6)
      // Those six were not failures either: each answered later and is kept.
      expect((await quotesFor(['A1'], fetcher)).A1).toEqual(PRICE)
      expect(fetcher).toHaveBeenCalledTimes(6)
    })

    it('an unexpected error after it has answered breaks nothing', async () => {
      const broken = () =>
        ({
          get status(): number {
            throw new TypeError('boom')
          },
        }) as unknown as Response
      const fetcher = slow({ LATE: 3_000 }, broken)
      const run = quotesFor([...FIRST, 'LATE'], fetcher)
      await vi.advanceTimersByTimeAsync(6_500)
      expect((await run).LATE).toBeNull()
      await vi.advanceTimersByTimeAsync(1_000)
      // Its in-flight entry is gone: the next request asks Yahoo again.
      const retried = mockFetch(() => chartResponse())
      expect((await quotesFor(['LATE'], retried)).LATE).toEqual(PRICE)
    })

    it('a request that ends in time leaves no timer behind', async () => {
      await quotesFor(['CW8.PA'], mockFetch(() => chartResponse()))
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  it('logs a failure once, without the symbol', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetcher = mockFetch(() => new Response('{}', { status: 500 }))
    await quotesFor(['CW8.PA'], fetcher)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('market upstream failed', { source: 'yahoo-chart', status: 500 })
    expect(JSON.stringify(log.mock.calls)).not.toContain('CW8.PA')
  })
})

describe('matchesFor', () => {
  const answer = () =>
    new Response(JSON.stringify({ quotes: [{ symbol: 'AIR.PA', quoteType: 'EQUITY', shortname: 'Airbus' }] }))

  it('caches by the trimmed, lowercased query', async () => {
    const fetcher = mockFetch(answer)
    await matchesFor(' Amundi ', fetcher)
    const again = await matchesFor('amundi', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(again).toHaveLength(1)
  })

  it('keeps no failure and lets the error through', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetcher = mockFetch(() => new Response('{}', { status: 500 }))
    await expect(matchesFor('amundi', fetcher)).rejects.toMatchObject({ name: 'MarketUnavailableError' })
    await expect(matchesFor('amundi', fetcher)).rejects.toMatchObject({ name: 'MarketUnavailableError' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('F7: an answer without a list of quotes is a failure, never kept as « nothing found »', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetcher = mockFetch(() => new Response(JSON.stringify({ finance: { error: 'changed' } })))
    await expect(matchesFor('amundi', fetcher)).rejects.toMatchObject({ name: 'MarketUnavailableError' })
    await expect(matchesFor('amundi', fetcher)).rejects.toMatchObject({ name: 'MarketUnavailableError' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('logs a failed search without its text', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetcher = mockFetch(() => new Response('{}', { status: 500 }))
    await matchesFor('LU1681043599', fetcher).catch(() => {})
    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('market upstream failed', { source: 'yahoo-search', status: 500 })
    expect(JSON.stringify(log.mock.calls)).not.toContain('LU1681043599')
  })
})

describe('ratesNow', () => {
  const xml = "<Cube><Cube time='2026-11-06'><Cube currency='USD' rate='1.1165'/></Cube></Cube>"

  it('keeps a success an hour', async () => {
    const fetcher = mockFetch(() => new Response(xml))
    await ratesNow(fetcher)
    vi.advanceTimersByTime(3_599_000)
    expect((await ratesNow(fetcher)).on).toBe('2026-11-06')
    expect(fetcher).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2_000)
    await ratesNow(fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('keeps no failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetcher = mockFetch(() => new Response('', { status: 503 }))
    await expect(ratesNow(fetcher)).rejects.toMatchObject({ source: 'ecb', status: 503 })
    await expect(ratesNow(fetcher)).rejects.toBeInstanceOf(Error)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

describe('global upstream cap', () => {
  it('answers null past the cap, without caching it as a failure', async () => {
    const fetcher = mockFetch(() => chartResponse())
    for (let i = 0; i < UPSTREAM_CALLS_PER_MINUTE; i++) await quotesFor([`S${i}`], fetcher)
    expect(fetcher).toHaveBeenCalledTimes(UPSTREAM_CALLS_PER_MINUTE)
    expect((await quotesFor(['OVER'], fetcher))['OVER']).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(UPSTREAM_CALLS_PER_MINUTE)
    await vi.advanceTimersByTimeAsync(60_001)
    expect((await quotesFor(['OVER'], fetcher))['OVER']).not.toBeNull()
  })

  it('does not count cached answers', async () => {
    const fetcher = mockFetch(() => chartResponse())
    for (let i = 0; i < UPSTREAM_CALLS_PER_MINUTE + 10; i++) await quotesFor(['CW8.PA'], fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('keeps a separate cap for each kind: prices at the cap do not block search or rates', async () => {
    const fetcher = mockFetch((url) =>
      url.includes('search') ? new Response(JSON.stringify({ quotes: [] })) : chartResponse(),
    )
    for (let i = 0; i < UPSTREAM_CALLS_PER_MINUTE; i++) await quotesFor([`S${i}`], fetcher)
    await expect(matchesFor('world etf', fetcher)).resolves.toEqual([])
  })

  it('makes a search unavailable past its cap, and resumes after the minute', async () => {
    const fetcher = mockFetch(() => new Response(JSON.stringify({ quotes: [] })))
    for (let i = 0; i < SEARCH_CALLS_PER_MINUTE; i++) await matchesFor(`query ${i}`, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(SEARCH_CALLS_PER_MINUTE)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(matchesFor('one more', fetcher)).rejects.toBeInstanceOf(MarketUnavailableError)
    expect(fetcher).toHaveBeenCalledTimes(SEARCH_CALLS_PER_MINUTE)
    await vi.advanceTimersByTimeAsync(60_001)
    await expect(matchesFor('one more', fetcher)).resolves.toEqual([])
  })

  it('makes rates fail past their cap, and resumes after the minute', async () => {
    // A failure is never cached, so every ask reaches the cap check.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const down = mockFetch(() => new Response('', { status: 503 }))
    for (let i = 0; i < RATES_CALLS_PER_MINUTE; i++) {
      await expect(ratesNow(down)).rejects.toMatchObject({ status: 503 })
    }
    await expect(ratesNow(down)).rejects.toBeInstanceOf(MarketUnavailableError)
    expect(down).toHaveBeenCalledTimes(RATES_CALLS_PER_MINUTE)
    await vi.advanceTimersByTimeAsync(60_001)
    const up = mockFetch(() => new Response(readFileSync(join(__dirname, 'ecb-2026-11-06.xml'), 'utf8')))
    await expect(ratesNow(up)).resolves.toBeDefined()
  })

  it('logs nothing about a symbol or a query when the cap is hit', async () => {
    const fetcher = mockFetch(() => chartResponse())
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (let i = 0; i < SEARCH_CALLS_PER_MINUTE; i++) await matchesFor(`SECRETQUERY${i}`, fetcher).catch(() => {})
    await matchesFor('SECRETQUERY-OVER', fetcher).catch(() => {})
    for (let i = 0; i <= UPSTREAM_CALLS_PER_MINUTE; i++) await quotesFor([`SECRETSYM${i}`], fetcher)
    expect(JSON.stringify(error.mock.calls)).not.toMatch(/SECRET/)
  })
})
