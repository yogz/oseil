// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { AuthApiError, AuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import NewPasswordPage from '@/app/(compte)/nouveau-mot-de-passe/page'
import { memoryStorage } from '@/lib/auth/__tests__/memory-storage'
import { InvalidRecoveryKeyError } from '@/lib/vault/keys'
import { NewPasswordForm } from '../account/NewPasswordForm'
import { confirmRecoveryKey } from './confirm-recovery-key'

const mocks = vi.hoisted(() => ({
  resetWithRecoveryKey: vi.fn(),
  startOver: vi.fn(),
  confirmRecoveryKeySeen: vi.fn(),
  setKey: vi.fn(),
  clearKeys: vi.fn(),
  loadPage: vi.fn(),
  setSession: vi.fn(),
}))

vi.mock('@/lib/vault/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/vault/store')>()),
  resetWithRecoveryKey: mocks.resetWithRecoveryKey,
  startOver: mocks.startOver,
  confirmRecoveryKeySeen: mocks.confirmRecoveryKeySeen,
}))
vi.mock('@/lib/vault/device', () => ({
  indexedDbKeyStore: () => ({ get: vi.fn(), set: mocks.setKey, delete: vi.fn(), clear: mocks.clearKeys }),
}))
vi.mock('@/lib/navigation', () => ({ loadPage: mocks.loadPage }))
vi.mock('@/lib/supabase/browser', () => ({
  createBrowserSupabase: () => ({ auth: { setSession: mocks.setSession } }),
}))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}))

const CLIENT = {} as SupabaseClient
// The address comes from the session, never from a field of the form.
const USER = { id: 'someone', email: 'me@example.com' }
const KEY = {} as CryptoKey
const NEW_RECOVERY = '0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ'
const NO_KEY = "Je n’ai plus ma clé de secours"
const LOST_FOR_GOOD =
  'Sans ta clé, tes chiffres sont perdus pour de bon. Si tu les as téléchargés dans les Réglages, tu pourras les reprendre juste après. Tu peux repartir de zéro avec un coffre vide.'
const CONFIRM = 'Tape « repartir de zéro » pour confirmer'
const EXPIRED = 'Ce lien a expiré ou a déjà servi.'
const FACE_ID_MARKER = 'stefin-face-id'
const ACCOUNT_MARKER = 'oseil-compte-ici'

beforeEach(() => {
  // Node's own localStorage, which does not work without a file, hides jsdom's.
  vi.stubGlobal('localStorage', memoryStorage())
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.setKey.mockResolvedValue(undefined)
  mocks.clearKeys.mockResolvedValue(undefined)
  mocks.confirmRecoveryKeySeen.mockResolvedValue(undefined)
})
afterEach(cleanup)
afterEach(() => vi.unstubAllGlobals())

async function fillPasswords(user: ReturnType<typeof userEvent.setup>, password = 'un nouveau mot de passe') {
  await user.type(screen.getByLabelText('Nouveau mot de passe'), password)
  await user.type(screen.getByLabelText('Confirme ton mot de passe'), password)
}

