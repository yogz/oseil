// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { CurrencyChoice } from '../CurrencyChoice'
import { ONLY_EUROS } from '@/lib/market/words'
import { plain } from '@/lib/__tests__/plain'

const state = vi.hoisted(() => ({ rates: null as unknown, enabled: [] as boolean[] }))
vi.mock('@/lib/market/use-market', () => ({
  useRates: (enabled: boolean) => {
    state.enabled.push(enabled)
    return enabled ? { status: 'ready', rates: state.rates } : { status: 'idle' }
  },
}))

beforeEach(() => {
  state.enabled = []
  state.rates = { on: '2026-11-06', perEuro: { USD: 1.1165, GBP: 0.83415, CHF: 0.9143 } }
})
afterEach(cleanup)

test('it says « En euros » with « changer », and asks for rates only once opened', async () => {
  render(<CurrencyChoice value="EUR" onChoose={() => {}} />)
  expect(screen.getByText(/^En euros/)).toBeInTheDocument()
  expect(state.enabled.every((e) => e === false)).toBe(true)
  await userEvent.click(screen.getByRole('button', { name: 'Changer de devise' }))
  expect(state.enabled).toContain(true)
})

test('« dollars américains » calls onChoose with the euros for one dollar', async () => {
  const onChoose = vi.fn()
  render(<CurrencyChoice value="EUR" onChoose={onChoose} />)
  await userEvent.click(screen.getByRole('button', { name: 'Changer de devise' }))
  for (const name of ['euros', 'dollars américains', 'livres sterling', 'francs suisses']) {
    expect(screen.getByRole('button', { name })).toBeInTheDocument()
  }
  await userEvent.click(screen.getByRole('button', { name: 'dollars américains' }))
  expect(onChoose).toHaveBeenCalledWith('USD', expect.closeTo(0.895656, 5))
})

test('without rates only euros are offered, and the screen says so', async () => {
  state.rates = null
  render(<CurrencyChoice value="EUR" onChoose={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'Changer de devise' }))
  expect(screen.getByText(plain(ONLY_EUROS))).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'euros' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'dollars américains' })).not.toBeInTheDocument()
})

test('a locked currency is shown without « changer »', () => {
  render(<CurrencyChoice value="USD" locked onChoose={() => {}} />)
  expect(screen.getByText(/^En dollars américains/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Changer de devise' })).not.toBeInTheDocument()
})
