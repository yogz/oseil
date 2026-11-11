// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { CONFIRM_DELETE, KEEP, ONLY_LINE, YES_DELETE } from '@/lib/screens/line-words'
import { DeleteFlow } from '../DeleteFlow'
import { plain } from '@/lib/__tests__/plain'

afterEach(cleanup)

test('asks, then deletes', async () => {
  const user = userEvent.setup()
  const onDelete = vi.fn().mockResolvedValue(false)
  render(<DeleteFlow canDelete saveError={null} onDelete={onDelete} onCancel={vi.fn()} />)
  expect(screen.getByText(CONFIRM_DELETE)).toBeInTheDocument()
  expect(onDelete).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: YES_DELETE }))
  expect(onDelete).toHaveBeenCalledTimes(1)
})

test('keeping the line cancels', async () => {
  const user = userEvent.setup()
  const onCancel = vi.fn()
  render(<DeleteFlow canDelete saveError={null} onDelete={vi.fn()} onCancel={onCancel} />)
  await user.click(screen.getByRole('button', { name: KEEP }))
  expect(onCancel).toHaveBeenCalled()
})

test('refuses to delete the only line of a snapshot', () => {
  render(<DeleteFlow canDelete={false} saveError={null} onDelete={vi.fn()} onCancel={vi.fn()} />)
  expect(screen.getByText(plain(ONLY_LINE))).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: YES_DELETE })).toBeNull()
})
