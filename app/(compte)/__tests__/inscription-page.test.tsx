// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://oseil.fr/inscription"}
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import SignUpPage from '@/app/(compte)/inscription/page'
import { memoryStorage } from '@/lib/auth/__tests__/memory-storage'

const mocks = vi.hoisted(() => ({ signUp: vi.fn(), resendConfirmation: vi.fn() }))

vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}))
vi.mock('@/lib/supabase/browser', () => ({ createBrowserSupabase: () => ({}) }))
vi.mock('@/lib/auth/account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/account')>()),
  signUp: mocks.signUp,
  resendConfirmation: mocks.resendConfirmation,
}))

const ACCOUNT_MARKER = 'oseil-compte-ici'

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  mocks.signUp.mockReset()
  mocks.resendConfirmation.mockReset()
})
afterEach(cleanup)
afterEach(() => vi.unstubAllGlobals())

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  { password = 'un mot de passe long', confirmation = 'un mot de passe long' } = {},
) {
  await user.type(screen.getByLabelText('Ton adresse e-mail'), 'me@example.com')
  await user.type(screen.getByLabelText('Choisis un mot de passe'), password)
  await user.type(screen.getByLabelText('Confirme ton mot de passe'), confirmation)
  await user.click(screen.getByRole('button', { name: 'Créer mon compte' }))
}

describe('the sign-up page and the « an account was used here » marker', () => {
  test('sets the marker once the account is created', async () => {
    const user = userEvent.setup()
    mocks.signUp.mockResolvedValue(undefined)
    render(<SignUpPage />)

    await fillAndSubmit(user)

    expect(await screen.findByRole('heading', { name: 'Plus qu’une étape' })).toBeInTheDocument()
    expect(localStorage.getItem(ACCOUNT_MARKER)).toBe('1')
  })

  test('does not set it when the sign-up fails', async () => {
    const user = userEvent.setup()
    mocks.signUp.mockRejectedValue(new Error('offline'))
    render(<SignUpPage />)

    await fillAndSubmit(user)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(localStorage.getItem(ACCOUNT_MARKER)).toBeNull()
  })

  test('does not set it when the form is refused before any request', async () => {
    const user = userEvent.setup()
    render(<SignUpPage />)

    await fillAndSubmit(user, { confirmation: 'un autre mot de passe' })

    expect(mocks.signUp).not.toHaveBeenCalled()
    expect(localStorage.getItem(ACCOUNT_MARKER)).toBeNull()
  })
})

