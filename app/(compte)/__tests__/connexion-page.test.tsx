// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://oseil.fr/connexion"}
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import SignInPage from '@/app/(compte)/connexion/page'
import {
  modelMark,
  rememberModel,
  rememberVault,
  rememberedModel,
  rememberedVault,
  vaultMark,
} from '@/lib/app/session-memory'
import type { Model } from '@/lib/app/use-model'
import { memoryStorage } from '@/lib/auth/__tests__/memory-storage'
import {
  FaceIdCancelledError,
  FaceIdNoLongerOpensError,
  FaceIdUnavailableError,
  type Prepared,
  type PreparedSignIn,
} from '@/lib/auth/face-id'
import { accountHere } from '@/lib/auth/account-here'
import { IDLE_CLOSED_SENTENCE, idleClock } from '@/lib/app/idle-lock'
import { faceIdMarker } from '@/lib/auth/face-id-marker'
import { rememberedEmail } from '@/lib/auth/remembered-email'
import { FACE_ID_NO_PRF, faceIdActivationFailed } from '@/lib/auth/messages'
import { clearPendingRecovery, readPendingRecovery } from '@/lib/auth/pending-recovery'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  clearKeys: vi.fn(),
  replace: vi.fn(),
  signIn: vi.fn(),
  resendConfirmation: vi.fn(),
  supported: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  prepareFaceIdSignIn: vi.fn(),
  signInWithFaceId: vi.fn(),
  prepareFaceId: vi.fn(),
  activateFaceId: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}))
vi.mock('@/lib/supabase/browser', () => ({
  createBrowserSupabase: () => ({ auth: { getSession: mocks.getSession } }),
}))
vi.mock('@/lib/auth/account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/account')>()),
  signIn: mocks.signIn,
  resendConfirmation: mocks.resendConfirmation,
}))
vi.mock('@/lib/vault/device', () => ({
  indexedDbKeyStore: () => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn(), clear: mocks.clearKeys }),
}))
// The browser's WebAuthn, as the adapter hands it over.
vi.mock('@/lib/auth/webauthn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/webauthn')>()),
  browserWebAuthn: { supported: mocks.supported, create: mocks.create, get: mocks.get },
}))
// The real errors, the four functions faked.
vi.mock('@/lib/auth/face-id', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/face-id')>()),
  prepareFaceIdSignIn: mocks.prepareFaceIdSignIn,
  signInWithFaceId: mocks.signInWithFaceId,
  prepareFaceId: mocks.prepareFaceId,
  activateFaceId: mocks.activateFaceId,
}))

const realFaceId = await vi.importActual<typeof import('@/lib/auth/face-id')>('@/lib/auth/face-id')

const KEY = { type: 'secret' } as CryptoKey
const USER_ID = 'someone'

// The site, whose address the passkeys belong to: the page is opened there
// (see the environment options above), unless a test opens it elsewhere.
const SITE = 'https://oseil.fr/connexion'
function openedAt(url: string) {
  ;(globalThis as unknown as { jsdom: { reconfigure(settings: { url: string }): void } }).jsdom.reconfigure({ url })
}

// When a challenge was prepared, on both of the device's clocks, as the screens read them.
const now = () => ({ monotonic: performance.now(), wall: Date.now() })
const fourMinutesAgo = () => ({ ...now(), monotonic: performance.now() - 4 * 60_000 })
// An iPhone locked for 5 minutes: its monotonic clock did not move, its wall clock did.
const asleepFiveMinutes = () => ({ ...now(), wall: Date.now() - 5 * 60_000 })
// The device's own clock, a day ahead of the server's, from the start.
const clockADayAhead = () => {
  const realNow = Date.now.bind(Date)
  vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 24 * 60 * 60_000)
}

