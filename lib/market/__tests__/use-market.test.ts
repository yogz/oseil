// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { TAB_TTL_MS, forgetMarket, useMarket, useRates } from '../use-market'

const fetchMock = vi.fn()
const QUOTE = { price: 10, currency: 'EUR', asOf: '2026-11-06' }
const RATES = { on: '2026-11-06', perEuro: { USD: 1.1 } }
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function route(quotesOk = true) {
  fetchMock.mockImplementation(async (url: string, init?: { body?: string }) => {
    if (url === '/api/rates') return json({ rates: RATES })
    if (!quotesOk) return json({}, 500)
    const { symbols } = JSON.parse(init!.body!) as { symbols: string[] }
    return json({ quotes: Object.fromEntries(symbols.map((s) => [s, QUOTE])) })
  })
}
const quoteCalls = () => fetchMock.mock.calls.filter(([u]) => u === '/api/quotes')

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  forgetMarket()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

test('loading, then ready with the quote and the rates', async () => {
  route()
  const { result } = renderHook(() => useMarket(['CW8.PA'], { rates: true }))
  expect(result.current.status).toBe('loading')
  await waitFor(() => expect(result.current.status).toBe('ready'))
  if (result.current.status !== 'ready') throw new Error()
  expect(result.current.market).toEqual({ quotes: { 'CW8.PA': QUOTE }, rates: RATES })
})

test('mounted again within 5 minutes: ready with no new fetch', async () => {
  route()
  const first = renderHook(() => useMarket(['CW8.PA'], { rates: true }))
  await waitFor(() => expect(first.result.current.status).toBe('ready'))
  first.unmount()
  fetchMock.mockClear()
  const second = renderHook(() => useMarket(['CW8.PA'], { rates: true }))
  await waitFor(() => expect(second.result.current.status).toBe('ready'))
  expect(fetchMock).not.toHaveBeenCalled()
})

test('symbols are sent sorted, without duplicates, and only the missing ones', async () => {
  route()
  const a = renderHook(() => useMarket(['CW8.PA']))
  await waitFor(() => expect(a.result.current.status).toBe('ready'))
  fetchMock.mockClear()
  const b = renderHook(() => useMarket(['MC.PA', 'CW8.PA', 'AI.PA', 'MC.PA']))
  await waitFor(() => expect(b.result.current.status).toBe('ready'))
  expect(quoteCalls()).toHaveLength(1)
  expect(quoteCalls()[0][1].body).toBe('{"symbols":["AI.PA","MC.PA"]}')
})

test('a failure gives null per symbol and is kept 60 s only', async () => {
  route(false)
  const first = renderHook(() => useMarket(['CW8.PA']))
  await waitFor(() => expect(first.result.current.status).toBe('ready'))
  if (first.result.current.status !== 'ready') throw new Error()
  expect(first.result.current.market.quotes).toEqual({ 'CW8.PA': null })
  first.unmount()
  fetchMock.mockClear()
  const second = renderHook(() => useMarket(['CW8.PA']))
  await waitFor(() => expect(second.result.current.status).toBe('ready'))
  expect(fetchMock).not.toHaveBeenCalled()
  second.unmount()

  const real = Date.now()
  const spy = vi.spyOn(Date, 'now').mockReturnValue(real + 61_000)
  route()
  const third = renderHook(() => useMarket(['CW8.PA']))
  await waitFor(() => expect(third.result.current.status).toBe('ready'))
  spy.mockRestore()
  expect(quoteCalls()).toHaveLength(1)
})

test('retry forgets and asks again', async () => {
  route()
  const { result } = renderHook(() => useMarket(['CW8.PA'], { rates: true }))
  await waitFor(() => expect(result.current.status).toBe('ready'))
  fetchMock.mockClear()
  act(() => {
    if (result.current.status === 'ready') result.current.retry()
  })
  await waitFor(() => expect(fetchMock.mock.calls.length).toBe(2))
  await waitFor(() => expect(result.current.status).toBe('ready'))
})

test('no symbol and no rates: ready at once, no fetch', () => {
  const { result } = renderHook(() => useMarket([]))
  expect(result.current).toMatchObject({ status: 'ready', market: { quotes: {}, rates: null } })
  expect(fetchMock).not.toHaveBeenCalled()
})

test('useRates(false) stays idle and asks nothing; true asks', async () => {
  route()
  const off = renderHook(() => useRates(false))
  expect(off.result.current).toEqual({ status: 'idle' })
  expect(fetchMock).not.toHaveBeenCalled()
  const on = renderHook(() => useRates(true))
  await waitFor(() => expect(on.result.current).toEqual({ status: 'ready', rates: RATES }))
})

test('a price is reused before 5 minutes and asked again after', async () => {
  route()
  const first = renderHook(() => useMarket(['CW8.PA']))
  await waitFor(() => expect(first.result.current.status).toBe('ready'))
  first.unmount()
  const real = Date.now()
  const spy = vi.spyOn(Date, 'now').mockReturnValue(real + TAB_TTL_MS - 1000)
  const early = renderHook(() => useMarket(['CW8.PA']))
  await waitFor(() => expect(early.result.current.status).toBe('ready'))
  expect(quoteCalls()).toHaveLength(1)
  early.unmount()
  spy.mockReturnValue(real + TAB_TTL_MS + 1000)
  const late = renderHook(() => useMarket(['CW8.PA']))
  await waitFor(() => expect(late.result.current.status).toBe('ready'))
  spy.mockRestore()
  expect(quoteCalls()).toHaveLength(2)
})

test('two mounts asking the same symbols at once make one call, and a failure frees the slot', async () => {
  route()
  const a = renderHook(() => useMarket(['CW8.PA', 'AI.PA'], { rates: true }))
  const b = renderHook(() => useMarket(['AI.PA', 'CW8.PA'], { rates: true }))
  await waitFor(() => expect(a.result.current.status).toBe('ready'))
  await waitFor(() => expect(b.result.current.status).toBe('ready'))
  expect(quoteCalls()).toHaveLength(1)
  expect(fetchMock.mock.calls.filter(([u]) => u === '/api/rates')).toHaveLength(1)

  forgetMarket()
  fetchMock.mockClear()
  fetchMock.mockRejectedValueOnce(new TypeError('network'))
  const c = renderHook(() => useMarket(['MC.PA']))
  await waitFor(() => expect(c.result.current.status).toBe('ready'))
  if (c.result.current.status !== 'ready') throw new Error()
  expect(c.result.current.market.quotes).toEqual({ 'MC.PA': null })
  act(() => {
    if (c.result.current.status === 'ready') c.result.current.retry()
  })
  await waitFor(() => expect(quoteCalls()).toHaveLength(2))
})
