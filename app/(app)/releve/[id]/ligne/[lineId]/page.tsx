'use client'

// Correcting one line at one relevé (docs/superpowers/specs/2026-11-12-corriger-un-releve-design.md,
// planche 8D): the fiche's figures form, dated with that relevé. As the figures are typed, the screen
// says what a dry run of the correction would write (correctionPreview); at save, the correction is
// planned again on the state re-read then, and refused if it would write anything else.

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { FiguresEdit } from '@/components/line/FiguresEdit'
import { BACK } from '@/components/line/LineSheet'
import { Button } from '@/components/ui/Button'
import { PageColumns } from '@/components/ui/PageColumns'
import { FindCorner } from '@/components/ui/FindLink'
import { TabBar } from '@/components/ui/TabBar'
import { useMenuFromModel } from '@/components/ui/use-menu-from-model'
import { VaultWait, WaitCover } from '@/components/ui/VaultWait'
import { useModel, type ModelState } from '@/lib/app/use-model'
import { saveCorrection } from '@/lib/correct/save'
import { correctFiguresAt, sameEntry } from '@/lib/correct/snapshot-changes'
import type { Figures, Planned } from '@/lib/correct/types'
import { todayIso } from '@/lib/dates'
import { EVOLUTION_LOAD_FAILED, EVOLUTION_RETRY, EVOLUTION_TITLE } from '@/lib/screens/evolution-words'
import { AMOUNT_LABEL, outcomeSentence, RESUME } from '@/lib/screens/line-words'
import { correctedHref, correctionPreview, statementLineView, type StatementLineView } from '@/lib/screens/statement'

const TITLE = 'pt-2 text-title font-semibold leading-tight tracking-[-0.01em]'
const SOFT = 'text-body leading-relaxed text-ink-soft'
const TEXT_LINK = 'self-start text-body text-ink underline underline-offset-4'

type Ready = Extract<ModelState, { status: 'ready' }>
type ReadyView = Extract<StatementLineView, { kind: 'ready' }>