// Each one distinct, so a test can tell which was used.
let made = 0
function preparedSignIn(preparedAt = now()): PreparedSignIn {
  made += 1
  return {
    challengeId: `sign-in-${made}`,
    preparedAt,
    options: { challenge: new Uint8Array([made]), rpId: 'oseil.fr' },
  }
}
function preparedActivation(preparedAt = now()): Prepared {
  made += 1
  return {
    challengeId: `activation-${made}`,
    preparedAt,
    options: {
      challenge: new Uint8Array([made]),
      rp: { id: 'oseil.fr', name: 'PatriCube' },
      user: { id: new Uint8Array([1]), name: 'a@b.fr', displayName: 'a@b.fr' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    },
  }
}

function unlocked(recoveryConfirmed = true) {
  return { status: 'unlocked', faceId: { keyEncryptionKey: KEY, userId: USER_ID, recoveryConfirmed } }
}

const never = () => new Promise<never>(() => {})
const cancelled = () => new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError')

beforeEach(() => {
  // Node's own localStorage, which does not work without a file, hides jsdom's.
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('sessionStorage', memoryStorage())
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.clearKeys.mockResolvedValue(undefined)
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
  // A device that cannot create a passkey, unless a test says otherwise.
  mocks.supported.mockResolvedValue(false)
})
afterEach(() => {
  cleanup()
  openedAt(SITE)
  clearPendingRecovery()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SignInPage', () => {
  test('without a session, forgets the keys left on the device', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
    render(<SignInPage />)

    await vi.waitFor(() => expect(mocks.clearKeys).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('heading', { name: 'Te connecter' })).toBeInTheDocument()
  })

  // Sent here without a full page load, then « Retour »: whoever is at the
  // keyboard must not get the previous person's screens back.
  test('without a session, forgets what the tab kept between screens', async () => {
    const model = {
      profile: null,
      snapshots: [],
      goals: [],
      settings: null,
      draft: null,
      unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
    } satisfies Model
    rememberVault({ userId: USER_ID, dataKey: KEY }, vaultMark())
    rememberModel({ userId: USER_ID, model, client: {} as never }, modelMark())
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
    render(<SignInPage />)

    await vi.waitFor(() => expect(rememberedVault()).toBeNull())
    expect(rememberedModel(USER_ID)).toBeNull()
  })

  test('with a session, leaves the keys alone', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'someone' } } }, error: null })
    render(<SignInPage />)

    await vi.waitFor(() => expect(mocks.getSession).toHaveBeenCalled())
    await Promise.resolve()
    expect(mocks.clearKeys).not.toHaveBeenCalled()
  })

  test('ignores a device that cannot forget its keys', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
    mocks.clearKeys.mockRejectedValue(new DOMException('lost', 'UnknownError'))
    render(<SignInPage />)

    await vi.waitFor(() => expect(mocks.clearKeys).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Me connecter' })).toBeEnabled()
  })

  describe('after signing in', () => {
    const DISPLAY = '0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ'

    async function submit() {
      mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
      const user = userEvent.setup()
      render(<SignInPage />)
      await user.type(screen.getByLabelText('Ton adresse e-mail'), 'a@b.fr')
      await user.type(screen.getByLabelText('Ton mot de passe'), 'correct horse battery')
      await user.click(screen.getByRole('button', { name: 'Me connecter' }))
      await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalled())
    }

    test('a renewed recovery key is handed to the key screen as renewed', async () => {
      mocks.signIn.mockResolvedValue({ status: 'renewed-recovery', recoveryDisplay: DISPLAY })
      await submit()
      expect(readPendingRecovery()).toEqual({ display: DISPLAY, renewed: true })
      expect(mocks.replace).toHaveBeenCalledWith('/cle-de-secours')
    })

    test('a new vault’s key is handed over as not renewed', async () => {
      mocks.signIn.mockResolvedValue({ status: 'new-vault', recoveryDisplay: DISPLAY })
      await submit()
      expect(readPendingRecovery()).toEqual({ display: DISPLAY, renewed: false })
      expect(mocks.replace).toHaveBeenCalledWith('/cle-de-secours')
    })

    test('an unlocked vault goes home with no key held', async () => {
      mocks.signIn.mockResolvedValue(unlocked())
      await submit()
      expect(readPendingRecovery()).toBeNull()
      expect(mocks.replace).toHaveBeenCalledWith('/')
    })

    test.each([
      ['an unlocked vault', () => unlocked()],
      ['a new vault', () => ({ status: 'new-vault', recoveryDisplay: DISPLAY })],
      ['a renewed recovery key', () => ({ status: 'renewed-recovery', recoveryDisplay: DISPLAY })],
    ])('marks this device as having served an account after %s', async (_name, result) => {
      mocks.signIn.mockResolvedValue(result())
      expect(accountHere.isSet()).toBe(false)
      await submit()
      expect(accountHere.isSet()).toBe(true)
    })

    // lib/app/idle-lock.ts: an entry starts the clock again, and the sentence of the last closing goes.
    test('a successful sign-in starts the clock of the vault again', async () => {
      mocks.signIn.mockResolvedValue(unlocked())
      localStorage.setItem('oseil-derniere-activite', '1')
      idleClock.markClosed()
      const before = Date.now()
      await submit()
      expect(idleClock.last()).toBeGreaterThanOrEqual(before)
      expect(idleClock.wasClosed()).toBe(false)
    })

    test('a refused password leaves the device unmarked', async () => {
      mocks.signIn.mockRejectedValue(new Error('refused'))
      const user = userEvent.setup()
      render(<SignInPage />)
      await user.type(screen.getByLabelText('Ton adresse e-mail'), 'a@b.fr')
      await user.type(screen.getByLabelText('Ton mot de passe'), 'wrong')
      await user.click(screen.getByRole('button', { name: 'Me connecter' }))
      await screen.findByRole('alert')
      expect(accountHere.isSet()).toBe(false)
    })
  })
})

