// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthApiError } from '@supabase/supabase-js'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import { memoryStorage } from '@/lib/auth/__tests__/memory-storage'
import { exampleProfile, exampleSnapshot } from '@/lib/model/__tests__/fixtures'
import { DELETE_FOR_GOOD, DELETE_WHAT_GOES } from '@/lib/screens/settings-words'
import { EmailMismatchError, WrongPasswordError } from '@/lib/vault/store'
import { DeleteAccount } from '../DeleteAccount'

const mocks = vi.hoisted(() => ({
  confirmWithPassword: vi.fn(),
  deleteAccount: vi.fn(),
  finishDeletion: vi.fn(),
  signOut: vi.fn(),
  confirmWithFaceId: vi.fn(),
  prepareFaceIdSignIn: vi.fn(),
  supported: vi.fn(),
  loadPage: vi.fn(),
  getUser: vi.fn(),
}))

vi.mock('@/lib/auth/account', async (original) => ({
  ...(await original<typeof import('@/lib/auth/account')>()),
  confirmWithPassword: mocks.confirmWithPassword,
  deleteAccount: mocks.deleteAccount,
  finishDeletion: mocks.finishDeletion,
  signOut: mocks.signOut,
}))
vi.mock('@/lib/auth/face-id', async (original) => ({
  ...(await original<typeof import('@/lib/auth/face-id')>()),
  confirmWithFaceId: mocks.confirmWithFaceId,
  prepareFaceIdSignIn: mocks.prepareFaceIdSignIn,
}))
vi.mock('@/lib/auth/webauthn', async (original) => ({
  ...(await original<typeof import('@/lib/auth/webauthn')>()),
  browserWebAuthn: { supported: mocks.supported, create: vi.fn(), get: vi.fn() },
}))
vi.mock('@/lib/navigation', () => ({ loadPage: mocks.loadPage }))
const KEYS = {}
vi.mock('@/lib/vault/device', () => ({ indexedDbKeyStore: () => KEYS }))

const { DeviceKeyNotClearedError } = await import('@/lib/auth/account')
const { FaceIdCancelledError, FaceIdOtherAccountError } = await import('@/lib/auth/face-id')

const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const model: Model = {
  profile: loaded(exampleProfile),
  snapshots: [loaded(exampleSnapshot, 's0')],
  goals: [],
  settings: null,
  draft: null,
  unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
}
const client = { auth: { getUser: mocks.getUser } } as never
const PREPARED = { challengeId: 'c', options: { challenge: new Uint8Array(1) }, preparedAt: { monotonic: performance.now(), wall: Date.now() } }

const PASSWORD_LABEL = 'Ton mot de passe, pour confirmer'
const SUBMIT = 'Supprimer mon compte et mes chiffres'
const FAILED = 'La suppression n’a pas abouti. Rien n’a été effacé. Réessaie dans un moment.'
const UNKNOWN = 'On n’a pas pu savoir si la suppression a abouti. Réessaie dans un moment.'
const EMAIL_UNREADABLE = 'Ton adresse n’a pas pu être lue. Réessaie dans un moment.'

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  vi.stubGlobal('localStorage', memoryStorage())
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'nicolas@example.com' } } })
  mocks.confirmWithPassword.mockResolvedValue(undefined)
  mocks.deleteAccount.mockResolvedValue(undefined)
  mocks.finishDeletion.mockResolvedValue(undefined)
  mocks.signOut.mockResolvedValue(undefined)
  mocks.confirmWithFaceId.mockResolvedValue(undefined)
  mocks.supported.mockResolvedValue(false)
  mocks.prepareFaceIdSignIn.mockResolvedValue(PREPARED)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function typeAndSubmit(password = 'un mot de passe') {
  await userEvent.type(screen.getByLabelText(PASSWORD_LABEL), password)
  await userEvent.click(screen.getByRole('button', { name: SUBMIT }))
}