// Planche 1 of the account screens (Nicolas, 10 November 2026): the contract is said before the
// commitment, the recovery key announced, and the words are those of the landing page.
describe('before the account is created', () => {
  test('says the password never leaves the device, and announces the recovery key', () => {
    render(<SignUpPage />)
    const intro = screen.getByText(/Ton mot de passe ne quitte jamais ton appareil/)
    expect(intro).toHaveTextContent('pas même nous')
    expect(intro).toHaveTextContent('À ta première connexion, on te remettra une clé de secours, pour tout retrouver si tu l’oublies.')
    // Before the form, not under it.
    expect(intro.compareDocumentPosition(screen.getByLabelText('Ton adresse e-mail'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  test('lets each password be shown, and hidden again', async () => {
    const user = userEvent.setup()
    render(<SignUpPage />)
    const password = screen.getByLabelText('Choisis un mot de passe')
    expect(password).toHaveAttribute('type', 'password')
    const [show] = screen.getAllByRole('button', { name: 'Afficher' })
    await user.click(show)
    expect(password).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: 'Masquer' }))
    expect(password).toHaveAttribute('type', 'password')
    expect(screen.getAllByRole('button', { name: 'Afficher' })).toHaveLength(2)
  })

  test('« J’ai déjà un compte » leads to the sign-in, as on the landing page', () => {
    render(<SignUpPage />)
    expect(screen.getByRole('link', { name: 'J’ai déjà un compte' })).toHaveAttribute('href', '/connexion')
  })

  test('under the form, a line leads to how Oseil treats the data', () => {
    render(<SignUpPage />)
    const link = screen.getByRole('link', { name: 'la façon dont Oseil traite tes données' })
    expect(link).toHaveAttribute('href', '/confidentialite')
    expect(link.closest('p')).toHaveTextContent('En créant ton compte, tu acceptes la façon dont Oseil traite tes données.')
  })
})

// Planche 2: both mistakes at once, the error in place of the hint, never the rule written twice.
test('says both mistakes at once, each in place of its hint', async () => {
  const user = userEvent.setup()
  render(<SignUpPage />)

  await fillAndSubmit(user, { password: 'court', confirmation: 'autre' })

  const password = screen.getByLabelText('Choisis un mot de passe')
  const confirmation = screen.getByLabelText('Confirme ton mot de passe')
  expect(password).toHaveAccessibleDescription('Trop court : encore 5 caractères.')
  expect(confirmation).toHaveAccessibleDescription('Les deux mots de passe sont différents.')
  expect(screen.queryByText('Au moins 10 caractères.')).toBeNull()
  expect(mocks.signUp).not.toHaveBeenCalled()
})

test('while the account is being created, the button says so', async () => {
  const user = userEvent.setup()
  mocks.signUp.mockReturnValue(new Promise(() => {}))
  render(<SignUpPage />)

  await fillAndSubmit(user)

  expect(screen.getByRole('button', { name: 'Création de ton coffre…' })).toHaveAttribute('aria-busy', 'true')
  expect(await screen.findByRole('status', {}, { timeout: 1000 })).toHaveTextContent(/^Création de ton coffre…$/)
  expect(screen.getByLabelText('Ton adresse e-mail')).not.toBeVisible()
})

// Planche 3: the address recalled, what comes next, a resend and two ways out.
describe('once the link is sent', () => {
  async function sent(user: ReturnType<typeof userEvent.setup>) {
    mocks.signUp.mockResolvedValue(undefined)
    render(<SignUpPage />)
    await fillAndSubmit(user)
    return screen.findByRole('heading', { name: 'Plus qu’une étape' })
  }

  test('recalls the address and says what comes next', async () => {
    const user = userEvent.setup()
    const title = await sent(user)
    expect(title).toHaveFocus()
    const text = screen.getByText(/On vient d’écrire à/)
    expect(text).toHaveTextContent('me@example.com')
    expect(text).toHaveTextContent('on te remettra ta clé de secours')
    expect(screen.getByText(/Regarde dans les indésirables/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'J’ai confirmé, me connecter' })).toHaveAttribute('href', '/connexion')
  })

  test('sends the link again to the same address', async () => {
    const user = userEvent.setup()
    await sent(user)
    mocks.resendConfirmation.mockResolvedValue(undefined)

    await user.click(screen.getByRole('button', { name: 'Renvoyer l’e-mail' }))

    expect(mocks.resendConfirmation).toHaveBeenCalledWith(expect.anything(), {
      email: 'me@example.com',
      redirectTo: 'https://oseil.fr/connexion',
    })
    expect(await screen.findByRole('status')).toHaveTextContent('C’est reparti')
  })

  test('says so when the link could not leave again', async () => {
    const user = userEvent.setup()
    await sent(user)
    mocks.resendConfirmation.mockRejectedValue(new Error('rate limited'))

    await user.click(screen.getByRole('button', { name: 'Renvoyer l’e-mail' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('L’e-mail n’a pas pu repartir. Réessaie dans une minute.')
  })

  test('« Corriger mon adresse » brings the form back, the address kept', async () => {
    const user = userEvent.setup()
    await sent(user)

    await user.click(screen.getByRole('button', { name: 'Corriger mon adresse' }))

    expect(screen.getByLabelText('Ton adresse e-mail')).toHaveValue('me@example.com')
    expect(screen.getByLabelText('Choisis un mot de passe')).toHaveValue('')
  })
})
