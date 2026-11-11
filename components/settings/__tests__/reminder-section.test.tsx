// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { SAVE_FAILED } from '@/lib/screens/words'
import { ReminderSection } from '../ReminderSection'

type Answer = { data: unknown; error: unknown }

// A client whose `rpc` answers by function name; anything else is not reached by the section.
function clientWith(answers: Record<string, () => Promise<Answer>>) {
  const rpc = vi.fn((name: string) => {
    const answer = answers[name]
    if (!answer) throw new Error(`unexpected rpc ${name}`)
    return answer()
  })
  return { client: { rpc } as never, rpc }
}

const ok = (data: unknown = null) => () => Promise.resolve({ data, error: null })
const refused = () => Promise.resolve({ data: null, error: { message: 'no' } })

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const toggle = () => screen.getByRole('switch', { name: 'Me le rappeler par e-mail' })

test('shows the setting on when the base says it is on, with its line of explanation', async () => {
  const { client, rpc } = clientWith({ my_reminder_email: ok(true) })
  render(<ReminderSection client={client} />)
  await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'true'))
  expect(rpc).toHaveBeenCalledWith('my_reminder_email')
  expect(screen.getByText('Quand tes chiffres n’ont pas été mis à jour depuis six mois.')).toBeInTheDocument()
})

test('shows it off when the base says it is off', async () => {
  const { client } = clientWith({ my_reminder_email: ok(false) })
  render(<ReminderSection client={client} />)
  await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'false'))
})

test('while reading, no switch: no state that could be wrong', () => {
  const { client } = clientWith({ my_reminder_email: () => new Promise<Answer>(() => {}) })
  render(<ReminderSection client={client} />)
  expect(screen.queryByRole('switch')).toBeNull()
  expect(screen.getByText('Me le rappeler par e-mail')).toBeInTheDocument()
})

test('a failed read says so, and shows no state', async () => {
  const { client } = clientWith({ my_reminder_email: refused })
  render(<ReminderSection client={client} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Ce réglage n’a pas pu être lu.')
  expect(screen.queryByRole('switch')).toBeNull()
})

test('a read that answers something else than true or false is not shown as a state', async () => {
  const { client } = clientWith({ my_reminder_email: ok(null) })
  render(<ReminderSection client={client} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Ce réglage n’a pas pu être lu.')
  expect(screen.queryByRole('switch')).toBeNull()
})

test('touching it calls set_my_reminder_email(false), and it stays off', async () => {
  const { client, rpc } = clientWith({ my_reminder_email: ok(true), set_my_reminder_email: ok() })
  render(<ReminderSection client={client} />)
  await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'true'))
  await userEvent.click(toggle())
  expect(rpc).toHaveBeenCalledWith('set_my_reminder_email', { enabled: false })
  await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'false'))
  expect(toggle()).toBeEnabled()
  expect(screen.queryByRole('alert')).toBeNull()
})

test('touching it again switches it back on', async () => {
  const { client, rpc } = clientWith({ my_reminder_email: ok(false), set_my_reminder_email: ok() })
  render(<ReminderSection client={client} />)
  await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'false'))
  await userEvent.click(toggle())
  expect(rpc).toHaveBeenCalledWith('set_my_reminder_email', { enabled: true })
  await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'true'))
})

test('a failed save puts the switch back and says so', async () => {
  const { client } = clientWith({ my_reminder_email: ok(true), set_my_reminder_email: refused })
  render(<ReminderSection client={client} />)
  await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'true'))
  await userEvent.click(toggle())
  // Testing Library folds the non-breaking space of the sentence into a plain one.
  expect(await screen.findByRole('alert')).toHaveTextContent(SAVE_FAILED.replace('\u00A0', ' '))
  expect(toggle()).toHaveAttribute('aria-checked', 'true')
})

test('a save that throws (no network) also puts the switch back', async () => {
  const { client } = clientWith({
    my_reminder_email: ok(true),
    set_my_reminder_email: () => Promise.reject(new TypeError('Failed to fetch')),
  })
  render(<ReminderSection client={client} />)
  await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'true'))
  await userEvent.click(toggle())
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(toggle()).toHaveAttribute('aria-checked', 'true')
})