test('the warning and the download button come before the password field', () => {
  render(<DeleteAccount client={client} model={model} />)
  // Matched on the raw text: getByText would normalise the non-breaking spaces of the page, not the string.
  const forGood = screen.getByText((_, element) => element?.tagName === 'STRONG' && element.textContent === DELETE_FOR_GOOD)
  const warning = forGood.closest('p') as HTMLElement
  expect(warning.textContent).toContain(DELETE_WHAT_GOES)
  expect(DELETE_WHAT_GOES).toMatch(/^Tes chiffres, ton historique.*tout de suite\.$/)
  expect(DELETE_FOR_GOOD).toMatch(/^C’est définitif.*ne pourra rien récupérer\.$/)
  const before = screen.getByText('Télécharge d’abord tes chiffres : c’est la seule trace qui te restera.')
  const download = screen.getByRole('button', { name: 'Télécharger mes chiffres' })
  const field = screen.getByLabelText(PASSWORD_LABEL)
  const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
  expect(follows(warning, before)).toBe(true)
  expect(follows(before, download)).toBe(true)
  expect(follows(download, field)).toBe(true)
  // Drawn like the recovery key's warning (Nicolas, 12 November 2026): a red rule, and only the
  // sentence that cannot be undone in red.
  expect(warning.className).toMatch(/border-loss/)
  expect(forGood.className).toMatch(/text-loss/)
  // Its button too (Nicolas, 12 November 2026): an outlined pill, its outline and its words in red.
  // « Télécharger mes chiffres » stays the neutral outline.
  const submit = screen.getByRole('button', { name: SUBMIT })
  expect(submit.className).toMatch(/\bborder-loss\b/)
  expect(submit.className).toMatch(/\btext-loss\b/)
  expect(submit.className).toMatch(/\bfont-semibold\b/)
  expect(submit.className).not.toMatch(/\bborder-rule-strong\b/)
  expect(download.className).toMatch(/\bborder-rule-strong\b/)
  expect(download.className).not.toMatch(/loss/)
})

test('an empty password calls nothing', async () => {
  render(<DeleteAccount client={client} model={model} />)
  await waitFor(() => expect(mocks.getUser).toHaveBeenCalled())
  await userEvent.click(screen.getByRole('button', { name: SUBMIT }))
  expect(mocks.confirmWithPassword).not.toHaveBeenCalled()
  expect(mocks.deleteAccount).not.toHaveBeenCalled()
})

test('a wrong password says so, and nothing is deleted', async () => {
  mocks.confirmWithPassword.mockRejectedValue(new WrongPasswordError())
  render(<DeleteAccount client={client} model={model} />)
  await typeAndSubmit()
  expect(await screen.findByText('Ce n’est pas ton mot de passe actuel.')).toBeInTheDocument()
  expect(mocks.deleteAccount).not.toHaveBeenCalled()
  expect(mocks.loadPage).not.toHaveBeenCalled()
})

test('another address than the signed-in one reads as a failure, and nothing is deleted', async () => {
  mocks.confirmWithPassword.mockRejectedValue(new EmailMismatchError())
  render(<DeleteAccount client={client} model={model} />)
  await typeAndSubmit()
  expect(await screen.findByText(FAILED)).toBeInTheDocument()
  expect(mocks.deleteAccount).not.toHaveBeenCalled()
})

test('the right password: confirmed, then deleted, then the landing with a full load', async () => {
  render(<DeleteAccount client={client} model={model} />)
  await waitFor(() => expect(mocks.getUser).toHaveBeenCalled())
  await typeAndSubmit('le bon mot de passe')
  await waitFor(() => expect(mocks.loadPage).toHaveBeenCalledWith('/?compte=supprime'))
  expect(mocks.confirmWithPassword).toHaveBeenCalledWith(client, {
    email: 'nicolas@example.com',
    password: 'le bon mot de passe',
  })
  expect(mocks.deleteAccount).toHaveBeenCalledWith(client, KEYS)
  expect(mocks.confirmWithPassword.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.deleteAccount.mock.invocationCallOrder[0],
  )
  expect(mocks.deleteAccount.mock.invocationCallOrder[0]).toBeLessThan(mocks.loadPage.mock.invocationCallOrder[0])
})

test('the button is disabled while working: a second click makes no second call', async () => {
  let finish: () => void = () => {}
  mocks.confirmWithPassword.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
  render(<DeleteAccount client={client} model={model} />)
  await waitFor(() => expect(mocks.getUser).toHaveBeenCalled())
  await typeAndSubmit()
  const button = screen.getByRole('button', { name: SUBMIT })
  expect(button).toBeDisabled()
  await userEvent.click(button)
  expect(mocks.confirmWithPassword).toHaveBeenCalledTimes(1)
  finish()
  await waitFor(() => expect(mocks.loadPage).toHaveBeenCalledTimes(1))
  expect(mocks.deleteAccount).toHaveBeenCalledTimes(1)
})

