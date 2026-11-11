'use client'

import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CloseFlow } from '@/components/line/CloseFlow'
import { BoardLeft } from '@/components/money/BoardLeft'
import { DeleteFlow } from '@/components/line/DeleteFlow'
import { FiguresEdit } from '@/components/line/FiguresEdit'
import { GroupEdit } from '@/components/line/GroupEdit'
import { FinancedEdit } from '@/components/line/FinancedEdit'
import { BACK, LineSheet, type Editing } from '@/components/line/LineSheet'
import { NameEdit } from '@/components/line/NameEdit'
import { PlaceEdit } from '@/components/line/PlaceEdit'
import { ResidenceEdit } from '@/components/line/ResidenceEdit'
import { SlowEdit } from '@/components/line/SlowEdit'
import { PurchaseEdit } from '@/components/line/PurchaseEdit'
import { UnlockYearEdit } from '@/components/line/UnlockYearEdit'
import { Button } from '@/components/ui/Button'
import { PageColumns } from '@/components/ui/PageColumns'
import { TabBar } from '@/components/ui/TabBar'
import { useMenuFromModel } from '@/components/ui/use-menu-from-model'
import { VaultWait } from '@/components/ui/VaultWait'
import { useModel, type ModelState } from '@/lib/app/use-model'
import { saveCorrection, type CorrectionState } from '@/lib/correct/save'
import { fileLine, placeChoices, renameLine, setFinanced, setGroups, setPurchase, setResidence, setSlow, setUnlockYear } from '@/lib/correct/profile-changes'
import {
  closeLine,
  closingBounds,
  closingRewrites,
  correctFigures,
  deleteLine,
  finishClosing,
  reopenLine,
  sameEntry,
} from '@/lib/correct/snapshot-changes'
import type { Planned } from '@/lib/correct/types'
import { todayIso } from '@/lib/dates'
import { isRanged } from '@/lib/catalog'
import { quotedSymbols } from '@/lib/market/live'
import { useMarket } from '@/lib/market/use-market'
import { lineSheetView } from '@/lib/screens/line-sheet'
import { monArgentView } from '@/lib/screens/mon-argent'
import { useIsDesktop } from '@/lib/app/use-desktop'
import { outcomeSentence } from '@/lib/screens/line-words'
import { SAVE_FAILED } from '@/lib/screens/words'

type Ready = Extract<ModelState, { status: 'ready' }>

export default function LinePage() {
  const state = useModel()
  const { id } = useParams<{ id: string }>()
  useMenuFromModel(state)

  return (
    <>
      {state.status === 'ready' ? (
        <ReadyBody state={state} lineId={id} />
      ) : (
        <Link href="/" className={BACK}>
          ‹ Mon argent
        </Link>
      )}
      {state.status === 'loading' ? <VaultWait phase="open" /> : null}

      {state.status === 'failed' || state.status === 'unavailable' ? (
        <div className="mt-4 flex flex-col gap-4">
          <p role="alert" className="text-body leading-relaxed text-ink">
            Tes chiffres n’ont pas pu être chargés.
          </p>
          <Button variant="secondary" onClick={state.retry}>
            Réessayer
          </Button>
        </div>
      ) : null}

      <TabBar current="mon-argent" />
    </>
  )
}

function ReadyBody({ state, lineId }: { state: Ready; lineId: string }) {
  const router = useRouter()
  const today = todayIso()
  const { profile, snapshots } = state.model
  const symbols = profile && snapshots.length > 0 ? quotedSymbols(profile.value, snapshots[snapshots.length - 1].value) : []
  const market = useMarket(symbols, { rates: symbols.length > 0 })
  // The same prices as « Mon argent »; nothing is drawn until they are known (8 s at most).
  const view = lineSheetView(state.model, lineId, today, market.status === 'ready' ? market.market : null)

  // B6: on a computer the fiche sits where its category's detail sat, Mon argent's grid on its left
  // with the line's category lit: opening a line from its category moves nothing.
  const desktop = useIsDesktop()
  const home = desktop && market.status === 'ready' ? monArgentView(state.model, today, market.market) : null
  const board = home?.kind === 'board' && home.grid.kind === 'grid' ? home : null

  useEffect(() => {
    if (view === null) router.replace('/')
  }, [view, router])

  if (market.status === 'loading') return <VaultWait phase="prices" />
  if (view === null) return null
  return (
    <PageColumns aside={board ? <BoardLeft board={board} lit={view.category ?? undefined} /> : null}>
      <Sheet state={state} view={view} />
    </PageColumns>
  )
}

