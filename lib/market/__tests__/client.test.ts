import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { CLIENT_TIMEOUT_MS, requestQuotes, requestRates, requestSearch } from '../client'

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const html = () => new Response('<html>connexion</html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
const QUOTE = { price: 10, currency: 'EUR', asOf: '2026-11-06' }
const RATES = { on: '2026-11-06', perEuro: { USD: 1.1 } }
const MATCH = { symbol: 'CW8.PA', name: 'Amundi', exchange: 'Paris', kind: 'ETF' }

test('requestQuotes posts the symbols and nothing else, and unwraps quotes', async () => {
  fetchMock.mockResolvedValue(json({ quotes: { 'AI.PA': QUOTE, 'CW8.PA': null } }))
  expect(await requestQuotes(['AI.PA', 'CW8.PA'])).toEqual({ 'AI.PA': QUOTE, 'CW8.PA': null })
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/quotes')
  expect(init.method).toBe('POST')
  expect(init.body).toBe('{"symbols":["AI.PA","CW8.PA"]}')
  expect(init.headers['Content-Type']).toBe('application/json')
})

test('requestSearch posts the query in the body', async () => {
  fetchMock.mockResolvedValue(json({ results: [MATCH] }))
  expect(await requestSearch('LU1681043599')).toEqual([MATCH])
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/quotes/search')
  expect(init.body).toBe('{"query":"LU1681043599"}')
})

test('requestRates is a GET without body', async () => {
  fetchMock.mockResolvedValue(json({ rates: RATES }))
  expect(await requestRates()).toEqual(RATES)
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/rates')
  expect(init.body).toBeUndefined()
})

test('a 401 or an HTML page is null for each request, never a throw', async () => {
  for (const make of [() => json({}, 401), html]) {
    fetchMock.mockResolvedValue(make())
    expect(await requestQuotes(['A'])).toBeNull()
    fetchMock.mockResolvedValue(make())
    expect(await requestSearch('ab')).toBeNull()
    fetchMock.mockResolvedValue(make())
    expect(await requestRates()).toBeNull()
  }
})

test('a part that does not parse is null', async () => {
  fetchMock.mockResolvedValue(json({ quotes: 'nope' }))
  expect(await requestQuotes(['CW8.PA'])).toBeNull()
  fetchMock.mockResolvedValue(json({ results: [{ ...MATCH, kind: 'x' }] }))
  expect(await requestSearch('amundi')).toBeNull()
  fetchMock.mockResolvedValue(json({ rates: { perEuro: { USD: 1.1 } } }))
  expect(await requestRates()).toBeNull()
  fetchMock.mockRejectedValue(new TypeError('network'))
  expect(await requestRates()).toBeNull()
})

test('a malformed quote drops only its own symbol', async () => {
  fetchMock.mockResolvedValue(json({ quotes: { 'AI.PA': QUOTE, 'CW8.PA': { ...QUOTE, price: 'x' } } }))
  expect(await requestQuotes(['AI.PA', 'CW8.PA'])).toEqual({ 'AI.PA': QUOTE, 'CW8.PA': null })
})

test('a request that never answers gives null at 8 s, not before', async () => {
  vi.useFakeTimers()
  fetchMock.mockImplementation(
    (_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }),
  )
  let result: unknown = 'pending'
  void requestQuotes(['CW8.PA']).then((r) => (result = r))
  await vi.advanceTimersByTimeAsync(CLIENT_TIMEOUT_MS - 1)
  expect(result).toBe('pending')
  await vi.advanceTimersByTimeAsync(1)
  expect(result).toBeNull()
})
