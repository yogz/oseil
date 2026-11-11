import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { hasSession, quotesFor } = vi.hoisted(() => ({ hasSession: vi.fn(), quotesFor: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ hasSession }))
vi.mock('@/lib/market/server', () => ({ quotesFor }))

import { SYMBOL } from '@/lib/market/types'
import * as route from '../route'
import { POST } from '../route'

const CONSOLE = ['log', 'info', 'warn', 'error', 'debug'] as const

function raw(body: string): Promise<Response> {
  return POST(
    new Request('http://localhost/api/quotes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
  )
}

const post = (body: unknown) => raw(JSON.stringify(body))
const distinct = (count: number) => Array.from({ length: count }, (_, i) => `S${i}.PA`)

beforeEach(() => {
  hasSession.mockReset().mockResolvedValue(true)
  quotesFor.mockReset().mockImplementation(async (symbols: string[]) =>
    Object.fromEntries(symbols.map((symbol) => [symbol, null])),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/quotes', () => {
  it('is rendered at request time, never prerendered', () => {
    expect(route.dynamic).toBe('force-dynamic')
  })

  // Symbols travel in the body, never in an address a log or a history keeps.
  it('answers POST only', () => {
    expect('GET' in route).toBe(false)
  })

  it('refuses a caller without a session, and never asks for a price', async () => {
    hasSession.mockResolvedValue(false)
    const res = await post({ symbols: ['CW8.PA'] })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(quotesFor).not.toHaveBeenCalled()
  })

  // An anonymous caller learns nothing about what the route accepts.
  it('checks the session before it reads the body', async () => {
    hasSession.mockResolvedValue(false)
    expect((await raw('not json')).status).toBe(401)
  })

  it.each([
    ['not JSON', 'not json'],
    ['JSON null', 'null'],
    ['an array', '["CW8.PA"]'],
    ['no symbols', '{}'],
    ['symbols as a string', JSON.stringify({ symbols: 'CW8.PA' })],
    ['an empty list', JSON.stringify({ symbols: [] })],
    ['a number in the list', JSON.stringify({ symbols: ['CW8.PA', 1] })],
    ['51 distinct symbols', JSON.stringify({ symbols: distinct(51) })],
    ['a space in a symbol', JSON.stringify({ symbols: ['CW8 PA'] })],
    ['a path in a symbol', JSON.stringify({ symbols: ['../x'] })],
    ['a symbol too long', JSON.stringify({ symbols: ['A'.repeat(21)] })],
    ['an empty symbol', JSON.stringify({ symbols: [''] })],
  ])('refuses %s with 400, before any upstream call', async (_, body) => {
    const res = await raw(body)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(quotesFor).not.toHaveBeenCalled()
  })

  it('asks once per distinct symbol, and answers a missing price with null', async () => {
    quotesFor.mockResolvedValue({
      'CW8.PA': { price: 692.3, currency: 'EUR', asOf: '2026-11-06' },
      'NOPE.PA': null,
    })
    const res = await post({ symbols: ['CW8.PA', 'CW8.PA', 'NOPE.PA'] })
    expect(quotesFor).toHaveBeenCalledTimes(1)
    expect(quotesFor).toHaveBeenCalledWith(['CW8.PA', 'NOPE.PA'])
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({
      quotes: { 'CW8.PA': { price: 692.3, currency: 'EUR', asOf: '2026-11-06' }, 'NOPE.PA': null },
    })
  })

  it('accepts 50 symbols', async () => {
    expect((await post({ symbols: distinct(50) })).status).toBe(200)
    expect(quotesFor).toHaveBeenLastCalledWith(distinct(50))
  })

  // The browser sends a list already without duplicates, so the cap is on the
  // list as sent, and it comes before any symbol is examined.
  it('refuses more than 50 entries, even repeated, before it examines one', async () => {
    const examine = vi.spyOn(SYMBOL, 'test')
    expect((await post({ symbols: [...distinct(50), 'S0.PA'] })).status).toBe(400)
    expect((await post({ symbols: Array(51).fill('CW8.PA') })).status).toBe(400)
    expect(examine).not.toHaveBeenCalled()
    expect(quotesFor).not.toHaveBeenCalled()
  })

  it('logs nothing itself, whatever it is asked', async () => {
    const spies = CONSOLE.map((name) => vi.spyOn(console, name).mockImplementation(() => {}))
    hasSession.mockResolvedValueOnce(false)
    await post({ symbols: ['CW8.PA'] })
    await post({ symbols: ['CW8 PA'] })
    await raw('not json')
    await post({ symbols: ['CW8.PA', 'NOPE.PA'] })
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})
