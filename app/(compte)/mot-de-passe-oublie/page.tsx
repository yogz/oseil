'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { RECOVERY_FAILED } from '@/lib/auth/messages'
import { requestPasswordReset } from '@/lib/auth/recovery'
import { createRecoveryBrowserSupabase } from '@/lib/supabase/browser'

const LINK =
  'inline-flex min-h-11 items-center text-body text-ink-soft underline decoration-rule-strong underline-offset-4 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const outcome = await requestPasswordReset(createRecoveryBrowserSupabase(), {
      email,
      redirectTo: `${window.location.origin}/nouveau-mot-de-passe`,
    })
    // The same sentence whether or not the address has an account.
    if (outcome === 'sent') setSent(true)
    else setError(RECOVERY_FAILED)
    setBusy(false)
  }

  return (
    <>
      <h1 className="text-title font-semibold leading-tight tracking-[-0.01em]">Mot de passe oublié</h1>
      <p className="mt-3 text-body leading-relaxed text-ink-soft">
        On t’envoie un lien pour en choisir un nouveau. Pour retrouver tes chiffres, il te faudra aussi ta clé de
        secours.
      </p>

      {sent ? (
        <p role="status" className="mt-8 text-body leading-relaxed text-ink">
          Si un compte existe pour cette adresse, un lien vient de partir. Pense à regarder dans les indésirables.
        </p>
      ) : (
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
          {error ? (
            <p role="alert" className="text-body font-medium leading-normal text-ink">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy} aria-busy={busy} className="mt-2">
            Envoyer le lien
          </Button>
        </form>
      )}

      <div className="mt-6">
        <Link href="/connexion" className={LINK}>
          Retour à la connexion
        </Link>
      </div>
    </>
  )
}
