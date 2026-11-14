'use client'

// Copying or correcting the total paid in on one account at one relevé (planche 10D,
// docs/superpowers/specs/2026-11-14-total-verse-design.md): the update's box, opened on that relevé's
// own total, with the total of the relevé before recalled under it. Only that relevé is written: the
// two periods around it follow by themselves. At save, the plan is made again on the state re-read
// then, and refused if that total moved meanwhile.

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { BACK } from '@/components/line/LineSheet'
import { FormActions } from '@/components/setup/FormActions'
import { Button } from '@/components/ui/Button'
import { PageColumns } from '@/components/ui/PageColumns'
import { FindCorner } from '@/components/ui/FindLink'
import { TabBar } from '@/components/ui/TabBar'
import { useMenuFromModel } from '@/components/ui/use-menu-from-model'
import { VaultWait, WaitCover } from '@/components/ui/VaultWait'
import { PaidTotalField } from '@/components/update/PaidTotalField'
import { useModel, type ModelState } from '@/lib/app/use-model'
import { saveCorrection } from '@/lib/correct/save'
import type { Cents } from '@/lib/model/types'
import { todayIso } from '@/lib/dates'
import { EVOLUTION_LOAD_FAILED, EVOLUTION_RETRY, EVOLUTION_TITLE } from '@/lib/screens/evolution-words'
import { outcomeSentence, RESUME, SAVE } from '@/lib/screens/line-words'
import { correctedHref, planPaidTotal, statementTotalView, statementView, type StatementTotalView } from '@/lib/screens/statement'
import { LOCKED_UPDATE_TOTAL } from '@/lib/screens/statement-words'

const TITLE = 'pt-2 text-title font-semibold leading-tight tracking-[-0.01em]'
const TEXT_LINK = 'self-start text-body text-ink underline underline-offset-4'

type Ready = Extract<ModelState, { status: 'ready' }>
type ReadyView = Extract<StatementTotalView, { kind: 'ready' }>

export default function StatementTotalPage() {
  const state = useModel()
  const { id, accountId } = useParams<{ id: string; accountId: string }>()
  useMenuFromModel(state)
  return (
    <>
      {state.status === 'ready' ? (
        <ReadyBody state={state} snapshotId={id} accountId={accountId} />
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

function ReadyBody({ state, snapshotId, accountId }: { state: Ready; snapshotId: string; accountId: string }) {
  const router = useRouter()
  const today = todayIso()
  const view = statementTotalView(state.model, snapshotId, accountId, today)
  // An account the relevé's page shows no total for has no screen: back to the relevé (which itself
  // goes back to Évolution when it has no page).
  const hasPage = statementView(state.model, snapshotId, today).kind === 'ready'
  useEffect(() => {
    if (view.kind === 'none') router.replace(hasPage ? `/releve/${snapshotId}` : '/evolution')
  }, [view.kind, hasPage, router, snapshotId])
  if (view.kind === 'none') return null
  return (
    <PageColumns aside={null}>
      <TotalCorrection state={state} view={view} />
    </PageColumns>
  )
}

function TotalCorrection({ state, view }: { state: Ready; view: ReadyView }) {
  const router = useRouter()
  const { client, dataKey, reload } = state
  const { snapshotId, account } = view
  const [cents, setCents] = useState<Cents | null>(view.current)
  // What was typed cannot be read: its error is under the box, and the save waits for a figure.
  const [readable, setReadable] = useState(true)
  const [said, setSaid] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!readable || saving) return
    // Nothing changed: nothing to write, and nothing « Corrigé ». Back to the relevé as it was.
    if (cents === view.current) {
      router.replace(view.back.href)
      return
    }
    setSaid(null)
    setSaving(true)
    let outcome: Awaited<ReturnType<typeof saveCorrection>> | 'failed'
    try {
      // A past relevé may be corrected while an update runs, never its base; the latest relevé is
      // refused outright during an update, as for a line.
      outcome = await saveCorrection(
        client,
        dataKey,
        (s) => planPaidTotal(s, snapshotId, account.id, view.current, cents),
        view.isLatest ? {} : { pastOnly: true },
      )
    } catch {
      outcome = 'failed'
    }
    if (outcome === 'saved') {
      reload()
      // replace, not push: the back button must not reopen this screen.
      router.replace(correctedHref(snapshotId))
      return
    }
    setSaid(outcome === 'update-running' ? LOCKED_UPDATE_TOTAL : outcomeSentence(outcome))
    reload()
    setSaving(false)
  }

  const back = (
    <FindCorner>
      <Link href={view.back.href} className={BACK}>
        ‹ {view.back.label}
      </Link>
    </FindCorner>
  )

  if (view.locked) {
    return (
      <div className="flex flex-col">
        {back}
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
        {back}
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <h1 className={TITLE}>{view.title}</h1>
          <PaidTotalField
            account={account}
            previous={view.previous}
            cents={cents}
            onValue={setCents}
            onReadable={setReadable}
          />
          <FormActions submitLabel={SAVE} busy={saving} saveError={said} onCancel={() => router.replace(view.back.href)} />
        </form>
      </div>
    </WaitCover>
  )
}
