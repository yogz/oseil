// @vitest-environment jsdom
// « Où il est rangé »: another account, or a new one (docs/superpowers/specs/2026-11-11-tout-corriger-depuis-la-fiche-design.md, § 2).
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import type { PlaceChoices } from '@/lib/correct/profile-changes'
import { exampleProfile, line } from '@/lib/model/__tests__/fixtures'
import type { AccountTypeId, Line } from '@/lib/model/types'
import { NO_OTHER_ACCOUNT } from '@/lib/screens/line-words'
import { PlaceEdit } from '../PlaceEdit'

afterEach(cleanup)

const [bourso] = exampleProfile.establishments
const byAccount = (id: string) => exampleProfile.accounts.find((a) => a.id === id)!
const withPea: PlaceChoices = { moves: 'line', establishments: [], accounts: [{ account: byAccount('life'), establishment: bourso }], category: true }

function setup(choices: PlaceChoices, newTypes: AccountTypeId[] = ['pea-pme', 'livret-a'], companions: Line[] = []) {
  const onSubmit = vi.fn().mockResolvedValue(false)
  const onCreate = vi.fn().mockResolvedValue(false)
  const onCancel = vi.fn()
  render(
    <PlaceEdit
      choices={choices}
      establishment={bourso}
      newTypes={newTypes}
      companions={companions}
      saveError={null}
      onSubmit={onSubmit}
      onCreate={onCreate}
      onCancel={onCancel}
    />,
  )
  return { onSubmit, onCreate, onCancel }
}

test('offers the accounts, each with its bank, and returns the pick', async () => {
  const user = userEvent.setup()
  const { onSubmit } = setup(withPea)
  await user.click(screen.getByRole('button', { name: 'Assurance-vie · BoursoBank' }))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(onSubmit).toHaveBeenCalledWith('life')
})

test('says there is no other account, and still offers a new one', () => {
  setup({ ...withPea, accounts: [] })
  expect(screen.getByText(NO_OTHER_ACCOUNT)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '+ Un nouveau compte' })).toBeInTheDocument()
})

test('« Enregistrer » with nothing picked writes nothing', async () => {
  const user = userEvent.setup()
  const { onSubmit, onCancel } = setup(withPea)
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(onSubmit).not.toHaveBeenCalled()
  expect(onCancel).toHaveBeenCalled()
})

test('a new account: its type among the ones given, its name prefilled, the companions ticked', async () => {
  const user = userEvent.setup()
  const { onCreate } = setup(withPea, ['pea-pme', 'livret-a'], [line('reaumur', 'pea', { name: 'REAUMUR' }), line('brossolette', 'pea', { name: 'BROSSOLETTE' })])
  await user.click(screen.getByRole('button', { name: '+ Un nouveau compte' }))
  expect(screen.queryByRole('button', { name: /Compte-titres/ })).toBeNull()
  await user.click(screen.getByRole('button', { name: /PEA-PME/ }))
  expect(screen.getByLabelText('Son nom')).toHaveValue('PEA-PME')
  expect(screen.getByRole('button', { name: 'REAUMUR' })).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: 'BROSSOLETTE' }))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(onCreate).toHaveBeenCalledWith({ type: 'pea-pme', name: 'PEA-PME', lineIds: ['reaumur'] })
})

test('a new account of one line asks no name and takes nothing along', async () => {
  const user = userEvent.setup()
  const { onCreate } = setup(withPea, ['livret-a'], [line('reaumur', 'pea', { name: 'REAUMUR' })])
  await user.click(screen.getByRole('button', { name: '+ Un nouveau compte' }))
  await user.click(screen.getByRole('button', { name: /Livret A/ }))
  expect(screen.queryByLabelText('Son nom')).toBeNull()
  expect(screen.queryByRole('button', { name: 'REAUMUR' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(onCreate).toHaveBeenCalledWith({ type: 'livret-a', name: 'Livret A', lineIds: [] })
})

test('an emptied name is refused before anything is written', async () => {
  const user = userEvent.setup()
  const { onCreate } = setup(withPea)
  await user.click(screen.getByRole('button', { name: '+ Un nouveau compte' }))
  await user.click(screen.getByRole('button', { name: /PEA-PME/ }))
  await user.clear(screen.getByLabelText('Son nom'))
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(onCreate).not.toHaveBeenCalled()
  expect(screen.getByText('Écris un nom.')).toBeInTheDocument()
})
