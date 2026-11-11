'use client'

import { useEffect, useState } from 'react'
import { hasExpired, prepareFaceIdSignIn, signInWithFaceId, type PreparedSignIn } from '@/lib/auth/face-id'
import { faceIdSignInErrorMessage, type FaceIdLabel } from '@/lib/auth/messages'
import { browserWebAuthn, rpIdServesHost } from '@/lib/auth/webauthn'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import { indexedDbKeyStore } from '@/lib/vault/device'

type FaceIdSignInProps = {
  /** What checks the person on this device: « Face ID », « Touch ID », « Windows Hello », « ton empreinte ». */
  label: FaceIdLabel
  /** The session and the vault are open. */
  onSignedIn: () => void
  /** The look of a link of the page: this acts in place, so it is a button dressed as one. */
  className: string
}

// « Utiliser Face ID », a quiet link under the password form. The sign-in is
// prepared with Supabase before the tap, so that the tap goes straight to the
// passkey: Safari can refuse a WebAuthn request that does not follow it at once.
export function FaceIdSignIn({ label, onSignedIn, className }: FaceIdSignInProps) {
  // A prepared sign-in serves once: each round prepares a fresh one.
  const [round, setRound] = useState(0)
  const [prepared, setPrepared] = useState<PreparedSignIn | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    prepareFaceIdSignIn(createBrowserSupabase()).then(
      (ready) => {
        if (!live) return
        // Away from the site's address (a preview, localhost), the browser
        // would refuse the passkey: the password is right below.
        if (rpIdServesHost(ready.options.rpId, window.location.hostname)) {
          setPrepared(ready)
          // Each round says whether Face ID is there: one that prepared a
          // sign-in undoes what an earlier round said.
          setUnavailable(false)
        } else setUnavailable(true)
      },
      // Supabase refused, or the network did: the password is right below.
      () => {
        if (live) setUnavailable(true)
      },
    )
    return () => {
      live = false
    }
  }, [round])

  function signIn() {
    if (!prepared) return
    if (hasExpired(prepared)) {
      // Asking Supabase again now would come between the tap and the prompt:
      // a fresh sign-in is prepared instead, and waits for one more tap.
      setPrepared(null)
      setRound((count) => count + 1)
      return
    }
    // Straight from the tap: nothing is awaited before the passkey opens.
    const attempt = signInWithFaceId(createBrowserSupabase(), indexedDbKeyStore(), browserWebAuthn, prepared)
    setPrepared(null)
    setBusy(true)
    setError(null)
    attempt
      .then(onSignedIn, (failure: unknown) => setError(faceIdSignInErrorMessage(failure, label)))
      .finally(() => {
        setBusy(false)
        setRound((count) => count + 1)
      })
  }

  if (unavailable && !error) return null

  return (
    <div className="flex flex-col items-start">
      {unavailable ? null : (
        <button
          type="button"
          disabled={!prepared || busy}
          aria-busy={busy}
          onClick={signIn}
          className={`${className} disabled:opacity-60`}
        >
          {`Utiliser ${label}`}
        </button>
      )}
      {error ? (
        <p role="alert" className="mb-2 text-body font-medium leading-normal text-ink">
          {error}
        </p>
      ) : null}
    </div>
  )
}
