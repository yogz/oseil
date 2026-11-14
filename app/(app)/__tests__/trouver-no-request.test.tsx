// @vitest-environment jsdom
// Review Focus 3 of « Trouver »: what is typed never leaves the browser. The real market hook is used
// here, and every request goes through a fetch spy: the prices are asked once, when the page opens,
// and nothing more while typing.
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Model, ModelState } from '@/lib/app/use-model'
import { forgetMarket } from '@/lib/market/use-market'
import { account, line, snapshotOf, unitsEntry } from '@/lib/model/__tests__/fixtures'
import type { Profile } from '@/lib/model/types'
import FindPage from '../trouver/page'

const mocks = vi.hoisted(() => ({ state: { current: { status: 'loading' } as ModelState } }))

vi.mock('@/lib/app/use-model', () => ({ useModel: () => mocks.state.current }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn() }) }))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props} />,
}))

const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const profile: Profile = {
  schema: 1,
  establishments: [{ id: 'e', name: 'BoursoBank', kind: 'institution' }],
  accounts: [account('pea', 'pea', { name: 'PEA' })],
  lines: [line('o1', 'pea', { kind: 'units', name: 'OVHCLOUD', quoteSymbol: 'OVH.PA' })],
}
const model: Model = {
  profile: loaded(profile),
  snapshots: [loaded(snapshotOf([unitsEntry('o1', 10, 20, 10)]), 's0')],
  goals: [],
  settings: null,
  draft: null,
  unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
}

const answer = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
const fetchSpy = vi.fn(async (url: string) => (url === '/api/rates' ? answer({ rates: null }) : answer({ quotes: { 'OVH.PA': null } })))

beforeEach(() => {
  forgetMarket()
  fetchSpy.mockClear()
  vi.stubGlobal('fetch', fetchSpy)
  mocks.state.current = { status: 'ready', model, client: {} as never, dataKey: {} as CryptoKey, reload: vi.fn() }
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('no price is asked while the first launch is unfinished', async () => {
  const unfinished: Profile = { ...profile, firstLaunch: { complete: false, planned: ['e'], finished: [] } }
  mocks.state.current = {
    status: 'ready',
    model: { ...model, profile: loaded(unfinished) },
    client: {} as never,
    dataKey: {} as CryptoKey,
    reload: vi.fn(),
  }
  render(<FindPage />)
  await screen.findByRole('searchbox', { name: 'Trouver' })
  await waitFor(() => expect(screen.getByText('Une action, un compte, un mois, un réglage.')).toBeInTheDocument())
  expect(fetchSpy).not.toHaveBeenCalled()
})

test('the prices are asked once at the open, and typing sends nothing', async () => {
  render(<FindPage />)
  const box = await screen.findByRole('searchbox', { name: 'Trouver' })
  await waitFor(() => expect(screen.getByText('Une action, un compte, un mois, un réglage.')).toBeInTheDocument())
  const atOpen = fetchSpy.mock.calls.map(([url]) => url)
  expect(atOpen.sort()).toEqual(['/api/quotes', '/api/rates'])

  await userEvent.type(box, 'ovhcloud')
  await userEvent.clear(box)
  await userEvent.type(box, 'ovh')
  await screen.findByRole('region', { name: 'Tes lignes' })
  expect(fetchSpy).toHaveBeenCalledTimes(atOpen.length)
  // Nor is it in the address.
  expect(window.location.search).toBe('')
})
