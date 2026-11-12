'use client'

import Link from 'next/link'
import { TEXT_LINK } from '@/components/setup/styles'
import { useCallback, useEffect, useState } from 'react'
import { BoardLeft } from '@/components/money/BoardLeft'
import { CategoryRow } from '@/components/money/CategoryRow'
import { DisplayModeProvider } from '@/components/money/DisplayMode'
import { FirstLaunchState } from '@/components/money/FirstLaunchState'
import { GlanceCards } from '@/components/money/GlanceCards'
import { GoalsHeadline, useGoalsSimulation } from '@/components/money/GoalsSimulation'
import { reminderOf, UpdateReminder } from '@/components/money/UpdateReminder'
import { Button } from '@/components/ui/Button'
import { GearIcon } from '@/components/ui/GearIcon'
import { TabBar } from '@/components/ui/TabBar'
import { useTopMenuInfo } from '@/components/ui/top-menu-info'
import { VaultWait } from '@/components/ui/VaultWait'
import { gridArrival, updateEcho } from '@/lib/app/arrival'
import { useOpenAfterDim, useSquareHint, useUpdateEcho } from '@/lib/app/board-motion'
import { squareHint } from '@/lib/app/square-hint'
import { echoLines } from '@/lib/screens/update-echo'
import { useIsDesktop } from '@/lib/app/use-desktop'
import { useModel, type ModelState } from '@/lib/app/use-model'
import { useReducedMotion } from '@/lib/app/use-reduced-motion'
import { todayIso } from '@/lib/dates'
import { quotedSymbols } from '@/lib/market/live'
import { useMarket } from '@/lib/market/use-market'
import { glanceOf, type Glance } from '@/lib/screens/glance'
import { OPEN_LINES, SHEET_OF } from '@/lib/screens/line-words'
import { SETTINGS_LINK } from '@/lib/screens/settings-words'
import { HINT, HINT_LINK, SQUARE_HINT_SENTENCE } from '@/lib/screens/words'
import type { Market } from '@/lib/market/types'
import type { CategoryId, IsoDate } from '@/lib/model/types'
import { monArgentView, type Board, type MonArgentView } from '@/lib/screens/mon-argent'
import { categoryDetailView, type CategoryDetailView } from '@/lib/screens/category-detail'
import { squareOwner, squareTold } from '@/lib/screens/grid-pick'

const TITLE = 'text-title font-semibold leading-tight tracking-[-0.01em]'
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const PILL = 'inline-flex min-h-11 items-center rounded-full border border-rule-strong px-4 text-body'
const SENTENCE = 'mt-4 text-body leading-relaxed text-ink'

type Ready = Extract<ModelState, { status: 'ready' }>

