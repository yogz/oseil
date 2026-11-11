'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import { FaceIdOffer } from '@/components/account/FaceIdOffer'
import { ResendConfirmation } from '@/components/account/ResendConfirmation'
import { FaceIdSignIn } from '@/components/account/FaceIdSignIn'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { WaitCover } from '@/components/ui/VaultWait'
import { forgetEverything } from '@/lib/app/session-memory'
import { EmailNotConfirmedError, signIn, type FaceIdMaterial } from '@/lib/auth/account'
import { accountHere } from '@/lib/auth/account-here'
import { IDLE_CLOSED_SENTENCE, idleClock } from '@/lib/app/idle-lock'
import { faceIdMarker } from '@/lib/auth/face-id-marker'
import { faceIdLabel, signInErrorMessage, type FaceIdLabel } from '@/lib/auth/messages'
import { setPendingRecovery } from '@/lib/auth/pending-recovery'
import { browserWebAuthn } from '@/lib/auth/webauthn'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import { indexedDbKeyStore } from '@/lib/vault/device'

const LINK =
  'inline-flex min-h-11 items-center text-body text-ink-soft underline decoration-rule-strong underline-offset-4 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

const CONFIRMED = 'Ton adresse est confirmée. Connecte-toi pour recevoir ta clé de secours et commencer.'
const LINK_EXPIRED =
  'Ce lien n’est plus valable. Connecte-toi : si ton adresse n’est pas encore confirmée, tu pourras recevoir un nouveau lien.'

// Face ID is offered after a plain unlock only (no new vault, no new recovery
// key), once the recovery key is confirmed, on a device that has not activated
// it. The page also needs the device to have said, as it opened, that it can
// create a passkey (`label`): that answer is not awaited again, and until it
// comes nothing is offered.
function offersFaceId(material: FaceIdMaterial): boolean {
  return material.recoveryConfirmed && !faceIdMarker.isSet()
}

