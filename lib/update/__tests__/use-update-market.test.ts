// @vitest-environment jsdom
// The update on the real useMarket, with the site's routes stubbed: the prices are taken
// once, when the update opens (decision 7), and « Réessayer » asks only for the rates again,
// even once the tab no longer holds the prices.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { ModelState } from '@/lib/app/use-model'
import { forgetMarket, TAB_TTL_MS } from '@/lib/market/use-market'
import { exampleProfile, exampleSnapshot } from '@/lib/model/__tests__/fixtures'
import { useUpdate, type UpdateSession, type UpdateState } from '../use-update'

const mocks = vi.hoisted(() => ({ state: { current: null as unknown }, today: '2026-11-07' }))

vi.mock('@/lib/app/use-model', () => ({ useModel: () => mocks.state.current }))
vi.mock('@/lib/model/repository', () => ({
  InvalidDocumentError: class InvalidDocumentError extends Error {},
  DocumentChangedError: class DocumentChangedError extends Error {},
  saveDraft: async () => 'd1',
  createDraft: async (_c: unknown, _k: unknown, _d: unknown, id: string) => id,
  deleteDraft: async () => {},
  deleteAllDrafts: async () => {},
  saveProfile: async () => 'p1',
  addSnapshot: async () => 's2',
  listUpdateDocuments: async () => [],
  profileVersion: async () => ({ id: 'p1', updatedAt: '' }),
}))
vi.mock('@/lib/dates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dates')>()),
  todayIso: () => mocks.today,
}))

const RATES = { on: '2026-11-06', perEuro: { USD: 1.1165 } }
const quoted = {
  ...exampleProfile,
  lines: exampleProfile.lines.map((l) => (l.id === 'etf' ? { ...l, quoteSymbol: 'CW8.PA' } : l)),
}

// What the routes answer: the ECB down at first, and the price of the day.
const world = { ecbUp: false, price: 260 }
const fetchMock = vi.fn()
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const calls = (url: string) => fetchMock.mock.calls.filter(([u]) => u === url)

const session = (state: UpdateState): UpdateSession => {
  if (state.status !== 'ready') throw new Error(`expected ready, got ${state.status}`)
  return state.session
}

beforeEach(() => {
  forgetMarket()
  world.ecbUp = false
  world.price = 260
  fetchMock.mockReset().mockImplementation(async (url: string, init?: { body?: string }) => {
    if (url === '/api/rates') return world.ecbUp ? json({ rates: RATES }) : json({}, 502)
    const { symbols } = JSON.parse(init!.body!) as { symbols: string[] }
    return json({ quotes: Object.fromEntries(symbols.map((s) => [s, { price: world.price, currency: 'EUR', asOf: '2026-11-06' }])) })
  })
  vi.stubGlobal('fetch', fetchMock)
  mocks.state.current = {
    status: 'ready',
    client: {},
    dataKey: {} as CryptoKey,
    reload: () => {},
    model: {
      profile: { id: 'p1', value: quoted, updatedAt: '' },
      snapshots: [{ id: 's1', value: exampleSnapshot, updatedAt: '' }],
      goals: [],
      settings: null,
      draft: null,
      unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
    },
  } as unknown as ModelState
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('« Réessayer » asks the rates again, never the prices: those of the opening stay, past the tab’s memory too', async () => {
  const { result } = renderHook(() => useUpdate())
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(session(result.current).market).toEqual({ prices: { etf: 260 }, rates: null })
  expect(calls('/api/quotes')).toHaveLength(1)
  expect(calls('/api/rates')).toHaveLength(1)

  // Later: the ECB answers, the price has moved, and the tab no longer holds it.
  world.ecbUp = true
  world.price = 300
  const later = Date.now() + TAB_TTL_MS + 1
  vi.spyOn(Date, 'now').mockReturnValue(later)
  act(() => session(result.current).retryMarket())
  await waitFor(() => expect(result.current.status === 'ready' && result.current.session.market.rates).toEqual(RATES))

  expect(session(result.current).market.prices).toEqual({ etf: 260 })
  expect(calls('/api/quotes')).toHaveLength(1)
  expect(calls('/api/rates')).toHaveLength(2)
})
