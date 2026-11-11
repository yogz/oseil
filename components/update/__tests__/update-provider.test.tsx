// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { exampleProfile, exampleSnapshot } from '@/lib/model/__tests__/fixtures'
import type { UpdateState } from '@/lib/update/use-update'
import { markStep, startDraft } from '@/lib/update/draft'
import { UpdateProvider, useUpdateScreen } from '../UpdateProvider'

const mocks = vi.hoisted(() => ({ state: { current: null as unknown }, replace: vi.fn() }))
vi.mock('@/lib/update/use-update', () => ({ useUpdate: () => mocks.state.current }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }))

function ready(draft = startDraft('s1')): UpdateState {
  return {
    status: 'ready',
    session: {
      profile: exampleProfile,
      base: { id: 's1', value: exampleSnapshot, updatedAt: '' },
      draft,
      market: { prices: {}, rates: null },
      failedPrices: [],
      retryMarket: () => {},
      saved: false,
      change: async () => true,
      save: async () => true,
      abandon: async () => true,
      settled: async () => true,
      resave: async () => true,
      saveError: null,
    },
  }
}

const wrapper = ({ children }: { children: ReactNode }) => <UpdateProvider>{children}</UpdateProvider>

beforeEach(() => {
  mocks.replace.mockReset()
  mocks.state.current = ready()
})
afterEach(cleanup)

test('current is « Chez toi » on a fresh draft', () => {
  const { result } = renderHook(() => useUpdateScreen(), { wrapper })
  expect(result.current.current?.name).toBe('Chez toi')
})

test('current is BoursoBank once « Chez toi » is done', () => {
  mocks.state.current = ready(markStep(startDraft('s1'), 'home', 'done'))
  const { result } = renderHook(() => useUpdateScreen(), { wrapper })
  expect(result.current.current?.name).toBe('BoursoBank')
})

test('a skipped step counts as progress: the next one opens', () => {
  mocks.state.current = ready(markStep(startDraft('s1'), 'home', 'skipped'))
  const { result } = renderHook(() => useUpdateScreen(), { wrapper })
  expect(result.current.current?.name).toBe('BoursoBank')
})

test('show changes the current establishment', () => {
  const { result } = renderHook(() => useUpdateScreen(), { wrapper })
  act(() => result.current.show('linxea'))
  expect(result.current.current?.name).toBe('Linxea')
})

test('later progress does not move the screen', () => {
  const { result, rerender } = renderHook(() => useUpdateScreen(), { wrapper })
  mocks.state.current = ready(markStep(startDraft('s1'), 'home', 'done'))
  rerender()
  expect(result.current.current?.name).toBe('Chez toi')
})

test('unavailable sends the person home and renders nothing', () => {
  mocks.state.current = { status: 'unavailable' }
  const { container } = render(
    <UpdateProvider>
      <p>screen</p>
    </UpdateProvider>,
  )
  expect(mocks.replace).toHaveBeenCalledWith('/')
  expect(container.textContent).toBe('')
})

test('a ready update renders its children and does not redirect', () => {
  const { container } = render(
    <UpdateProvider>
      <p>screen</p>
    </UpdateProvider>,
  )
  expect(container.textContent).toBe('screen')
  expect(mocks.replace).not.toHaveBeenCalled()
})
