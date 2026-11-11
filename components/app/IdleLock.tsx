'use client'

import { useEffect } from 'react'
import { signOut } from '@/lib/auth/account'
import { idleClock, shouldClose } from '@/lib/app/idle-lock'
import { loadPage } from '@/lib/navigation'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import { indexedDbKeyStore } from '@/lib/vault/device'

// The clock of the vault (lib/app/idle-lock.ts), on every screen of the application. What counts as
// something done: a touch, a click, a key, the wheel. The time is written at most every few seconds,
// and read when the screen opens, when it comes back to the front, and every few seconds.
const WRITE_EVERY_MS = 5_000
const CHECK_EVERY_MS = 15_000
const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

export function IdleLock() {
  useEffect(() => {
    let closing = false
    let written = 0
    // Still on a screen of the application. Once the key is gone, the application may already have
    // moved to /connexion by itself (lib/vault/use-vault.ts): loading that page again a moment later
    // would empty a form the person has started to fill.
    let here = true

    async function close() {
      if (closing) return
      closing = true
      idleClock.markClosed()
      // The same sign-out as « Se déconnecter »: the key first, then the session. A failure changes
      // nothing here: the full page load to /connexion forgets this page's memory, and the sign-in
      // page clears a key left without a session.
      await signOut(createBrowserSupabase(), indexedDbKeyStore()).catch(() => {})
      if (here) loadPage('/connexion')
    }

    function check() {
      if (shouldClose(idleClock.last(), Date.now())) void close()
    }

    function act() {
      const now = Date.now()
      // Something done after the limit does not open the vault again: the check comes first.
      if (shouldClose(idleClock.last(), now)) {
        void close()
        return
      }
      if (now - written < WRITE_EVERY_MS) return
      written = now
      idleClock.touch(now)
    }

    function front() {
      if (document.visibilityState === 'visible') check()
    }

    // Opening a screen: a time left long ago closes the vault at once; no time at all starts it.
    if (idleClock.last() === null) idleClock.touch(Date.now())
    else check()

    for (const event of ACTIVITY) window.addEventListener(event, act, { capture: true, passive: true })
    document.addEventListener('visibilitychange', front)
    const timer = window.setInterval(check, CHECK_EVERY_MS)
    return () => {
      here = false
      for (const event of ACTIVITY) window.removeEventListener(event, act, { capture: true })
      document.removeEventListener('visibilitychange', front)
      window.clearInterval(timer)
    }
  }, [])

  return null
}
