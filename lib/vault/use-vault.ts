'use client'

// Opens the vault for a screen: the signed-in person's id, and their data key
// as this device keeps it. A session without the key on this device opens
// nothing — another browser, cleared site data, a failed first sign-in — so it
// is closed, and the person goes back to /connexion to type their password.
//
// Only an answer is acted on, never a hiccup. "No session" and "no key" are
// answers: the session is closed, which also wipes the device's keys. A
// session that cannot be refreshed for now, or a key store that fails to
// answer, are hiccups: everything is kept, and the screen offers to try again.
//
// A screen that comes after another one opens at once with the vault the tab
// opened last (lib/app/session-memory.ts), marked `recalled`, and checks it
// again all the same: the check's answer stands. A hiccup then keeps that
// vault on screen; "no session" or "no key" forgets everything the tab kept.

import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { forgetEverything, rememberVault, rememberedVault, vaultMark } from '@/lib/app/session-memory'
import { signOut } from '@/lib/auth/account'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import { indexedDbKeyStore } from './device'

export type VaultState =
  | { status: 'loading' }
  // `recalled`: remembered by the tab, not checked again yet.
  | { status: 'ready'; dataKey: CryptoKey; userId: string; recalled?: true }
  | { status: 'unavailable'; retry: () => void }

type Opened = { kind: 'ready'; dataKey: CryptoKey; userId: string } | { kind: 'absent' } | { kind: 'hiccup' }

export function useVault(): VaultState {
  const router = useRouter()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<VaultState>(() => {
    const remembered = rememberedVault()
    return remembered ? { status: 'ready', ...remembered, recalled: true } : { status: 'loading' }
  })

  useEffect(() => {
    let cancelled = false
    const client = createBrowserSupabase()
    const keys = indexedDbKeyStore()
    const mark = vaultMark()

    async function open(): Promise<Opened> {
      const { data, error } = await client.auth.getSession()
      // Offline, or the server busy: the session is still in storage.
      if (error && isAuthRetryableFetchError(error)) return { kind: 'hiccup' }
      const userId = data.session?.user.id
      if (!userId) return { kind: 'absent' }
      const dataKey = await keys.get(userId)
      return dataKey ? { kind: 'ready', dataKey, userId } : { kind: 'absent' }
    }

    async function settle() {
      const opened = await open().catch((): Opened => ({ kind: 'hiccup' }))
      if (cancelled) return

      if (opened.kind === 'ready') {
        rememberVault({ userId: opened.userId, dataKey: opened.dataKey }, mark)
        setState({ status: 'ready', dataKey: opened.dataKey, userId: opened.userId })
        return
      }
      if (opened.kind === 'hiccup') {
        // A vault already on screen stays there; a screen without one offers to try again.
        setState((shown) =>
          shown.status === 'ready'
            ? { status: 'ready', dataKey: shown.dataKey, userId: shown.userId }
            : {
                status: 'unavailable',
                retry: () => {
                  setState({ status: 'loading' })
                  setAttempt((count) => count + 1)
                },
              },
        )
        return
      }
      // Nothing of a session that is gone stays in the tab, nor on screen.
      forgetEverything()
      setState({ status: 'loading' })
      // signOut forgets the keys first, then may still fail to close a
      // session that is already dead: either way, the way out is /connexion.
      await signOut(client, keys).catch(() => {})
      if (cancelled) return
      router.replace('/connexion')
    }

    void settle()
    return () => {
      cancelled = true
    }
  }, [router, attempt])

  return state
}
