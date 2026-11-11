'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { BoardLeft } from '@/components/money/BoardLeft'
import { DisplayModeProvider, useDisplayMode } from '@/components/money/DisplayMode'
import { Figure } from '@/components/money/Figure'
import { GoalBar } from '@/components/money/GoalBar'
import { CategorySquare } from '@/components/money/CategorySquare'
import { ChapterFoot, PurchaseGain } from '@/components/money/PurchaseGain'
import { FILL } from '@/components/money/HundredSquares'
import { Button } from '@/components/ui/Button'
import { PageColumns } from '@/components/ui/PageColumns'
import { Unfold } from '@/components/ui/Unfold'
import { TabBar } from '@/components/ui/TabBar'
import { useTopMenuInfo } from '@/components/ui/top-menu-info'
import { VaultWait } from '@/components/ui/VaultWait'
import { useIsDesktop } from '@/lib/app/use-desktop'
import { useOpenAfterDim } from '@/lib/app/board-motion'
import { useReducedMotion } from '@/lib/app/use-reduced-motion'
import { useTouchAway } from '@/lib/app/use-touch-away'
import { useModel, type ModelState } from '@/lib/app/use-model'
import { todayIso } from '@/lib/dates'
import { quotedSymbols } from '@/lib/market/live'
import { useMarket } from '@/lib/market/use-market'
import { categoryDetailView, type CategoryDetailView, type DetailChapter, type DetailLine } from '@/lib/screens/category-detail'
import { lineRange, squareOwner, squareTold } from '@/lib/screens/grid-pick'
import { monArgentView } from '@/lib/screens/mon-argent'
import { SHEET_OF } from '@/lib/screens/line-words'
import { titlesFromCategory } from '@/lib/screens/titles'
import { CATEGORY_LINK } from '@/lib/screens/words'
import type { CategoryId } from '@/lib/model/types'

// What a touch may land on and keep the detail: the grid, anything that can be touched itself, and
// anywhere inside a line's row or a chapter (its edge, its small squares, its sub-row).
const KEEPS_THE_DETAIL = 'a, button, select, input, textarea, label, [role="button"], [data-grid], li, [data-chapter]'
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const BACK = `inline-flex min-h-11 items-center self-start text-body text-ink-soft ${FOCUS}`
const QUIET_LINK = `inline-flex min-h-11 items-center self-start text-ink-soft underline decoration-rule-strong underline-offset-4 ${FOCUS}`

type Ready = Extract<ModelState, { status: 'ready' }>

