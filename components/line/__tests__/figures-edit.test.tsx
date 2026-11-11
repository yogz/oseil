// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { amountEntry, unitsEntry } from '@/lib/model/__tests__/fixtures'
import type { AccountTypeId } from '@/lib/model/types'
import { IS_CORRECTION } from '@/lib/screens/line-words'
import { NEGATIVE_AMOUNT, ZERO_HOME } from '@/lib/update/fields'
import { FiguresEdit } from '../FiguresEdit'
import { plain } from '@/lib/__tests__/plain'

afterEach(cleanup)

function setup(
  entry = unitsEntry('etf', 100, 250, 200),
  currency: 'EUR' | 'USD' = 'EUR',
  accountType: AccountTypeId = 'pea',
  label = 'Son montant',
) {
  const onSubmit = vi.fn().mockResolvedValue(true)
  const onCancel = vi.fn()
  render(<FiguresEdit entry={entry} currency={currency} accountType={accountType} label={label} saveError={null} onSubmit={onSubmit} onCancel={onCancel} />)
  return { onSubmit, onCancel }
}

test('corrects the parts of a fund, and says it is a correction', async () => {
  const user = userEvent.setup()
  const { onSubmit } = setup()
  expect(screen.getByText(plain(IS_CORRECTION))).toBeInTheDocument()
  const parts = screen.getByLabelText('Ses parts')
  expect(parts).toHaveValue('100')
  await user.clear(parts)
  await user.type(parts, '120')
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(onSubmit).toHaveBeenCalledWith({ kind: 'units', units: 120, unitPrice: 250, averagePrice: 200 })
})

test('keeps an empty average price as unknown, not 0', async () => {
  const user = userEvent.setup()
  const { onSubmit } = setup()
  await user.clear(screen.getByLabelText(/Son prix moyen/))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(onSubmit).toHaveBeenCalledWith({ kind: 'units', units: 100, unitPrice: 250, averagePrice: null })
})

test('starts an unknown average price empty', () => {
  setup(unitsEntry('etf', 100, 250, null))
  expect(screen.getByLabelText(/Son prix moyen/)).toHaveValue('')
})

test('refuses parts and prices that do not read', async () => {
  const user = userEvent.setup()
  const { onSubmit } = setup()
  await user.clear(screen.getByLabelText('Ses parts'))
  await user.type(screen.getByLabelText('Ses parts'), 'abc')
  await user.clear(screen.getByLabelText(/Son prix moyen/))
  await user.type(screen.getByLabelText(/Son prix moyen/), 'x')
  await user.clear(screen.getByLabelText(/Le prix d’une part/))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getAllByText('Ce nombre n’est pas lisible.')).toHaveLength(3)
  expect(onSubmit).not.toHaveBeenCalled()
})

test('corrects an amount, in the currency of the line', async () => {
  const user = userEvent.setup()
  const { onSubmit } = setup(amountEntry('livret', 1_200.5), 'USD', 'livret-a')
  const field = screen.getByLabelText('Son montant (USD)')
  expect(field).toHaveValue('1\u202f200,50')
  await user.clear(field)
  await user.type(field, '1 300,25')
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(onSubmit).toHaveBeenCalledWith({ kind: 'amount', amount: 130_025 })
})

test('refuses an amount that does not read, or is negative', async () => {
  const user = userEvent.setup()
  const { onSubmit } = setup(amountEntry('livret', 1_200), 'EUR', 'livret-a')
  const field = screen.getByLabelText('Son montant (EUR)')
  await user.clear(field)
  await user.type(field, 'beaucoup')
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getByText('Ce montant n’est pas lisible.')).toBeInTheDocument()
  await user.clear(field)
  await user.type(field, '-5')
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getByText(NEGATIVE_AMOUNT)).toBeInTheDocument()
  expect(onSubmit).not.toHaveBeenCalled()
})

test('accepts an overdrawn current account', async () => {
  const user = userEvent.setup()
  const { onSubmit } = setup(amountEntry('cc', 100), 'EUR', 'current')
  const field = screen.getByLabelText('Son montant (EUR)')
  await user.clear(field)
  await user.type(field, '-250')
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(onSubmit).toHaveBeenCalledWith({ kind: 'amount', amount: -25_000 })
})

test('refuses a home at zero', async () => {
  const user = userEvent.setup()
  const { onSubmit } = setup(amountEntry('h', 300_000), 'EUR', 'home')
  const field = screen.getByLabelText('Son montant (EUR)')
  await user.clear(field)
  await user.type(field, '0')
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getByText(ZERO_HOME)).toBeInTheDocument()
  expect(onSubmit).not.toHaveBeenCalled()
})

test('cancel writes nothing', async () => {
  const user = userEvent.setup()
  const { onSubmit, onCancel } = setup()
  await user.click(screen.getByRole('button', { name: 'Annuler' }))
  expect(onCancel).toHaveBeenCalled()
  expect(onSubmit).not.toHaveBeenCalled()
})
