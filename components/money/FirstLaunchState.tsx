'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import type { Entered, MonArgentView } from '@/lib/screens/mon-argent'

export type FirstLaunchView = Extract<MonArgentView, { kind: 'first-launch' | 'resume' | 'reveal-pending' }>

export const isFirstLaunchView = (view: MonArgentView): view is FirstLaunchView =>
  view.kind === 'first-launch' || view.kind === 'resume' || view.kind === 'reveal-pending'

const PILL_LINK =
  'inline-flex min-h-11 items-center self-start rounded-full border border-rule-strong bg-ink px-4 text-body font-semibold ' +
  'text-ground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const STATUS_WORDS = { done: 'fait', current: 'en cours', todo: 'à faire' } as const

// Until the first round is done, the three tabs say the same thing: where the person is, and
// « Continuer ». No grid, no net, no total, no curve: nothing that would read as an answer while
// banks are still missing. Mon argent, Repères and Évolution all draw this.
export function FirstLaunchState({ view }: { view: FirstLaunchView }) {
  if (view.kind === 'first-launch') return <ToWelcome />
  if (view.kind === 'reveal-pending') {
    return (
      <div className="mt-4 flex flex-col gap-4">
        <p className="text-body leading-relaxed text-ink">Ta grille est prête.</p>
        <LinkPill href="/premier-lancement/revelation">La voir</LinkPill>
      </div>
    )
  }
  return (
    <>
      <div className="mt-4 flex flex-col gap-4">
        <p className="text-body leading-relaxed text-ink">
          {view.onlyBanks
            ? `Il te reste ${view.remaining} ${view.remaining > 1 ? 'banques' : 'banque'} à ajouter`
            : `Il te reste ${view.remaining} ${view.remaining > 1 ? 'étapes' : 'étape'} avant ta grille`}
        </p>
        <LinkPill href="/premier-lancement/etape">Continuer</LinkPill>
      </div>
      <EnteredSoFar entered={view.entered} />
    </>
  )
}

// Nothing entered at all: the first launch begins at its welcome.
function ToWelcome() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/premier-lancement')
  }, [router])
  return null
}

function LinkPill({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className={PILL_LINK}>
      {children}
    </Link>
  )
}

// A first launch half done: what was typed in, step by step.
function EnteredSoFar({ entered }: { entered: Entered }) {
  return (
    <>
      {entered.map((group) => (
        <section key={group.id} className="mt-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="min-w-0 text-body font-medium text-ink-muted">{group.establishment}</h2>
            <p className="shrink-0 text-caption text-ink-muted">{STATUS_WORDS[group.status]}</p>
          </div>
          {group.accounts.length > 0 ? (
            <ul className="mt-1 flex flex-col divide-y divide-hairline">
              {group.accounts.map((account, i) => (
                <li key={`${account.name}-${i}`} className="flex min-h-11 items-center justify-between gap-3 text-body">
                  <span className="min-w-0 truncate text-ink">{account.name}</span>
                  <span className="shrink-0 tabular-nums text-ink-soft">{account.amount}</span>
                </li>
              ))}
            </ul>
          ) : group.status === 'done' ? (
            <p className="mt-1 text-body text-ink-muted">aucun compte</p>
          ) : null}
        </section>
      ))}
    </>
  )
}
