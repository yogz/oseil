'use client'

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { FaceIdMaterial } from '@/lib/auth/account'
import { activateFaceId, hasExpired, prepareFaceId, type Prepared } from '@/lib/auth/face-id'
import { FACE_ID_NO_PRF, faceIdActivationFailed, faceIdAlready, type FaceIdLabel } from '@/lib/auth/messages'
import { browserWebAuthn, rpIdServesHost } from '@/lib/auth/webauthn'
import { createBrowserSupabase } from '@/lib/supabase/browser'

type FaceIdOfferProps = {
  /** What checks the person on this device: « Face ID », « Touch ID », « Windows Hello », « ton empreinte ». */
  label: FaceIdLabel
  /** From the password sign-in. Held by this screen alone, and forgotten with it. */
  material: FaceIdMaterial
  /** On to the application: the person answered, or the offer gave way. */
  onLeave: () => void
}

// The person closed the prompt, or the browser refused it: the same refusal.
function isCancelled(failure: unknown): boolean {
  return failure instanceof DOMException && failure.name === 'NotAllowedError'
}

// « Ouvrir avec Face ID la prochaine fois ? », right after a password sign-in.
// The registration is prepared with Supabase as the offer shows, so that the
// passkey's creation follows the tap on « Activer » at once.
export function FaceIdOffer({ label, material, onLeave }: FaceIdOfferProps) {
  // A prepared registration serves once: each round prepares a fresh one.
  const [round, setRound] = useState(0)
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [busy, setBusy] = useState(false)
  // The second gesture, when the creation gave no secret: awaited, then given.
  const [confirmation, setConfirmation] = useState<'none' | 'awaited' | 'given'>('none')
  const [message, setMessage] = useState<string | null>(null)
  // Resolves the activation's `confirm`, while it waits for that gesture.
  const confirmed = useRef<(() => void) | null>(null)
  const giveWay = useEffectEvent(onLeave)
  // Where the focus goes as the screen changes under it, so that a screen
  // reader, or a keyboard, is not left on a button that is gone. Moved in the
  // same commit as the change (a layout effect), never a moment after it.
  const heading = useRef<HTMLHeadingElement>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)
  const continueButton = useRef<HTMLButtonElement>(null)

  // The form the person was in is gone: on to the question.
  useLayoutEffect(() => {
    heading.current?.focus()
  }, [])

  // « Activer » became « Confirmer avec … »: on to the gesture awaited.
  useLayoutEffect(() => {
    if (confirmation === 'awaited') confirmButton.current?.focus()
  }, [confirmation])

  // The buttons gave way to a message: on to what comes next.
  useLayoutEffect(() => {
    if (message) continueButton.current?.focus()
  }, [message])

  useEffect(() => {
    let live = true
    prepareFaceId(createBrowserSupabase()).then(
      (ready) => {
        if (!live) return
        // Away from the site's address (a preview, localhost), the browser
        // would refuse to create the passkey: nothing to offer here.
        if (rpIdServesHost(ready.options.rp.id, window.location.hostname)) setPrepared(ready)
        else giveWay()
      },
      // Nothing to offer after all: on, as if the offer had never shown.
      () => {
        if (live) giveWay()
      },
    )
    return () => {
      live = false
    }
  }, [round])

  function activate() {
    if (!prepared) return
    if (hasExpired(prepared)) {
      // Asking Supabase again now would come between the tap and the prompt:
      // a fresh registration is prepared instead, and waits for one more tap.
      setPrepared(null)
      setRound((count) => count + 1)
      return
    }
    // Straight from the tap: nothing is awaited before the passkey is created.
    const attempt = activateFaceId(createBrowserSupabase(), browserWebAuthn, {
      prepared,
      keyEncryptionKey: material.keyEncryptionKey,
      userId: material.userId,
      // The opening that gives the secret waits for the tap on « Confirmer
      // avec … », and goes within that tap.
      confirm: () =>
        new Promise<void>((resolve) => {
          confirmed.current = resolve
          setConfirmation('awaited')
        }),
    })
    setPrepared(null)
    setBusy(true)
    attempt
      .then(
        (outcome) => {
          if (outcome.status === 'active') onLeave()
          else setMessage(outcome.status === 'no-prf' ? FACE_ID_NO_PRF : faceIdAlready(label))
        },
        (failure: unknown) => {
          // The offer stays, with a fresh registration for the next tap.
          if (isCancelled(failure)) setRound((count) => count + 1)
          else setMessage(faceIdActivationFailed(label))
        },
      )
      .finally(() => {
        confirmed.current = null
        setConfirmation('none')
        setBusy(false)
      })
  }

  function confirm() {
    const resolve = confirmed.current
    confirmed.current = null
    setConfirmation('given')
    resolve?.()
  }

  return (
    <div className="flex flex-col">
      {/* Focusable by the screen only, and drawn without a ring: it is not a control. */}
      <h1 ref={heading} tabIndex={-1} className="text-title font-semibold leading-tight tracking-[-0.01em] focus:outline-none">
        {`Ouvrir avec ${label} la prochaine fois\u00A0?`}
      </h1>
      <p className="mt-3 text-body leading-relaxed text-ink-soft">
        Ton mot de passe reste valable, sur tous tes appareils.
      </p>

      {message ? (
        <>
          <p role="alert" className="mt-8 text-body font-medium leading-normal text-ink">
            {message}
          </p>
          <Button ref={continueButton} className="mt-6" onClick={onLeave}>
            Continuer
          </Button>
        </>
      ) : (
        <div className="mt-8 flex flex-col gap-3">
          {confirmation === 'none' ? (
            <Button disabled={!prepared || busy} aria-busy={busy} onClick={activate}>
              Activer
            </Button>
          ) : (
            <Button
              ref={confirmButton}
              disabled={confirmation === 'given'}
              aria-busy={confirmation === 'given'}
              onClick={confirm}
            >
              {`Confirmer avec ${label}`}
            </Button>
          )}
          {/* Not while the passkey is being made or saved; still there while
              the second gesture is awaited, which the person may not give. */}
          <Button variant="secondary" disabled={busy && confirmation !== 'awaited'} onClick={onLeave}>
            Pas maintenant
          </Button>
        </div>
      )}
    </div>
  )
}
