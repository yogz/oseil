'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ResendConfirmation } from '@/components/account/ResendConfirmation'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { WaitCover } from '@/components/ui/VaultWait'
import { signUp } from '@/lib/auth/account'
import { accountHere } from '@/lib/auth/account-here'
import { idleClock } from '@/lib/app/idle-lock'
import { signUpErrorMessage, signUpFieldErrors } from '@/lib/auth/messages'
import { createBrowserSupabase } from '@/lib/supabase/browser'

const LINK =
  'inline-flex min-h-11 items-center text-body text-ink-soft underline decoration-rule-strong underline-offset-4 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const TITLE = 'text-title font-semibold leading-tight tracking-[-0.01em] focus:outline-none'

// The account screens were reviewed on planches with Nicolas on 10 November 2026 (planches 1 to 3):
// the contract is said before the commitment, the recovery key announced, both mistakes shown at
// once, and the screen that follows says where the link went and what comes next.
export default function SignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirmation?: string }>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError(null)
    const problems = signUpFieldErrors({ password, confirmation })
    setFieldErrors(problems)
    if (problems.password || problems.confirmation) return

    setBusy(true)
    try {
      // The confirmation link brings the person back to the sign-in screen;
      // the vault is created at that first sign-in.
      await signUp(createBrowserSupabase(), {
        email,
        password,
        redirectTo: `${window.location.origin}/connexion`,
      })
      accountHere.set()
      idleClock.start(Date.now())
      setSent(true)
    } catch (failure) {
      setError(signUpErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <LinkSent
        email={email}
        onCorrect={() => {
          // The address is kept to be corrected; the password is typed again.
          setPassword('')
          setConfirmation('')
          setFieldErrors({})
          setSent(false)
        }}
      />
    )
  }

  return (
    <>
      <h1 className={TITLE}>Créer ton compte</h1>
      <p className="mt-3 text-body leading-relaxed text-ink-soft">
        Ton mot de passe ne quitte jamais ton appareil&nbsp;: personne d’autre ne peut lire tes chiffres, pas même nous. À ta
        première connexion, on te remettra une clé de secours, pour tout retrouver si tu l’oublies.
      </p>

      {/* After a third of a second the form gives its place to the wait, but stays mounted: a refusal
          brings it back as it was. */}
      <WaitCover active={busy} phase="create">
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
            label="Choisis un mot de passe"
            type="password"
            autoComplete="new-password"
            required
            revealable
            hint="Au moins 10&nbsp;caractères."
            error={fieldErrors.password}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <TextField
            label="Confirme ton mot de passe"
            type="password"
            autoComplete="new-password"
            required
            revealable
            error={fieldErrors.confirmation}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          {error ? (
            <p role="alert" className="text-body font-semibold leading-normal text-ink">
              {error}
            </p>
          ) : null}
          {/* While the keys are derived (a second or more on a phone), the pill stays full and says so. */}
          <Button type="submit" aria-busy={busy} aria-disabled={busy} className="mt-2">
            {busy ? 'Création de ton coffre…' : 'Créer mon compte'}
          </Button>
        </form>
      </WaitCover>

      <p className="mt-4 text-caption leading-normal text-ink-muted">
        En créant ton compte, tu acceptes{' '}
        <Link
          href="/confidentialite"
          className="underline decoration-rule-strong underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          la façon dont Oseil traite tes données
        </Link>
        .
      </p>

      <div className="mt-4">
        <Link href="/connexion" className={LINK}>
          J’ai déjà un compte
        </Link>
      </div>
    </>
  )
}

// Planche 3: the address recalled, what comes next, the spam folder, a resend and two ways out.
function LinkSent({ email, onCorrect }: { email: string; onCorrect: () => void }) {
  const title = useRef<HTMLHeadingElement>(null)

  // The form is gone: VoiceOver starts again from the title of what replaced it.
  useEffect(() => title.current?.focus(), [])

  return (
    <>
      <h1 ref={title} tabIndex={-1} className={TITLE}>
        Plus qu’une étape
      </h1>
      <p className="mt-4 text-body leading-relaxed text-ink-soft">
        On vient d’écrire à <strong className="font-semibold break-all text-ink">{email}</strong>. Touche le lien de cet
        e-mail pour confirmer ton adresse, puis connecte-toi&nbsp;: on te remettra ta clé de secours. Prévois de quoi la
        noter.
      </p>
      <p className="mt-3 text-caption leading-normal text-ink-muted">
        Rien reçu&nbsp;? Regarde dans les indésirables, ou vérifie l’adresse.
      </p>

      <div className="mt-6">
        <ResendConfirmation email={email} />
      </div>

      <div className="mt-4 flex flex-col items-start gap-1">
        <button type="button" onClick={onCorrect} className={LINK}>
          Corriger mon adresse
        </button>
        <Link href="/connexion" className={LINK}>
          J’ai confirmé, me connecter
        </Link>
      </div>
    </>
  )
}
