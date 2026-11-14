'use client'

import { useEffect, useState } from 'react'
import { hasExpired, prepareFaceIdSignIn, signInWithFaceId, type PreparedSignIn } from '@/lib/auth/face-id'
import { faceIdSignInErrorMessage, type FaceIdLabel } from '@/lib/auth/messages'
import { browserWebAuthn, rpIdServesHost } from '@/lib/auth/webauthn'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import { indexedDbKeyStore } from '@/lib/vault/device'

export type FaceIdSignIn = {
  /** Preparing: shown, but not ready for a tap. Unavailable: shown nowhere, the password is there. */
  state: 'off' | 'preparing' | 'ready' | 'unavailable'
  busy: boolean
  /** What the last attempt said went wrong, in the device's word. It outlives the next round. */
  error: string | null
  /** To be called from the tap itself, nothing awaited before it. */
  signIn: () => void
}

// The Face ID sign-in of the sign-in page, whichever way the page shows it: a quiet link under the
// password form, or the first pill when Face ID has served on this device (planche 4B). The sign-in
// is prepared with Supabase before the tap, so that the tap goes straight to the passkey: Safari can
// refuse a WebAuthn request that does not follow it at once. Without a `label` (a device that cannot
// create a passkey, or one that has not said yet), nothing is asked of Supabase.
export function useFaceIdSignIn(label: FaceIdLabel | null, onSignedIn: () => void): FaceIdSignIn {
  // A prepared sign-in serves once: each round prepares a fresh one.
  const [round, setRound] = useState(0)
  const [prepared, setPrepared] = useState<PreparedSignIn | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (label === null) return
    let live = true
    prepareFaceIdSignIn(createBrowserSupabase()).then(
      (ready) => {
        if (!live) return
        // Away from the site's address (a preview, localhost), the browser
        // would refuse the passkey: the password is right there.
        if (rpIdServesHost(ready.options.rpId, window.location.hostname)) {
          setPrepared(ready)
          // Each round says whether Face ID is there: one that prepared a
          // sign-in undoes what an earlier round said.
          setUnavailable(false)
        } else setUnavailable(true)
      },
      // Supabase refused, or the network did: the password is right there.
      () => {
        if (live) setUnavailable(true)
      },
    )
    return () => {
      live = false
    }
  }, [round, label])

  function signIn() {
    if (!prepared || label === null) return
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

  const state = label === null ? 'off' : unavailable ? 'unavailable' : prepared ? 'ready' : 'preparing'
  return { state, busy, error, signIn }
}
