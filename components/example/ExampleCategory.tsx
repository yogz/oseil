'use client'

import Link from 'next/link'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { BoardLeft } from '@/components/money/BoardLeft'
import { useDisplayMode } from '@/components/money/display-mode-context'
import { Figure } from '@/components/money/Figure'
import { GoalBar } from '@/components/money/GoalBar'
import { CategorySquare } from '@/components/money/CategorySquare'
import { ChapterFoot, PurchaseGain } from '@/components/money/PurchaseGain'
import { FILL } from '@/components/money/HundredSquares'
import { PageColumns } from '@/components/ui/PageColumns'
import { Unfold } from '@/components/ui/Unfold'
import { useIsDesktop } from '@/lib/app/use-desktop'
import { useOpenAfterDim } from '@/lib/app/board-motion'
import { useTouchAway } from '@/lib/app/use-touch-away'
import { exampleBoard, exampleDetail } from '@/lib/example/views'
import type { CategoryId } from '@/lib/model/types'
import type { CategoryDetailView, DetailChapter, DetailLine } from '@/lib/screens/category-detail'
import { lineRange, squareOwner, squareTold } from '@/lib/screens/grid-pick'
import { ExampleDisplayMode } from './ExampleDisplayMode'
import { EXAMPLE_LABEL, exampleGridName } from './words'
import { EXAMPLE_HOME, exampleCategory } from './links'

// A category of the example: Mon argent's grid with this category lit, and its detail, read only.
// Re-composed from the real page's pieces (that page reads the vault, and each of its lines leads
// to a private fiche): here a line leads nowhere, it is only read (spec of the landing, proposition).
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const BACK = `inline-flex min-h-11 items-center self-start text-body text-ink-soft ${FOCUS}`
const QUIET_BUTTON = `inline-flex min-h-11 items-center self-start text-ink-soft underline decoration-rule-strong underline-offset-4 ${FOCUS}`

export function ExampleCategory({ category }: { category: CategoryId }) {
  // The board is the same for every category; the detail follows the category shown. The page is
  // replaced, not remounted, when a square opens another category: nothing about one category may
  // be kept for the next.
  const [board] = useState(exampleBoard)
  const view = useMemo(() => exampleDetail(category), [category])
  const desktop = useIsDesktop()
  const [leavingTo, setLeaving] = useState<CategoryId | null>(null)
  const [lit, setLitLine] = useState<{ category: CategoryId; lineId: string } | null>(null)
  // A line lit on another category's page means nothing here.
  const litLine = lit?.category === category ? lit.lineId : null
  useTouchAway(litLine !== null, () => setLitLine(null))
  const [hoveredSquare, setHoveredSquare] = useState<number | null>(null)
  const leaving = leavingTo !== null && leavingTo !== category ? leavingTo : null
  // Opened after the same wait as in the site (lib/app/board-motion.ts); the history stays as it is.
  useOpenAfterDim(leaving === null ? null : exampleCategory(leaving), { replace: true })

  if (view === null) return null
  const squares = board.grid.kind === 'grid' ? board.grid.categories : null
  // A square of another category opens that one; a square of this one lights its line.
  const onSquare = squares
    ? (index: number) => {
        const owner = squareOwner(squares, index)
        if (!owner) return
        if (owner.category !== category) setLeaving((current) => current ?? owner.category)
        else setLitLine((current) => (current?.category === category && current.lineId === owner.lineId ? null : owner))
      }
    : undefined
  const told = desktop && squares && hoveredSquare !== null ? squareTold(squares, hoveredSquare, exampleDetail) : null

  return (
    <ExampleDisplayMode>
      <div className="flex flex-1 flex-col">
        {desktop ? null : (
          <Link href={EXAMPLE_HOME} className={BACK}>
            ‹ Mon argent
          </Link>
        )}
        <PageColumns
          aside={
            squares ? (
              <div className="mt-4 flex flex-col lg:mt-0">
                <BoardLeft
                  board={board}
                  label={EXAMPLE_LABEL}
                  gridName={exampleGridName(board)}
                  lit={leaving ?? category}
                  onSquare={onSquare}
                  focus={leaving === null && litLine !== null ? (lineRange(squares, litLine) ?? undefined) : undefined}
                  progress={!desktop}
                  onSquareHover={desktop ? setHoveredSquare : undefined}
                  told={told}
                />
              </div>
            ) : null
          }
        >
          <div
            data-detail=""
            className={`flex flex-col transition-opacity duration-(--motion-short) ease-(--motion-leave) motion-reduce:transition-none lg:[&>*:first-child]:mt-0 ${desktop ? '' : 'mt-4'} ${leaving ? 'pointer-events-none opacity-0' : ''}`}
          >
            <Detail view={view} category={category} focusedId={leaving ? null : litLine} back={desktop} />
          </div>
        </PageColumns>
      </div>
    </ExampleDisplayMode>
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
  back: boolean
}) {
  const [open, setOpen] = useState(false)
  const all = view.chapters ? view.chapters.flatMap((c) => c.lines) : [...view.lines, ...view.tooSmall]
  const hasDetails = all.some((l) => l.details !== null)
  const line = (l: DetailLine) => (
    <LineItem key={l.lineId} line={l} category={category} open={open} squares={view.squares} focused={focusedId === l.lineId} />
  )
  return (
    <div className="flex animate-board-in flex-col motion-reduce:animate-none">
      {back ? (
        <Link href={EXAMPLE_HOME} className={BACK}>
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
      {view.cryptoNote ? <p className="text-caption text-ink-muted">{view.cryptoNote}</p> : null}
      {view.purchaseGain ? <PurchaseGain gain={view.purchaseGain} /> : null}
      {view.debtSentence ? <p className="mt-1 text-body leading-relaxed text-ink-soft">{view.debtSentence}</p> : null}
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
            <Chapter key={chapter.id} chapter={chapter} category={category} focusedId={focusedId} note={chapter.note}>
              {chapter.lines.map(line)}
            </Chapter>
          ))}
        </div>
      ) : (
        <>
          <ul className="mt-4 flex flex-col divide-y divide-hairline">{[...view.lines, ...view.tooSmall].map(line)}</ul>
          {view.worldNote ? <p className="mt-3 text-caption text-ink-muted">{view.worldNote}</p> : null}
        </>
      )}
      {hasDetails ? (
        <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={`mt-4 ${QUIET_BUTTON} text-body`}>
          {open ? 'Masquer les chiffres détaillés' : 'Voir les chiffres détaillés'}
        </button>
      ) : null}
    </div>
  )
}

