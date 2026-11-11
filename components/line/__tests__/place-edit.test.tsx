// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import type { PlaceChoices } from '@/lib/correct/profile-changes'
import { exampleProfile } from '@/lib/model/__tests__/fixtures'
import type { CategoryId } from '@/lib/model/types'
import { CANCEL, NO_OTHER_ACCOUNT, NO_OTHER_BANK } from '@/lib/screens/line-words'
import { PlaceEdit } from '../PlaceEdit'

afterEach(cleanup)

const [bourso, linxea] = exampleProfile.establishments
const byAccount = (id: string) => exampleProfile.accounts.find((a) => a.id === id)!

function setup(choices: PlaceChoices, current: CategoryId | undefined = undefined) {
  const onSubmit = vi.fn().mockResolvedValue(false)
  const onCancel = vi.fn()
  render(<PlaceEdit choices={choices} current={current} saveError={null} onSubmit={onSubmit} onCancel={onCancel} />)
  return { onSubmit, onCancel }
}

test('offers the banks as chips for a whole account, and returns the pick', async () => {
  const user = userEvent.setup()
  const { onSubmit } = setup({ moves: 'account', establishments: [bourso, linxea], accounts: [], category: false })
  await user.click(screen.getByRole('button', { name: 'BoursoBank' }))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(onSubmit).toHaveBeenCalledWith({ to: 'boursobank', category: null })
})

test('offers the accounts, each with its bank, for a line', async () => {
  const user = userEvent.setup()
  const { onSubmit } = setup({
    moves: 'line',
    establishments: [],
    accounts: [{ account: byAccount('pea'), establishment: bourso }],
    category: false,
  })
  await user.click(screen.getByRole('button', { name: 'PEA · BoursoBank' }))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(onSubmit).toHaveBeenCalledWith({ to: 'pea', category: null })
})

test('says there is no other bank yet, and offers nothing to save', () => {
  setup({ moves: 'account', establishments: [], accounts: [], category: false })
  expect(screen.getByText(NO_OTHER_BANK)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
  expect(screen.getByRole('button', { name: CANCEL })).toBeInTheDocument()
})

test('says there is no other account for a line, and offers nothing to save', () => {
  setup({ moves: 'line', establishments: [], accounts: [], category: false })
  expect(screen.getByText(NO_OTHER_ACCOUNT)).toBeInTheDocument()
  expect(screen.queryByText(NO_OTHER_BANK)).toBeNull()
  expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
})

test('with nowhere else to file it, still lets its category be chosen, the sentence above', async () => {
  const user = userEvent.setup()
  const { onSubmit } = setup({ moves: 'account', establishments: [], accounts: [], category: true }, 'markets')
  expect(screen.getByText(NO_OTHER_BANK)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Placements en bourse' })).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: 'Or et crypto' }))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(onSubmit).toHaveBeenCalledWith({ to: null, category: 'gold' })
})

test('the sentence for a line with no other account to go to, above its category', () => {
  setup({ moves: 'line', establishments: [], accounts: [], category: true }, 'markets')
  expect(screen.getByText(NO_OTHER_ACCOUNT)).toBeInTheDocument()
  expect(screen.queryByText(NO_OTHER_BANK)).toBeNull()
  expect(screen.getByRole('button', { name: 'Placements en bourse' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument()
})

test('has the builder’s copy for a line with no other account', () => {
  expect(NO_OTHER_ACCOUNT).toBe('Tu n’as pas d’autre compte où le ranger.')
})

test('changes the category together with the place, only when it changed', async () => {
  const user = userEvent.setup()
  const { onSubmit } = setup({ moves: 'account', establishments: [linxea], accounts: [], category: true }, 'markets')
  expect(screen.getByRole('button', { name: 'Placements en bourse' })).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: 'Linxea' }))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(onSubmit).toHaveBeenLastCalledWith({ to: 'linxea', category: null })

  await user.click(screen.getByRole('button', { name: 'Épargne sécurisée' }))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(onSubmit).toHaveBeenLastCalledWith({ to: 'linxea', category: 'secured' })
})
