// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { todayIso } from '@/lib/dates'
import { IN_THE_FUTURE, KEEP, SINCE, TOO_EARLY, YES_CLOSE } from '@/lib/screens/line-words'
import { CloseFlow } from '../CloseFlow'
import { plain } from '@/lib/__tests__/plain'

afterEach(cleanup)

const today = todayIso()
const bounds = { earliest: '2020-01-02', latest: today }

function setup(rewrites: (on: string) => number = () => 0) {
  const onClose = vi.fn().mockResolvedValue(false)
  const onCancel = vi.fn()
  render(<CloseFlow label="Vendu" bounds={bounds} rewrites={rewrites} saveError={null} onClose={onClose} onCancel={onCancel} />)
  return { onClose, onCancel }
}

test('asks since when, with today pre-filled and the bounds on the field', () => {
  setup()
  const field = screen.getByLabelText(plain(SINCE))
  expect(field).toHaveValue(today)
  expect(field).toHaveAttribute('min', bounds.earliest)
  expect(field).toHaveAttribute('max', today)
})

test('closes at once when no snapshot is rewritten', async () => {
  const user = userEvent.setup()
  const { onClose } = setup()
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(onClose).toHaveBeenCalledWith(today)
})

test('asks first when snapshots are rewritten, and says how many', async () => {
  const user = userEvent.setup()
  const { onClose } = setup((on) => (on === '2026-10-15' ? 2 : 0))
  fireEvent.change(screen.getByLabelText(plain(SINCE)), { target: { value: '2026-10-15' } })
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getByText('Il sortira de tes 2 relevés pris depuis le 15 octobre. Ça ne se défait pas.')).toBeInTheDocument()
  expect(onClose).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: YES_CLOSE }))
  expect(onClose).toHaveBeenCalledWith('2026-10-15')
})

test('keeping the line leaves the confirmation and calls nothing', async () => {
  const user = userEvent.setup()
  const { onClose, onCancel } = setup(() => 1)
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  await user.click(screen.getByRole('button', { name: KEEP }))
  expect(onClose).not.toHaveBeenCalled()
  expect(onCancel).toHaveBeenCalled()
})

test('refuses a day in the future without calling anything', async () => {
  const user = userEvent.setup()
  const { onClose } = setup()
  fireEvent.change(screen.getByLabelText(plain(SINCE)), { target: { value: '2999-01-01' } })
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getByText(plain(IN_THE_FUTURE))).toBeInTheDocument()
  expect(onClose).not.toHaveBeenCalled()
})

test('refuses a day before the first snapshot without calling anything', async () => {
  const user = userEvent.setup()
  const { onClose } = setup()
  fireEvent.change(screen.getByLabelText(plain(SINCE)), { target: { value: '2019-01-01' } })
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getByText(plain(TOO_EARLY))).toBeInTheDocument()
  expect(onClose).not.toHaveBeenCalled()
})

test('refuses an empty day without calling anything', async () => {
  const user = userEvent.setup()
  const { onClose } = setup()
  fireEvent.change(screen.getByLabelText(plain(SINCE)), { target: { value: '' } })
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(onClose).not.toHaveBeenCalled()
})
