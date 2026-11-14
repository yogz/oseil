'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { BoardLeft } from '@/components/money/BoardLeft'
import { DisplayModeProvider } from '@/components/money/DisplayMode'
import { Button } from '@/components/ui/Button'
import { PageColumns } from '@/components/ui/PageColumns'
import { FindCorner } from '@/components/ui/FindLink'
import { TabBar } from '@/components/ui/TabBar'
import { useMenuFromModel } from '@/components/ui/use-menu-from-model'
import { VaultWait, WaitCover } from '@/components/ui/VaultWait'
import { useIsDesktop } from '@/lib/app/use-desktop'
import { useModel, type ModelState } from '@/lib/app/use-model'
import { CATEGORIES, isRanged, type RangedCategory } from '@/lib/catalog'
import { todayIso } from '@/lib/dates'
import { monArgentView } from '@/lib/screens/mon-argent'
import { saveCorrection } from '@/lib/correct/save'
import { setGroups } from '@/lib/correct/profile-changes'
import { outcomeSentence } from '@/lib/screens/line-words'
import { rangingView } from '@/lib/screens/ranging'
import type { CategoryId, GroupId } from '@/lib/model/types'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const BACK = `inline-flex min-h-11 items-center self-start text-body text-ink-soft ${FOCUS}`
const PILL = `min-h-11 max-w-1/2 shrink-0 rounded-full border bg-transparent px-4 text-subtitle ${FOCUS}`

type Ready = Extract<ModelState, { status: 'ready' }>

export default function RangerPage() {
  const state = useModel()
  const { id } = useParams<{ id: string }>()
  useMenuFromModel(state)
  // While loading, the way back already names the category, known from the route.
  const back = isRanged(id as CategoryId)
    ? { href: `/categorie/${id}`, label: `‹ ${CATEGORIES[id as CategoryId].label}` }
    : { href: '/', label: '‹ Mon argent' }

  return (
    <>
      {state.status === 'loading' ? <VaultWait phase="open" /> : null}
      {state.status === 'ready' ? (
        isRanged(id as CategoryId) && state.model.profile ? (
          <Ranging state={state} category={id as RangedCategory} />
        ) : (
          <Nothing href="/" label="‹ Mon argent" />
        )
      ) : (
        <FindCorner>
          <Link href={back.href} className={BACK}>
            {back.label}
          </Link>
        </FindCorner>
      )}

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

function Nothing({ href, label }: { href: string; label: string }) {
  return (
    <PageColumns aside={null}>
      <div className="flex flex-col">
        <FindCorner>
          <Link href={href} className={BACK}>
            {label}
          </Link>
        </FindCorner>
        <p className="mt-4 text-body leading-relaxed text-ink-soft">Rien à ranger ici.</p>
      </div>
    </PageColumns>
  )
}

function Ranging({ state, category }: { state: Ready; category: RangedCategory }) {
  const router = useRouter()
  const { client, dataKey, reload, model } = state
  const view = rangingView(model.profile!.value, category)
  const [picked, setPicked] = useState<Record<string, GroupId>>({})
  const [saving, setSaving] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  // From lg: Mon argent's grid stays on the left, as on the category page (nothing without one).
  const desktop = useIsDesktop()
  const home = desktop ? monArgentView(model, todayIso()) : null
  const board = home?.kind === 'board' && home.grid.kind === 'grid' ? home : null

  if (view.rows.length === 0) return <Nothing href={view.back.href} label={view.back.label} />

  const choices = view.rows.map((row) => ({ lineId: row.lineId, group: picked[row.lineId] ?? row.chosen }))

  async function validate() {
    setSaving(true)
    setSaid(null)
    let outcome: Awaited<ReturnType<typeof saveCorrection>> | 'failed'
    try {
      // The plan is applied to the profile re-read at save time, never to what is on screen.
      outcome = await saveCorrection(client, dataKey, (s) => ({
        writes: [{ kind: 'profile', value: setGroups(s.profile.value, choices) }],
      }))
    } catch {
      outcome = 'failed'
    }
    if (outcome === 'saved') {
      reload()
      // replace, not push: the back button must not reopen this screen.
      router.replace(view.back.href)
      return
    }
    setSaid(outcomeSentence(outcome))
    reload()
    setSaving(false)
  }

  const nameOf = (row: { name: string }) => (category === 'markets' ? `Zone de ${row.name}` : `Type de ${row.name}`)

  return (
    <DisplayModeProvider state={state}>
      <PageColumns aside={board ? <BoardLeft board={board} lit={category} /> : null}>
        <WaitCover active={saving} phase="lock">
          <div className="flex flex-col">
            <FindCorner>
              <Link href={view.back.href} className={BACK}>
                {view.back.label}
              </Link>
            </FindCorner>
            <h1 className="pt-2 text-title font-semibold leading-tight tracking-[-0.01em]">{view.title}</h1>
            <p className="mt-1 text-body leading-relaxed text-ink-soft">{view.intro}</p>

            <ul className="mt-4 flex flex-col divide-y divide-hairline">
              {view.rows.map((row) => {
                const value = picked[row.lineId] ?? row.chosen
                const caption = row.reason && picked[row.lineId] === undefined ? `${row.where} · ${row.reason}` : row.where
                const captionId = `caption-${row.lineId}`
                return (
                  <li key={row.lineId} className="flex items-center gap-3 py-3">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body text-ink">{row.name}</span>
                      <span id={captionId} className="text-caption text-ink-muted">
                        {caption}
                      </span>
                    </div>
                    <select
                      aria-label={nameOf(row)}
                      aria-describedby={captionId}
                      value={value}
                      onChange={(event) => setPicked((current) => ({ ...current, [row.lineId]: event.target.value as GroupId }))}
                      className={`${PILL} ${value === 'unknown' ? 'border-dashed border-rule-strong text-ink-muted' : 'border-rule-strong text-ink'}`}
                    >
                      {view.options.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </li>
                )
              })}
            </ul>

            {said ? (
              <p role="alert" className="mt-4 text-body leading-relaxed text-ink">
                {said}
              </p>
            ) : null}
            <div className="mt-6">
              <Button disabled={saving} onClick={() => void validate()}>
                {view.rows.length === 1 ? 'Valider ce choix' : `Valider ces ${view.rows.length}\u00a0choix`}
              </Button>
            </div>
          </div>
        </WaitCover>
      </PageColumns>
    </DisplayModeProvider>
  )
}
