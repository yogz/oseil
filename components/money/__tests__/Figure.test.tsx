// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@/lib/model/documents'
import type { ModelState } from '@/lib/app/use-model'
import { DisplayModeProvider } from '../DisplayMode'
import { Figure } from '../Figure'

const mocks = vi.hoisted(() => ({ saveSettings: vi.fn() }))
vi.mock('@/lib/model/repository', () => ({ saveSettings: mocks.saveSettings }))

type Ready = Extract<ModelState, { status: 'ready' }>
const CLIENT = { tag: 'client' } as never
const KEY = {} as CryptoKey

function ready(
  overrides: { settings?: Ready['model']['settings']; unreadableSettings?: number } = {},
): Ready {
  return {
    status: 'ready',
    client: CLIENT,
    dataKey: KEY,
    reload: vi.fn(),
    model: {
      profile: null,
      snapshots: [],
      goals: [],
      settings: overrides.settings ?? null,
      draft: null,
      unreadable: { profile: 0, snapshots: 0, goals: 0, settings: overrides.unreadableSettings ?? 0, draft: 0 },
    },
  }
}

function screenOf(state: Ready) {
  return render(
    <DisplayModeProvider state={state}>
      <Figure euros="1 000 €" percent="12 %" tone="gain" />
      <Figure euros="50 €" percent="3 %" />
    </DisplayModeProvider>,
  )
}

beforeEach(() => {
  mocks.saveSettings.mockReset().mockResolvedValue('new-id')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

test('shows euros, then percent everywhere after a touch, and saves the choice', async () => {
  const user = userEvent.setup()
  screenOf(ready())
  expect(screen.getByRole('button', { name: '1 000 €' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '1 000 €' }))
  expect(screen.getByRole('button', { name: '12 %' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '3 %' })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Chiffres en % partout · touche pour revenir en €')
  expect(mocks.saveSettings).toHaveBeenCalledWith(CLIENT, KEY, { ...DEFAULT_SETTINGS, display: 'percent' }, undefined)
})

test('a second touch goes back to euros and updates the same document', async () => {
  const user = userEvent.setup()
  screenOf(ready())
  await user.click(screen.getByRole('button', { name: '1 000 €' }))
  await user.click(screen.getByRole('button', { name: '12 %' }))
  expect(screen.getByRole('status')).toHaveTextContent('Chiffres en euros partout')
  expect(mocks.saveSettings).toHaveBeenCalledTimes(2)
  expect(mocks.saveSettings).toHaveBeenLastCalledWith(CLIENT, KEY, { ...DEFAULT_SETTINGS, display: 'euros' }, 'new-id')
})

test('two quick touches never insert two documents', async () => {
  const user = userEvent.setup()
  let release: (id: string) => void = () => {}
  mocks.saveSettings.mockReturnValueOnce(new Promise<string>((resolve) => (release = resolve)))
  screenOf(ready())
  await user.click(screen.getByRole('button', { name: '1 000 €' }))
  await user.click(screen.getByRole('button', { name: '12 %' }))
  expect(mocks.saveSettings).toHaveBeenCalledTimes(1)
  await act(async () => release('first-id'))
  expect(mocks.saveSettings).toHaveBeenCalledTimes(2)
  expect(mocks.saveSettings.mock.calls[1][3]).toBe('first-id')
})

test('keeps the other settings and the id of an existing document', async () => {
  const user = userEvent.setup()
  const value = { ...DEFAULT_SETTINGS, hideAmounts: true, budget: { basis: 'salary' as const, monthly: 100000 } }
  screenOf(ready({ settings: { id: 'abc', value, updatedAt: '2026-11-01T00:00:00Z' } }))
  await user.click(screen.getByRole('button', { name: '1 000 €' }))
  expect(mocks.saveSettings).toHaveBeenCalledWith(CLIENT, KEY, { ...value, display: 'percent' }, 'abc')
})

test('starts in the saved mode', () => {
  const value = { ...DEFAULT_SETTINGS, display: 'percent' as const }
  screenOf(ready({ settings: { id: 'abc', value, updatedAt: '2026-11-01T00:00:00Z' } }))
  expect(screen.getByRole('button', { name: '12 %' })).toBeInTheDocument()
})

test('a failed save says so and keeps the mode for the visit', async () => {
  const user = userEvent.setup()
  mocks.saveSettings.mockRejectedValue(new Error('offline'))
  screenOf(ready())
  await user.click(screen.getByRole('button', { name: '1 000 €' }))
  expect(await screen.findByText('Ton choix n’a pas pu être enregistré.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '12 %' })).toBeInTheDocument()
})

test('unreadable settings: toggles for the visit without writing', async () => {
  const user = userEvent.setup()
  screenOf(ready({ unreadableSettings: 1 }))
  await user.click(screen.getByRole('button', { name: '1 000 €' }))
  expect(screen.getByRole('button', { name: '12 %' })).toBeInTheDocument()
  expect(mocks.saveSettings).not.toHaveBeenCalled()
})

test('the toast goes away after 1.8 seconds', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  screenOf(ready())
  await user.click(screen.getByRole('button', { name: '1 000 €' }))
  expect(screen.getByRole('status')).toBeInTheDocument()
  act(() => void vi.advanceTimersByTime(1800))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('a figure has a dotted underline and a 44 px touch zone that does not push the lines apart', () => {
  screenOf(ready())
  const figure = screen.getByRole('button', { name: '1 000 €' })
  expect(figure).toHaveClass('underline', 'decoration-dotted', 'text-gain')
  expect(figure).toHaveAttribute('type', 'button')
  // Part of the sentence it sits in (a 44 px high box would leave a blank line around it)…
  expect(figure).toHaveClass('inline')
  expect(figure).not.toHaveClass('min-h-11', 'inline-flex')
  // …with an invisible zone around it, about 18 px of text plus 14 px above and below.
  expect(figure.className).toMatch(/after:absolute/)
  expect(figure.className).toMatch(/after:-inset-y-3\.5/)
})

test('a touchable figure says what a touch does, in euros and in percent', async () => {
  const user = userEvent.setup()
  screenOf(ready())
  expect(screen.getByRole('button', { name: '1 000 €' })).toHaveAccessibleDescription('passer en %')
  await user.click(screen.getByRole('button', { name: '1 000 €' }))
  expect(screen.getByRole('button', { name: '12 %' })).toHaveAccessibleDescription('passer en euros')
})
