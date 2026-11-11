'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { RecoveryKey } from '@/components/account/RecoveryKey'
import { clearPendingRecovery, readPendingRecovery } from '@/lib/auth/pending-recovery'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import { confirmRecoveryKeySeen } from '@/lib/vault/store'

// Reached only from a sign-in that made a key (the first one, or a renewal of
// a key never confirmed), which leaves it in memory. Opened
// any other way — a reload, a bookmark, the back button — there is no key to
// show, and the person goes on to the home screen.
export default function RecoveryKeyPage() {
  const router = useRouter()
  // Read once, into this screen's state: from here on the key lives in the
  // screen alone, and the memory it came from is emptied when the screen goes.
  const [pending] = useState(readPendingRecovery)

  useEffect(() => {
    if (!pending) router.replace('/')
    return clearPendingRecovery
  }, [pending, router])

  if (!pending) return null

  return (
    <RecoveryKey
      display={pending.display}
      renewed={pending.renewed}
      onContinue={async () => {
        // A failure stays on this screen: the key must be confirmed, or the
        // next sign-in would renew it.
        await confirmRecoveryKeySeen(createBrowserSupabase(), pending.display)
        clearPendingRecovery()
        router.replace('/')
      }}
    />
  )
}