describe('Utiliser Face ID', () => {
  const BUTTON = /^Utiliser /

  // A device that can, with a sign-in prepared and waiting.
  async function ready(prepared = preparedSignIn()) {
    mocks.supported.mockResolvedValue(true)
    mocks.prepareFaceIdSignIn.mockResolvedValue(prepared)
    render(<SignInPage />)
    const button = await screen.findByRole('button', { name: BUTTON })
    await vi.waitFor(() => expect(button).toBeEnabled())
    return button
  }

  test('is not offered on a device that cannot, and nothing is asked of Supabase', async () => {
    render(<SignInPage />)
    await vi.waitFor(() => expect(mocks.supported).toHaveBeenCalled())
    await Promise.resolve()

    expect(screen.queryByRole('button', { name: BUTTON })).not.toBeInTheDocument()
    expect(mocks.prepareFaceIdSignIn).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Me connecter' })).toBeInTheDocument()
  })

  test('is offered under the form on a device that can, prepared as the page opens', async () => {
    const button = await ready()

    expect(button).toHaveTextContent('Utiliser ton empreinte')
    expect(mocks.prepareFaceIdSignIn).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('button', { name: 'Me connecter' }).compareDocumentPosition(button) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  test('is a button styled as a link, between « Mot de passe oublié ? » and « Créer mon compte »', async () => {
    const button = await ready()
    const forgot = screen.getByRole('link', { name: /Mot de passe oublié/ })
    const create = screen.getByRole('link', { name: 'Créer mon compte' })

    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveClass('underline')
    expect(forgot.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(button.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('says Face ID on an iPhone', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    )
    const button = await ready()
    expect(button).toHaveTextContent('Utiliser Face ID')
  })

  test('waits, disabled, while the sign-in is being prepared', async () => {
    mocks.supported.mockResolvedValue(true)
    mocks.prepareFaceIdSignIn.mockReturnValue(never())
    render(<SignInPage />)
    const button = await screen.findByRole('button', { name: BUTTON })

    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(mocks.signInWithFaceId).not.toHaveBeenCalled()
  })

  test('gives way to the password when the sign-in cannot be prepared', async () => {
    mocks.supported.mockResolvedValue(true)
    mocks.prepareFaceIdSignIn.mockRejectedValue(new Error('passkeys are not enabled'))
    render(<SignInPage />)

    await vi.waitFor(() => expect(mocks.prepareFaceIdSignIn).toHaveBeenCalled())
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: BUTTON })).not.toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // Safari can refuse a WebAuthn request that does not follow the tap at once:
  // nothing may be awaited between the tap and the call.
  test('a tap calls signInWithFaceId within the tap itself, with the prepared sign-in', async () => {
    const prepared = preparedSignIn()
    const button = await ready(prepared)
    mocks.signInWithFaceId.mockReturnValue(never())

    fireEvent.click(button)

    expect(mocks.signInWithFaceId).toHaveBeenCalledTimes(1)
    const [, , webauthn, given] = mocks.signInWithFaceId.mock.calls[0]
    expect(webauthn.get).toBe(mocks.get)
    expect(given).toBe(prepared)
  })

  test('the tap reaches the browser’s passkey prompt within the tap itself', async () => {
    const prepared = preparedSignIn()
    const button = await ready(prepared)
    mocks.signInWithFaceId.mockImplementation(realFaceId.signInWithFaceId)
    mocks.get.mockReturnValue(never())

    fireEvent.click(button)

    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(mocks.get).toHaveBeenCalledWith(prepared.options)
  })

  test('goes home once signed in', async () => {
    const button = await ready()
    mocks.signInWithFaceId.mockResolvedValue(undefined)

    fireEvent.click(button)

    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'))
    expect(accountHere.isSet()).toBe(true)
  })

  // In the device's word: the default user agent here is neither an Apple
  // phone nor a Mac.
  test.each([
    [
      'its packet no longer opens',
      new FaceIdNoLongerOpensError(),
      'Ton empreinte n’ouvre plus ton coffre sur cet appareil. Connecte-toi avec ton mot de passe.',
    ],
    [
      'the passkey gave no secret',
      new FaceIdUnavailableError(),
      'Cette clé est rangée dans un gestionnaire qui ne sait pas ouvrir le coffre. Choisis celle de l’app Mots de passe d’Apple, ou connecte-toi avec ton mot de passe.',
    ],
  ])('says so when %s, and stays', async (_, failure, message) => {
    const button = await ready()
    mocks.signInWithFaceId.mockRejectedValue(failure)

    fireEvent.click(button)

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(mocks.replace).not.toHaveBeenCalled()
    // The next round prepares a fresh sign-in: the message outlives it.
    await vi.waitFor(() => expect(mocks.prepareFaceIdSignIn).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(button).toBeEnabled())
    expect(screen.getByRole('alert')).toHaveTextContent(message)
  })

  test('says so in the word of an iPhone there', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    )
    const button = await ready()
    mocks.signInWithFaceId.mockRejectedValue(new FaceIdNoLongerOpensError())

    fireEvent.click(button)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Face ID n’ouvre plus ton coffre sur cet appareil. Connecte-toi avec ton mot de passe.',
    )
  })

  test('says nothing when the person closes the prompt', async () => {
    const button = await ready()
    mocks.signInWithFaceId.mockRejectedValue(new FaceIdCancelledError())

    fireEvent.click(button)

    await vi.waitFor(() => expect(mocks.prepareFaceIdSignIn).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  // A prepared sign-in serves once: whatever the outcome, the next tap has a new one.
  test.each([
    ['a success', () => mocks.signInWithFaceId.mockResolvedValueOnce(undefined)],
    ['a failure', () => mocks.signInWithFaceId.mockRejectedValueOnce(new FaceIdNoLongerOpensError())],
    ['a cancelled prompt', () => mocks.signInWithFaceId.mockRejectedValueOnce(new FaceIdCancelledError())],
  ])('prepares a fresh sign-in after %s', async (_, outcome) => {
    const first = preparedSignIn()
    const second = preparedSignIn()
    const button = await ready(first)
    mocks.prepareFaceIdSignIn.mockResolvedValue(second)
    outcome()

    fireEvent.click(button)
    await vi.waitFor(() => expect(mocks.prepareFaceIdSignIn).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(button).toBeEnabled())
    mocks.signInWithFaceId.mockReturnValue(never())
    fireEvent.click(button)

    expect(mocks.signInWithFaceId).toHaveBeenCalledTimes(2)
    expect(mocks.signInWithFaceId.mock.calls[1][3]).toBe(second)
  })

  // Asking Supabase again before the prompt would break the tap's link to it:
  // a fresh sign-in is prepared instead, for one more tap.
  test('a sign-in prepared 4 minutes ago is not used at the tap: a fresh one waits for one more tap', async () => {
    const fresh = preparedSignIn()
    const button = await ready(preparedSignIn(fourMinutesAgo()))
    mocks.prepareFaceIdSignIn.mockResolvedValue(fresh)

    fireEvent.click(button)

    expect(mocks.signInWithFaceId).not.toHaveBeenCalled()
    expect(mocks.get).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(mocks.prepareFaceIdSignIn).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(button).toBeEnabled())

    mocks.signInWithFaceId.mockReturnValue(never())
    fireEvent.click(button)
    expect(mocks.signInWithFaceId).toHaveBeenCalledTimes(1)
    expect(mocks.signInWithFaceId.mock.calls[0][3]).toBe(fresh)
  })

  test('a device clock far ahead does not make the tap expired', async () => {
    clockADayAhead()
    const prepared = preparedSignIn()
    const button = await ready(prepared)
    mocks.signInWithFaceId.mockReturnValue(never())

    fireEvent.click(button)

    expect(mocks.signInWithFaceId).toHaveBeenCalledTimes(1)
    expect(mocks.signInWithFaceId.mock.calls[0][3]).toBe(prepared)
  })

  test('a device that slept 5 minutes does not use its sign-in at the tap: a fresh one waits for one more tap', async () => {
    const fresh = preparedSignIn()
    const button = await ready(preparedSignIn(asleepFiveMinutes()))
    mocks.prepareFaceIdSignIn.mockResolvedValue(fresh)

    fireEvent.click(button)

    expect(mocks.signInWithFaceId).not.toHaveBeenCalled()
    expect(mocks.get).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(mocks.prepareFaceIdSignIn).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(button).toBeEnabled())
    mocks.signInWithFaceId.mockReturnValue(never())
    fireEvent.click(button)
    expect(mocks.signInWithFaceId.mock.calls[0][3]).toBe(fresh)
  })
})

// Planche 4B (Nicolas, 12 November 2026): once Face ID has served on this device, it comes first.
describe('Face ID first, once it has served here', () => {
  const PILL = /^Me reconnecter avec /
  const IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
  const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

  async function ready(prepared = preparedSignIn()) {
    faceIdMarker.set('a-credential')
    mocks.supported.mockResolvedValue(true)
    mocks.prepareFaceIdSignIn.mockResolvedValue(prepared)
    render(<SignInPage />)
    const pill = await screen.findByRole('button', { name: PILL })
    await vi.waitFor(() => expect(pill).toBeEnabled())
    return pill
  }

  test('without the marker, the screen is as before', async () => {
    mocks.supported.mockResolvedValue(true)
    mocks.prepareFaceIdSignIn.mockResolvedValue(preparedSignIn())
    render(<SignInPage />)
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /^Utiliser / })).toBeEnabled())

    expect(screen.getByRole('heading', { name: 'Te connecter' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Me connecter' })).toHaveClass('bg-ink')
    expect(screen.getByRole('link', { name: 'Créer mon compte' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: PILL })).not.toBeInTheDocument()
    expect(screen.queryByText('Ou avec ton mot de passe')).not.toBeInTheDocument()
  })

  test('with the marker: « Te reconnecter », the Face ID pill, then the password, outlined', async () => {
    idleClock.markClosed()
    const pill = await ready()

    expect(screen.getByRole('heading', { name: 'Te reconnecter' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Te connecter' })).not.toBeInTheDocument()
    expect(pill).toHaveTextContent('Me reconnecter avec ton empreinte')
    expect(pill).toHaveClass('bg-ink', 'rounded-full')
    const caption = screen.getByText('Ou avec ton mot de passe')
    expect(caption).toHaveClass('text-caption', 'text-ink-muted')
    const submit = screen.getByRole('button', { name: 'Me reconnecter' })
    expect(submit).toHaveAttribute('type', 'submit')
    expect(submit).toHaveClass('border', 'rounded-full')
    expect(submit).not.toHaveClass('bg-ink')
    // The old link went: the pill replaced it. And the person has an account here.
    expect(screen.queryByRole('button', { name: /^Utiliser / })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Créer mon compte' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Me connecter' })).not.toBeInTheDocument()

    // In the order of planche 4B: the notice, the pill, the caption, the form, « Mot de passe oublié ? ».
    const notice = screen.getAllByRole('status').find((element) => element.textContent === IDLE_CLOSED_SENTENCE)!
    const field = screen.getByLabelText('Ton adresse e-mail')
    const forgot = screen.getByRole('link', { name: /Mot de passe oublié/ })
    expect(follows(notice, pill)).toBe(true)
    expect(follows(pill, caption)).toBe(true)
    expect(follows(caption, field)).toBe(true)
    expect(follows(field, submit)).toBe(true)
    expect(follows(submit, forgot)).toBe(true)
  })

  // No jump: the layout is chosen from the marker as the page opens, the pill waiting for the device.
  test('from the first render, « Te reconnecter » and the pill, disabled, before the device answers', () => {
    faceIdMarker.set('a-credential')
    mocks.supported.mockReturnValue(never())
    render(<SignInPage />)

    expect(screen.getByRole('heading', { name: 'Te reconnecter' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: PILL })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Me reconnecter' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Créer mon compte' })).not.toBeInTheDocument()
    expect(mocks.prepareFaceIdSignIn).not.toHaveBeenCalled()
  })

  test('the pill keeps waiting, disabled, while the sign-in is prepared', async () => {
    faceIdMarker.set('a-credential')
    mocks.supported.mockResolvedValue(true)
    mocks.prepareFaceIdSignIn.mockReturnValue(never())
    render(<SignInPage />)
    await vi.waitFor(() => expect(mocks.prepareFaceIdSignIn).toHaveBeenCalled())

    expect(screen.getByRole('heading', { name: 'Te reconnecter' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: PILL })).toBeDisabled()
  })

  // After an attempt, a preparation that fails does not move the message into the links.
  test('after a refusal, a preparation that fails keeps the screen, the message under the pill', async () => {
    const pill = await ready()
    mocks.prepareFaceIdSignIn.mockRejectedValue(new Error('network'))
    mocks.signInWithFaceId.mockRejectedValue(new FaceIdUnavailableError())

    fireEvent.click(pill)

    expect(await screen.findByRole('alert')).toHaveTextContent('Cette clé est rangée dans un gestionnaire')
    await vi.waitFor(() => expect(mocks.prepareFaceIdSignIn).toHaveBeenCalledTimes(2))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByRole('heading', { name: 'Te reconnecter' })).toBeInTheDocument()
    expect(pill).toBeDisabled()
    expect(follows(pill, screen.getByRole('alert'))).toBe(true)
    expect(follows(screen.getByRole('alert'), screen.getByText('Ou avec ton mot de passe'))).toBe(true)
  })

  test('says Face ID on an iPhone', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(IPHONE)
    const pill = await ready()
    expect(pill).toHaveTextContent('Me reconnecter avec Face ID')
  })

  test('the address of the last sign-in is filled in', async () => {
    rememberedEmail.set('me@example.com')
    await ready()
    expect(screen.getByLabelText('Ton adresse e-mail')).toHaveValue('me@example.com')
  })

  test('the pill waits, disabled, while the sign-in is being prepared', async () => {
    faceIdMarker.set('a-credential')
    mocks.supported.mockResolvedValue(true)
    mocks.prepareFaceIdSignIn.mockReturnValue(never())
    render(<SignInPage />)
    const pill = await screen.findByRole('button', { name: PILL })

    expect(pill).toBeDisabled()
    fireEvent.click(pill)
    expect(mocks.signInWithFaceId).not.toHaveBeenCalled()
  })

  // Safari: nothing awaited between the tap and the passkey.
  test('a tap reaches the browser’s passkey prompt within the tap itself', async () => {
    const prepared = preparedSignIn()
    const pill = await ready(prepared)
    mocks.signInWithFaceId.mockImplementation(realFaceId.signInWithFaceId)
    mocks.get.mockReturnValue(never())

    fireEvent.click(pill)

    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(mocks.get).toHaveBeenCalledWith(prepared.options)
  })

  test('goes home once signed in, the address of the session remembered', async () => {
    const pill = await ready()
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: USER_ID, email: 'me@example.com' } } }, error: null })
    mocks.signInWithFaceId.mockResolvedValue(undefined)

    fireEvent.click(pill)

    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'))
    expect(accountHere.isSet()).toBe(true)
    expect(rememberedEmail.read()).toBe('me@example.com')
  })

  test('the outlined pill signs in with the password, as before', async () => {
    rememberedEmail.set('a@b.fr')
    mocks.signIn.mockResolvedValue(unlocked())
    await ready()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Ton mot de passe'), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Me reconnecter' }))

    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'))
    expect(mocks.signIn).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      email: 'a@b.fr',
      password: 'correct horse battery',
    })
  })

  test('a refusal of the pill is said under it, and the screen stays', async () => {
    const pill = await ready()
    mocks.signInWithFaceId.mockRejectedValue(new FaceIdUnavailableError())

    fireEvent.click(pill)

    expect(await screen.findByRole('alert')).toHaveTextContent('Cette clé est rangée dans un gestionnaire')
    expect(follows(pill, screen.getByRole('alert'))).toBe(true)
    expect(follows(screen.getByRole('alert'), screen.getByText('Ou avec ton mot de passe'))).toBe(true)
    await vi.waitFor(() => expect(mocks.prepareFaceIdSignIn).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(pill).toBeEnabled())
    expect(screen.getByRole('heading', { name: 'Te reconnecter' })).toBeInTheDocument()
  })

  // Face ID no longer opens the vault here: the marker goes, and with it the Face ID first screen.
  test('when its packet no longer opens, the plain screen comes back, with the message', async () => {
    const pill = await ready()
    mocks.signInWithFaceId.mockImplementation(async () => {
      faceIdMarker.clear()
      throw new FaceIdNoLongerOpensError()
    })

    fireEvent.click(pill)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ton empreinte n’ouvre plus ton coffre sur cet appareil. Connecte-toi avec ton mot de passe.',
    )
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: 'Te connecter' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Me connecter' })).toHaveClass('bg-ink')
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  test.each([
    ['the device cannot create a passkey', () => mocks.supported.mockResolvedValue(false)],
    [
      'the sign-in cannot be prepared',
      () => {
        mocks.supported.mockResolvedValue(true)
        mocks.prepareFaceIdSignIn.mockRejectedValue(new Error('passkeys are not enabled'))
      },
    ],
    [
      'the page is away from the site’s address',
      () => {
        openedAt('http://localhost:3000/connexion')
        mocks.supported.mockResolvedValue(true)
        mocks.prepareFaceIdSignIn.mockResolvedValue(preparedSignIn())
      },
    ],
  ])('the marker alone is not enough: the plain screen when %s', async (_, setup) => {
    faceIdMarker.set('a-credential')
    setup()
    render(<SignInPage />)

    await vi.waitFor(() => expect(mocks.supported).toHaveBeenCalled())
    await act(async () => {
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: PILL })).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Te connecter' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Me connecter' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Créer mon compte' })).toBeInTheDocument()
  })
})

