'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { WaitCover } from '@/components/ui/VaultWait'
import type { Model } from '@/lib/app/use-model'
import {
  DeviceKeyNotClearedError,
  confirmWithPassword,
  deleteAccount,
  finishDeletion,
  isUserNotFound,
  signOut,
} from '@/lib/auth/account'
import {
  FaceIdCancelledError,
  FaceIdNoLongerOpensError,
  FaceIdOtherAccountError,
  FaceIdUnavailableError,
  confirmWithFaceId,
  hasExpired,
  prepareFaceIdSignIn,
  type PreparedSignIn,
} from '@/lib/auth/face-id'
import { faceIdMarker } from '@/lib/auth/face-id-marker'
import { faceIdLabel, faceIdNoLongerOpens, faceIdUnavailable, type FaceIdLabel } from '@/lib/auth/messages'
import { browserWebAuthn, rpIdServesHost } from '@/lib/auth/webauthn'
import { loadPage } from '@/lib/navigation'
import {
  ACCOUNT_GONE_URL,
  DELETE_DOWNLOAD_FIRST,
  DELETE_EMAIL_UNREADABLE,
  DELETE_FACE_ID_NOTE,
  DELETE_FAILED,
  DELETE_FOR_GOOD,
  DELETE_HREF,
  DELETE_PASSWORD,
  DELETE_SUBMIT,
  DELETE_UNKNOWN,
  DELETE_WHAT_GOES,
  NOT_CURRENT_PASSWORD,
  PASSWORD_OLD_EMPTY,
  RETRY,
  deleteWithFaceId,
} from '@/lib/screens/settings-words'
import { indexedDbKeyStore } from '@/lib/vault/device'
import { PasswordTooShortError, WrongPasswordError } from '@/lib/vault/store'
import { DownloadFiguresButton } from './DownloadFiguresButton'
import { NOTE, SENTENCE, SMALL_BUTTON } from './styles'

// The Face ID mark changes on no one's watch here: nothing to subscribe to.
const noChange = () => () => {}

// « Supprimer mon compte », in this order (docs/superpowers/specs/2026-11-12-supprimer-mon-compte-design.md):
// what goes, the file to keep, then the password typed again, or a fresh Face ID tap. Nothing is deleted
// before the person has confirmed, and once it is, a full page load leaves nothing of them in memory.
export function DeleteAccount({ client, model }: { client: SupabaseClient; model: Model }) {
  // Who is signed in, read once as the screen opens: Face ID compares the passkey's account with it,
  // since nothing may be asked of the network between the tap and the prompt.
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const email = user?.email ?? null
  const [password, setPassword] = useState('')
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [said, setSaid] = useState<string | null>(null)
  // `confirming`: the password or Face ID being checked; `deleting`: the deletion asked for. `broken`:
  // the deletion failed, after the tabs had forgotten their memory. Only a fresh load of this screen
  // can be trusted then, never the form as it stood.
  const [stage, setStage] = useState<'form' | 'confirming' | 'deleting' | 'broken'>('form')
  const faceIdHere = useSyncExternalStore(noChange, () => faceIdMarker.isSet(), () => false)

  useEffect(() => {
    let live = true
    client.auth.getUser().then(
      (result) => {
        if (!live) return
        const found = result.data.user
        if (found?.email) {
          setUser({ id: found.id, email: found.email })
        } else if (isUserNotFound(result.error)) {
          // The account is already gone: a deletion whose answer was lost, then « Réessayer ». The
          // device forgets it as after any deletion, and the landing says so.
          setStage('deleting')
          void finishDeletion(client, indexedDbKeyStore())
            .catch(() => {})
            .then(() => loadPage(ACCOUNT_GONE_URL))
        } else {
          setSaid(DELETE_EMAIL_UNREADABLE)
        }
      },
      () => {
        if (live) setSaid(DELETE_EMAIL_UNREADABLE)
      },
    )
    return () => {
      live = false
    }
  }, [client])

  async function run(confirm: () => Promise<void>, label: FaceIdLabel | null) {
    setStage('confirming')
    setFieldError(undefined)
    setSaid(null)
    try {
      await confirm()
    } catch (failure) {
      if (failure instanceof FaceIdOtherAccountError) {
        // The other account's session was opened, then closed on this device: this one is gone
        // too. Treated as a sign-out; nothing is deleted.
        await signOut(client, indexedDbKeyStore()).catch(() => {})
        loadPage('/connexion')
        return
      }
      if (failure instanceof WrongPasswordError || failure instanceof PasswordTooShortError) {
        setFieldError(NOT_CURRENT_PASSWORD)
      } else if (failure instanceof FaceIdCancelledError) {
        // The person closed the prompt: nothing to say.
      } else if (failure instanceof FaceIdNoLongerOpensError && label) {
        setSaid(faceIdNoLongerOpens(label))
      } else if (failure instanceof FaceIdUnavailableError && label) {
        setSaid(faceIdUnavailable(label))
      } else {
        // A wrong address (EmailMismatchError) included: not something the person can correct here.
        console.error(failure)
        setSaid(DELETE_FAILED)
      }
      setStage('form')
      return
    }
    setStage('deleting')
    try {
      await deleteAccount(client, indexedDbKeyStore())
    } catch (failure) {
      // A key this device could not forget belongs to an account that no longer exists: it opens
      // nothing, and the account is gone. Anything else: whether it landed is not known.
      if (!(failure instanceof DeviceKeyNotClearedError)) {
        console.error(failure)
        setStage('broken')
        return
      }
    }
    loadPage(ACCOUNT_GONE_URL)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (stage !== 'form' || email === null) return
    if (password === '') {
      setFieldError(PASSWORD_OLD_EMPTY)
      return
    }
    void run(() => confirmWithPassword(client, { email, password }), null)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* The second warning of the site in the colour of a loss, drawn like the recovery key's
          (chosen by Nicolas on 12 November 2026): a red rule, and the sentence that cannot be undone in red.
          Its button, below, is red too (same day): outline and words. */}
      <p className="border-l-2 border-loss pl-3 text-body leading-relaxed text-ink">
        {DELETE_WHAT_GOES} <strong className="font-semibold text-loss">{DELETE_FOR_GOOD}</strong>
      </p>
      <p className={NOTE}>{DELETE_DOWNLOAD_FIRST}</p>
      <DownloadFiguresButton model={model} />
      {faceIdHere ? <p className={NOTE}>{DELETE_FACE_ID_NOTE}</p> : null}
      {stage === 'broken' ? (
        <div className="flex flex-col gap-4">
          <p role="alert" className={SENTENCE}>
            {DELETE_UNKNOWN}
          </p>
          {/* A full load: the tabs' memory is already forgotten, the form is not brought back from it. */}
          <Button variant="secondary" onClick={() => loadPage(DELETE_HREF)}>
            {RETRY}
          </Button>
        </div>
      ) : (
        // While the confirmation is checked, the vault is opened: nothing is being deleted yet.
        <WaitCover active={stage === 'confirming' || stage === 'deleting'} phase={stage === 'deleting' ? 'delete' : 'open'}>
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <TextField
              label={DELETE_PASSWORD}
              type="password"
              autoComplete="current-password"
              revealable
              value={password}
              error={fieldError}
              onChange={(event) => setPassword(event.target.value)}
            />
            {said ? (
              <p role="alert" className={SENTENCE}>
                {said}
              </p>
            ) : null}
            <Button type="submit" variant="danger" disabled={stage !== 'form' || email === null}>
              {DELETE_SUBMIT}
            </Button>
            {faceIdHere ? (
              <FaceIdConfirm
                client={client}
                userId={user?.id ?? null}
                disabled={stage !== 'form'}
                onConfirm={(confirm, label) => void run(confirm, label)}
              />
            ) : null}
          </form>
        </WaitCover>
      )}
    </div>
  )
}