// Closed on arrival, as in the site; a line lit in the grid opens the chapter that holds it.
function Chapter({
  chapter,
  category,
  focusedId,
  note,
  children,
}: {
  chapter: DetailChapter
  category: CategoryId
  focusedId: string | null
  note: string | null
  children: ReactNode
}) {
  const [shown, setShown] = useState(false)
  const [seen, setSeen] = useState<string | null>(null)
  if (focusedId !== seen) {
    setSeen(focusedId)
    if (focusedId !== null && chapter.lines.some((l) => l.lineId === focusedId)) setShown(true)
  }
  const { mode } = useDisplayMode()
  const panel = useId()
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
        <span className="shrink-0 text-body tabular-nums text-ink">{mode === 'percent' ? chapter.percent : chapter.euros}</span>
      </button>
      <ChapterFoot chapter={chapter} category={category} />
      <Unfold open={shown} id={panel}>
          {note ? <p className="pb-2 text-caption text-ink-muted">{note}</p> : null}
          <ul className="flex flex-col divide-y divide-hairline">{children}</ul>
      </Unfold>
    </div>
  )
}

// A line, read only: its name and where it is, its figure, its squares. No fiche to open.
function LineItem({
  line,
  category,
  open,
  squares,
  focused,
}: {
  line: DetailLine
  category: CategoryId
  open: boolean
  squares: boolean
  focused: boolean
}) {
  return (
    <li data-focused={focused ? '' : undefined} className={`py-2 ${focused ? '-mx-3 rounded-control bg-field px-3' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="flex min-h-11 min-w-0 flex-1 flex-col justify-center">
          <span className="truncate text-body text-ink">{line.name}</span>
          {line.where ? <span className="text-caption text-ink-muted">{line.where}</span> : null}
        </div>
        <span className="text-body text-ink">
          <Figure euros={line.euros} percent={line.percent} />
        </span>
      </div>
      {line.loans.map((loan) => (
        <p key={loan.lineId} className="mt-1 flex min-h-11 items-center border-l border-rule-strong pl-3 text-caption text-ink-soft">
          {loan.sentence}
        </p>
      ))}
      {squares && line.squares > 0 ? (
        <div role="img" aria-label={`${line.squares} ${line.squares > 1 ? 'carrés' : 'carré'}`} className="mt-2 flex flex-wrap gap-0.5">
          {Array.from({ length: line.squares }, (_, i) => (
            <span key={i} className={`size-square-s rounded-square ${FILL[category]}`} />
          ))}
        </div>
      ) : null}
      {line.result ? (
        <p className="text-caption">
          <Figure tone={line.result.tone} euros={line.result.euros} percent={line.result.percent} />
        </p>
      ) : null}
      {line.noPrice ? <p className="text-caption text-ink-muted">{line.noPrice}</p> : null}
      {open && line.details ? <p className="text-caption leading-relaxed text-ink-soft">{line.details}</p> : null}
    </li>
  )
}
