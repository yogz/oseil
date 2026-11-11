import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const { rpc, createClient } = vi.hoisted(() => {
  const rpc = vi.fn()
  return { rpc, createClient: vi.fn(() => ({ rpc })) }
})
vi.mock('@supabase/supabase-js', () => ({ createClient }))

import { GET } from '../route'

const SECRET = 'test-cron-secret'

function call(authorization?: string): Promise<Response> {
  const headers: Record<string, string> = authorization === undefined ? {} : { authorization }
  return GET(new Request('http://localhost/api/keep-alive', { headers }))
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable'
  rpc.mockReset()
  createClient.mockClear()
})

afterEach(() => {
  delete process.env.CRON_SECRET
})

test('refuses a call without the header, and never touches the database', async () => {
  const res = await call()
  expect(res.status).toBe(401)
  expect(rpc).not.toHaveBeenCalled()
})

test('refuses a wrong secret', async () => {
  const res = await call('Bearer wrong')
  expect(res.status).toBe(401)
  expect(rpc).not.toHaveBeenCalled()
})

test('refuses a header without the Bearer scheme', async () => {
  const res = await call(SECRET)
  expect(res.status).toBe(401)
  expect(rpc).not.toHaveBeenCalled()
})

test('refuses everything when CRON_SECRET is not set, even an empty bearer', async () => {
  delete process.env.CRON_SECRET
  expect((await call('Bearer ')).status).toBe(401)
  expect((await call('Bearer undefined')).status).toBe(401)
  expect(rpc).not.toHaveBeenCalled()
})

test('refuses everything when CRON_SECRET is empty', async () => {
  process.env.CRON_SECRET = ''
  expect((await call('Bearer ')).status).toBe(401)
  expect(rpc).not.toHaveBeenCalled()
})

test('with the right secret, calls keep_alive once and returns seenAt', async () => {
  rpc.mockResolvedValue({ data: '2026-11-06T07:00:00+00:00', error: null })
  const res = await call(`Bearer ${SECRET}`)
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true, seenAt: '2026-11-06T07:00:00+00:00' })
  expect(rpc).toHaveBeenCalledTimes(1)
  expect(rpc).toHaveBeenCalledWith('keep_alive')
})

test('answers 502 when the database fails, and logs its code and message only', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  rpc.mockResolvedValue({ data: null, error: { code: 'PGRST301', message: 'down', details: SECRET } })
  const res = await call(`Bearer ${SECRET}`)
  expect(res.status).toBe(502)
  expect(await res.json()).toEqual({ ok: false })
  expect(consoleError).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(consoleError.mock.calls)).toContain('PGRST301')
  expect(JSON.stringify(consoleError.mock.calls)).toContain('down')
  expect(JSON.stringify(consoleError.mock.calls)).not.toContain(SECRET)
  consoleError.mockRestore()
})

test('answers 502 when the database call throws, and logs why', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  rpc.mockRejectedValue(new Error('network'))
  const res = await call(`Bearer ${SECRET}`)
  expect(res.status).toBe(502)
  expect(await res.json()).toEqual({ ok: false })
  expect(consoleError).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(consoleError.mock.calls)).toContain('network')
  consoleError.mockRestore()
})
