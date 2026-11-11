'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { FILL, HundredSquares } from '@/components/money/HundredSquares'
import { Alert, Blocked, LoadFailed } from '@/components/setup/Notices'
import { useSubmit } from '@/components/setup/useSubmit'
import { BACK } from '@/components/setup/styles'
import { Button } from '@/components/ui/Button'
import { VaultWait } from '@/components/ui/VaultWait'
import { CATEGORIES } from '@/lib/catalog'
import { formatEuros } from '@/lib/format'
import { computeSituation } from '@/lib/model/situation'
import { buildGrid } from '@/lib/model/squares'
import { excludedSentences, noGridSentence, POSITIVE_ONLY } from '@/lib/screens/mon-argent'
import { completeFirstLaunch, launchComplete, reopenStep, steps, type SetupDraft } from '@/lib/setup/first-launch'
import { UNREADABLE, useFirstLaunch } from '@/lib/setup/use-first-launch'

type Apply = (change: (draft: SetupDraft | null) => SetupDraft) => Promise<boolean>

export default function RevelationPage() {
  const first = useFirstLaunch()
  if (first.status === 'blocked') return <Blocked message={UNREADABLE} retry={first.retry} />
  if (first.status === 'failed') return <LoadFailed retry={first.retry} />
  if (first.status === 'loading') return <VaultWait phase="open" />
  if (first.status !== 'ready') return null
  return <Reveal draft={first.draft} apply={first.apply} saveError={first.saveError} />
}

const squaresWord = (n: number) => `${n} carré${n > 1 ? 's' : ''}`

function Reveal({ draft, apply, saveError }: { draft: SetupDraft | null; apply: Apply; saveError: string | null }) {
  const router = useRouter()
  const { busy, run } = useSubmit()
  const reopening = useSubmit()

  // Reached before the last bank is finished: back to the steps.
  const all = draft ? steps(draft.profile) : []
  const finished = draft?.profile.firstLaunch?.finished ?? []
  const unfinished = draft === null || all.length === 0 || all.some((e) => !finished.includes(e.id))
  useEffect(() => {
    if (unfinished) router.replace('/premier-lancement/etape')
  }, [unfinished, router])
  if (draft === null || unfinished) return null

  let situation
  try {
    situation = computeSituation(draft.profile, draft.snapshot)
  } catch (error) {
    console.error(error)
    return <Alert>Tes chiffres ne s’additionnent pas encore&nbsp;: reviens à tes banques pour les vérifier.</Alert>
  }
  const grid = buildGrid(situation)
  const excluded = grid.kind === 'grid' ? excludedSentences(situation, grid) : []
  // The spending comes next, then the goals (docs/superpowers/specs/2026-11-11-coussin-objectif-design.md):
  // the goals screen says itself when there is nothing to split.
  const next = '/premier-lancement/depenses'

  const proceed = () =>
    run(async () => {
      const ok = await apply((d) => {
        if (!d) throw new Error('No draft to complete')
        return completeFirstLaunch(d)
      })
      if (ok) router.push(next)
      return ok
    })

  // The last step opened again; once the first launch is complete, the steps are closed.
  const last = all[all.length - 1]
  const canCorrect = !launchComplete(draft.profile)
  const correct = () =>
    reopening.run(async () => {
      const ok = await apply((d) => {
        if (!d) throw new Error('No draft to reopen')
        return reopenStep(d, last.id)
      })
      if (ok) router.replace('/premier-lancement/etape')
      return ok
    })

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-end">
        <button
          type="button"
          disabled={busy || reopening.busy}
          className={`${BACK} self-auto disabled:opacity-50`}
          onClick={() => router.push('/')}
        >
          Plus tard
        </button>
      </div>
      <h1 className="text-center text-title font-semibold leading-tight tracking-[-0.01em]">
        Voilà ton argent
        <br />
        en 100 carrés
      </h1>

      {grid.kind === 'grid' ? (
        <>
          <div className="mx-auto mt-6 w-60">
            <HundredSquares
              animate
              label="Ta grille de cent carrés"
              squares={grid.categories.map((c) => ({ category: c.category, count: c.squares }))}
            />
          </div>
          <p className="mt-6 text-center text-body leading-relaxed text-ink-soft">
            {`Ce qui est vraiment à toi\u00A0: ${formatEuros(situation.net)}.`}
          </p>
          <p className="text-center text-body leading-relaxed text-ink-soft">
            {`Un carré vaut ${formatEuros(Math.round(grid.squareValue))}.`}
          </p>
          <ul className="mt-6 flex flex-col">
            {grid.categories.map((c) => (
              <li key={c.category} className="flex min-h-11 items-center justify-between border-b border-hairline text-body">
                <span className="flex items-center gap-3 text-ink">
                  <span aria-hidden="true" className={`size-3.5 rounded-square ${FILL[c.category]}`} />
                  {CATEGORIES[c.category].label}
                </span>
                <span className="text-ink-muted">{squaresWord(c.squares)}</span>
              </li>
            ))}
          </ul>
          {/* A category with no square, or one pocket of Immobilier under its loans. */}
          {excluded.map((item) => (
            <p key={item.sentence} className="mt-3 text-caption leading-relaxed text-ink-muted">
              {item.sentence}
            </p>
          ))}
          {excluded.length > 0 ? (
            <p className="mt-3 text-caption leading-relaxed text-ink-soft">{POSITIVE_ONLY}</p>
          ) : null}
        </>
      ) : (
        <p className="mt-6 text-body leading-relaxed text-ink-soft">{noGridSentence(situation)}</p>
      )}

      <div className="mt-8 flex flex-col gap-3">
        <Button disabled={busy || reopening.busy} onClick={proceed}>
          Continuer
        </Button>
        {canCorrect ? (
          <Button variant="secondary" disabled={busy || reopening.busy} onClick={correct}>
            Revenir corriger
          </Button>
        ) : null}
        {saveError ? <Alert>{saveError}</Alert> : null}
      </div>
    </div>
  )
}