function Sheet({ state, view }: { state: Ready; view: NonNullable<ReturnType<typeof lineSheetView>> }) {
  const router = useRouter()
  const today = todayIso()
  const { client, dataKey, reload, model } = state
  const profile = model.profile!.value
  const lineId = view.lineId
  const entry = model.snapshots[model.snapshots.length - 1].value.entries.find((e) => e.lineId === lineId)
  // `?modifier=prix-moyen` (from « prix d’achat manquant » in its category): the fiche opens on its
  // figures, the average price ready to type in. Only a line in parts has one; any other opens as usual.
  const asked = useSearchParams().get('modifier') === 'prix-moyen'
  const askedPrice = asked && entry?.kind === 'units'
  const [editing, setEditing] = useState<Editing>(askedPrice ? 'figures' : null)
  // Once read, the request leaves the address: a reload, or « Ses parts… » touched again, opens as usual.
  useEffect(() => {
    if (asked) router.replace(`/ligne/${lineId}`)
  }, [asked, router, lineId])
  const [said, setSaid] = useState<string | null>(null)

  // Re-read, plan, write, and say what happened. Resolves true once saved. `then`: what follows a
  // success; 'leave' when the line is no longer in the latest snapshot (deleted, or closed with its
  // snapshots rewritten): it has no fiche left to reload, so it goes back to its category at once.
  // Any other answer reads the model again, the sentence kept on screen: a write cut short shows
  // what was really stored (a close cut short is then unfinished, with « Terminer »).
  async function write(plan: (current: CorrectionState) => Planned, then: 'reload' | 'leave' = 'reload'): Promise<boolean> {
    setSaid(null)
    let outcome: Awaited<ReturnType<typeof saveCorrection>> | 'failed'
    try {
      outcome = await saveCorrection(client, dataKey, plan)
    } catch {
      outcome = 'failed'
    }
    if (outcome === 'saved') {
      if (then === 'leave') router.replace(view.back.href)
      else reload()
      setEditing(null)
      return true
    }
    setSaid(outcomeSentence(outcome))
    reload()
    return false
  }

  // Every plan looks the line up in the state re-read at save time, never in what is on screen.
  const profileWrite = (change: (p: typeof profile, reRead: (typeof profile)['lines'][number]) => typeof profile) =>
    write((s) => {
      const reRead = s.profile.value.lines.find((l) => l.id === lineId)
      if (!reRead) return { refused: 'not-held' }
      return { writes: [{ kind: 'profile', value: change(s.profile.value, reRead) }] }
    })

  function leave() {
    setSaid(null)
    setEditing(null)
  }
  // A closed line's « Ce n’était pas fermé » and an interrupted close's « Terminer » are one tap, no form.
  function open(next: Editing) {
    setSaid(null)
    if (next === 'close' && view.state.kind === 'closed') {
      void write((s) => reopenLine(s.profile.value, s.snapshots, lineId))
    } else if (next === 'close' && view.state.kind === 'closing-unfinished') {
      void write((s) => finishClosing(s.profile.value, s.snapshots, lineId), 'leave')
    } else {
      setEditing(next)
    }
  }

  const line = profile.lines.find((l) => l.id === lineId)!
  const accountId = line.accountId
  const figuresRow = view.rows.find((r) => r.kind === 'figures')
  const homes = profile.lines
    .filter((l) => l.closedOn === undefined && profile.accounts.find((a) => a.id === l.accountId)?.type === 'home')
    .map((l) => ({ id: l.id, name: l.name }))
  const unlock = view.rows.find((r) => r.kind === 'unlock')
  const slow = view.rows.find((r) => r.kind === 'slow')
  const residence = view.rows.find((r) => r.kind === 'residence')
  const group = view.rows.find((r) => r.kind === 'group')
  const purchase = view.rows.find((r) => r.kind === 'purchase')

  const bounds = closingBounds(model.snapshots, lineId, today)

  let form = null
  if (view.locked === null) {
    if (editing === 'close' && view.state.kind === 'open' && bounds) {
      form = (
        <CloseFlow
          label={view.close.label}
          bounds={bounds}
          rewrites={(on) => closingRewrites(model.snapshots, lineId, on)}
          saveError={said}
          // A close that rewrites snapshots takes the line out of the latest one, as a deletion does.
          onClose={(on) =>
            write(
              (s) => closeLine(s.profile.value, s.snapshots, lineId, on, today),
              closingRewrites(model.snapshots, lineId, on) > 0 ? 'leave' : 'reload',
            )
          }
          onCancel={leave}
        />
      )
    } else if (editing === 'delete' && view.state.kind === 'open') {
      form = (
        <DeleteFlow
          canDelete={view.canDelete}
          saveError={said}
          onDelete={() => write((s) => deleteLine(s.profile.value, s.snapshots, lineId), 'leave')}
          onCancel={leave}
        />
      )
    } else if (editing === 'name') {
      form = <NameEdit name={view.name} saveError={said} onSave={(name) => profileWrite((p) => renameLine(p, lineId, name))} onCancel={leave} />
    } else if (editing === 'purchase' && purchase?.kind === 'purchase') {
      form = (
        <PurchaseEdit
          perEuro={purchase.perEuro}
          source={purchase.source}
          label={purchase.label}
          currency={purchase.currency}
          words={purchase.words}
          saveError={said}
          onSave={(next) => profileWrite((p) => setPurchase(p, lineId, next))}
          onCancel={leave}
        />
      )
    } else if (editing === 'unlock' && unlock?.kind === 'unlock') {
      form = (
        <UnlockYearEdit
          year={unlock.year}
          saveError={said}
          onSave={(year) => profileWrite((p, l) => setUnlockYear(p, l.accountId, year))}
          onCancel={leave}
        />
      )
    } else if (editing === 'slow' && slow?.kind === 'slow') {
      form = (
        <SlowEdit
          slow={slow.slow}
          saveError={said}
          onSave={(next) => profileWrite((p, l) => setSlow(p, l.accountId, next))}
          onCancel={leave}
        />
      )
    } else if (editing === 'residence' && residence?.kind === 'residence') {
      form = (
        <ResidenceEdit
          residence={residence.residence}
          saveError={said}
          onSave={(next) => profileWrite((p, l) => setResidence(p, l.accountId, next))}
          onCancel={leave}
        />
      )
    } else if (editing === 'group' && group?.kind === 'group' && view.category !== null && isRanged(view.category)) {
      form = (
        <GroupEdit
          label={group.label}
          category={view.category}
          group={group.group}
          saveError={said}
          onSave={(next) => profileWrite((p) => setGroups(p, [{ lineId, group: next }]))}
          onCancel={leave}
        />
      )
    } else if (editing === 'financed') {
      const current = profile.accounts.find((a) => a.id === accountId)?.financedLineId ?? null
      form = (
        <FinancedEdit
          homes={homes}
          current={current}
          saveError={said}
          onSave={(home) => profileWrite((p, l) => setFinanced(p, l.accountId, home))}
          onCancel={leave}
        />
      )
    } else if (editing === 'figures' && entry && figuresRow?.kind === 'figures') {
      form = (
        <FiguresEdit
          entry={entry}
          currency={line.currency}
          accountType={profile.accounts.find((a) => a.id === accountId)!.type}
          label={figuresRow.label}
          focusAverage={askedPrice}
          saveError={said}
          onSubmit={(figures) =>
            write((s) => {
              // The figures were typed over the reading on screen: one that changed meanwhile is left alone.
              const held = s.snapshots.at(-1)?.value.entries.find((e) => e.lineId === lineId)
              if (!held || !sameEntry(held, entry)) return { refused: 'not-held' }
              return { writes: correctFigures(s.snapshots, lineId, figures) }
            })
          }
          onCancel={leave}
        />
      )
    } else if (editing === 'place') {
      form = (
        <PlaceEdit
          choices={placeChoices(profile, lineId)}
          current={line.category ?? view.category ?? undefined}
          saveError={said}
          onSubmit={({ to, category }) => profileWrite((p) => fileLine(p, lineId, to, category))}
          onCancel={leave}
        />
      )
    }
  }

  return <LineSheet view={view} form={form} notice={
        view.state.kind === 'open' || (view.state.kind === 'closing-unfinished' && said === SAVE_FAILED) ? null : said
      } onEdit={open} />
}