test('a key the device could not forget: the account is gone all the same, so the landing', async () => {
  mocks.deleteAccount.mockRejectedValue(new DeviceKeyNotClearedError())
  render(<DeleteAccount client={client} model={model} />)
  await waitFor(() => expect(mocks.getUser).toHaveBeenCalled())
  await typeAndSubmit()
  await waitFor(() => expect(mocks.loadPage).toHaveBeenCalledWith('/?compte=supprime'))
})

// The answer of the deletion lost, and the check after it too (deleteAccount then fails): whether
// anything was erased is not known, and the screen claims neither.
test('a deletion whose outcome is unknown says so, and « Réessayer » loads the screen afresh', async () => {
  mocks.deleteAccount.mockRejectedValue(new Error('Could not delete the account: Failed to fetch'))
  render(<DeleteAccount client={client} model={model} />)
  await waitFor(() => expect(mocks.getUser).toHaveBeenCalled())
  await typeAndSubmit()
  expect(await screen.findByText(UNKNOWN)).toBeInTheDocument()
  expect(screen.queryByText(/Rien n’a été effacé/)).toBeNull()
  expect(mocks.loadPage).not.toHaveBeenCalled()
  // The tabs' memory is already forgotten: the form does not come back from it.
  expect(screen.queryByLabelText(PASSWORD_LABEL)).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  expect(mocks.loadPage).toHaveBeenCalledWith('/reglages/supprimer')
})

test('no Face ID button where Face ID is not set on this device', async () => {
  mocks.supported.mockResolvedValue(true)
  render(<DeleteAccount client={client} model={model} />)
  await waitFor(() => expect(mocks.getUser).toHaveBeenCalled())
  await Promise.resolve()
  expect(screen.queryByRole('button', { name: /^Confirmer avec/ })).toBeNull()
  expect(mocks.prepareFaceIdSignIn).not.toHaveBeenCalled()
  expect(screen.queryByText(/app Mots de passe/)).toBeNull()
})

function faceIdHere() {
  localStorage.setItem('stefin-face-id', '1')
  mocks.supported.mockResolvedValue(true)
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)')
}

test('with Face ID here: the button, the note, and a tap that confirms then deletes', async () => {
  faceIdHere()
  render(<DeleteAccount client={client} model={model} />)
  expect(
    screen.getByText('Ta clé Face ID reste rangée dans l’app Mots de passe de ton appareil : tu peux l’y retirer toi-même.'),
  ).toBeInTheDocument()
  const button = await screen.findByRole('button', { name: 'Confirmer avec Face ID' })
  await waitFor(() => expect(button).toBeEnabled())
  await userEvent.click(button)
  await waitFor(() => expect(mocks.loadPage).toHaveBeenCalledWith('/?compte=supprime'))
  // The account read as the screen opened: nothing is fetched between the tap and the prompt.
  expect(mocks.confirmWithFaceId).toHaveBeenCalledWith(client, expect.anything(), PREPARED, 'user-1')
  expect(mocks.deleteAccount).toHaveBeenCalledWith(client, KEYS)
  expect(mocks.confirmWithPassword).not.toHaveBeenCalled()
})

test('a closed Face ID prompt says nothing and deletes nothing', async () => {
  faceIdHere()
  mocks.confirmWithFaceId.mockRejectedValue(new FaceIdCancelledError())
  render(<DeleteAccount client={client} model={model} />)
  const button = await screen.findByRole('button', { name: 'Confirmer avec Face ID' })
  await waitFor(() => expect(button).toBeEnabled())
  await userEvent.click(button)
  await waitFor(() => expect(mocks.confirmWithFaceId).toHaveBeenCalled())
  await waitFor(() => expect(mocks.prepareFaceIdSignIn).toHaveBeenCalledTimes(2))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(mocks.deleteAccount).not.toHaveBeenCalled()
})

test('a Face ID key of another account: signed out, back to the sign-in, nothing deleted', async () => {
  faceIdHere()
  mocks.confirmWithFaceId.mockRejectedValue(new FaceIdOtherAccountError())
  render(<DeleteAccount client={client} model={model} />)
  const button = await screen.findByRole('button', { name: 'Confirmer avec Face ID' })
  await waitFor(() => expect(button).toBeEnabled())
  await userEvent.click(button)
  await waitFor(() => expect(mocks.loadPage).toHaveBeenCalledWith('/connexion'))
  expect(mocks.signOut).toHaveBeenCalledWith(client, KEYS)
  expect(mocks.deleteAccount).not.toHaveBeenCalled()
})

