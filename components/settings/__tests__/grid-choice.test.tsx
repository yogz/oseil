// @vitest-environment jsdom
// « Ta grille » in the settings (docs/superpowers/specs/2026-11-12-grille-sans-chez-toi-design.md).
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Model, ModelState } from '@/lib/app/use-model'
import { account, amountEntry, line, profileOf, snapshotOf } from '@/lib/model/__tests__/fixtures'
import type { Profile, Settings } from '@/lib/model/types'
import { DisplaySection } from '../DisplaySection'

const mocks = vi.hoisted(() => ({ saveSettings: vi.fn() }))
vi.mock('@/lib/model/repository', () => ({ saveSettings: mocks.saveSettings }))

const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const base: Settings = { schema: 1, budget: null, display: 'euros', hideAmounts: false }
const withHome = profileOf([account('c', 'current'), account('h', 'home')], [line('cash', 'c'), line('home', 'h')])
const homeAlone = profileOf([account('h', 'home')], [line('home', 'h')])
const noHome = profileOf([account('c', 'current')], [line('cash', 'c')])

function stateOf(profile: Profile, settings: Settings = base): Extract<ModelState, { status: 'ready' }> {
  const entries = profile.lines.map((l) => amountEntry(l.id, 100_000))
  const model: Model = {
    profile: loaded(profile),
    snapshots: [loaded(snapshotOf(entries), 's0')],
    goals: [],
    settings: loaded(settings, 'st0'),
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
  }
  return { status: 'ready', model, client: {} as never, dataKey: {} as CryptoKey, reload: vi.fn() }
}

beforeEach(() => mocks.saveSettings.mockReset().mockResolvedValue('st0'))
afterEach(cleanup)

test('with a home and something else: « Tout compter » chosen, « Sans chez toi » saved as the only new field', async () => {
  render(<DisplaySection state={stateOf(withHome)} />)
  expect(screen.getByText('Ta grille')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Tout compter' })).toHaveAttribute('aria-pressed', 'true')
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Sans chez toi' }))
  })
  expect(mocks.saveSettings).toHaveBeenCalledWith({}, {}, { ...base, withoutHome: true }, 'st0')
})

test('back to « Tout compter », the field goes: absent is everything counted', async () => {
  render(<DisplaySection state={stateOf(withHome, { ...base, withoutHome: true })} />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Tout compter' }))
  })
  expect(mocks.saveSettings).toHaveBeenCalledWith({}, {}, base, 'st0')
})

test('a home alone: « Sans chez toi » greyed, and said why', () => {
  render(<DisplaySection state={stateOf(homeAlone)} />)
  expect(screen.getByRole('button', { name: 'Sans chez toi' })).toBeDisabled()
  expect(screen.getByText('Rien d’autre à montrer pour l’instant.')).toBeInTheDocument()
})

test('no home: no « Ta grille »', () => {
  render(<DisplaySection state={stateOf(noHome)} />)
  expect(screen.queryByText('Ta grille')).toBeNull()
})
