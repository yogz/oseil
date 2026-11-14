'use client'

// The page of one relevé (docs/superpowers/specs/2026-11-12-corriger-un-releve-design.md, planche 8C):
// that day's total, what a square was worth, and its lines by bank, each opening its correction.
// A reading: no field, no progress, no « suivant ». Everything it says comes from statementView.

import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BACK } from '@/components/line/LineSheet'
import { FILL } from '@/components/money/HundredSquares'
import { Button } from '@/components/ui/Button'
import { PageColumns } from '@/components/ui/PageColumns'
import { FindCorner } from '@/components/ui/FindLink'
import { TabBar } from '@/components/ui/TabBar'
import { useMenuFromModel } from '@/components/ui/use-menu-from-model'
import { VaultWait } from '@/components/ui/VaultWait'
import { useModel, type ModelState } from '@/lib/app/use-model'
import { todayIso } from '@/lib/dates'
import { EVOLUTION_LOAD_FAILED, EVOLUTION_RETRY, EVOLUTION_TITLE } from '@/lib/screens/evolution-words'
import { CORRECTED_PARAM, statementView } from '@/lib/screens/statement'
import { STATEMENT_CORRECTED } from '@/lib/screens/statement-words'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const TITLE = 'pt-2 text-title font-semibold leading-tight tracking-[-0.01em]'
// Back to « Tes relevés », where this page was opened from.
const BACK_HREF = '/evolution#releves'

type Ready = Extract<ModelState, { status: 'ready' }>

export default function StatementPage() {
  const state = useModel()
  const { id } = useParams<{ id: string }>()
  useMenuFromModel(state)
  return (
    <>
      {state.status === 'ready' ? (
        <ReadyBody state={state} snapshotId={id} />
      ) : (
        <FindCorner>
          <Link href={BACK_HREF} className={BACK}>
            ‹ {EVOLUTION_TITLE}
          </Link>
        </FindCorner>
      )}
      {state.status === 'loading' ? <VaultWait phase="open" /> : null}
      {state.status === 'failed' || state.status === 'unavailable' ? (
        <div className="mt-4 flex flex-col gap-4">
          <p role="alert" className="text-body leading-relaxed text-ink">
            {EVOLUTION_LOAD_FAILED}
          </p>
          <Button variant="secondary" onClick={state.retry}>
            {EVOLUTION_RETRY}
          </Button>
        </div>
      ) : null}
      <TabBar current="evolution" />
    </>
  )
}

function ReadyBody({ state, snapshotId }: { state: Ready; snapshotId: string }) {
  const router = useRouter()
  const view = statementView(state.model, snapshotId, todayIso())
  // « Corrigé… » in place of the lead: read once from the address, which then forgets it, so the
  // next visit (a reload included) shows the lead again.
  const asked = useSearchParams().get(CORRECTED_PARAM) === '1'
  const [corrected] = useState(asked)
  useEffect(() => {
    if (asked) router.replace(`/releve/${snapshotId}`)
  }, [asked, router, snapshotId])
  // A relevé the list does not show has no page.
  useEffect(() => {
    if (view.kind === 'none') router.replace('/evolution')
  }, [view.kind, router])
  if (view.kind === 'none') return null

  // On a computer, the title and the total on the left, the lines on the right, as on every screen.
  return (
    <PageColumns
      aside={
        <>
          <FindCorner>
            <Link href={BACK_HREF} className={BACK}>
              ‹ {EVOLUTION_TITLE}
            </Link>
          </FindCorner>
          <h1 className={TITLE}>{view.title}</h1>
          <p data-testid="statement-total" className="mt-2 text-hero font-semibold leading-tight hero-figure text-ink">
            {view.total}
          </p>
          {view.squareValue ? <p className="text-caption text-ink-muted">{view.squareValue}</p> : null}
          <p className="mt-3 text-body leading-relaxed text-ink-soft">{corrected ? STATEMENT_CORRECTED : view.lead}</p>
        </>
      }
    >
      {view.banks.map((bank) => (
        <section key={bank.name} aria-label={bank.name} className="mt-6 flex flex-col lg:first:mt-0">
          <h2 className="pb-1 text-subtitle font-semibold">{bank.name}</h2>
          <ul className="flex flex-col">
            {bank.lines.map((line) => (
              <li key={line.lineId} className="border-t border-hairline">
                <Link href={line.href} className={`flex min-h-13 items-center justify-between gap-3 py-3 text-body ${FOCUS}`}>
                  <span className="flex items-center">
                    {/* The square of its category, as in the lists; a loan has none. */}
                    {line.category ? (
                      <span
                        aria-hidden="true"
                        data-category={line.category}
                        className={`mr-2 inline-block size-square-s shrink-0 rounded-square ${FILL[line.category]}`}
                      />
                    ) : null}
                    {line.name}
                  </span>
                  <span className="flex items-center gap-3">
                    {/* A figure of a list: dotted, as everywhere. */}
                    <span className="underline decoration-dotted underline-offset-4 tabular-nums">{line.figure}</span>
                    <span aria-hidden="true">›</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </PageColumns>
  )
}
