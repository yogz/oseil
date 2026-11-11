import { describe, expect, it, vi } from 'vitest'
import { MarketUnavailableError } from '../types'
import { fetchQuote, searchSecurities } from '../yahoo'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

function chart(meta: Record<string, unknown>) {
  return { chart: { result: [{ meta }], error: null } }
}

const GOOD = { regularMarketPrice: 692.3, currency: 'EUR', regularMarketTime: 1793982902 }

function fetcherOf(response: Response | (() => Promise<Response>)) {
  return vi.fn(async () => (typeof response === 'function' ? response() : response)) as unknown as typeof fetch &
    ReturnType<typeof vi.fn>
}

describe('fetchQuote', () => {
  it('reads the price, the currency and the UTC date', async () => {
    const fetcher = fetcherOf(json(chart(GOOD)))
    expect(await fetchQuote('CW8.PA', fetcher)).toEqual({ price: 692.3, currency: 'EUR', asOf: '2026-11-06' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, init] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://query1.finance.yahoo.com/v8/finance/chart/CW8.PA?interval=1d&range=1d')
    expect(init.cache).toBe('no-store')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.headers['User-Agent']).toBe('Mozilla/5.0 (compatible; stefin/1.0)')
  })

  it('reads the nature of the security from instrumentType', async () => {
    for (const [instrumentType, kind] of [['EQUITY', 'action'], ['ETF', 'ETF'], ['MUTUALFUND', 'fonds'], ['CRYPTOCURRENCY', 'crypto']]) {
      const quote = await fetchQuote('CW8.PA', fetcherOf(json(chart({ ...GOOD, instrumentType }))))
      expect(quote).toEqual({ price: 692.3, currency: 'EUR', asOf: '2026-11-06', kind })
    }
  })

  it('keeps the price and gives no kind for any other instrumentType', async () => {
    for (const instrumentType of ['FUTURE', 'constructor', 'toString', 42, undefined]) {
      const quote = await fetchQuote('X', fetcherOf(json(chart({ ...GOOD, instrumentType }))))
      expect(quote?.price).toBe(692.3)
      expect('kind' in (quote as object)).toBe(false)
    }
  })

  // Exactly: 1039.2 / 100 is 10.392000000000001, which a box would show, and which typed
  // back as « 10,392 » would read as a new value instead of a confirmation.
  it('turns pence into pounds, rounded to 6 decimals', async () => {
    const quote = await fetchQuote('ISF.L', fetcherOf(json(chart({ ...GOOD, regularMarketPrice: 1039.2, currency: 'GBp' }))))
    expect(quote?.currency).toBe('GBP')
    expect(quote?.price).toBe(10.392)
  })

  it('keeps 6 decimals of pounds, no more', async () => {
    const quote = await fetchQuote('X.L', fetcherOf(json(chart({ ...GOOD, regularMarketPrice: 12.3456789, currency: 'GBp' }))))
    expect(quote?.price).toBe(0.123457)
  })

  it('gives null for pence too small to make a millionth of a pound', async () => {
    const quote = await fetchQuote('X.L', fetcherOf(json(chart({ ...GOOD, regularMarketPrice: 0.00004, currency: 'GBp' }))))
    expect(quote).toBeNull()
  })

  it.each([
    ['a 404', () => json({ chart: { result: null, error: { code: 'Not Found' } } }, 404)],
    ['a null result', () => json({ chart: { result: null, error: null } })],
    ['an empty result', () => json({ chart: { result: [], error: null } })],
    ['a zero price', () => json(chart({ ...GOOD, regularMarketPrice: 0 }))],
    ['a missing currency', () => json(chart({ ...GOOD, currency: undefined }))],
    ['a currency ZAc', () => json(chart({ ...GOOD, currency: 'ZAc' }))],
    ['a missing time', () => json(chart({ ...GOOD, regularMarketTime: undefined }))],
    // Past what a Date can hold: toISOString() would throw a RangeError.
    ['a time beyond any date', () => json(chart({ ...GOOD, regularMarketTime: 1e13 }))],
    // A real Date, but in the year 11476: its ISO form is not YYYY-MM-DD.
    ['a time past the year 9999', () => json(chart({ ...GOOD, regularMarketTime: 3e11 }))],
  ])('gives null for %s', async (_name, make) => {
    expect(await fetchQuote('X', fetcherOf(make()))).toBeNull()
  })

  it.each([429, 500])('rejects on a %i', async (status) => {
    await expect(fetchQuote('X', fetcherOf(json({}, status)))).rejects.toMatchObject({
      name: 'MarketUnavailableError',
      source: 'yahoo-chart',
      status,
    })
  })

  it('turns GBX pence into pounds too', async () => {
    const quote = await fetchQuote('ISF.L', fetcherOf(json(chart({ ...GOOD, regularMarketPrice: 1039.2, currency: 'GBX' }))))
    expect(quote?.currency).toBe('GBP')
    expect(quote?.price).toBe(10.392)
  })

  it('gives up after the 5 s timeout, with a null status', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort(new DOMException('t', 'TimeoutError')))
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      init.signal?.throwIfAborted()
      return json(chart(GOOD))
    }) as unknown as typeof fetch
    const error = await fetchQuote('X', fetcher).catch((e) => e)
    expect(timeout).toHaveBeenCalledWith(5_000)
    expect(error).toBeInstanceOf(MarketUnavailableError)
    expect(error.status).toBeNull()
    timeout.mockRestore()
  })

  it('rejects on a timeout', async () => {
    const fetcher = fetcherOf(() => Promise.reject(new DOMException('t', 'TimeoutError')))
    const error = await fetchQuote('X', fetcher).catch((e) => e)
    expect(error).toBeInstanceOf(MarketUnavailableError)
    expect(error.status).toBeNull()
  })
})