// The mark of a closing changes on no one’s watch here: nothing to subscribe to.
const noChange = () => () => {}

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // What checks the person on this device, when it can create a passkey.
  const [label, setLabel] = useState<FaceIdLabel | null>(null)
  // After a password sign-in, the question awaiting an answer, and what
  // answering « Activer » needs. Held here alone, forgotten with the page.
  const [offer, setOffer] = useState<{ label: FaceIdLabel; material: FaceIdMaterial } | null>(null)
  // What the link of the confirmation e-mail brought back, said once under the title.
  const [arrival, setArrival] = useState<string | null>(null)
  // The vault closed by itself after 15 minutes untouched (lib/app/idle-lock.ts): said under the title,
  // until the next entry. The server cannot know it: its render, and the first one here, say nothing.
  const closedByClock = useSyncExternalStore(noChange, () => idleClock.wasClosed(), () => false)
  // A sign-in refused because the address is not confirmed yet: its link can be sent again.
  const [unconfirmed, setUnconfirmed] = useState(false)

  // Arriving here signed out: a key left on the device belongs to nobody who
  // can use it, so it goes (an expired session, another account's leftovers).
  useEffect(() => {
    // What this tab kept between screens goes as the page opens, whatever the
    // session says: reached without a full page load, then « Retour », it would
    // bring back the previous person's screens.
    forgetEverything()
    void (async () => {
      try {
        const { data } = await createBrowserSupabase().auth.getSession()
        if (!data.session) await indexedDbKeyStore().clear()
      } catch {
        // Nothing to do about it here: signing in replaces the key anyway.
      }
    })()
  }, [])

  // A device that cannot is offered nothing, and nothing is asked of Supabase.
  useEffect(() => {
    let live = true
    void browserWebAuthn.supported().then((supported) => {
      if (live && supported) setLabel(faceIdLabel(navigator))
    })
    return () => {
      live = false
    }
  }, [])

  // Back from the link of the confirmation e-mail (planche 4): Supabase adds a code to the address
  // when it confirmed it, an error when the link was too old. The page says which, then takes it
  // out of the address, so a reload or a bookmark does not say it again.
  // In the browser that signed up, Supabase turns that code into a session as the client starts
  // (the PKCE flow): its address is the one just confirmed, and fills the field when it is still
  // empty, so only the password is left to type. The code stays in the address until Supabase has
  // read it. Elsewhere, the code cannot be used, there is no session, and the field stays empty.
  // Nothing is sent that Supabase's own client would not have sent anyway.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const confirmed = params.has('code')
    const next = confirmed
      ? CONFIRMED
      : params.has('error_code') || params.has('error') || hash.has('error_code')
        ? LINK_EXPIRED
        : null
    if (next === null) return
    let live = true
    void (async () => {
      let address: string | undefined
      if (confirmed) {
        try {
          const { data } = await createBrowserSupabase().auth.getSession()
          address = data.session?.user.email
        } catch {
          // The message is said all the same: the address is confirmed, whatever happened here.
        }
      }
      window.history.replaceState(null, '', window.location.pathname)
      // Said once the page is drawn, like the Face ID answer below: never during the first render,
      // which the server made without an address to read.
      await Promise.resolve()
      if (!live) return
      setArrival(next)
      if (address) setEmail((typed) => typed || address)
    })()
    return () => {
      live = false
    }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    setUnconfirmed(false)
    try {
      // The password is turned into two secrets here, in the browser: one
      // signs in, the other opens the vault. Neither is the password.
      const result = await signIn(createBrowserSupabase(), indexedDbKeyStore(), { email, password })
      accountHere.set()
      idleClock.start(Date.now())
      if (result.status !== 'unlocked') {
        // Kept in memory only, for the next screen to show once.
        setPendingRecovery(result.recoveryDisplay, result.status === 'renewed-recovery')
        router.replace('/cle-de-secours')
      } else if (label !== null && offersFaceId(result.faceId)) {
        setOffer({ label, material: result.faceId })
      } else {
        router.replace('/')
      }
    } catch (failure) {
      setError(signInErrorMessage(failure))
      setUnconfirmed(failure instanceof EmailNotConfirmedError)
      setBusy(false)
    }
  }

  if (offer) {
    return <FaceIdOffer label={offer.label} material={offer.material} onLeave={() => router.replace('/')} />
  }

  return (
    <>
      <h1 className="text-title font-semibold leading-tight tracking-[-0.01em]">Te connecter</h1>
      {arrival || closedByClock ? (
        <p role="status" className="mt-4 border-l-2 border-ink pl-3 text-body leading-relaxed text-ink">
          {arrival || IDLE_CLOSED_SENTENCE}
        </p>
      ) : null}

      {/* After a third of a second the form gives its place to the wait, but stays mounted: a refusal
          brings it back as it was. */}
      <WaitCover active={busy} phase="open">
        <form onSubmit={submit} className="mt-8 flex flex-col gap-5">
          <TextField
            label="Ton adresse e-mail"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <TextField
            label="Ton mot de passe"
            type="password"
            autoComplete="current-password"
            required
            revealable
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error ? (
            <p role="alert" className="text-body font-semibold leading-normal text-ink">
              {error}
            </p>
          ) : null}
          {/* The keys are derived here, on the device, in a second or more: the pill stays full and says so. */}
          <Button type="submit" aria-busy={busy} aria-disabled={busy} className="mt-2">
            {busy ? 'Ouverture de ton coffre…' : 'Me connecter'}
          </Button>
        </form>
      </WaitCover>
      {unconfirmed && email ? (
        <div className="mt-4">
          <ResendConfirmation email={email} />
        </div>
      ) : null}

      <div className="mt-6 flex flex-col items-start gap-1">
        <Link href="/mot-de-passe-oublie" className={LINK}>
          Mot de passe oublié&nbsp;?
        </Link>
        {label ? (
          <FaceIdSignIn
            label={label}
            className={LINK}
            onSignedIn={() => {
              accountHere.set()
              idleClock.start(Date.now())
              router.replace('/')
            }}
          />
        ) : null}
        <Link href="/inscription" className={LINK}>
          Créer mon compte
        </Link>
      </div>
    </>
  )
}