describe('Ouvrir avec Face ID la prochaine fois ?', () => {
  const OFFER = /^Ouvrir avec .+ la prochaine fois\u00A0\?$/

  async function signInByPassword(result: unknown = unlocked()) {
    mocks.signIn.mockResolvedValue(result)
    const user = userEvent.setup()
    render(<SignInPage />)
    await user.type(screen.getByLabelText('Ton adresse e-mail'), 'a@b.fr')
    await user.type(screen.getByLabelText('Ton mot de passe'), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Me connecter' }))
    return user
  }

  // A device that can, the recovery key confirmed, the marker absent.
  async function offer(prepared: Prepared = preparedActivation()) {
    mocks.supported.mockResolvedValue(true)
    mocks.prepareFaceIdSignIn.mockReturnValue(never())
    mocks.prepareFaceId.mockResolvedValue(prepared)
    const user = await signInByPassword()
    const activate = await screen.findByRole('button', { name: 'Activer' })
    await vi.waitFor(() => expect(activate).toBeEnabled())
    return { user, activate }
  }

  test('replaces the form when the three conditions hold, and prepares the activation', async () => {
    await offer()

    expect(screen.getByRole('heading', { name: OFFER })).toHaveTextContent(
      'Ouvrir avec ton empreinte la prochaine fois ?',
    )
    expect(screen.getByText('Ton mot de passe reste valable, sur tous tes appareils.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pas maintenant' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Me connecter' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Ton mot de passe')).not.toBeInTheDocument()
    expect(mocks.prepareFaceId).toHaveBeenCalledTimes(1)
    expect(mocks.replace).not.toHaveBeenCalled()
    // The browser was asked once, as the page opened: the sign-in does not wait for it again.
    expect(mocks.supported).toHaveBeenCalledTimes(1)
  })

  // The form the person was in is gone: a screen reader starts again at the question.
  test('the question takes the focus as it replaces the form', async () => {
    await offer()

    expect(screen.getByRole('heading', { name: OFFER })).toHaveFocus()
  })

  // The device's answer is read as the page has it: one that has not come yet
  // offers nothing, and the sign-in goes home as today.
  test('is not shown, and the sign-in goes home, while the browser has not said whether it can', async () => {
    mocks.supported.mockReturnValue(never())
    await signInByPassword()

    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'))
    expect(screen.queryByRole('heading', { name: OFFER })).not.toBeInTheDocument()
    expect(mocks.prepareFaceId).not.toHaveBeenCalled()
  })

  // Any one condition missing: home as today, and nothing new asked of Supabase.
  test.each([
    ['the recovery key is not confirmed', () => mocks.signIn.mockResolvedValue(unlocked(false))],
    ['this device already carries the marker', () => faceIdMarker.set()],
    ['the device cannot create a passkey', () => mocks.supported.mockResolvedValue(false)],
  ])('is not shown when %s', async (_, without) => {
    mocks.supported.mockResolvedValue(true)
    mocks.prepareFaceIdSignIn.mockReturnValue(never())
    mocks.signIn.mockResolvedValue(unlocked())
    without()
    const user = userEvent.setup()
    render(<SignInPage />)
    await user.type(screen.getByLabelText('Ton adresse e-mail'), 'a@b.fr')
    await user.type(screen.getByLabelText('Ton mot de passe'), 'correct horse battery')
    // With the marker, Face ID comes first and the password's pill says « Me reconnecter ».
    await user.click(screen.getByRole('button', { name: /^Me (re)?connecter$/ }))

    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'))
    expect(screen.queryByRole('heading', { name: OFFER })).not.toBeInTheDocument()
    expect(mocks.prepareFaceId).not.toHaveBeenCalled()
  })

  test.each([
    ['a new vault', 'new-vault'],
    ['a renewed recovery key', 'renewed-recovery'],
  ])('is not shown after %s, which goes to its key as today', async (_, status) => {
    mocks.supported.mockResolvedValue(true)
    mocks.prepareFaceIdSignIn.mockReturnValue(never())
    await signInByPassword({ status, recoveryDisplay: '0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ' })

    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/cle-de-secours'))
    expect(screen.queryByRole('heading', { name: OFFER })).not.toBeInTheDocument()
    expect(mocks.prepareFaceId).not.toHaveBeenCalled()
  })

  test('gives way silently when the activation cannot be prepared', async () => {
    mocks.supported.mockResolvedValue(true)
    mocks.prepareFaceIdSignIn.mockReturnValue(never())
    mocks.prepareFaceId.mockRejectedValue(new Error('passkeys are not enabled'))
    await signInByPassword()

    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('« Pas maintenant » goes home, and nothing is activated', async () => {
    const { user } = await offer()

    await user.click(screen.getByRole('button', { name: 'Pas maintenant' }))

    expect(mocks.replace).toHaveBeenCalledWith('/')
    expect(mocks.activateFaceId).not.toHaveBeenCalled()
  })

  test('« Activer » calls activateFaceId within the tap itself, with the key from the sign-in', async () => {
    const prepared = preparedActivation()
    const { activate } = await offer(prepared)
    mocks.activateFaceId.mockReturnValue(never())

    fireEvent.click(activate)

    expect(mocks.activateFaceId).toHaveBeenCalledTimes(1)
    const [, webauthn, input] = mocks.activateFaceId.mock.calls[0]
    expect(webauthn.create).toBe(mocks.create)
    expect(input).toEqual({ prepared, keyEncryptionKey: KEY, userId: USER_ID, confirm: expect.any(Function) })
    expect(input.prepared).toBe(prepared)
  })

  test('« Activer » reaches the browser’s passkey creation within the tap itself', async () => {
    const prepared = preparedActivation()
    const { activate } = await offer(prepared)
    mocks.activateFaceId.mockImplementation(realFaceId.activateFaceId)
    mocks.create.mockReturnValue(never())

    fireEvent.click(activate)

    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.create).toHaveBeenCalledWith(prepared.options)
  })

  test('active: goes home', async () => {
    const { activate } = await offer()
    mocks.activateFaceId.mockResolvedValue({ status: 'active' })

    fireEvent.click(activate)

    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'))
  })

  test.each([
    ['the passkey cannot give a secret', () => mocks.activateFaceId.mockResolvedValue({ status: 'no-prf' }), FACE_ID_NO_PRF],
    [
      'Face ID is ready already',
      () => mocks.activateFaceId.mockResolvedValue({ status: 'already' }),
      'Ton empreinte est déjà prête sur cet appareil.',
    ],
    ['anything else fails', () => mocks.activateFaceId.mockRejectedValue(new Error('fetch failed')), faceIdActivationFailed('ton empreinte')],
  ])('says so when %s, then « Continuer » goes home', async (_, outcome, message) => {
    const { user, activate } = await offer()
    outcome()

    fireEvent.click(activate)

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Activer' })).not.toBeInTheDocument()
    // The buttons gave way to the message: the focus goes to what comes next.
    expect(screen.getByRole('button', { name: 'Continuer' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    expect(mocks.replace).toHaveBeenCalledWith('/')
  })

  // The secret comes with a second gesture when the creation did not give it:
  // the tap on « Confirmer avec … » is what lets the opening go.
  test('a second gesture: « Confirmer avec … » resolves the confirmation within its tap', async () => {
    const { activate } = await offer()
    let confirmed = false
    mocks.activateFaceId.mockImplementation(async (_client, _webauthn, input: { confirm: () => Promise<void> }) => {
      await input.confirm()
      confirmed = true
      return { status: 'active' }
    })

    fireEvent.click(activate)
    const confirm = await screen.findByRole('button', { name: 'Confirmer avec ton empreinte' })
    expect(confirmed).toBe(false)
    expect(screen.queryByRole('button', { name: 'Activer' })).not.toBeInTheDocument()
    // « Activer » became « Confirmer avec … »: the focus is on the gesture awaited.
    expect(confirm).toHaveFocus()

    fireEvent.click(confirm)
    // No timer, no request: only the promise's own step.
    await Promise.resolve()
    await Promise.resolve()
    expect(confirmed).toBe(true)
    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'))
  })

  // The person closed the prompt (or the browser refused it): the offer stays,
  // with a fresh activation for the next tap.
  test('a cancelled prompt leaves the offer, ready again with a fresh activation', async () => {
    const second = preparedActivation()
    const { activate } = await offer()
    mocks.prepareFaceId.mockResolvedValue(second)
    mocks.activateFaceId.mockRejectedValueOnce(cancelled())

    fireEvent.click(activate)
    await vi.waitFor(() => expect(mocks.prepareFaceId).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Activer' })).toBeEnabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(mocks.replace).not.toHaveBeenCalled()

    mocks.activateFaceId.mockReturnValue(never())
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    expect(mocks.activateFaceId).toHaveBeenCalledTimes(2)
    expect(mocks.activateFaceId.mock.calls[1][2].prepared).toBe(second)
  })

  test('an activation prepared 4 minutes ago is not used at the tap: a fresh one waits for one more tap', async () => {
    const fresh = preparedActivation()
    const { activate } = await offer(preparedActivation(fourMinutesAgo()))
    mocks.prepareFaceId.mockResolvedValue(fresh)

    fireEvent.click(activate)

    expect(mocks.activateFaceId).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(mocks.prepareFaceId).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Activer' })).toBeEnabled())

    mocks.activateFaceId.mockReturnValue(never())
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    expect(mocks.activateFaceId).toHaveBeenCalledTimes(1)
    expect(mocks.activateFaceId.mock.calls[0][2].prepared).toBe(fresh)
  })

  test('a device clock far ahead does not make « Activer » expired', async () => {
    clockADayAhead()
    const prepared = preparedActivation()
    const { activate } = await offer(prepared)
    mocks.activateFaceId.mockReturnValue(never())

    fireEvent.click(activate)

    expect(mocks.activateFaceId).toHaveBeenCalledTimes(1)
    expect(mocks.activateFaceId.mock.calls[0][2].prepared).toBe(prepared)
  })

  test('a device that slept 5 minutes does not use its activation at the tap: a fresh one waits for one more tap', async () => {
    const fresh = preparedActivation()
    const { activate } = await offer(preparedActivation(asleepFiveMinutes()))
    mocks.prepareFaceId.mockResolvedValue(fresh)

    fireEvent.click(activate)

    expect(mocks.activateFaceId).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(mocks.prepareFaceId).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Activer' })).toBeEnabled())
    mocks.activateFaceId.mockReturnValue(never())
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    expect(mocks.activateFaceId.mock.calls[0][2].prepared).toBe(fresh)
  })

  // The key that opens the password packet is held by the screen alone.
  test('keeps nothing of the sign-in in the browser’s storage but the remembered address', async () => {
    await offer()
    // Only the bare « an account was used here » flag, the time of the last activity
    // (lib/app/idle-lock.ts), and the address typed (lib/auth/remembered-email.ts): nothing
    // of the password, nor of the keys.
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).sort()
    expect(keys).toEqual(['oseil-adresse', 'oseil-compte-ici', 'oseil-derniere-activite'])
    expect(localStorage.getItem('oseil-compte-ici')).toBe('1')
    expect(localStorage.getItem('oseil-adresse')).toBe('a@b.fr')
    expect(sessionStorage.length).toBe(0)
  })
})

// A Vercel preview and localhost use the production Supabase project, whose
// passkeys belong to oseil.fr: the browser would refuse them there.
// Nothing of Face ID shows, and the password works as before.
describe.each([
  ['a Vercel preview', 'https://stefin-git-feat-face-id-yogz.vercel.app/connexion'],
  ['localhost', 'http://localhost:3000/connexion'],
])('Away from the site’s address, on %s', (_, url) => {
  beforeEach(() => {
    openedAt(url)
    mocks.supported.mockResolvedValue(true)
  })

  test('offers no Face ID sign-in, and leaves the form as it is', async () => {
    mocks.prepareFaceIdSignIn.mockResolvedValue(preparedSignIn())
    render(<SignInPage />)

    await vi.waitFor(() => expect(mocks.prepareFaceIdSignIn).toHaveBeenCalled())
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: /^Utiliser / })).not.toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Me connecter' })).toBeEnabled()
  })

  test('offers no activation after a password sign-in, which goes home as before', async () => {
    mocks.prepareFaceIdSignIn.mockReturnValue(never())
    mocks.prepareFaceId.mockResolvedValue(preparedActivation())
    mocks.signIn.mockResolvedValue(unlocked())
    const user = userEvent.setup()
    render(<SignInPage />)
    await user.type(screen.getByLabelText('Ton adresse e-mail'), 'a@b.fr')
    await user.type(screen.getByLabelText('Ton mot de passe'), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Me connecter' }))

    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'))
    expect(mocks.replace).toHaveBeenCalledTimes(1)
    expect(mocks.activateFaceId).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// Planche 4 of the account screens (Nicolas, 10 November 2026): back from the confirmation link,
// the page says the address is confirmed; while the keys are derived, the pill says so.
describe('back from the link of the e-mail', () => {
  afterEach(() => openedAt(SITE))

  test('says the address is confirmed, then forgets the code in the address', async () => {
    openedAt(`${SITE}?code=abc123`)
    render(<SignInPage />)

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Ton adresse est confirmée. Connecte-toi pour recevoir ta clé de secours et commencer.',
    )
    expect(window.location.search).toBe('')
  })

  // In the browser that signed up, Supabase turns the code into a session as the page opens: its
  // address is the one just confirmed, and only the password is left to type.
  test('fills in the address the link confirmed, read once the code is used', async () => {
    openedAt(`${SITE}?code=abc123`)
    mocks.getSession.mockImplementation(async () => {
      // The code must still be in the address while Supabase reads it.
      expect(window.location.search).toBe('?code=abc123')
      return { data: { session: { user: { id: USER_ID, email: 'me@example.com' } } }, error: null }
    })
    render(<SignInPage />)

    await vi.waitFor(() => expect(screen.getByLabelText('Ton adresse e-mail')).toHaveValue('me@example.com'))
    expect(window.location.search).toBe('')
  })

  // On another device, the code cannot be used there: nothing to fill in, the message stays.
  test('leaves the address empty when the link was opened elsewhere', async () => {
    openedAt(`${SITE}?code=abc123`)
    render(<SignInPage />)

    expect(await screen.findByRole('status')).toHaveTextContent('Ton adresse est confirmée.')
    expect(screen.getByLabelText('Ton adresse e-mail')).toHaveValue('')
    expect(window.location.search).toBe('')
  })

  test('never replaces an address the person already typed', async () => {
    const user = userEvent.setup()
    openedAt(`${SITE}?code=abc123`)
    let answer: (value: unknown) => void = () => {}
    mocks.getSession.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    render(<SignInPage />)

    await user.type(screen.getByLabelText('Ton adresse e-mail'), 'autre@example.com')
    await act(async () => answer({ data: { session: { user: { id: USER_ID, email: 'me@example.com' } } }, error: null }))
    expect(screen.getByLabelText('Ton adresse e-mail')).toHaveValue('autre@example.com')
  })

  test('says so when the link is no longer valid', async () => {
    openedAt(`${SITE}?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`)
    render(<SignInPage />)

    expect(await screen.findByRole('status')).toHaveTextContent('Ce lien n’est plus valable.')
    expect(window.location.search).toBe('')
  })

  test('says nothing when the page is opened from anywhere else', async () => {
    render(<SignInPage />)
    await screen.findByRole('button', { name: 'Me connecter' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

test('while the keys are derived, the pill says so', async () => {
  const user = userEvent.setup()
  mocks.signIn.mockReturnValue(never())
  render(<SignInPage />)

  await user.type(screen.getByLabelText('Ton adresse e-mail'), 'me@example.com')
  await user.type(screen.getByLabelText('Ton mot de passe'), 'un mot de passe long')
  await user.click(screen.getByRole('button', { name: 'Me connecter' }))

  expect(screen.getByRole('button', { name: 'Ouverture de ton coffre…' })).toHaveAttribute('aria-busy', 'true')
  // After a third of a second, the form gives its place to the wait of the site.
  expect(await screen.findByRole('status', {}, { timeout: 1000 })).toHaveTextContent(/^Ouverture de ton coffre…$/)
  expect(screen.getByLabelText('Ton adresse e-mail')).not.toBeVisible()
})

test('a refused sign-in brings the form back, filled, with its error', async () => {
  const user = userEvent.setup()
  let refuse: (reason: unknown) => void = () => {}
  mocks.signIn.mockReturnValue(new Promise((_, reject) => (refuse = reject)))
  render(<SignInPage />)

  await user.type(screen.getByLabelText('Ton adresse e-mail'), 'me@example.com')
  await user.type(screen.getByLabelText('Ton mot de passe'), 'un mot de passe long')
  await user.click(screen.getByRole('button', { name: 'Me connecter' }))
  await screen.findByText('Ouverture de ton coffre…', { selector: 'p' }, { timeout: 1000 })

  await act(async () => refuse(new Error('refused')))
  expect(screen.getByLabelText('Ton adresse e-mail')).toBeVisible()
  expect(screen.getByLabelText('Ton adresse e-mail')).toHaveValue('me@example.com')
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(screen.queryByText('Ouverture de ton coffre…', { selector: 'p' })).not.toBeInTheDocument()
})

test('an address not confirmed yet can have its link sent again', async () => {
  const user = userEvent.setup()
  const { EmailNotConfirmedError } = await import('@/lib/auth/account')
  mocks.signIn.mockRejectedValue(new EmailNotConfirmedError())
  mocks.resendConfirmation.mockResolvedValue(undefined)
  render(<SignInPage />)

  await user.type(screen.getByLabelText('Ton adresse e-mail'), 'me@example.com')
  await user.type(screen.getByLabelText('Ton mot de passe'), 'un mot de passe long')
  await user.click(screen.getByRole('button', { name: 'Me connecter' }))
  await user.click(await screen.findByRole('button', { name: 'Renvoyer l’e-mail' }))

  expect(mocks.resendConfirmation).toHaveBeenCalledWith(expect.anything(), {
    email: 'me@example.com',
    redirectTo: 'https://oseil.fr/connexion',
  })
  expect(await screen.findByText(/C’est reparti/)).toBeInTheDocument()
})

// Nicolas, 12 November 2026: the address of the last sign-in here fills the field
// (lib/auth/remembered-email.ts). It is read and written on the device only.
describe('the remembered address', () => {
  test('fills the field as the page opens', async () => {
    rememberedEmail.set('me@example.com')
    render(<SignInPage />)
    await vi.waitFor(() => expect(screen.getByLabelText('Ton adresse e-mail')).toHaveValue('me@example.com'))
  })

  test('leaves the field empty when nothing is remembered', async () => {
    render(<SignInPage />)
    await vi.waitFor(() => expect(mocks.getSession).toHaveBeenCalled())
    expect(screen.getByLabelText('Ton adresse e-mail')).toHaveValue('')
  })

  test('a password sign-in remembers the address, as the account knows it', async () => {
    mocks.signIn.mockResolvedValue(unlocked())
    const user = userEvent.setup()
    render(<SignInPage />)
    await user.type(screen.getByLabelText('Ton adresse e-mail'), ' Me@Example.com')
    await user.type(screen.getByLabelText('Ton mot de passe'), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Me connecter' }))
    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'))
    expect(rememberedEmail.read()).toBe('me@example.com')
  })

  test('a refused sign-in remembers nothing, and keeps the address remembered before', async () => {
    rememberedEmail.set('me@example.com')
    mocks.signIn.mockRejectedValue(new Error('refused'))
    const user = userEvent.setup()
    render(<SignInPage />)
    const field = screen.getByLabelText('Ton adresse e-mail')
    await vi.waitFor(() => expect(field).toHaveValue('me@example.com'))
    await user.clear(field)
    await user.type(field, 'other@example.com')
    await user.type(screen.getByLabelText('Ton mot de passe'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Me connecter' }))
    await screen.findByRole('alert')
    expect(rememberedEmail.read()).toBe('me@example.com')
  })

  test('a Face ID sign-in remembers the address of the session it opened', async () => {
    mocks.supported.mockResolvedValue(true)
    mocks.prepareFaceIdSignIn.mockResolvedValue(preparedSignIn())
    render(<SignInPage />)
    const button = await screen.findByRole('button', { name: /^Utiliser / })
    await vi.waitFor(() => expect(button).toBeEnabled())
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: USER_ID, email: 'me@example.com' } } }, error: null })
    mocks.signInWithFaceId.mockResolvedValue(undefined)

    fireEvent.click(button)

    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'))
    expect(rememberedEmail.read()).toBe('me@example.com')
  })

  test('a Face ID sign-in still goes home when the session cannot be read', async () => {
    mocks.supported.mockResolvedValue(true)
    mocks.prepareFaceIdSignIn.mockResolvedValue(preparedSignIn())
    render(<SignInPage />)
    const button = await screen.findByRole('button', { name: /^Utiliser / })
    await vi.waitFor(() => expect(button).toBeEnabled())
    mocks.getSession.mockRejectedValue(new Error('storage'))
    mocks.signInWithFaceId.mockResolvedValue(undefined)

    fireEvent.click(button)

    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'))
    expect(rememberedEmail.read()).toBeNull()
  })

  test('the address a confirmation link brings outranks the one remembered', async () => {
    rememberedEmail.set('old@example.com')
    openedAt(`${SITE}?code=abc123`)
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: USER_ID, email: 'new@example.com' } } }, error: null })
    render(<SignInPage />)
    await vi.waitFor(() => expect(screen.getByLabelText('Ton adresse e-mail')).toHaveValue('new@example.com'))
  })
})

// The vault closed by itself (lib/app/idle-lock.ts): the sign-in says why the person is here.
test('after the vault closed by itself, the sign-in says so under its title', () => {
  idleClock.markClosed()
  render(<SignInPage />)
  expect(screen.getAllByRole('status').map((el) => el.textContent)).toContain(IDLE_CLOSED_SENTENCE)
})

test('an ordinary arrival says nothing of a closing', () => {
  render(<SignInPage />)
  expect(document.body.textContent).not.toContain(IDLE_CLOSED_SENTENCE)
})