export default function CategoryPage() {
  const state = useModel()
  const { id } = useParams<{ id: string }>()

  return (
    <>
      {state.status === 'ready' ? (
        <ReadyBody state={state} category={id as CategoryId} />
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

function ReadyBody({ state, category }: { state: Ready; category: CategoryId }) {
  const router = useRouter()
  const today = todayIso()
  const base = categoryDetailView(state.model, category, today)
  const { profile, snapshots } = state.model
  const symbols = profile && snapshots.length > 0 ? quotedSymbols(profile.value, snapshots[snapshots.length - 1].value) : []
  const market = useMarket(symbols, { rates: symbols.length > 0 })
  // The same prices as « Mon argent »; nothing is drawn until they are known (8 s at most).
  const view = market.status === 'ready' ? categoryDetailView(state.model, category, today, market.market) : base
  // Mon argent's grid stays: on its left from lg, above it on a phone (9 November 2026). From lg the
  // menu at the top keeps its date and its update.
  const desktop = useIsDesktop()
  const home = market.status === 'ready' ? monArgentView(state.model, today, market.market) : null
  const board = home?.kind === 'board' ? home : null
  // Without a grid there is nothing to keep beside or above: the detail stands alone.
  const withGrid = board !== null && board.grid.kind === 'grid'
  useTopMenuInfo({ canUpdate: board === null ? null : board.update.available })

  useEffect(() => {
    if (view === null) router.replace('/')
  }, [view, router])

  // The grid is clickable, on a computer and on a phone (9 November 2026). A square of another
  // category opens that category: it lights, the detail fades, then the page is replaced (back
  // returns to Mon argent). A square of this one lights its line and sets its row forth in the
  // detail; again, it goes out.
  const [leavingTo, setLeaving] = useState<CategoryId | null>(null)
  const [litLine, setLitLine] = useState<{ category: CategoryId; lineId: string } | null>(null)
  // What was chosen on another category's page means nothing here (the page is replaced, not remounted).
  const leaving = leavingTo !== null && leavingTo !== category ? leavingTo : null
  const lineId = litLine?.category === category ? litLine.lineId : null
  useOpenAfterDim(leaving === null ? null : `/categorie/${leaving}`, { replace: true })
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (lineId !== null) setLitLine(null)
      else router.push('/')
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [lineId, router])
  useTouchAway(lineId !== null, () => setLitLine(null))
  // Whether the « Tu possèdes… » bubble was open when the finger came down: that touch closes it
  // (components/money/NetAmount.tsx), and does nothing else, as Escape does.
  const pressedWithBubble = useRef(false)
  // On a computer, the square under the mouse is told under the grid, as on Mon argent.
  const [hoveredSquare, setHoveredSquare] = useState<number | null>(null)

  if (market.status === 'loading') return <VaultWait phase="prices" />
  if (view === null) return null
  const squares = board && board.grid.kind === 'grid' ? board.grid.categories : null
  const onSquare = squares
    ? (index: number) => {
        const owner = squareOwner(squares, index)
        if (!owner) return
        if (owner.category !== category) setLeaving((current) => current ?? owner.category)
        else setLitLine((current) => (current?.category === category && current.lineId === owner.lineId ? null : owner))
      }
    : undefined
  // A category with no square of its own (Immobilier below its loan) lights nothing: lit, it would
  // darken the whole grid.
  const ownSquares = squares?.some((c) => c.category === category && c.squares > 0) === true
  const told =
    desktop && squares && hoveredSquare !== null
      ? squareTold(squares, hoveredSquare, (c) => categoryDetailView(state.model, c, today, market.market))
      : null
  // A touch outside the grid, on nothing that can be touched, shows the grid whole again: back to
  // Mon argent (Nicolas, 9 November 2026). A click, so that a finger scrolling never counts, nor
  // does text selected with the mouse. Listened to on the page itself, not the document: Safari
  // sends the document no click for a touch on plain text.
  const away = (event: MouseEvent<HTMLDivElement>) => {
    if (pressedWithBubble.current || leaving !== null) return
    if (!(event.target instanceof Element) || event.target.closest(KEEPS_THE_DETAIL)) return
    if (window.getSelection()?.isCollapsed === false) return
    router.push('/')
  }
  return (
    <DisplayModeProvider state={state}>
      <div
        className="flex flex-1 flex-col"
        onPointerDownCapture={(event) => {
          pressedWithBubble.current = event.currentTarget.querySelector('[data-bubble]') !== null
        }}
        onClick={away}
      >
        {/* On a phone the way back takes the place of Mon argent's header row (both 44 px): the grid
            below sits where it sat there, at the same width, and nothing jumps when the page changes. */}
        {desktop ? null : (
          <Link href="/" className={BACK}>
            ‹ Mon argent
          </Link>
        )}
        {/* B6: the detail in the reading column, Mon argent's grid on its left (nothing without one);
            on a phone, the grid first and the detail under it. */}
        <PageColumns
          aside={
            board && withGrid ? (
              <div className="mt-4 flex flex-col lg:mt-0">
                <BoardLeft
                  board={board}
                  lit={leaving ?? (ownSquares ? category : undefined)}
                  onSquare={onSquare}
                  focus={leaving === null && lineId !== null && squares ? (lineRange(squares, lineId) ?? undefined) : undefined}
                  progress={!desktop}
                  fit={!desktop}
                  onSquareHover={desktop ? setHoveredSquare : undefined}
                  told={told}
                  // A2: on a computer the date left the menu for the grid, as on Mon argent; a phone's
                  // category page keeps the figures without it, as before.
                  dateLabel={desktop ? board.dateLabel : undefined}
                />
              </div>
            ) : null
          }
        >
          {/* The detail fades out when another category is chosen in the grid. */}
          <div
            data-detail=""
            className={`flex flex-col transition-opacity duration-(--motion-short) ease-(--motion-leave) motion-reduce:transition-none lg:[&>*:first-child]:mt-0 ${withGrid && !desktop ? 'mt-4' : ''} ${leaving ? 'pointer-events-none opacity-0' : ''}`}
          >
            <Detail view={view} category={category} focusedId={lineId} back={desktop} />
          </div>
        </PageColumns>
      </div>
    </DisplayModeProvider>
  )
}

function Detail({
  view,
  category,
  focusedId,
  back,
}: {
  view: CategoryDetailView
  category: CategoryId
  focusedId: string | null
  // The way back at the top of the detail, on a computer; a phone has it above the grid.
  back: boolean
}) {
  const [open, setOpen] = useState(false)
  const all = view.chapters ? view.chapters.flatMap((c) => c.lines) : [...view.lines, ...view.tooSmall]
  const hasDetails = all.some((l) => l.details !== null)

  return (
    <div className="flex animate-board-in flex-col motion-reduce:animate-none">
      {back ? (
        <Link href="/" className={BACK}>
          ‹ Mon argent
        </Link>
      ) : null}
      <h1 className="flex items-center gap-3 pt-2 text-title font-semibold leading-tight tracking-[-0.01em]">
        <CategorySquare category={category} className="size-square-m" />
        {view.name}
      </h1>
      <p className="text-hero font-semibold leading-tight hero-figure text-ink">
        <Figure quiet euros={view.euros} percent={view.percent} />
      </p>
      <p className="mt-1 text-body leading-relaxed text-ink-soft">{view.header}</p>
      {view.purchaseGain ? <PurchaseGain gain={view.purchaseGain} /> : null}
      {view.debtSentence ? (
        <p className="mt-1 text-body leading-relaxed text-ink-soft">{view.debtSentence}</p>
      ) : null}
      {view.debts.length > 0 ? (
        <ul className="flex flex-col divide-y divide-hairline">
          {view.debts.map((debt) => (
            <DebtItem key={debt.lineId} debt={debt} />
          ))}
        </ul>
      ) : null}
      {view.note ? <p className="mt-1 text-caption leading-relaxed text-ink-soft">{view.note}</p> : null}
      {view.leftOut.map((line) => (
        <Link key={line.lineId} href={`/ligne/${line.lineId}`} className={`${QUIET_LINK} text-caption`}>
          {SHEET_OF(line.name)}
        </Link>
      ))}
      {view.goal ? (
        <div className="mt-3">
          <GoalBar
            place="detail"
            category={category}
            actual={view.goal.actual}
            target={view.goal.target}
            scale={Math.max(view.goal.actual, view.goal.target)}
          />
        </div>
      ) : null}

      {view.chapters ? (
        <div className="mt-4 flex flex-col">
          {view.chapters.map((chapter) => (
            <Chapter
              key={chapter.id}
              chapter={chapter}
              category={category}
              open={open}
              squares={view.squares}
              focusedId={focusedId}
              note={chapter.id === 'world' ? view.worldNote : null}
            />
          ))}
        </div>
      ) : (
        <>
          <ul className="mt-4 flex flex-col divide-y divide-hairline">
            {view.lines.map((line) => (
              <LineItem key={line.lineId} line={line} category={category} open={open} squares={view.squares} focusedId={focusedId} />
            ))}
          </ul>

          {view.tooSmall.length > 0 ? (
            <>
              <h2 className="mt-6 text-body font-medium text-ink">Trop petit pour un carré</h2>
              <ul className="mt-1 flex flex-col divide-y divide-hairline">
                {view.tooSmall.map((line) => (
                  <LineItem key={line.lineId} line={line} category={category} open={open} squares={view.squares} focusedId={focusedId} />
                ))}
              </ul>
            </>
          ) : null}
          {view.worldNote ? <p className="mt-3 text-caption text-ink-muted">{view.worldNote}</p> : null}
        </>
      )}

      {hasDetails ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className={`mt-4 ${QUIET_LINK} text-body`}
        >
          {open ? 'Masquer les chiffres détaillés' : 'Voir les chiffres détaillés'}
        </button>
      ) : null}
      {view.ranging ? (
        <Link href={view.ranging.href} className={`${QUIET_LINK} text-body`}>
          {view.ranging.label}
        </Link>
      ) : null}
      {view.titlesLink ? (
        <Link href={titlesFromCategory(category)} className={`${QUIET_LINK} text-body`}>
          {CATEGORY_LINK}
        </Link>
      ) : null}
    </div>
  )
}

// A chapter is closed on arrival; one touch opens its lines. Its subtotal is plain text, not a
// Figure: a button inside the row's button is invalid. It follows the screen's € / % mode all the same.
function Chapter({
  chapter,
  category,
  open,
  squares,
  focusedId,
  note,
}: {
  chapter: DetailChapter
  category: CategoryId
  open: boolean
  squares: boolean
  focusedId: string | null
  note: string | null
}) {
  const [shown, setShown] = useState(false)
  // A line lit in the grid opens the chapter that holds it (and the reader may close it again).
  const [seen, setSeen] = useState<string | null>(null)
  if (focusedId !== seen) {
    setSeen(focusedId)
    if (focusedId !== null && chapter.lines.some((l) => l.lineId === focusedId)) setShown(true)
  }
  const { mode } = useDisplayMode()
  const panel = useId()
  const figure = <span className="shrink-0 text-body tabular-nums text-ink">{mode === 'percent' ? chapter.percent : chapter.euros}</span>
  // « En location » kept for a goal share alone holds no line: nothing to open, so no button and no « › ».
  if (chapter.lines.length === 0) {
    return (
      <div data-chapter="" className="border-t border-rule-strong">
        <div className="flex min-h-11 w-full items-center gap-3">
          <span className="min-w-0 flex-1 text-subtitle font-semibold text-ink">{chapter.label}</span>
          {figure}
        </div>
        <ChapterFoot chapter={chapter} category={category} />
      </div>
    )
  }
  return (
    <div data-chapter="" className="border-t border-rule-strong">
      <button
        type="button"
        aria-expanded={shown}
        aria-controls={panel}
        aria-label={chapter.said ? chapter.said[mode] : undefined}
        onClick={() => setShown((value) => !value)}
        className={`flex min-h-11 w-full items-center gap-3 text-left ${FOCUS}`}
      >
        <span className="min-w-0 flex-1 text-subtitle font-semibold text-ink">
          {chapter.label}{' '}
          <span aria-hidden="true" className="font-normal text-ink-muted">
            {shown ? '⌄' : '›'}
          </span>
        </span>
        {figure}
      </button>
      <ChapterFoot chapter={chapter} category={category} />
      <Unfold open={shown} id={panel}>
          {note ? <p className="pb-2 text-caption text-ink-muted">{note}</p> : null}
          <ul className="flex flex-col divide-y divide-hairline">
            {chapter.lines.map((line) => (
              <LineItem key={line.lineId} line={line} category={category} open={open} squares={squares} focusedId={focusedId} />
            ))}
          </ul>
      </Unfold>
    </div>
  )
}

// A loan is a debt, not a line of the category: what it still owes, never in red.
function DebtItem({ debt }: { debt: CategoryDetailView['debts'][number] }) {
  return (
    <li>
      <Link href={`/ligne/${debt.lineId}`} className={`flex min-h-11 items-center gap-3 ${FOCUS}`}>
        <span className="min-w-0 flex-1 truncate text-body text-ink">{debt.name}</span>
        <span className="shrink-0 text-body text-ink-soft">reste {debt.owed}</span>
        <span aria-hidden="true" className="w-5 shrink-0 text-right text-ink-muted">
          ›
        </span>
      </Link>
    </li>
  )
}

// The name opens the line's fiche. The figure is a sibling of the link, never inside it: a button
// in a link cannot be told apart from the link by a thumb or a screen reader (as in CategoryRow).
function LineItem({
  line,
  category,
  open,
  squares,
  focusedId,
}: {
  line: DetailLine
  category: CategoryId
  open: boolean
  squares: boolean
  focusedId: string | null
}) {
  const href = `/ligne/${line.lineId}`
  const focused = focusedId === line.lineId
  const reduced = useReducedMotion()
  const desktop = useIsDesktop()
  const ref = useRef<HTMLLIElement>(null)
  // The line lit in the grid is brought into view. On a computer, beside the grid, it only moves if
  // it is out of sight; on a phone it is below the grid, and comes to the middle of the screen.
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView?.({ block: desktop ? 'nearest' : 'center', behavior: reduced ? 'auto' : 'smooth' })
  }, [focused, reduced, desktop])
  return (
    <li ref={ref} data-focused={focused ? '' : undefined} className={`py-2 ${focused ? '-mx-3 rounded-control bg-field px-3' : ''}`}>
      <div className="flex items-center gap-3">
        <Link href={href} className={`flex min-h-11 min-w-0 flex-1 flex-col justify-center ${FOCUS}`}>
          <span className="truncate text-body text-ink">{line.name}</span>
          <span className="text-caption text-ink-muted">{line.where}</span>
        </Link>
        <span className="text-body text-ink">
          <Figure euros={line.euros} percent={line.percent} />
        </span>
        <Link href={href} aria-hidden="true" tabIndex={-1} className="flex min-h-11 w-5 items-center justify-end text-ink-muted">
          ›
        </Link>
      </div>
      {line.loans.map((loan) => (
        <Link
          key={loan.lineId}
          href={`/ligne/${loan.lineId}`}
          className={`mt-1 flex min-h-11 items-center border-l border-rule-strong pl-3 text-caption text-ink-soft ${FOCUS}`}
        >
          {loan.sentence}
        </Link>
      ))}
      {squares && line.squares > 0 ? (
        <div
          role="img"
          aria-label={`${line.squares} ${line.squares > 1 ? 'carrés' : 'carré'}`}
          className="mt-2 flex flex-wrap gap-0.5"
        >
          {Array.from({ length: line.squares }, (_, i) => (
            <span key={i} className={`size-square-s rounded-square ${FILL[category]}`} />
          ))}
        </div>
      ) : null}
      {line.result ? (
        <p className="text-caption">
          <Figure
            tone={line.result.tone}
            euros={line.result.euros}
            percent={line.result.percent}
          />
        </p>
      ) : null}
      {/* A line in parts: the caption opens its fiche on the average price, ready to type in. */}
      {line.noPrice && line.priceToSet ? (
        <Link
          href={`${href}?modifier=prix-moyen`}
          // Every such link would read the same to VoiceOver: its name says which line, after what is written.
          aria-label={`${line.noPrice} : ajouter le prix moyen de ${line.name}`}
          className={`inline-flex min-h-11 items-center text-caption text-ink-muted underline decoration-rule-strong underline-offset-4 ${FOCUS}`}
        >
          {line.noPrice}
        </Link>
      ) : line.noPrice ? (
        <p className="text-caption text-ink-muted">{line.noPrice}</p>
      ) : null}
      {open && line.details ? <p className="text-caption leading-relaxed text-ink-soft">{line.details}</p> : null}
    </li>
  )
}
