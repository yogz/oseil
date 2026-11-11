'use client'

import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { NewPasswordForm } from '@/components/account/NewPasswordForm'
import { Button } from '@/components/ui/Button'
import { RECOVERY_FAILED } from '@/lib/auth/messages'
import { readRecoveryLink, type RecoveryTokens } from '@/lib/auth/recovery'
import { createBrowserSupabase } from '@/lib/supabase/browser'

const TITLE = 'text-title font-semibold leading-tight tracking-[-0.01em]'
const LINK =
  'inline-flex min-h-11 items-center self-start text-body text-ink-soft underline decoration-rule-strong underline-offset-4 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

type Arrival =
  | { status: 'opening' }
  | { status: 'ready'; user: { id: string; email: string } }
  | { status: 'spent' }
  | { status: 'unreachable' }

// Reached from the reset link (see lib/auth/recovery.ts): Supabase sends the
// person here with a recovery session in the address's fragment. The session
// is handed to the main client, which keeps it in cookies like any other —
// the person comes out of here signed in, with the new password.
export default function NewPasswordPage() {
  const [arrival, setArrival] = useState<Arrival>({ status: 'opening' })
  const [attempt, setAttempt] = useState(0)
  // The link's tokens, taken out of the address once and held here: the
  // address is cleaned at once, and React runs this effect twice in
  // development — the second run finds the address already clean.
  const link = useRef<RecoveryTokens | null | undefined>(undefined)

  useEffect(() => {
    if (link.current === undefined) {
      link.current = readRecoveryLink(window.location.hash)
      // Before any client reads the address: the tokens are neither left in
      // view nor kept by a bookmark or the history.
      if (window.location.hash) window.history.replaceState(null, '', window.location.pathname)
    }
    const tokens = link.current
    let cancelled = false

    async function open(): Promise<Arrival> {
      if (!tokens) return { status: 'spent' }
      const { data, error } = await createBrowserSupabase().auth.setSession(tokens)
      // Offline, or the server busy: the tokens may still be good.
      if (error && isAuthRetryableFetchError(error)) return { status: 'unreachable' }
      if (error || !data.user?.email) return { status: 'spent' }
      return { status: 'ready', user: { id: data.user.id, email: data.user.email } }
    }

    void open()
      .catch((): Arrival => ({ status: 'unreachable' }))
      .then((next) => {
        if (!cancelled) setArrival(next)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (arrival.status === 'ready') return <NewPasswordForm client={createBrowserSupabase()} user={arrival.user} />

  return (
    <>
      <h1 className={TITLE}>Nouveau mot de passe</h1>

      {arrival.status === 'spent' ? (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-body leading-relaxed text-ink-soft">Ce lien a expiré ou a déjà servi.</p>
          <Link href="/mot-de-passe-oublie" className={LINK}>
            Recevoir un nouveau lien
          </Link>
        </div>
      ) : null}

      {arrival.status === 'unreachable' ? (
        <div className="mt-4 flex flex-col gap-4">
          <p role="alert" className="text-body leading-relaxed text-ink">
            {RECOVERY_FAILED}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setArrival({ status: 'opening' })
              setAttempt((count) => count + 1)
            }}
          >
            Réessayer
          </Button>
        </div>
      ) : null}
    </>
  )
}
