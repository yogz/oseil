'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { BankStep } from '@/components/update/BankStep'
import { useUpdateScreen } from '@/components/update/UpdateProvider'
import { WayOut } from '@/components/update/WayOut'
import { VaultWait } from '@/components/ui/VaultWait'
import { steps } from '@/lib/setup/first-launch'

// One establishment of the update. While it loads, « Un instant… »; any other state than
// ready (blocked, failed, unreadable) is said on the start screen, which is also
// where an update with no establishment on screen goes back to.
export default function BankPage() {
  const router = useRouter()
  const { state, current } = useUpdateScreen()
  const away = state.status !== 'loading' && (state.status !== 'ready' || current === null)

  useEffect(() => {
    if (away) router.replace('/mise-a-jour')
  }, [away, router])

  if (state.status === 'loading') return <WayOut><VaultWait phase="open" /></WayOut>
  if (state.status !== 'ready' || current === null) return null
  const all = steps(state.session.profile)
  const index = all.findIndex((e) => e.id === current.id)
  return (
    <BankStep
      key={current.id}
      establishment={current}
      step={{ index, total: all.length }}
      previousId={index > 0 ? all[index - 1].id : null}
      next={all[index + 1] ?? null}
    />
  )
}