export default function HomePage() {
  const state = useModel()
  const today = todayIso()
  // The echo of an update just saved: taken as soon as Mon argent is reached, and forgotten at once,
  // whatever is shown (loading, an error, a first launch): it never waits for a later visit.
  const [echoAsked, setEchoAsked] = useState(() => updateEcho.due())
  useEffect(() => {
    updateEcho.done()
  }, [])
  const echoTaken = useCallback(() => setEchoAsked(false), [])
  // The view without prices is known as soon as the model is, so the header can say what « Mettre à jour » does.
  const base = state.status === 'ready' ? monArgentView(state.model, today) : null
  // Only a board has prices to ask for: the last saved snapshot's quoted lines.
  const symbols =
    state.status === 'ready' && base?.kind === 'board' && state.model.profile
      ? quotedSymbols(state.model.profile.value, state.model.snapshots[state.model.snapshots.length - 1].value)
      : []
  const market = useMarket(symbols, { rates: symbols.length > 0 })
  // The board waits for the prices (8 s at most, then the snapshot's own); nothing is drawn meanwhile.
  const waiting = base?.kind === 'board' && market.status === 'loading'
  const view =
    state.status === 'ready' && base?.kind === 'board' && market.status === 'ready'
      ? monArgentView(state.model, today, market.market)
      : base
  const update = base?.kind === 'board' ? base.update : null
  const reminderShown = state.status === 'ready' && view?.kind === 'board' && !waiting && update?.available === true
  // From lg the menu at the top carries « Mettre à jour »; the phone header keeps its own.
  useTopMenuInfo({ canUpdate: update === null ? null : update.available })

  return (
    <>
      {/* The title, « Mettre à jour » and the gear of the settings share a line (A4), so the grid below
          fits in the first screen. Known as soon as the model is: nothing pops in later. On a screen
          narrower than 360 px the line would not fit: the title is then only read aloud, the lit tab
          below says where one is. */}
      <div className="flex items-center gap-3">
        <h1 className={`${TITLE} whitespace-nowrap max-[22.5rem]:sr-only lg:sr-only`}>Mon argent</h1>
        {update?.available ? (
          <Link href="/mise-a-jour" className={`${PILL} ml-auto shrink-0 whitespace-nowrap text-ink lg:hidden ${FOCUS}`}>
            Mettre à jour
          </Link>
        ) : null}
        <Link
          href="/reglages"
          aria-label={SETTINGS_LINK}
          className={`-mr-2.5 inline-flex size-11 shrink-0 items-center justify-center text-ink-muted lg:hidden ${update?.available ? '' : 'ml-auto'} ${FOCUS}`}
        >
          <GearIcon className="size-5.5" />
        </Link>
      </div>
      {update?.pending ? (
        <p className="mt-2 text-caption text-ink-soft">
          Mise à jour en cours ·{' '}
          <Link
            href="/mise-a-jour"
            aria-label="Reprendre la mise à jour"
            className="inline-flex min-h-11 items-center font-semibold text-ink underline"
          >
            Reprendre
          </Link>
        </p>
      ) : null}

      {/* One wait at one place: the vault opening, then the prices, without starting again. */}
      {state.status === 'loading' || waiting ? <VaultWait phase={waiting ? 'prices' : 'open'} /> : null}
      {state.status === 'ready' && view && !waiting ? <ReadyBody state={state} view={view} market={market.status === 'ready' ? market.market : null} today={today} echoAsked={echoAsked} echoTaken={echoTaken} reminded={reminderShown} /> : null}
      {/* The reminder of an update after three months without one: only over a board that is ready, and
          only when an update can be made. */}
      {reminderShown && update ? (
        <UpdateReminder snapshots={state.model.snapshots} today={today} pending={update.pending} />
      ) : null}

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

function ReadyBody({
  state,
  view,
  market,
  today,
  echoAsked,
  echoTaken,
  reminded,
}: {
  state: Ready
  view: MonArgentView
  market: Market | null
  today: IsoDate
  echoAsked: boolean
  echoTaken: () => void
  // The reminder of an update may open over the board: the square hint then stays quiet.
  reminded: boolean
}) {
  const desktop = useIsDesktop()

  switch (view.kind) {
    case 'first-launch':
      return <FirstLaunchState view={view} />
    case 'unreadable-profile':
      return (
        <p role="alert" className={SENTENCE}>
          Ton profil n’a pas pu être lu sur cet appareil. Rien n’a été effacé.
        </p>
      )
    case 'error':
      return (
        <>
          <p role="alert" className={SENTENCE}>
            {view.reason === 'unreadable'
              ? 'Tes chiffres n’ont pas pu être lus sur cet appareil. Rien n’a été effacé.'
              : 'Un de tes chiffres n’a pas pu être calculé.'}
          </p>
          {/* A recount cut short: its fiche finishes it. */}
          {view.unfinished ? (
            <Link href={view.unfinished.href} className={TEXT_LINK}>
              {`Terminer le recompte de « ${view.unfinished.name} »`}
            </Link>
          ) : null}
        </>
      )
    case 'reveal-pending':
    case 'resume':
      return <FirstLaunchState view={view} />
    case 'board':
      return (
        <DisplayModeProvider state={state}>
          <BoardBody
            board={view}
            echoLines={
              echoAsked && state.model.profile
                ? echoLines(state.model.profile.value, state.model.snapshots[state.model.snapshots.length - 1].value)
                : null
            }
            echoTaken={echoTaken}
            // Read when the board appears, as the hint decides: the sheet opens at the same moment.
            reminded={reminded && reminderOf(state.model.snapshots, today) !== null}
            desktop={desktop}
            glance={desktop ? glanceOf(state.model, today, market) : null}
            detailOf={(category) => categoryDetailView(state.model, category, today, market)}
          />
        </DisplayModeProvider>
      )
  }
}

function BoardBody({
  board,
  echoLines: echoed,
  echoTaken,
  glance,
  desktop,
  detailOf,
  reminded,
}: {
  board: Board
  // The lines seen by the update just saved, when it left some banks aside (lib/screens/update-echo.ts);
  // null: no update just saved, or its echo already played on this visit.
  echoLines: string[] | null
  echoTaken: () => void
  glance: Glance | null
  desktop: boolean
  // A category's detail, for what a square under the mouse tells (its line's figure, as there).
  detailOf: (category: CategoryId) => CategoryDetailView | null
  // The reminder of an update opens over the board on this visit.
  reminded: boolean
}) {
  // The grid arrives each time the site is opened or reloaded, never when coming back from another
  // tab (lib/app/arrival.ts). Decided once, when the board appears.
  const [arrive] = useState(() => gridArrival.due())
  useEffect(() => {
    gridArrival.shown()
  }, [])
  // The category under the mouse: its row lights up, and so do its squares in the grid.
  const [hoveredRow, setHovered] = useState<CategoryId | null>(null)
  // The mouse only on a computer; a finger resting on a row, anywhere (planche 2).
  const hovered = desktop ? hoveredRow : null
  const [pressed, setPressed] = useState<CategoryId | null>(null)
  const simulation = useGoalsSimulation(board.goals?.simulation ?? null)
  const squares = board.grid.kind === 'grid' ? board.grid.categories : null
  // A square opens its category's detail, as its row does, on a computer and on a phone alike
  // (9 November 2026): the category lights, what is beside the grid (under it, on a phone) fades,
  // then the page changes. Not while the simulation is on screen, whose squares are not where
  // their lines are.
  const reduced = useReducedMotion()
  const [leaving, setLeaving] = useState<CategoryId | null>(null)
  useOpenAfterDim(leaving === null ? null : `/categorie/${leaving}`)
  const onSquare =
    squares && !simulation.active
      ? (index: number) => {
          const owner = squareOwner(squares, index)
          // Touched once: the hint never plays again on this device.
          squareHint.touched()
          if (owner) setLeaving((current) => current ?? owner.category)
        }
      : undefined
  // While the simulation is on screen, a lit row would dim simulated squares by their real category:
  // the grid would mix both. It is ignored until the real colours are back. A square on its way to
  // its detail wins over a row.
  const hinting = useSquareHint(squares, arrive, echoed !== null && echoed.length > 0, reduced, squareHint, reminded)
  // A square touched, a row under the finger or the mouse, or the simulation on screen, ends the hint.
  const hint = hinting !== null && leaving === null && pressed === null && hovered === null && !simulation.active ? hinting : null
  const lit = simulation.active ? null : (leaving ?? pressed ?? hovered ?? hint)
  // On a computer, the square under the mouse is told under the grid and its category's row takes
  // its hover look; the grid itself does not dim (9 November 2026). Nothing is told during the
  // simulation, whose squares are not where their lines are; the mouse is followed all the same, so
  // that a square it has left does not come back afterwards.
  const [hoveredSquare, setHoveredSquare] = useState<number | null>(null)
  const told =
    desktop && squares !== null && !simulation.active && hoveredSquare !== null ? squareTold(squares, hoveredSquare, detailOf) : null
  const echo = useUpdateEcho(squares, echoed, echoTaken, arrive, reduced)
  return (
    // The text arrives in the same short fade as the squares (A10): nothing pops in all at once.
    <div className="flex animate-board-in flex-col motion-reduce:animate-none">
      {/* Two columns from lg: the figures and the grid on the left, the list on the right. Both start
          at the same height (A5). */}
      <div data-columns="" className="mt-4 flex flex-col lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-14">
        <BoardLeft
          board={board}
          lit={lit ?? undefined}
          animate={arrive}
          echo={simulation.active ? undefined : echo}
          said={hint !== null ? SQUARE_HINT_SENTENCE : null}
          shown={simulation.grid}
          dateLabel={board.dateLabel}
          fit={!desktop}
          onSquare={onSquare}
          onSquareHover={desktop ? setHoveredSquare : undefined}
          told={told}
          progress
          after={
            board.titlesHint ? (
              // The link under its sentence, never a « · » left hanging at the end of a line (A3).
              <p className="mt-2 flex flex-col items-start text-caption text-ink-soft">
                <span>{HINT}.</span>
                <Link href="/titres" className="inline-flex min-h-11 items-center font-semibold text-ink underline">
                  {HINT_LINK}
                </Link>
              </p>
            ) : null
          }
        />
        <div
          className={`flex flex-col transition-opacity duration-(--motion-short) ease-(--motion-leave) motion-reduce:transition-none lg:[&>*:first-child]:mt-0 ${leaving ? 'pointer-events-none opacity-0' : ''}`}
        >
          {board.goals ? <GoalsHeadline goals={board.goals} simulation={simulation} /> : null}

          <ul className="mt-3 flex flex-col divide-y divide-hairline">
            {board.categories.map((row) => (
              <CategoryRow
                key={row.category}
                row={row}
                scale={board.goals?.scale ?? null}
                hovered={hovered === row.category || told?.category === row.category || hint === row.category}
                onHover={desktop ? setHovered : undefined}
                onPress={setPressed}
              />
            ))}
          </ul>

          {board.excluded.map((item) => (
            <p key={item.sentence} className="mt-3 text-caption leading-relaxed text-ink-muted">
              {item.sentence}
            </p>
          ))}
          {board.withoutSquares.length > 0 ? (
            <section className="mt-4">
              <h2 className="text-caption font-medium text-ink-muted">{OPEN_LINES}</h2>
              <ul className="mt-1 flex flex-col divide-y divide-hairline">
                {board.withoutSquares.map((item) => (
                  <li key={item.category}>
                    <Link href={`/categorie/${item.category}`} className={`flex min-h-11 items-center gap-3 ${FOCUS}`}>
                      <span className="min-w-0 flex-1 truncate text-body text-ink">{item.name}</span>
                      <span aria-hidden="true" className="w-5 shrink-0 text-right text-ink-muted">
                        ›
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {board.warnings.map((warning) => (
            <p key={warning} role="status" className="mt-3 text-caption leading-relaxed text-ink-soft">
              {warning}
            </p>
          ))}
          {board.leftOut.map((line) => (
            <Link
              key={line.lineId}
              href={`/ligne/${line.lineId}`}
              className={`inline-flex min-h-11 items-center self-start text-caption text-ink-soft underline decoration-rule-strong underline-offset-4 ${FOCUS}`}
            >
              {SHEET_OF(line.name)}
            </Link>
          ))}
          {glance ? <GlanceCards glance={glance} /> : null}
        </div>
      </div>
    </div>
  )
}
