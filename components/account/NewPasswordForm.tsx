'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import { useId, useState, type FormEvent } from 'react'
import { RecoveryKey } from '@/components/account/RecoveryKey'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { accountHere } from '@/lib/auth/account-here'
import { idleClock } from '@/lib/app/idle-lock'
import { faceIdMarker } from '@/lib/auth/face-id-marker'
import { WRONG_RECOVERY_KEY, recoveryErrorMessage, signUpFieldErrors } from '@/lib/auth/messages'
import { isStartOverConfirmed } from '@/lib/auth/recovery'
import { loadPage } from '@/lib/navigation'
import { indexedDbKeyStore } from '@/lib/vault/device'
import { InvalidRecoveryKeyError } from '@/lib/vault/keys'
import { confirmRecoveryKeySeen, resetWithRecoveryKey, startOver } from '@/lib/vault/store'

type NewPasswordFormProps = {
  client: SupabaseClient
  /** The person of the recovery session. The address comes from there, never from a field: the vault is sealed for it. */
  user: { id: string; email: string }
}

type FieldErrors = { recoveryKey?: string; password?: string; confirmation?: string }

const TITLE = 'text-title font-semibold leading-tight tracking-[-0.01em]'
const LINK =
  'inline-flex min-h-11 items-center self-start text-left text-body text-ink-soft underline decoration-rule-strong ' +
  'underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

// By the time a data key is handed back, the vault is resealed and the password
// changed: a device that fails to keep the key has not undone any of it. The
// home screen then finds no key and sends the person to sign in, where the new
// password opens the vault again. So a failure here is not reported.
async function keepOnDevice(userId: string, dataKey: CryptoKey): Promise<void> {
  try {
    // One key per device: another account's key does not stay beside this one.
    const keys = indexedDbKeyStore()
    await keys.clear()
    await keys.set(userId, dataKey)
  } catch {
    // See above.
  }
}

export function NewPasswordForm({ client, user }: NewPasswordFormProps) {
  const startOverId = useId()
  const [recoveryKey, setRecoveryKey] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [startingOver, setStartingOver] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // After starting over: the new recovery key, in this screen's memory only.
  const [newRecovery, setNewRecovery] = useState<string | null>(null)

  const confirmed = isStartOverConfirmed(phrase)

  if (newRecovery) {
    return (
      <RecoveryKey
        display={newRecovery}
        onContinue={async () => {
          await confirmRecoveryKeySeen(client, newRecovery)
          loadPage('/')
        }}
      />
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const problems = signUpFieldErrors({ password, confirmation })
    setFieldErrors(problems)
    if (problems.password || problems.confirmation) return
    if (startingOver && !confirmed) return

    setBusy(true)
    try {
      if (startingOver) {
        const created = await startOver(client, { newPassword: password, email: user.email })
        // A new data key: no passkey opens it, so Face ID is no longer on here.
        faceIdMarker.clear()
        accountHere.set()
        idleClock.start(Date.now())
        await keepOnDevice(user.id, created.dataKey)
        // Shown whatever became of the data key: it is the only copy.
        setNewRecovery(created.recoveryDisplay)
      } else {
        const dataKey = await resetWithRecoveryKey(client, {
          recoveryDisplay: recoveryKey,
          newPassword: password,
          email: user.email,
        })
        accountHere.set()
        idleClock.start(Date.now())
        await keepOnDevice(user.id, dataKey)
        // A full page load: the key held in this page's memory goes with it.
        loadPage('/')
      }
    } catch (failure) {
      // A wrong key wrote nothing: the person corrects it and tries again.
      if (failure instanceof InvalidRecoveryKeyError) setFieldErrors({ recoveryKey: WRONG_RECOVERY_KEY })
      else setError(recoveryErrorMessage(failure))
      setBusy(false)
    }
  }

  function toggleStartOver() {
    setStartingOver((open) => !open)
    setFieldErrors((errors) => ({ ...errors, recoveryKey: undefined }))
    setError(null)
  }

  const alert = error ? (
    <p role="alert" className="text-body font-medium leading-normal text-ink">
      {error}
    </p>
  ) : null

  return (
    <>
      <h1 className={TITLE}>Nouveau mot de passe</h1>
      <p className="mt-2 break-all text-body leading-normal text-ink-soft">Pour le compte {user.email}</p>

      <form onSubmit={submit} className="mt-8 flex flex-col gap-5">
        {startingOver ? null : (
          <TextField
            label="Ta clé de secours"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            required
            error={fieldErrors.recoveryKey}
            value={recoveryKey}
            onChange={(event) => setRecoveryKey(event.target.value)}
          />
        )}
        <TextField
          label="Nouveau mot de passe"
          type="password"
          autoComplete="new-password"
          required
          error={fieldErrors.password}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <TextField
          label="Confirme ton mot de passe"
          type="password"
          autoComplete="new-password"
          required
          error={fieldErrors.confirmation}
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />

        {startingOver ? null : (
          <>
            {alert}
            <Button type="submit" disabled={busy} aria-busy={busy} className="mt-2">
              Retrouver mes chiffres
            </Button>
          </>
        )}

        <button
          type="button"
          className={LINK}
          aria-expanded={startingOver}
          aria-controls={startOverId}
          disabled={busy}
          onClick={toggleStartOver}
        >
          Je n’ai plus ma clé de secours
        </button>

        {startingOver ? (
          <div id={startOverId} className="flex flex-col gap-5">
            <p className="text-body leading-relaxed text-ink">
              Sans ta clé, tes chiffres sont perdus pour de bon. Si tu les as téléchargés dans les Réglages, tu
              pourras les reprendre juste après. Tu peux repartir de zéro avec un coffre vide.
            </p>
            <TextField
              label="Tape « repartir de zéro » pour confirmer"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
            />
            {alert}
            <Button type="submit" disabled={busy || !confirmed} aria-busy={busy} className="mt-2">
              Repartir de zéro
            </Button>
          </div>
        ) : null}
      </form>
    </>
  )
}