test('the Face ID button waits until the signed-in account is known', async () => {
  faceIdHere()
  mocks.getUser.mockReturnValue(new Promise(() => {}))
  render(<DeleteAccount client={client} model={model} />)
  const button = await screen.findByRole('button', { name: 'Confirmer avec Face ID' })
  await waitFor(() => expect(mocks.prepareFaceIdSignIn).toHaveBeenCalled())
  await Promise.resolve()
  expect(button).toBeDisabled()
})

// The file is « the only trace left »: what it leaves out is said here as in the Réglages.
test('what the file leaves out is said before deleting, in the Réglages’ own words', () => {
  render(
    <DeleteAccount
      client={client}
      model={{
        ...model,
        draft: { id: 'd', value: {}, updatedAt: '' } as never,
        unreadable: { ...model.unreadable, snapshots: 2 },
      }}
    />,
  )
  expect(screen.getByText('Ta mise à jour en cours n’y est pas, seulement les relevés terminés.')).toBeInTheDocument()
  expect(screen.getByText(/^2 relevés n’ont pas pu être lus\s: ils manquent dans ce fichier\.$/)).toBeInTheDocument()
})

test('while the password is checked, the wait says the vault opens: nothing is deleted yet', async () => {
  mocks.confirmWithPassword.mockReturnValue(new Promise<void>(() => {}))
  render(<DeleteAccount client={client} model={model} />)
  await waitFor(() => expect(mocks.getUser).toHaveBeenCalled())
  await typeAndSubmit()
  expect(await screen.findByText('Ouverture de ton coffre…')).toBeInTheDocument()
  expect(screen.queryByText('Suppression de ton compte…')).toBeNull()
})

test('while the deletion runs, the wait says so', async () => {
  mocks.deleteAccount.mockReturnValue(new Promise<void>(() => {}))
  render(<DeleteAccount client={client} model={model} />)
  await waitFor(() => expect(mocks.getUser).toHaveBeenCalled())
  await typeAndSubmit()
  expect(await screen.findByText('Suppression de ton compte…')).toBeInTheDocument()
  expect(screen.queryByText('Ouverture de ton coffre…')).toBeNull()
})

// After « Réessayer » on a deletion that had landed: the session is still on the device, the account
// is not on the server.
test('an account already gone as the screen opens: the device forgets it, then the landing', async () => {
  mocks.getUser.mockResolvedValue({
    data: { user: null },
    error: new AuthApiError('User not found', 403, 'user_not_found'),
  })
  render(<DeleteAccount client={client} model={model} />)
  await waitFor(() => expect(mocks.loadPage).toHaveBeenCalledWith('/?compte=supprime'))
  expect(mocks.finishDeletion).toHaveBeenCalledWith(client, KEYS)
  expect(mocks.finishDeletion.mock.invocationCallOrder[0]).toBeLessThan(mocks.loadPage.mock.invocationCallOrder[0])
  expect(mocks.deleteAccount).not.toHaveBeenCalled()
})

test('a key the device could not forget, with the account already gone: the landing all the same', async () => {
  mocks.getUser.mockResolvedValue({
    data: { user: null },
    error: new AuthApiError('User not found', 403, 'user_not_found'),
  })
  mocks.finishDeletion.mockRejectedValue(new DeviceKeyNotClearedError())
  render(<DeleteAccount client={client} model={model} />)
  await waitFor(() => expect(mocks.loadPage).toHaveBeenCalledWith('/?compte=supprime'))
})

test.each([
  { name: 'a refusal', answer: () => Promise.resolve({ data: { user: null }, error: new AuthApiError('Bad JWT', 401, 'bad_jwt') }) },
  { name: 'the network', answer: () => Promise.reject(new TypeError('Failed to fetch')) },
])('an address that cannot be read ($name) is said, and the button waits', async ({ answer }) => {
  mocks.getUser.mockImplementation(answer)
  render(<DeleteAccount client={client} model={model} />)
  expect(await screen.findByText(EMAIL_UNREADABLE)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: SUBMIT })).toBeDisabled()
  expect(mocks.finishDeletion).not.toHaveBeenCalled()
  expect(mocks.loadPage).not.toHaveBeenCalled()
})
