'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { AccountsStep } from '@/components/setup/AccountsStep'
import { TEXT_LINK } from '@/components/setup/styles'
import { Blocked, LoadFailed } from '@/components/setup/Notices'
import { VaultWait } from '@/components/ui/VaultWait'
import { launchComplete, steps, type SetupDraft } from '@/lib/setup/first-launch'
import { UNREADABLE, useFirstLaunch } from '@/lib/setup/use-first-launch'

type Apply = (change: (draft: SetupDraft | null) => SetupDraft) => Promise<boolean>

export default function StepPage() {
  const first = useFirstLaunch()

  if (first.status === 'blocked') return <Blocked message={UNREADABLE} retry={first.retry} />
  if (first.status === 'failed') return <LoadFailed retry={first.retry} />

  if (first.status === 'loading') return <VaultWait phase="open" />
  if (first.status !== 'ready') return null

  return <Steps draft={first.draft} apply={first.apply} saveError={first.saveError} />
}

// The first establishment not finished is the current step; none left goes on to the reveal.
function Steps({ draft, apply, saveError }: { draft: SetupDraft | null; apply: Apply; saveError: string | null }) {
  const router = useRouter()
  const all = draft ? steps(draft.profile) : []
  const finished = draft?.profile.firstLaunch?.finished ?? []
  const current = all.find((e) => !finished.includes(e.id))
  const done = draft !== null && all.length > 0 && current === undefined
  // Past the first launch, its steps are no longer the way to change anything.
  const past = launchComplete(draft?.profile ?? null)

  useEffect(() => {
    if (past) router.replace('/')
    else if (done) router.replace('/premier-lancement/revelation')
  }, [past, done, router])

  if (past) return null

  if (draft === null || all.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-body leading-relaxed text-ink">Dis-nous d’abord où est ton argent.</p>
        <Link href="/premier-lancement/ou" className={TEXT_LINK}>
          Choisir où est mon argent
        </Link>
      </div>
    )
  }
  if (!current) return null
  const index = all.indexOf(current)

  return (
    <AccountsStep
      key={current.id}
      draft={draft}
      apply={apply}
      saveError={saveError}
      establishment={current}
      step={{ index, total: all.length }}
      {...(index > 0 ? { previousId: all[index - 1].id } : {})}
    />
  )
}
