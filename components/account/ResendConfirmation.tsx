'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { resendConfirmation } from '@/lib/auth/account'
import { createBrowserSupabase } from '@/lib/supabase/browser'

// « Renvoyer l’e-mail »: the confirmation link once more, to the address typed (planche 3 of the
// account screens). Shown after the sign-up and when a sign-in meets an address not confirmed yet.
export function ResendConfirmation({ email }: { email: string }) {
  const [sending, setSending] = useState(false)
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null)

  async function resend() {
    if (sending) return
    setSending(true)
    setSaid(null)
    try {
      await resendConfirmation(createBrowserSupabase(), { email, redirectTo: `${window.location.origin}/connexion` })
      setSaid({ ok: true, text: 'C’est reparti. Regarde ta boîte mail dans quelques instants.' })
    } catch {
      // Most often the limit on how many e-mails can leave in a row.
      setSaid({ ok: false, text: 'L’e-mail n’a pas pu repartir. Réessaie dans une minute.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button variant="secondary" onClick={resend} aria-busy={sending} aria-disabled={sending}>
        {sending ? 'Envoi…' : 'Renvoyer l’e-mail'}
      </Button>
      {said ? (
        <p role={said.ok ? 'status' : 'alert'} className="text-body leading-normal text-ink">
          {said.text}
        </p>
      ) : null}
    </div>
  )
}
