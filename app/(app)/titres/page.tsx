'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { TitleFind } from '@/components/market/TitleFind'
import { FILL } from '@/components/money/HundredSquares'
import { SMALL_LINK } from '@/components/setup/styles'
import { Button } from '@/components/ui/Button'
import { PageColumns } from '@/components/ui/PageColumns'
import { FindCorner } from '@/components/ui/FindLink'
import { TabBar } from '@/components/ui/TabBar'
import { useMenuFromModel } from '@/components/ui/use-menu-from-model'
import { VaultWait } from '@/components/ui/VaultWait'
import { useModel, type ModelState } from '@/lib/app/use-model'
import { setUnquoted } from '@/lib/correct/profile-changes'
import { todayIso } from '@/lib/dates'
import { useMarket } from '@/lib/market/use-market'
import { isStale } from '@/lib/update/draft'
import {
  attachSymbol,
  titlesBack,
  titlesPageView,
  titleSymbols,
  type StripSquare,
  type TitlesPageView,
} from '@/lib/screens/titles'
import { saveTitleChange, type TitlesSave } from '@/lib/screens/titles-save'
import { HIDE, SHOW, TO_FIND_TITLE, UNQUOTED, CHANGE } from '@/lib/screens/titles-words'
import { FIND, NOTHING_TO_FOLLOW, SAVE_FAILED, TITLES, TITLES_INTRO, UNREADABLE_PROFILE, UPDATE_RUNNING } from '@/lib/screens/words'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const BACK = `inline-flex min-h-11 items-center self-start text-body text-ink-soft ${FOCUS}`
const TITLE = 'pt-2 text-title font-semibold leading-tight tracking-[-0.01em]'
const SENTENCE = 'text-body leading-relaxed text-ink'
const FOLD = `flex min-h-13 w-full items-center justify-between gap-3 border-t border-hairline text-left ${FOCUS}`
// The 8 px square of a title still to find: an outline in the colour of the text, empty inside.
const OUTLINE_SQUARE = 'size-square-s shrink-0 rounded-square border border-ink'

type Ready = Extract<ModelState, { status: 'ready' }>
type Titles = Extract<TitlesPageView, { kind: 'titles' }>

export default function TitlesPage() {
  const state = useModel()
  useMenuFromModel(state)
  // Back to the screen it was opened from (Mon argent, a category, a line's fiche, the Repères), by its name.
  const back = titlesBack(useSearchParams().get('depuis'), state.status === 'ready' ? (state.model.profile?.value ?? null) : null)
  return (
    <>
      <PageColumns
        aside={
          <>
            <FindCorner>
              <Link href={back.href} className={BACK}>
                ‹ {back.label}
              </Link>
            </FindCorner>
            <h1 className={TITLE}>{TITLES}</h1>
          </>
        }
      >
      {state.status === 'loading' ? <VaultWait phase="open" /> : null}
      {state.status === 'ready' ? <ReadyBody state={state} /> : null}
      {state.status === 'failed' || state.status === 'unavailable' ? (
        <div className="mt-4 flex flex-col gap-4">
          <p role="alert" className={SENTENCE}>
            Tes chiffres n’ont pas pu être chargés.
          </p>
          <Button variant="secondary" onClick={state.retry}>
            Réessayer
          </Button>
        </div>
      ) : null}
      </PageColumns>
      <TabBar current="mon-argent" />
    </>
  )
}

// Where the focus goes once the page has drawn the change: `key` names an element (« find:<line> »,
// « lead », the first row of a group), `until` waits for the titles to find to have moved.
type Pending = { key: string; until?: (toFind: string[]) => boolean }

