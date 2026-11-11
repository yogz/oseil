import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getClaims, createServerClient } = vi.hoisted(() => {
  const getClaims = vi.fn()
  return { getClaims, createServerClient: vi.fn(() => ({ auth: { getClaims } })) }
})
vi.mock('@supabase/ssr', () => ({ createServerClient }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }))

import { hasSession } from '../server'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
  getClaims.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('hasSession', () => {
  it('is true when the token is verified', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'user-1' } }, error: null })
    expect(await hasSession()).toBe(true)
  })

  it('is false without a session', async () => {
    getClaims.mockResolvedValue({ data: null, error: null })
    expect(await hasSession()).toBe(false)
  })

  it('is false when the token does not verify', async () => {
    getClaims.mockResolvedValue({ data: null, error: new Error('Invalid JWT signature') })
    expect(await hasSession()).toBe(false)
  })
})