describe('NewPasswordForm', () => {
  test('a wrong recovery key says so and keeps the form', async () => {
    const user = userEvent.setup()
    mocks.resetWithRecoveryKey.mockRejectedValue(new InvalidRecoveryKeyError())
    render(<NewPasswordForm client={CLIENT} user={USER} />)

    expect(screen.getByRole('heading', { name: 'Nouveau mot de passe' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Ta clé de secours'), 'zzzz zzzz')
    await fillPasswords(user)
    await user.click(screen.getByRole('button', { name: 'Retrouver mes chiffres' }))

    expect(await screen.findByText(/ne correspond pas à ton compte/)).toBeInTheDocument()
    expect(mocks.resetWithRecoveryKey).toHaveBeenCalledWith(CLIENT, {
      recoveryDisplay: 'zzzz zzzz',
      newPassword: 'un nouveau mot de passe',
      email: 'me@example.com',
    })
    // Everything typed is still there, ready to be corrected.
    expect(screen.getByLabelText('Ta clé de secours')).toHaveValue('zzzz zzzz')
    expect(screen.getByLabelText('Nouveau mot de passe')).toHaveValue('un nouveau mot de passe')
    expect(screen.getByRole('button', { name: 'Retrouver mes chiffres' })).toBeEnabled()
    expect(mocks.setKey).not.toHaveBeenCalled()
    expect(mocks.loadPage).not.toHaveBeenCalled()
  })

  test('the right key keeps the data key on this device, then goes home', async () => {
    const user = userEvent.setup()
    mocks.resetWithRecoveryKey.mockResolvedValue(KEY)
    render(<NewPasswordForm client={CLIENT} user={USER} />)

    await user.type(screen.getByLabelText('Ta clé de secours'), 'abcd')
    await fillPasswords(user)
    await user.click(screen.getByRole('button', { name: 'Retrouver mes chiffres' }))

    await vi.waitFor(() => expect(mocks.loadPage).toHaveBeenCalledWith('/'))
    expect(mocks.setKey).toHaveBeenCalledWith('someone', KEY)
    expect(mocks.setKey.mock.invocationCallOrder[0]).toBeLessThan(mocks.loadPage.mock.invocationCallOrder[0])
    // One key per device: the store is emptied before the new key goes in.
    expect(mocks.clearKeys.mock.invocationCallOrder[0]).toBeLessThan(mocks.setKey.mock.invocationCallOrder[0])
  })

  test('marks that an account was used here on success, and not on failure', async () => {
    const user = userEvent.setup()
    mocks.resetWithRecoveryKey.mockRejectedValueOnce(new InvalidRecoveryKeyError())
    render(<NewPasswordForm client={CLIENT} user={USER} />)

    await user.type(screen.getByLabelText('Ta clé de secours'), 'abcd')
    await fillPasswords(user)
    await user.click(screen.getByRole('button', { name: 'Retrouver mes chiffres' }))
    expect(await screen.findByText(/ne correspond pas à ton compte/)).toBeInTheDocument()
    expect(localStorage.getItem(ACCOUNT_MARKER)).toBeNull()

    mocks.resetWithRecoveryKey.mockResolvedValue(KEY)
    await user.click(screen.getByRole('button', { name: 'Retrouver mes chiffres' }))
    await vi.waitFor(() => expect(mocks.loadPage).toHaveBeenCalledWith('/'))
    expect(localStorage.getItem(ACCOUNT_MARKER)).toBe('1')
  })

  test('starting over marks that an account was used here, but not when it fails', async () => {
    const user = userEvent.setup()
    mocks.startOver.mockRejectedValueOnce(new Error('offline'))
    render(<NewPasswordForm client={CLIENT} user={USER} />)

    await user.click(screen.getByRole('button', { name: NO_KEY }))
    await fillPasswords(user)
    await user.type(screen.getByLabelText(CONFIRM), 'repartir de zéro')
    await user.click(screen.getByRole('button', { name: 'Repartir de zéro' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(localStorage.getItem(ACCOUNT_MARKER)).toBeNull()

    mocks.startOver.mockResolvedValue({ dataKey: KEY, recoveryDisplay: NEW_RECOVERY })
    await user.click(screen.getByRole('button', { name: 'Repartir de zéro' }))
    expect(await screen.findByText(NEW_RECOVERY)).toBeInTheDocument()
    expect(localStorage.getItem(ACCOUNT_MARKER)).toBe('1')
  })

  test('says which account the new password is for', () => {
    render(<NewPasswordForm client={CLIENT} user={USER} />)
    expect(screen.getByText('Pour le compte me@example.com')).toBeInTheDocument()
  })

  test('checks the new password before touching the vault', async () => {
    const user = userEvent.setup()
    render(<NewPasswordForm client={CLIENT} user={USER} />)

    await user.type(screen.getByLabelText('Ta clé de secours'), 'abcd')
    await user.type(screen.getByLabelText('Nouveau mot de passe'), 'un nouveau mot de passe')
    await user.type(screen.getByLabelText('Confirme ton mot de passe'), 'un autre mot de passe')
    await user.click(screen.getByRole('button', { name: 'Retrouver mes chiffres' }))

    expect(await screen.findByText('Les deux mots de passe sont différents.')).toBeInTheDocument()
    expect(mocks.resetWithRecoveryKey).not.toHaveBeenCalled()
  })

  test('a failure that is nobody’s doing is not told as a wrong key', async () => {
    const user = userEvent.setup()
    mocks.resetWithRecoveryKey.mockRejectedValue(new Error('fetch failed'))
    render(<NewPasswordForm client={CLIENT} user={USER} />)

    await user.type(screen.getByLabelText('Ta clé de secours'), 'abcd')
    await fillPasswords(user)
    await user.click(screen.getByRole('button', { name: 'Retrouver mes chiffres' }))

    expect(await screen.findByText("La récupération n’a pas abouti. Réessaie dans un instant.")).toBeInTheDocument()
    expect(screen.queryByText(/ne correspond pas à ton compte/)).not.toBeInTheDocument()
  })

  test('starting over requires typing « repartir de zéro »', async () => {
    const user = userEvent.setup()
    mocks.startOver.mockResolvedValue({ dataKey: KEY, recoveryDisplay: NEW_RECOVERY })
    render(<NewPasswordForm client={CLIENT} user={USER} />)

    expect(screen.queryByText(LOST_FOR_GOOD)).not.toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: NO_KEY })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(LOST_FOR_GOOD)).toBeInTheDocument()
    // Without a key, the key's field and its button have nothing left to do.
    expect(screen.queryByLabelText('Ta clé de secours')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retrouver mes chiffres' })).not.toBeInTheDocument()

    await fillPasswords(user)
    const confirm = screen.getByLabelText(CONFIRM)
    const startOverButton = screen.getByRole('button', { name: 'Repartir de zéro' })
    expect(startOverButton).toBeDisabled()

    for (const attempt of ['repartir', 'repartir de zero', 'repartir de zéro !']) {
      await user.clear(confirm)
      await user.type(confirm, attempt)
      expect(startOverButton).toBeDisabled()
    }
    await user.click(startOverButton)
    expect(mocks.startOver).not.toHaveBeenCalled()

    // Case and the spaces around it do not count.
    await user.clear(confirm)
    await user.type(confirm, '  Repartir de ZÉRO ')
    expect(startOverButton).toBeEnabled()
    await user.click(startOverButton)

    // The new key is shown once, as at the first sign-in; the data key is on
    // the device before the person can leave this screen.
    expect(await screen.findByText(NEW_RECOVERY)).toBeInTheDocument()
    expect(mocks.startOver).toHaveBeenCalledWith(CLIENT, { newPassword: 'un nouveau mot de passe', email: 'me@example.com' })
    expect(mocks.setKey).toHaveBeenCalledWith('someone', KEY)
    expect(mocks.clearKeys.mock.invocationCallOrder[0]).toBeLessThan(mocks.setKey.mock.invocationCallOrder[0])
    expect(mocks.loadPage).not.toHaveBeenCalled()

    await confirmRecoveryKey(user, NEW_RECOVERY)
    await vi.waitFor(() => expect(mocks.loadPage).toHaveBeenCalledWith('/'))
    // Confirmed before leaving: the next sign-in must not renew this key.
    expect(mocks.confirmRecoveryKeySeen).toHaveBeenCalledWith(CLIENT, NEW_RECOVERY)
    expect(mocks.confirmRecoveryKeySeen.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.loadPage.mock.invocationCallOrder[0],
    )
  })

  test('the new key stays on screen when it cannot be confirmed', async () => {
    const user = userEvent.setup()
    mocks.startOver.mockResolvedValue({ dataKey: KEY, recoveryDisplay: NEW_RECOVERY })
    mocks.confirmRecoveryKeySeen.mockRejectedValue(new Error('offline'))
    render(<NewPasswordForm client={CLIENT} user={USER} />)

    await user.click(screen.getByRole('button', { name: NO_KEY }))
    await fillPasswords(user)
    await user.type(screen.getByLabelText(CONFIRM), 'repartir de zéro')
    await user.click(screen.getByRole('button', { name: 'Repartir de zéro' }))
    await confirmRecoveryKey(user, NEW_RECOVERY)

    expect(await screen.findByRole('alert')).toHaveTextContent("Ça n’a pas marché. Vérifie ton accès à internet et réessaie.")
    // Still on the check: the key is one touch away.
    expect(screen.getByRole('button', { name: 'Oups, revoir ma clé' })).toBeInTheDocument()
    expect(mocks.loadPage).not.toHaveBeenCalled()
  })

  // A new data key: no passkey opens it any more, so Face ID is no longer on here.
  test('starting over takes the Face ID marker off this device', async () => {
    const user = userEvent.setup()
    localStorage.setItem(FACE_ID_MARKER, '1')
    mocks.startOver.mockResolvedValue({ dataKey: KEY, recoveryDisplay: NEW_RECOVERY })
    render(<NewPasswordForm client={CLIENT} user={USER} />)

    await user.click(screen.getByRole('button', { name: NO_KEY }))
    await fillPasswords(user)
    await user.type(screen.getByLabelText(CONFIRM), 'repartir de zéro')
    await user.click(screen.getByRole('button', { name: 'Repartir de zéro' }))

    expect(await screen.findByText(NEW_RECOVERY)).toBeInTheDocument()
    expect(localStorage.getItem(FACE_ID_MARKER)).toBeNull()
  })

  // The recovery key opens the same data key: the passkeys still open the vault.
  test('a new password through the recovery key keeps Face ID on this device', async () => {
    const user = userEvent.setup()
    localStorage.setItem(FACE_ID_MARKER, '1')
    mocks.resetWithRecoveryKey.mockResolvedValue(KEY)
    render(<NewPasswordForm client={CLIENT} user={USER} />)

    await user.type(screen.getByLabelText('Ta clé de secours'), 'abcd')
    await fillPasswords(user)
    await user.click(screen.getByRole('button', { name: 'Retrouver mes chiffres' }))

    await vi.waitFor(() => expect(mocks.loadPage).toHaveBeenCalledWith('/'))
    expect(localStorage.getItem(FACE_ID_MARKER)).toBe('1')
  })

  // The vault has a new password and a new key by then: a device that fails to
  // keep the data key must not hide the only copy of the new recovery key.
  test('shows the new recovery key even when this device cannot keep the data key', async () => {
    const user = userEvent.setup()
    mocks.startOver.mockResolvedValue({ dataKey: KEY, recoveryDisplay: NEW_RECOVERY })
    mocks.setKey.mockRejectedValue(new DOMException('lost', 'UnknownError'))
    render(<NewPasswordForm client={CLIENT} user={USER} />)

    await user.click(screen.getByRole('button', { name: NO_KEY }))
    await fillPasswords(user)
    await user.type(screen.getByLabelText(CONFIRM), 'repartir de zéro')
    await user.click(screen.getByRole('button', { name: 'Repartir de zéro' }))

    expect(await screen.findByText(NEW_RECOVERY)).toBeInTheDocument()
  })
})

describe('NewPasswordPage', () => {
  const LINK =
    '/nouveau-mot-de-passe#access_token=the-access&expires_at=1&expires_in=3600&refresh_token=the-refresh&token_type=bearer&type=recovery'

  afterEach(() => window.history.replaceState(null, '', '/'))

  test('opens the recovery session of the link, and takes its tokens out of the address', async () => {
    window.history.replaceState(null, '', LINK)
    mocks.setSession.mockResolvedValue({ data: { user: USER, session: {} }, error: null })
    render(<NewPasswordPage />)

    expect(await screen.findByLabelText('Ta clé de secours')).toBeInTheDocument()
    expect(mocks.setSession).toHaveBeenCalledWith({ access_token: 'the-access', refresh_token: 'the-refresh' })
    expect(window.location.hash).toBe('')
    expect(window.location.href).not.toContain('the-access')
    expect(window.location.pathname).toBe('/nouveau-mot-de-passe')
  })

  test.each([
    ['without a link', '/nouveau-mot-de-passe', () => {}],
    [
      'with a link that has expired',
      '/nouveau-mot-de-passe#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      () => {},
    ],
    [
      'with tokens the server refuses',
      LINK,
      () =>
        mocks.setSession.mockResolvedValue({
          data: { user: null, session: null },
          error: new AuthApiError('Invalid Refresh Token: Already Used', 400, 'refresh_token_already_used'),
        }),
    ],
  ])('says the link is spent %s, and offers a new one', async (_, address, arrange) => {
    window.history.replaceState(null, '', address)
    arrange()
    render(<NewPasswordPage />)

    expect(await screen.findByText(EXPIRED)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Recevoir un nouveau lien' })).toHaveAttribute('href', '/mot-de-passe-oublie')
    expect(screen.queryByLabelText('Ta clé de secours')).not.toBeInTheDocument()
    expect(window.location.hash).toBe('')
  })

  // No answer is not a spent link: the tokens are still good, held in memory.
  test('a session that cannot be opened for now offers to try again', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', LINK)
    mocks.setSession
      .mockResolvedValueOnce({ data: { user: null, session: null }, error: new AuthRetryableFetchError('fetch failed', 0) })
      .mockResolvedValueOnce({ data: { user: USER, session: {} }, error: null })
    render(<NewPasswordPage />)

    expect(await screen.findByText("La récupération n’a pas abouti. Réessaie dans un instant.")).toBeInTheDocument()
    expect(screen.queryByText(EXPIRED)).not.toBeInTheDocument()
    expect(window.location.hash).toBe('')

    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByLabelText('Ta clé de secours')).toBeInTheDocument()
    expect(mocks.setSession).toHaveBeenLastCalledWith({ access_token: 'the-access', refresh_token: 'the-refresh' })
  })
})