export default function StatementLinePage() {
  const state = useModel()
  const { id, lineId } = useParams<{ id: string; lineId: string }>()
  useMenuFromModel(state)
  return (
    <>
      {state.status === 'ready' ? (
        <ReadyBody state={state} snapshotId={id} lineId={lineId} />
      ) : (
        // The relevé's date is not known yet: the link says Évolution, and goes there.
        <FindCorner>
          <Link href="/evolution#releves" className={BACK}>
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

function ReadyBody({ state, snapshotId, lineId }: { state: Ready; snapshotId: string; lineId: string }) {
  const router = useRouter()
  const view = statementLineView(state.model, snapshotId, lineId, todayIso())
  // A line this relevé's page does not show has no correction: back to the relevé (which itself
  // goes back to Évolution when it has no page).
  useEffect(() => {
    if (view.kind === 'none') router.replace(`/releve/${snapshotId}`)
  }, [view.kind, router, snapshotId])
  if (view.kind === 'none') return null
  return (
    <PageColumns aside={null}>
      <Correction state={state} view={view} />
    </PageColumns>
  )
}

function Correction({ state, view }: { state: Ready; view: ReadyView }) {
  const router = useRouter()
  const { client, dataKey, reload, model } = state
  const { snapshotId, lineId } = view
  const [said, setSaid] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // A tap on figures the preview refuses: the refusal then sits by the button.
  const [tapped, setTapped] = useState(false)

  // What a dry run says of the figures typed, on the model on screen.
  const preview = (figures: Figures) => correctionPreview(model, snapshotId, lineId, figures)

  async function submit(figures: Figures): Promise<boolean> {
    const announced = preview(figures)
    // The refusal is said under the fields; a tap moves it by the button, so it does something. It
    // stays one alert, and goes as soon as the figures no longer refuse (Notes reads them live).
    if ('refused' in announced) {
      setTapped(true)
      return false
    }
    setSaid(null)
    setSaving(true)
    // Planned again on the state re-read at save time: the same entry, and exactly the relevés
    // announced, or nothing (Review Focus 4). A save cut short wrote the farthest relevés first:
    // redone, the screen announces only those still to correct, and that is what is checked.
    const plan = (s: Parameters<Parameters<typeof saveCorrection>[2]>[0]): Planned => {
      const held = s.snapshots.find((x) => x.id === snapshotId)?.value.entries.find((e) => e.lineId === lineId)
      if (!held || !sameEntry(held, view.entry)) return { refused: 'not-held' }
      const isLatest = s.snapshots.at(-1)?.id === snapshotId
      if (isLatest && s.updateRunning) return { refused: 'not-held' }
      const result = correctFiguresAt(s.snapshots, snapshotId, lineId, figures, { latestLocked: s.updateRunning === true })
      if ('refused' in result) return { refused: 'not-held' }
      if (result.others !== announced.others || result.latestToo !== announced.latestToo) return { refused: 'not-held' }
      return { writes: result.writes }
    }
    let outcome: Awaited<ReturnType<typeof saveCorrection>> | 'failed'
    try {
      // A past relevé may be corrected while an update runs, never into its base; the latest relevé
      // is refused outright during an update, as on the fiche.
      outcome = await saveCorrection(client, dataKey, plan, view.isLatest ? {} : { pastOnly: true })
    } catch {
      outcome = 'failed'
    }
    if (outcome === 'saved') {
      reload()
      // replace, not push: the back button must not reopen this screen.
      router.replace(correctedHref(snapshotId))
      return true
    }
    setSaid(outcomeSentence(outcome))
    reload()
    setSaving(false)
    return false
  }

  if (view.locked) {
    return (
      <div className="flex flex-col">
        <FindCorner>
          <Link href={view.back.href} className={BACK}>
            ‹ {view.back.label}
          </Link>
        </FindCorner>
        <h1 className={TITLE}>{view.title}</h1>
        <div role="status" className="mt-4 flex flex-col gap-1 rounded-control bg-field px-4 py-3">
          <p className="text-body leading-relaxed text-ink">{view.locked.message}</p>
          {view.locked.kind === 'update-running' ? (
            <Link href="/mise-a-jour" className={TEXT_LINK}>
              {RESUME}
            </Link>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <WaitCover active={saving} phase="lock">
      <div className="flex flex-col">
        <FindCorner>
          <Link href={view.back.href} className={BACK}>
            ‹ {view.back.label}
          </Link>
        </FindCorner>
        <FiguresEdit
          entry={view.entry}
          currency={view.currency}
          accountType={view.accountType}
          label={AMOUNT_LABEL}
          title={view.title}
          labels={view.labels}
          submitLabel={view.submit}
          saveError={said}
          notes={(figures) => <Notes view={view} said={figures ? preview(figures) : null} tapped={tapped} />}
          onSubmit={submit}
          onCancel={() => router.replace(view.back.href)}
        />
      </div>
    </WaitCover>
  )
}

// Under « C’est une correction » : today’s figure, the other relevés corrected with this one, what an
// update in progress stops, and that this relevé is part of the history. A refusal takes the place of
// the figures' sentences, and the history stays. `tapped`: the button was touched on a refusal, which
// then comes last, by the button: the same single alert, moved.
function Notes({ view, said, tapped }: { view: ReadyView; said: ReturnType<typeof correctionPreview> | null; tapped: boolean }) {
  if (said && 'refused' in said) {
    const refusal = (
      <p role="alert" className="text-body leading-relaxed text-ink">
        {said.message}
      </p>
    )
    return (
      <>
        {tapped ? null : refusal}
        <p className={SOFT}>{view.history}</p>
        {tapped ? refusal : null}
      </>
    )
  }
  const today = said ? said.today : view.today
  return (
    <>
      {today ? <p className={SOFT}>{today}</p> : null}
      {said?.othersSentence ? <p className={SOFT}>{said.othersSentence}</p> : null}
      {said?.lockedNote ? <p className={SOFT}>{said.lockedNote}</p> : null}
      <p className={SOFT}>{view.history}</p>
    </>
  )
}
