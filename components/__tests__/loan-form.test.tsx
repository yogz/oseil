// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { LoanForm } from '@/components/setup/LoanForm'

afterEach(cleanup)

const HOUSE = { id: 'house', name: 'Ma maison' }
const FLAT = { id: 'flat', name: 'Studio' }
const OTHER = 'Autre chose (voiture, études…)'

function show(homes: { id: string; name: string }[], initial?: { financedLineId?: string | null }) {
  const onSubmit = vi.fn().mockResolvedValue(true)
  render(
    <LoanForm homes={homes} initial={initial} submitLabel="Ajouter" saveError={null} onSubmit={onSubmit} onCancel={vi.fn()} />,
  )
  return onSubmit
}

async function owe(amount: string) {
  await userEvent.type(screen.getByLabelText('Combien reste-t-il à rembourser ?'), amount)
}

test('one home: it is chosen already, and the loan finances it', async () => {
  const onSubmit = show([HOUSE])
  expect(screen.getByRole('button', { name: 'Ma maison' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: OTHER })).toHaveAttribute('aria-pressed', 'false')
  await owe('1000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(onSubmit).toHaveBeenCalledWith({ name: 'Crédit', amount: 100_000, financedLineId: 'house' })
})

test('one home: « Autre chose » can still be chosen', async () => {
  const onSubmit = show([HOUSE])
  await owe('1000')
  await userEvent.click(screen.getByRole('button', { name: OTHER }))
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ financedLineId: null }))
})

test('several homes: nothing is chosen for the person, and the choice is asked for', async () => {
  const onSubmit = show([HOUSE, FLAT])
  for (const name of ['Ma maison', 'Studio', OTHER]) {
    expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
  }
  await owe('1000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(screen.getByText('Choisis ce que finance ce crédit.')).toBeInTheDocument()
  expect(onSubmit).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Studio' }))
  expect(screen.queryByText('Choisis ce que finance ce crédit.')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ financedLineId: 'flat' }))
})

test('no home: « Autre chose » is the only choice, already made', async () => {
  const onSubmit = show([])
  expect(screen.getByRole('button', { name: OTHER })).toHaveAttribute('aria-pressed', 'true')
  await owe('1000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ financedLineId: null }))
})

test('a loan reopened keeps what it was saved with, even with one home', () => {
  show([HOUSE], { financedLineId: null })
  expect(screen.getByRole('button', { name: OTHER })).toHaveAttribute('aria-pressed', 'true')
  cleanup()
  show([HOUSE, FLAT], { financedLineId: 'flat' })
  expect(screen.getByRole('button', { name: 'Studio' })).toHaveAttribute('aria-pressed', 'true')
})
