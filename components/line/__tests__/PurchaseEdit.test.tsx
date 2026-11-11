// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { PURCHASE_RESET } from '@/lib/screens/line-words'
import { PurchaseEdit } from '../PurchaseEdit'

afterEach(cleanup)

const field = () => screen.getByLabelText(/Quand tu as acheté, 1\s€ valait combien de dollars américains\s\?/)
const props = (over: Partial<Parameters<typeof PurchaseEdit>[0]> = {}) => ({
  perEuro: 1.0872,
  source: 'computed' as const,
  label: 'Le dollar à l’achat',
  currency: 'USD' as const,
  words: 'dollars américains',
  saveError: null,
  onSave: vi.fn(async () => true),
  onCancel: vi.fn(),
  ...over,
})

// docs/superpowers/specs/2026-11-11-change-a-l-achat-design.md, and the review of its screens.
test('says what is corrected, opens on the rate Oseil computed, and saves the one typed', async () => {
  const p = props()
  render(<PurchaseEdit {...p} />)
  expect(screen.getByRole('heading', { name: 'Le dollar à l’achat' })).toBeInTheDocument()
  expect(field()).toHaveValue('1,0872')
  expect(screen.getByText(/Oseil prend le cours du dollar le jour de chaque relevé/)).toBeInTheDocument()
  await userEvent.clear(field())
  await userEvent.type(field(), '1,2')
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(p.onSave).toHaveBeenCalledWith({ perEuro: 1.2 })
})

test('asks in which money the broker gives the average price, and saves euros with no rate', async () => {
  const p = props()
  render(<PurchaseEdit {...p} />)
  expect(screen.getByRole('group', { name: /ton prix moyen d’achat est en/ })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Euros' }))
  expect(screen.queryByLabelText(/valait combien/)).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(p.onSave).toHaveBeenCalledWith({ inEuros: true })
})

test('a rate out of bounds or unreadable is refused with a word, nothing saved', async () => {
  const p = props()
  render(<PurchaseEdit {...p} />)
  await userEvent.clear(field())
  await userEvent.type(field(), '0')
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getByText(/par exemple 1,08/)).toBeInTheDocument()
  expect(p.onSave).not.toHaveBeenCalled()
})

test('the way back to Oseil’s calculation is under the currency only, and only for a figure typed', async () => {
  const typed = props({ source: 'typed', perEuro: 1.2 })
  render(<PurchaseEdit {...typed} />)
  await userEvent.click(screen.getByRole('button', { name: PURCHASE_RESET }))
  expect(typed.onSave).toHaveBeenCalledWith(null)
  cleanup()
  render(<PurchaseEdit {...props({ source: 'euros', perEuro: null })} />)
  expect(screen.queryByRole('button', { name: PURCHASE_RESET })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Dollars américains' }))
  expect(screen.getByRole('button', { name: PURCHASE_RESET })).toBeInTheDocument()
  cleanup()
  render(<PurchaseEdit {...props()} />)
  expect(screen.queryByRole('button', { name: PURCHASE_RESET })).toBeNull()
})
