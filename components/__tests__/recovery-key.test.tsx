// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { RecoveryKeyReplacedError } from '@/lib/vault/store'
import { RecoveryKey } from '../account/RecoveryKey'

// A key in the shape the vault produces: 8 groups of 4 Crockford characters.
const DISPLAY = '0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ'
const STORED = 'Je l’ai rangée'
const DONE = 'C’est fait'
const AGAIN = 'Oups, revoir ma clé'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// Asks the third group first, then the sixth: the test knows what to type.
function picker() {
  return vi.fn((previous: number | null) => (previous === null ? 2 : 5))
}

async function toCheck(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: STORED }))
}

test('shows the key in 8 groups, with the warning, and offers to copy it', async () => {
  const user = userEvent.setup()
  render(<RecoveryKey display={DISPLAY} onContinue={async () => {}} pickGroup={picker()} />)

  expect(screen.getByRole('heading', { name: 'Ta clé de secours' })).toBeInTheDocument()
  expect(
    screen.getByText(
      (_, element) =>
        element?.tagName === 'P' &&
        element.textContent ===
          'Si tu oublies ton mot de passe, c’est la seule façon de retrouver tes chiffres. Personne ne peut les récupérer sans elle, pas même nous.',
    ),
  ).toBeInTheDocument()
  expect(screen.getByText(DISPLAY)).toBeInTheDocument()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Copier la clé' }))
  expect(await navigator.clipboard.readText()).toBe(DISPLAY)
})

test('hides the key and asks for one of its groups', async () => {
  const user = userEvent.setup()
  const onContinue = vi.fn().mockResolvedValue(undefined)
  render(<RecoveryKey display={DISPLAY} onContinue={onContinue} pickGroup={picker()} />)
  await toCheck(user)

  expect(screen.getByRole('heading', { name: 'Rangée pour de vrai ?' })).toBeInTheDocument()
  expect(screen.queryByText(DISPLAY)).not.toBeInTheDocument()
  expect(screen.queryByText(/89AB/)).not.toBeInTheDocument()
  expect(screen.getByText(/tape son troisième morceau/)).toBeInTheDocument()

  const done = screen.getByRole('button', { name: DONE })
  expect(done).toBeDisabled()
  await user.type(screen.getByRole('textbox', { name: 'Troisième morceau' }), '89 ab')
  expect(done).toBeEnabled()
  await user.click(done)
  expect(onContinue).toHaveBeenCalledOnce()
})

test('refuses another group, and lets the person try again', async () => {
  const user = userEvent.setup()
  const onContinue = vi.fn().mockResolvedValue(undefined)
  render(<RecoveryKey display={DISPLAY} onContinue={onContinue} pickGroup={picker()} />)
  await toCheck(user)

  const field = screen.getByRole('textbox', { name: 'Troisième morceau' })
  await user.type(field, '4567')
  await user.click(screen.getByRole('button', { name: DONE }))
  expect(onContinue).not.toHaveBeenCalled()
  // Testing Library reads a no-break space as a plain one.
  expect(screen.getByRole('alert')).toHaveTextContent('Ce n’est pas ce morceau-là. Relis ta clé, ou touche « Oups, revoir ma clé ».')

  await user.clear(field)
  await user.type(field, '89AB')
  await user.click(screen.getByRole('button', { name: DONE }))
  expect(onContinue).toHaveBeenCalledOnce()
})

test('shows the same key again, then asks for another group', async () => {
  const user = userEvent.setup()
  const pickGroup = picker()
  render(<RecoveryKey display={DISPLAY} onContinue={async () => {}} pickGroup={pickGroup} />)
  await toCheck(user)

  await user.click(screen.getByRole('button', { name: AGAIN }))
  expect(screen.getByRole('heading', { name: 'Ta clé de secours' })).toBeInTheDocument()
  expect(screen.getByText(DISPLAY)).toBeInTheDocument()

  await toCheck(user)
  expect(pickGroup).toHaveBeenLastCalledWith(2)
  expect(screen.getByRole('textbox', { name: 'Sixième morceau' })).toBeInTheDocument()
  expect(screen.getByText(/tape son sixième morceau/)).toBeInTheDocument()
})

test('offers to share the key where the device can', async () => {
  const user = userEvent.setup()
  const share = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { share }))
  render(<RecoveryKey display={DISPLAY} onContinue={async () => {}} pickGroup={picker()} />)

  await user.click(await screen.findByRole('button', { name: 'Partager' }))
  expect(share).toHaveBeenCalledWith({ text: `Ma clé de secours Oseil : ${DISPLAY}` })
})

test('offers no sharing where the device cannot', () => {
  render(<RecoveryKey display={DISPLAY} onContinue={async () => {}} pickGroup={picker()} />)
  expect(screen.queryByRole('button', { name: 'Partager' })).not.toBeInTheDocument()
})

test('stays on the check and says so when continuing fails', async () => {
  const user = userEvent.setup()
  const onContinue = vi.fn().mockRejectedValue(new Error('offline'))
  render(<RecoveryKey display={DISPLAY} onContinue={onContinue} pickGroup={picker()} />)
  await toCheck(user)
  await user.type(screen.getByRole('textbox', { name: 'Troisième morceau' }), '89AB')
  await user.click(screen.getByRole('button', { name: DONE }))

  expect(await screen.findByRole('alert')).toHaveTextContent("Ça n’a pas marché. Vérifie ton accès à internet et réessaie.")
  expect(screen.getByRole('button', { name: DONE })).toBeEnabled()
})

test('says so when the key was replaced on another device', async () => {
  const user = userEvent.setup()
  const onContinue = vi.fn().mockRejectedValue(new RecoveryKeyReplacedError())
  render(<RecoveryKey display={DISPLAY} onContinue={onContinue} pickGroup={picker()} />)
  await toCheck(user)
  await user.type(screen.getByRole('textbox', { name: 'Troisième morceau' }), '89AB')
  await user.click(screen.getByRole('button', { name: DONE }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    "Cette clé ne marche plus : elle a été remplacée lors d’une connexion sur un autre appareil. Reconnecte-toi pour en recevoir une nouvelle.",
  )
})

test('says the key is new when it replaces one that was never confirmed', () => {
  render(<RecoveryKey display={DISPLAY} renewed onContinue={async () => {}} pickGroup={picker()} />)
  expect(
    screen.getByText(
      "Tu n’avais pas confirmé avoir mis ta clé de secours de côté. En voici une nouvelle : l’ancienne ne marche plus.",
    ),
  ).toBeInTheDocument()
})