// « Confirmer avec Face ID », only where Face ID is set on this device and the device can use it (the
// sign-in page's rule). The ceremony is prepared with Supabase before the tap, so that the tap goes
// straight to the passkey: Safari can refuse a WebAuthn request that does not follow it at once.
function FaceIdConfirm({
  client,
  userId,
  disabled,
  onConfirm,
}: {
  client: SupabaseClient
  /** The account signed in, once read: until then the button waits. */
  userId: string | null
  disabled: boolean
  onConfirm: (confirm: () => Promise<void>, label: FaceIdLabel) => void
}) {
  const [label, setLabel] = useState<FaceIdLabel | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [prepared, setPrepared] = useState<PreparedSignIn | null>(null)
  // A prepared ceremony serves once: each round prepares a fresh one.
  const [round, setRound] = useState(0)

  useEffect(() => {
    let live = true
    void browserWebAuthn.supported().then((supported) => {
      if (live && supported) setLabel(faceIdLabel(navigator))
    })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (label === null) return
    let live = true
    prepareFaceIdSignIn(client).then(
      (ready) => {
        if (!live) return
        // Away from the site's address (a preview, localhost) the browser would refuse the passkey.
        if (rpIdServesHost(ready.options.rpId, window.location.hostname)) setPrepared(ready)
        else setUnavailable(true)
      },
      () => {
        if (live) setUnavailable(true)
      },
    )
    return () => {
      live = false
    }
  }, [client, label, round])

  if (label === null || unavailable) return null

  function tap() {
    if (!prepared || label === null || userId === null) return
    const ceremony = prepared
    const expected = userId
    setPrepared(null)
    if (hasExpired(ceremony)) {
      // Asking Supabase again now would come between the tap and the prompt: a fresh one waits
      // for one more tap.
      setRound((count) => count + 1)
      return
    }
    // Straight from the tap. Whatever the answer, the next tap gets a fresh ceremony.
    onConfirm(
      () => confirmWithFaceId(client, browserWebAuthn, ceremony, expected).finally(() => setRound((count) => count + 1)),
      label,
    )
  }

  return (
    <button
      type="button"
      className={`${SMALL_BUTTON} self-start`}
      disabled={disabled || !prepared || userId === null}
      onClick={tap}
    >
      {deleteWithFaceId(label)}
    </button>
  )
}