const AMUNDI = {
  exchange: 'PAR',
  shortname: 'Amundi MSCI World Swap UCITS ETF',
  quoteType: 'ETF',
  symbol: 'CW8.PA',
  index: 'quotes',
  score: 31000,
  typeDisp: 'ETF',
  longname: 'Amundi Index Solutions - Amundi MSCI World Swap UCITS ETF EUR Acc',
  exchDisp: 'Paris',
}

describe('searchSecurities', () => {
  it('reads a recorded answer', async () => {
    const fetcher = fetcherOf(json({ quotes: [AMUNDI], news: [] }))
    expect(await searchSecurities('LU1681043599', fetcher)).toEqual([
      {
        symbol: 'CW8.PA',
        name: 'Amundi Index Solutions - Amundi MSCI World Swap UCITS ETF EUR Acc',
        exchange: 'Paris',
        kind: 'ETF',
      },
    ])
    const [url] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://query2.finance.yahoo.com/v1/finance/search?q=LU1681043599&quotesCount=8&newsCount=0')
  })

  it('maps kinds, falls back on the symbol, and leaves the rest out', async () => {
    const fetcher = fetcherOf(
      json({
        quotes: [
          { symbol: 'AIR.PA', quoteType: 'EQUITY', shortname: 'Airbus', exchange: 'PAR' },
          { symbol: '0P0001CFPL.F', quoteType: 'MUTUALFUND' },
          { symbol: 'BTC=F', quoteType: 'FUTURE' },
          { symbol: 'FCHI', quoteType: 'INDEX' },
          { symbol: '^FCHI', quoteType: 'EQUITY' },
        ],
      }),
    )
    expect(await searchSecurities('x', fetcher)).toEqual([
      { symbol: 'AIR.PA', name: 'Airbus', exchange: 'PAR', kind: 'action' },
      { symbol: '0P0001CFPL.F', name: '0P0001CFPL.F', exchange: '', kind: 'fonds' },
    ])
  })

  // Recorded on 11 November 2026: Yahoo names a coin after its pair (« Ethereum USD ») on its
  // market « CCC ». The name loses the currency, the market says nothing, and one coin is one
  // result: the pair is chosen at the pick, in the line's currency (crypto.ts).
  it('reads a coin: its name without the currency, no market, one result per coin', async () => {
    const fetcher = fetcherOf(
      json({
        quotes: [
          { exchange: 'CCC', shortname: 'Bitcoin USD', longname: 'Bitcoin USD', quoteType: 'CRYPTOCURRENCY', symbol: 'BTC-USD', exchDisp: 'CCC' },
          { symbol: 'BTC=F', quoteType: 'FUTURE', exchDisp: 'Chicago Mercantile Exchange' },
          { symbol: 'IBIT', quoteType: 'ETF', shortname: 'iShares Bitcoin Trust ETF', exchDisp: 'NASDAQ' },
          { exchange: 'CCC', shortname: 'Bitcoin EUR', quoteType: 'CRYPTOCURRENCY', symbol: 'BTC-EUR', exchDisp: 'CCC' },
          { exchange: 'CCC', shortname: 'Bitcoin Cash USD', quoteType: 'CRYPTOCURRENCY', symbol: 'BCH-USD', exchDisp: 'CCC' },
        ],
      }),
    )
    expect(await searchSecurities('bitcoin', fetcher)).toEqual([
      { symbol: 'BTC-USD', name: 'Bitcoin', exchange: '', kind: 'crypto' },
      { symbol: 'IBIT', name: 'iShares Bitcoin Trust ETF', exchange: 'NASDAQ', kind: 'ETF' },
      { symbol: 'BCH-USD', name: 'Bitcoin Cash', exchange: '', kind: 'crypto' },
    ])
  })

  it('keeps eight at most, in order', async () => {
    const quotes = Array.from({ length: 10 }, (_, i) => ({ symbol: `S${i}`, quoteType: 'EQUITY' }))
    const result = await searchSecurities('x', fetcherOf(json({ quotes })))
    expect(result.map((m) => m.symbol)).toEqual(['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'])
  })

  it('rejects on a 500', async () => {
    await expect(searchSecurities('x', fetcherOf(json({}, 500)))).rejects.toBeInstanceOf(MarketUnavailableError)
  })

  // F7: an answer whose shape changed is a search that did not answer, never « Rien trouvé ».
  it('rejects a 200 answer without a list of quotes as unavailable', async () => {
    for (const body of [{ news: [] }, { quotes: null }, { quotes: {} }, [], 'quotes']) {
      const failure = searchSecurities('x', fetcherOf(json(body)))
      await expect(failure).rejects.toBeInstanceOf(MarketUnavailableError)
      await expect(failure).rejects.toMatchObject({ source: 'yahoo-search', status: 200 })
    }
  })

  it('an empty list of quotes is nothing found', async () => {
    expect(await searchSecurities('x', fetcherOf(json({ quotes: [], news: [] })))).toEqual([])
  })
})
