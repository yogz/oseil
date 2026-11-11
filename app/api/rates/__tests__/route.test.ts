import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarketUnavailableError, type Rates } from '@/lib/market/types'

const { hasSession, ratesNow } = vi.hoisted(() => ({ hasSession: vi.fn(), ratesNow: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ hasSession }))
vi.mock('@/lib/market/server', () => ({ ratesNow }))

import * as route from '../route'
import { GET } from '../route'

const CONSOLE = ['log', 'info', 'warn', 'error', 'debug'] as const
const RATES: Rates = { on: '2026-11-06', perEuro: { USD: 1.1165, GBP: 0.8721, CHF: 0.9342 } }

beforeEach(() => {
  hasSession.mockReset().mockResolvedValue(true)
  ratesNow.mockReset().mockResolvedValue(RATES)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/rates', () => {
  it('is rendered at request time, never prerendered', () => {
    expect(route.dynamic).toBe('force-dynamic')
  })

  // The request says nothing about which currencies someone holds: the
  // handler takes no request, so it cannot read a parameter or a body.
  it('takes no argument, so it reads no request parameter', () => {
    expect(GET.length).toBe(0)
    expect('POST' in route).toBe(false)
  })

  it('refuses a caller without a session, and never asks the ECB', async () => {
    hasSession.mockResolvedValue(false)
    const res = await GET()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(ratesNow).not.toHaveBeenCalled()
  })

  it('answers the rates of the day', async () => {
    const res = await GET()
    expect(ratesNow).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ rates: RATES })
  })

  it('answers 502 when the ECB fails, and does not log it itself', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    ratesNow.mockRejectedValue(new MarketUnavailableError('ecb', 503))
    const res = await GET()
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ ok: false })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(error).not.toHaveBeenCalled()
  })

  it('logs nothing itself, whatever happens', async () => {
    const spies = CONSOLE.map((name) => vi.spyOn(console, name).mockImplementation(() => {}))
    hasSession.mockResolvedValueOnce(false)
    await GET()
    await GET()
    ratesNow.mockRejectedValueOnce(new MarketUnavailableError('ecb', null))
    await GET()
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})
