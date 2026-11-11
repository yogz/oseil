'use client'

import { useState, type ReactNode } from 'react'
import { DeviceKeyNotClearedError, signOut } from '@/lib/auth/account'
import { loadPage } from '@/lib/navigation'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import { indexedDbKeyStore } from '@/lib/vault/device'

const LINK =
  'inline-flex min-h-11 items-center underline decoration-rule-strong underline-offset-4 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

// A screen with « Se déconnecter » under it, signing out the same way wherever it
// is offered: the key on this device is forgotten first, then the session is
// closed, then a full page load to /connexion, so nothing this page holds in
// memory survives. If the key cannot be erased, that is said, and nothing else
// stays on screen: any link left there would be a client-side move that keeps
// the data key in memory. `after` comes below the link (the tab bar).
export function SignOutFrame({ title, after, children }: { title?: string; after?: ReactNode; children: ReactNode }) {
  const [leaving, setLeaving] = useState<'no' | 'yes' | 'key-kept'>('no')

  async function leave() {
    setLeaving('yes')
    try {
      await signOut(createBrowserSupabase(), indexedDbKeyStore())
    } catch (error) {
      // The session is closed but the key is still on the device: that is
      // said, not hidden behind an ordinary sign-out.
      if (error instanceof DeviceKeyNotClearedError) {
        setLeaving('key-kept')
        return
      }
      // Any other failure comes from a session that was already dead: the
      // key is gone, and there is nothing left to close.
    }
    loadPage('/connexion')
  }

  if (leaving === 'key-kept') {
    return (
      <>
        {title ? <h1 className="pt-2 text-title font-semibold leading-tight tracking-[-0.01em]">{title}</h1> : null}
        <p role="alert" className="mt-4 text-body leading-relaxed text-ink">
          Tu es bien déconnecté, mais cet appareil n’a pas pu tout oublier. Reconnecte-toi puis déconnecte-toi à nouveau.
        </p>
        {/* A full page load, so the key held in this page's memory goes too. */}
        <a href="/connexion" className={`${LINK} mt-2 self-start text-body text-ink-soft`}>
          Te connecter
        </a>
      </>
    )
  }

  return (
    <>
      {children}
      <div className="mt-auto pt-10">
        <button
          type="button"
          onClick={leave}
          disabled={leaving === 'yes'}
          className={`${LINK} text-body text-ink-muted disabled:opacity-40`}
        >
          Se déconnecter
        </button>
      </div>
      {after}
    </>
  )
}