function ReadyBody({ state }: { state: Ready }) {
  const { model, client, dataKey, reload } = state
  const symbols = titleSymbols(model.profile?.value ?? null)
  const market = useMarket(symbols, { rates: symbols.length > 0 })
  const view = titlesPageView(model, market.status === 'ready' ? market.market : 'loading', todayIso())

  const [searching, setSearching] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [open, setOpen] = useState({ followed: false, unquoted: false })
  // The elements a focus can go to carry `data-focus`; they are looked up once drawn.
  const root = useRef<HTMLDivElement>(null)
  const pending = useRef<Pending | null>(null)
  const toFindIds = view.kind === 'titles' ? view.toFind.map((r) => r.lineId) : []

  useEffect(() => {
    const wanted = pending.current
    if (wanted === null || (wanted.until && !wanted.until(toFindIds))) return
    const element = root.current?.querySelector<HTMLElement>(`[data-focus="${wanted.key}"]`)
    if (!element) return
    element.focus()
    pending.current = null
  })

  if (view.kind === 'unreadable') {
    return (
      <p role="alert" className={`mt-4 ${SENTENCE}`}>
        {UNREADABLE_PROFILE}
      </p>
    )
  }
  if (view.kind === 'none') {
    return (
      <div className="mt-2 flex flex-col gap-3">
        <p className="text-body leading-relaxed text-ink-soft">{TITLES_INTRO}</p>
        <p className={SENTENCE}>{NOTHING_TO_FOLLOW}</p>
      </div>
    )
  }
  // An update in progress writes the profile at « Enregistrer »: nothing is attached meanwhile.
  const latest = model.snapshots[model.snapshots.length - 1]
  const updateRunning =
    model.unreadable.draft > 0 || (model.draft !== null && (latest === undefined || !isStale(model.draft.value, latest.id)))
  const off = updateRunning || busy

  async function write(change: Parameters<typeof saveTitleChange>[2]): Promise<boolean> {
    setBusy(true)
    setSaid(null)
    let outcome: TitlesSave | 'failed'
    try {
      outcome = await saveTitleChange(client, dataKey, change)
    } catch {
      outcome = 'failed'
    }
    setBusy(false)
    if (outcome === 'saved') {
      setSearching(null)
      reload()
      return true
    }
    // The button touched was off while it saved, and lost the focus: it goes to what is said.
    pending.current = { key: 'said' }
    setSaid(outcome === 'update-running' ? UPDATE_RUNNING : outcome === 'unreadable' ? UNREADABLE_PROFILE : SAVE_FAILED)
    return false
  }

  // A row leaves « À retrouver » (« Pas coté », « C’est bien lui »): the focus goes to the next row's
  // « Le retrouver » (the one before, for the last row), or to the lead when none is left.
  function leaving(lineId: string) {
    const ids = toFindIds
    const at = ids.indexOf(lineId)
    const next = ids[at + 1] ?? ids[at - 1]
    pending.current = { key: next ? `find:${next}` : 'lead', until: (now) => !now.includes(lineId) }
  }

  function unquote(lineId: string) {
    leaving(lineId)
    void write((p) => setUnquoted(p, lineId, true))
  }

  function attach(lineId: string, symbol: string) {
    leaving(lineId)
    void write((p) => attachSymbol(p, lineId, symbol))
  }

  // « Changer »: the line goes back to « À retrouver », and the focus with it.
  function requote(lineId: string) {
    pending.current = { key: `find:${lineId}`, until: (now) => now.includes(lineId) }
    void write((p) => setUnquoted(p, lineId, false))
  }

  function toggle(group: 'followed' | 'unquoted') {
    const opening = !open[group]
    setOpen({ ...open, [group]: opening })
    pending.current = opening ? { key: `${group}:first` } : null
  }

  return (
    <div ref={root} className="mt-2 flex flex-col gap-3">
      <p data-focus="lead" tabIndex={-1} className={`${SENTENCE} ${FOCUS}`}>
        {view.lead}
      </p>
      <Strip squares={view.strip} />
      {updateRunning ? (
        <p role="status" className={SENTENCE}>
          {UPDATE_RUNNING}
        </p>
      ) : null}
      {said ? (
        <p role="alert" data-focus="said" tabIndex={-1} className={`${SENTENCE} ${FOCUS}`}>
          {said}
        </p>
      ) : null}

      {view.toFind.length > 0 ? (
        <section className="mt-3 flex flex-col">
          <h2 className="text-body font-medium text-ink">{TO_FIND_TITLE}</h2>
          <ul aria-label={TO_FIND_TITLE} className="flex flex-col divide-y divide-hairline">
            {view.toFind.map((row) => (
              <li key={row.lineId} className="flex flex-col gap-3 py-3">
                <div>
                  <p className="flex items-center gap-2 text-body text-ink">
                    <span aria-hidden="true" className={OUTLINE_SQUARE} />
                    {row.name}
                  </p>
                  <p className="text-caption text-ink-muted">{row.caption}</p>
                </div>
                {searching === row.lineId ? (
                  <TitleFind
                    title={row}
                    busy={busy}
                    onAttach={(symbol) => attach(row.lineId, symbol)}
                    onClose={() => {
                      setSearching(null)
                      setSaid(null)
                    }}
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <Button
                      data-focus={`find:${row.lineId}`}
                      variant="secondary"
                      fit
                      disabled={off}
                      aria-label={row.findLabel}
                      onClick={() => {
                        setSaid(null)
                        setSearching(row.lineId)
                      }}
                    >
                      {FIND}
                    </Button>
                    <button
                      type="button"
                      className={SMALL_LINK}
                      disabled={off}
                      aria-label={row.unquotedLabel}
                      onClick={() => unquote(row.lineId)}
                    >
                      {UNQUOTED}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view.followed || view.unquoted ? (
        <div className="mt-3 flex flex-col border-b border-hairline">
          {view.followed ? (
            <Fold summary={view.followed.summary} fill={FILL.markets} open={open.followed} onToggle={() => toggle('followed')}>
              {view.followed.rows.map((row, i) => (
                <li key={row.lineId}>
                  <Link
                    data-focus={i === 0 ? 'followed:first' : undefined}
                    href={row.href}
                    className={`flex min-h-13 items-center justify-between gap-3 py-2 ${FOCUS}`}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="text-body text-ink">{row.name}</span>
                      <span className="text-caption text-ink-muted">{row.detail}</span>
                    </span>
                    <span aria-hidden="true" className="text-body text-ink-muted">
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </Fold>
          ) : null}
          {view.unquoted ? (
            <Fold summary={view.unquoted.summary} fill="bg-ink-muted" open={open.unquoted} onToggle={() => toggle('unquoted')}>
              {view.unquoted.rows.map((row, i) => (
                <li key={row.lineId} className="flex min-h-13 items-center justify-between gap-3">
                  <span className="text-body text-ink">{row.name}</span>
                  <button
                    data-focus={i === 0 ? 'unquoted:first' : undefined}
                    type="button"
                    className={SMALL_LINK}
                    disabled={off}
                    aria-label={row.changeLabel}
                    onClick={() => requote(row.lineId)}
                  >
                    {CHANGE}
                  </button>
                </li>
              ))}
            </Fold>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// One square per title, for the eye only: the lead says the same in words.
function Strip({ squares }: { squares: Titles['strip'] }) {
  return (
    <div data-strip aria-hidden="true" className="flex flex-wrap gap-[3px]">
      {squares.map((square: StripSquare) => (
        <span
          key={square.lineId}
          data-state={square.state}
          className={
            square.state === 'followed'
              ? `size-square-s rounded-square ${FILL[square.category]}`
              : square.state === 'unquoted'
                ? 'size-square-s rounded-square bg-ink-muted'
                : OUTLINE_SQUARE
          }
        />
      ))}
    </div>
  )
}

// A group folded under one row: its count, and « Voir » to show it in place.
function Fold({
  summary,
  fill,
  open,
  onToggle,
  children,
}: {
  summary: string
  fill: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <>
      <button type="button" className={FOLD} aria-expanded={open} onClick={onToggle}>
        <span className="flex items-center gap-2 text-body text-ink">
          <span aria-hidden="true" className={`size-square-s shrink-0 rounded-square ${fill}`} />
          {summary}
        </span>
        <span className="text-body text-ink-soft">{open ? HIDE : SHOW}</span>
      </button>
      {open ? <ul className="flex flex-col divide-y divide-hairline">{children}</ul> : null}
    </>
  )
}
