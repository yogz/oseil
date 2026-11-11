import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarketUnavailableError, type SecurityMatch } from '@/lib/market/types'

const { hasSession, matchesFor } = vi.hoisted(() => ({ hasSession: vi.fn(), matchesFor: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ hasSession }))
vi.mock('@/lib/market/server', () => ({ matchesFor }))

import * as route from '../route'
import { POST } from '../route'

const CONSOLE = ['log', 'info', 'warn', 'error', 'debug'] as const
const ISIN = 'LU1681043599'
const RESULTS: SecurityMatch[] = [
  { symbol: 'CW8.PA', name: 'Amundi MSCI World UCITS ETF', exchange: 'Paris', kind: 'ETF' },
]

function raw(body: string): Promise<Response> {
  return POST(
    new Request('http://localhost/api/quotes/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
  )
}

const post = (body: unknown) => raw(JSON.stringify(body))

beforeEach(() => {
  hasSession.mockReset().mockResolvedValue(true)
  matchesFor.mockReset().mockResolvedValue(RESULTS)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/quotes/search', () => {
  it('is rendered at request time, never prerendered', () => {
    expect(route.dynamic).toBe('force-dynamic')
  })

  // The text typed travels in the body, never in an address a log or a history keeps.
  it('answers POST only', () => {
    expect('GET' in route).toBe(false)
  })

  it('refuses a caller without a session, and never searches', async () => {
    hasSession.mockResolvedValue(false)
    const res = await post({ query: ISIN })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(matchesFor).not.toHaveBeenCalled()
  })

  it('checks the session before it reads the body', async () => {
    hasSession.mockResolvedValue(false)
    expect((await raw('not json')).status).toBe(401)
  })

  it.each([
    ['not JSON', 'not json'],
    ['JSON null', 'null'],
    ['no query', '{}'],
    ['a number', JSON.stringify({ query: 5 })],
    ['a list', JSON.stringify({ query: [ISIN] })],
    ['one character once trimmed', JSON.stringify({ query: ' a ' })],
    ['blanks only', JSON.stringify({ query: '     ' })],
    ['81 characters', JSON.stringify({ query: 'x'.repeat(81) })],
    // Half of a UTF-16 pair: encodeURIComponent would throw on it, a 500.
    ['a lone surrogate', '{"query":"ab\\uD800"}'],
  ])('refuses %s with 400, before any upstream call', async (_, body) => {
    const res = await raw(body)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(matchesFor).not.toHaveBeenCalled()
  })

  it('searches the text typed, and answers the results', async () => {
    const res = await post({ query: ISIN })
    expect(matchesFor).toHaveBeenCalledTimes(1)
    expect(matchesFor).toHaveBeenCalledWith(ISIN)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ results: RESULTS })
  })

  it('searches the trimmed text, from 2 to 80 characters', async () => {
    await post({ query: `  ${ISIN} ` })
    expect(matchesFor).toHaveBeenLastCalledWith(ISIN)
    expect((await post({ query: 'ab' })).status).toBe(200)
    expect((await post({ query: 'x'.repeat(80) })).status).toBe(200)
    expect((await post({ query: ` ${'x'.repeat(80)} ` })).status).toBe(200)
  })

  it('answers 502 when Yahoo fails, and does not log it itself', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    matchesFor.mockRejectedValue(new MarketUnavailableError('yahoo-search', 500))
    const res = await post({ query: ISIN })
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ ok: false })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(error).not.toHaveBeenCalled()
  })

  it('logs nothing itself, whatever it is asked', async () => {
    const spies = CONSOLE.map((name) => vi.spyOn(console, name).mockImplementation(() => {}))
    hasSession.mockResolvedValueOnce(false)
    await post({ query: ISIN })
    await post({ query: 'x'.repeat(81) })
    await raw('not json')
    await post({ query: ISIN })
    matchesFor.mockRejectedValueOnce(new MarketUnavailableError('yahoo-search', null))
    await post({ query: ISIN })
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})
