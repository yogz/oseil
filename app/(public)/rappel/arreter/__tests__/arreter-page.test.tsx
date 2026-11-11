// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import StopReminderPage, { metadata } from '../page'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props} />,
}))
vi.mock('@/lib/supabase/browser', () => ({
  createBrowserSupabase: () => ({ rpc: mocks.rpc }),
}))

const TOKEN = '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b'

async function open(search: Record<string, string | string[] | undefined>) {
  render(await StopReminderPage({ searchParams: Promise.resolve(search) }))
}

const button = () => screen.getByRole('button', { name: 'Ne plus recevoir ce rappel' })

beforeEach(() => {
  mocks.rpc.mockReset()
  mocks.rpc.mockResolvedValue({ data: null, error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// Mail filters open links ahead of the person: opening the page alone must switch nothing off.
test('opening the page calls nothing, and asks for a touch', async () => {
  await open({ jeton: TOKEN })
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  expect(button()).toBeEnabled()
  expect(mocks.rpc).not.toHaveBeenCalled()
  expect(screen.queryByText(/C’est noté/)).toBeNull()
  expect(metadata.title).toEqual({ absolute: 'Oseil, le rappel par e-mail' })
  expect(metadata.robots).toEqual({ index: false, follow: false })
})

test('the touch calls stop_reminder with the token of the link, then confirms', async () => {
  await open({ jeton: TOKEN })
  await userEvent.click(button())
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
  expect(mocks.rpc).toHaveBeenCalledWith('stop_reminder', { token: TOKEN })
  expect(await screen.findByRole('status')).toHaveTextContent('C’est noté, plus de rappel par e-mail.')
  expect(screen.getByText('Tu peux le remettre quand tu veux, dans les Réglages.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Ne plus recevoir ce rappel' })).toBeNull()
})

test('a token in capitals is still a token', async () => {
  await open({ jeton: TOKEN.toUpperCase() })
  await userEvent.click(button())
  expect(mocks.rpc).toHaveBeenCalledWith('stop_reminder', { token: TOKEN.toUpperCase() })
})

// The page never tells whether an account exists: without a usable token, the same confirmation,
// and nothing sent.
test.each([
  ['no token', {}],
  ['an empty token', { jeton: '' }],
  ['a token that is not a uuid', { jeton: 'abc' }],
  ['a uuid with something after it', { jeton: `${TOKEN}x` }],
  ['two tokens', { jeton: [TOKEN, TOKEN] }],
])('%s: the same confirmation after the touch, without calling the base', async (_, search) => {
  await open(search)
  expect(button()).toBeEnabled()
  await userEvent.click(button())
  expect(await screen.findByRole('status')).toHaveTextContent('C’est noté, plus de rappel par e-mail.')
  expect(mocks.rpc).not.toHaveBeenCalled()
})

test('a refused call says so plainly, and the button stays to try again', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'down' } })
  await open({ jeton: TOKEN })
  await userEvent.click(button())
  expect(await screen.findByRole('alert')).toHaveTextContent('Ça n’a pas marché. Vérifie ta connexion et réessaie.')
  expect(screen.queryByText(/C’est noté/)).toBeNull()
  expect(button()).toBeEnabled()

  mocks.rpc.mockResolvedValue({ data: null, error: null })
  await userEvent.click(button())
  expect(await screen.findByRole('status')).toHaveTextContent('C’est noté, plus de rappel par e-mail.')
})

test('a call that throws (no network) says so too', async () => {
  mocks.rpc.mockRejectedValue(new TypeError('Failed to fetch'))
  await open({ jeton: TOKEN })
  await userEvent.click(button())
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.queryByText(/C’est noté/)).toBeNull()
})

test('the mark of the site leads back to the address of the site', async () => {
  await open({ jeton: TOKEN })
  expect(screen.getByRole('link', { name: 'Oseil' })).toHaveAttribute('href', '/')
})

// On a computer, the two columns of Mon argent, as on the privacy page: the title on the left, the button on the right.
test('the two columns of Mon argent: the title in the aside, the button in the reading column', async () => {
  const { container } = render(await StopReminderPage({ searchParams: Promise.resolve({ jeton: TOKEN }) }))
  const columns = container.querySelector('[data-columns]')
  expect(columns).not.toBeNull()
  const [aside, reading] = Array.from(columns!.children)
  expect(aside).toContainElement(screen.getByRole('heading', { level: 1, name: 'Le rappel par e-mail' }))
  expect(reading).toContainElement(button())
  expect(container.querySelector('main')).toHaveClass('lg:max-w-5xl')
})
