// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { memoryStorage } from '@/lib/auth/__tests__/memory-storage'
import { REMINDER_DISMISSED_KEY } from '@/lib/app/update-reminder'
import { UpdateReminder } from '../UpdateReminder'

const TODAY = '2026-11-11'
const snap = (takenOn: string, createdAt?: string) => ({ value: { takenOn }, createdAt })
// Saved on 11 August, three months ago to the day.
const OLD = [snap('2026-08-11', '2026-08-11T09:00:00Z')]

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('renders nothing when the last update is less than three months old', () => {
  render(<UpdateReminder snapshots={[snap('2026-08-12', '2026-08-12T09:00:00Z')]} today={TODAY} pending={false} />)
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('renders nothing without any snapshot', () => {
  render(<UpdateReminder snapshots={[]} today={TODAY} pending={false} />)
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('when due: the age, the date, « Mettre à jour » to /mise-a-jour and « Plus tard »', () => {
  render(<UpdateReminder snapshots={OLD} today={TODAY} pending={false} />)
  const dialog = screen.getByRole('dialog', { name: 'Tes chiffres ont 3 mois' })
  expect(dialog).toHaveTextContent('Ils datent du 11 août. Un tour de tes banques, et ils seront de nouveau justes.')
  const link = screen.getByRole('link', { name: 'Mettre à jour' })
  expect(link).toHaveAttribute('href', '/mise-a-jour')
  expect(link).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Plus tard' })).toBeInTheDocument()
})

test('an old import: the title counts from the statement date, like the sentence', () => {
  // Statement of 1 June 2025, saved four months ago: 17 months, not 4.
  render(<UpdateReminder snapshots={[snap('2025-06-01', '2026-07-11T09:00:00Z')]} today={TODAY} pending={false} />)
  expect(screen.getByRole('dialog', { name: 'Tes chiffres ont 17\u00A0mois' })).toHaveTextContent('Ils datent du 1er juin 2025')
})

test('says « Reprendre » when an update is already under way', () => {
  render(<UpdateReminder snapshots={OLD} today={TODAY} pending />)
  expect(screen.getByRole('link', { name: 'Reprendre' })).toHaveAttribute('href', '/mise-a-jour')
  expect(screen.queryByRole('link', { name: 'Mettre à jour' })).toBeNull()
})

test('the age and the date both come from the latest statement', () => {
  // Sorted by takenOn: the last statement is of 1 July, saved on 20 July (the threshold reads the save, the words the statement).
  render(
    <UpdateReminder
      snapshots={[snap('2026-03-01', '2026-03-01T09:00:00Z'), snap('2026-07-01', '2026-07-20T09:00:00Z')]}
      today={TODAY}
      pending={false}
    />,
  )
  expect(screen.getByRole('dialog', { name: 'Tes chiffres ont 4\u00A0mois' })).toHaveTextContent('Ils datent du 1er juillet.')
})

test('a backdated statement saved lately, not last in the list, keeps the reminder away', () => {
  render(
    <UpdateReminder
      snapshots={[snap('2026-01-05', '2026-11-01T09:00:00Z'), snap('2026-07-01', '2026-07-01T09:00:00Z')]}
      today={TODAY}
      pending={false}
    />,
  )
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('« Plus tard » keeps today on this device and hides it', async () => {
  render(<UpdateReminder snapshots={OLD} today={TODAY} pending={false} />)
  await userEvent.click(screen.getByRole('button', { name: 'Plus tard' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(localStorage.getItem(REMINDER_DISMISSED_KEY)).toBe(TODAY)
})

test('dismissed today: not shown again today, shown again the next day', () => {
  localStorage.setItem(REMINDER_DISMISSED_KEY, TODAY)
  const { unmount } = render(<UpdateReminder snapshots={OLD} today={TODAY} pending={false} />)
  expect(screen.queryByRole('dialog')).toBeNull()
  unmount()
  render(<UpdateReminder snapshots={OLD} today="2026-11-12" pending={false} />)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

test('Escape and a touch on the dimmed screen act like « Plus tard »', () => {
  const { unmount } = render(<UpdateReminder snapshots={OLD} today={TODAY} pending={false} />)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(localStorage.getItem(REMINDER_DISMISSED_KEY)).toBe(TODAY)
  unmount()

  localStorage.removeItem(REMINDER_DISMISSED_KEY)
  const { container } = render(<UpdateReminder snapshots={OLD} today={TODAY} pending={false} />)
  fireEvent.click(container.querySelector('[data-veil]')!)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(localStorage.getItem(REMINDER_DISMISSED_KEY)).toBe(TODAY)
})

test('a storage that refuses: it still shows, and hides on touch for this visit', async () => {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('refused')
    },
    setItem: () => {
      throw new Error('refused')
    },
  })
  render(<UpdateReminder snapshots={OLD} today={TODAY} pending={false} />)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Plus tard' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
