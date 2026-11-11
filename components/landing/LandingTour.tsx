'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { FILL, HundredSquares } from '@/components/money/HundredSquares'
import { useAccountHere, OUTLINE_PILL, WHITE_PILL } from '@/components/landing/LandingChoices'
import type { CategoryId } from '@/lib/model/types'
import type { Tour, TourPanel, TourVisual } from '@/lib/landing/tour'

// « Ton tableur de suivi, en mieux » (maquette A, Nicolas, 11 November 2026): under the promises, five
// steps to read, and beside them one picture of the example that follows the step being read: the
// grid fills, takes its colours square by square, shows the places its goals still want, lets the
// stock-market squares beat a few times, then gives way to the curve, which draws itself. On a phone
// the picture is a thin band that stays at the top of the screen (the grid, and a few words or the
// goals' bar beside it); on a computer, the grid stays in the left column, as on Mon argent.
//
// The words come first: every step is in the page as it is sent, whole and readable, with or
// without script, motion or sight. The picture adds nothing a step does not say (it is hidden from
// VoiceOver). With fewer animations asked, every change is immediate and nothing beats.

const FADE = 'transition-opacity duration-(--motion-mid) motion-reduce:transition-none'
// The squares that take their colour do it one after the other, in under a second for the whole grid.
const RECOLOUR_STEP_MS = 8
// Whether the page can follow the reading never changes once it is open: nothing to subscribe to.
const noChange = () => () => {}

function cellsOf(tour: Tour, visual: TourVisual): CategoryId[] | null {
  if (visual.kind !== 'grid') return null
  return visual.cells === 'goals' ? tour.cells.goals : tour.cells.real
}

export function LandingTour({ tour }: { tour: Tour }) {
  // The step being read, and the grid shown just before it: the squares that change take their
  // colour one after the other from there.
  const [shown, setShown] = useState<{ active: number; from: ReadonlyArray<CategoryId | null> | undefined }>({
    active: 0,
    from: undefined,
  })
  // Once the script runs, the step being read stands out; before, every step reads the same.
  // The server cannot follow anything: what it sends, and the first render in the browser, read the same.
  const following = useSyncExternalStore(
    noChange,
    () => typeof IntersectionObserver !== 'undefined',
    () => false,
  )
  const steps = useRef<Array<HTMLLIElement | null>>([])

  // The step being read is the one across the middle of the screen; between two, the last one stays.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const next = Number((entry.target as HTMLElement).dataset.tourStep)
          setShown((before) => {
            if (before.active === next) return before
            const was = tour.steps[before.active].picture.visual
            return { active: next, from: was.kind === 'empty' ? Array(100).fill(null) : (cellsOf(tour, was) ?? undefined) }
          })
        }
      },
      { rootMargin: '-50% 0px -50% 0px' },
    )
    for (const step of steps.current) if (step) observer.observe(step)
    return () => observer.disconnect()
  }, [tour])

  const { visual, panel } = tour.steps[shown.active].picture
  return (
    <section data-landing-tour="" aria-labelledby="tour-title" className="mt-14 lg:col-span-2 lg:mt-20">
      <div className="lg:grid lg:grid-cols-2 lg:gap-x-14">
        <div className="lg:col-start-2">
          <h2 id="tour-title" className="text-title font-semibold leading-tight tracking-[-0.01em]">
            Ton tableur de suivi, en mieux
          </h2>
          <p className="mt-2 text-body leading-normal text-ink-soft">
            Tout ce que tu faisais dans ton fichier Excel, sans formules à entretenir.
          </p>
        </div>
      </div>

      <div className="mt-4 lg:mt-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-14">
        <div
          aria-hidden="true"
          data-tour-picture={visual.kind}
          className="sticky top-0 z-10 -mx-5 flex items-center gap-5 border-b border-hairline bg-ground px-5 py-3 lg:top-8 lg:mx-0 lg:block lg:border-b-0 lg:p-0"
        >
          <Visual tour={tour} visual={visual} from={shown.from} />
          <Panel tour={tour} panel={panel} />
        </div>
        <ol className="lg:col-start-2">
          {tour.steps.map((step, i) => (
            <li
              key={step.id}
              ref={(element) => {
                steps.current[i] = element
              }}
              data-tour-step={i}
              data-active={following && i === shown.active ? '' : undefined}
              className={`flex min-h-[36svh] flex-col justify-center border-b border-hairline py-8 lg:min-h-[55svh] ${FADE} ${
                following && i !== shown.active ? 'opacity-35' : 'opacity-100'
              }`}
            >
              <h3 className="text-subtitle font-semibold leading-snug">{step.title}</h3>
              <p className="mt-1.5 text-body leading-normal text-ink-soft">{step.text}</p>
              {step.fact ? <p className="mt-2 text-caption leading-normal text-ink-muted">{step.fact}</p> : null}
            </li>
          ))}
        </ol>
      </div>

      <div className="lg:grid lg:grid-cols-2 lg:gap-x-14">
        <TourEnd />
      </div>
    </section>
  )
}

// The grid or the curve, in a box of a fixed size, so that nothing under it jumps: on a phone the
// size of the small grid (10 squares of 8 px and 9 gaps of 1 px), on a computer the column's width.
function Visual({ tour, visual, from }: { tour: Tour; visual: TourVisual; from: ReadonlyArray<CategoryId | null> | undefined }) {
  const label = 'La grille de l’exemple'
  const grid =
    visual.kind === 'empty'
      ? { squares: [], empty: 100 }
      : {
          squares: tour.squares,
          cells: cellsOf(tour, visual) ?? tour.cells.real,
          from,
          step: RECOLOUR_STEP_MS,
          lit: visual.kind === 'grid' ? visual.lit : undefined,
          spotlight: visual.kind === 'grid' && visual.todo ? { lit: [], todo: tour.cells.todo } : undefined,
        }
  const curve = visual.kind === 'curve'
  return (
    <div className="relative size-[89px] shrink-0 lg:aspect-square lg:size-auto lg:w-full">
      <div
        data-tour-pulse={visual.kind === 'grid' && visual.pulse ? visual.lit : undefined}
        className={`absolute inset-0 ${FADE} ${curve ? 'opacity-0' : 'opacity-100'}`}
      >
        <div className="lg:hidden">
          <HundredSquares size="small" label={label} {...grid} />
        </div>
        <div className="hidden lg:block">
          <HundredSquares label={label} {...grid} />
        </div>
      </div>
      <div className={`absolute inset-0 py-2 lg:py-[15%] ${FADE} ${curve ? 'opacity-100' : 'opacity-0'}`}>
        <div className="relative size-full border-b border-hairline">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="size-full overflow-visible">
            {/* It draws itself when its step is read; at once with fewer animations asked. */}
            <polyline
              points={tour.curve.line}
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={curve ? 0 : 1}
              fill="none"
              vectorEffect="non-scaling-stroke"
              strokeWidth={2}
              strokeLinejoin="round"
              className="stroke-ink-soft transition-[stroke-dashoffset] duration-1200 ease-out motion-reduce:transition-none"
            />
          </svg>
          {/* The last point, round whatever the box: drawn outside the stretched drawing. */}
          <span
            className={`absolute size-2 -translate-1/2 rounded-full bg-ink-soft transition-opacity duration-(--motion-mid) motion-reduce:transition-none ${
              curve ? 'opacity-100 delay-1000 motion-reduce:delay-0' : 'opacity-0'
            }`}
            style={{ left: `${tour.curve.end.x}%`, top: `${tour.curve.end.y}%` }}
          />
        </div>
      </div>
    </div>
  )
}

// Beside the grid on a phone, under it on a computer: what the step adds to it, in a few words.
// Its height is kept, so that the band never changes size.
function Panel({ tour, panel }: { tour: Tour; panel: TourPanel }) {
  return (
    <div className="relative h-[89px] min-w-0 flex-1 lg:mt-6 lg:h-36">
      <ul className={`absolute inset-0 flex flex-col justify-center lg:gap-1.5 ${FADE} ${panel.kind === 'legend' ? 'opacity-100' : 'opacity-0'}`}>
        {tour.legend.map((row) => (
          <li key={row.category} className="flex items-center gap-2 text-caption leading-snug lg:text-body">
            <span
              className={`size-square-s shrink-0 rounded-square square-motion ${
                panel.kind === 'legend' && panel.coloured ? FILL[row.category] : 'border border-rule-strong'
              }`}
            />
            <span className="truncate text-ink-soft">{row.name}</span>
          </li>
        ))}
      </ul>
      <div className={`absolute inset-0 flex flex-col justify-center ${FADE} ${panel.kind === 'goals' ? 'opacity-100' : 'opacity-0'}`}>
        <p className="text-caption text-ink-soft lg:text-body">Ses objectifs, hors chez elle</p>
        <div className="mt-2 flex h-2 gap-0.5">
          {tour.goals.map((goal) => (
            <span key={goal.category} className={`rounded-square ${FILL[goal.category]}`} style={{ flexGrow: goal.target }} />
          ))}
        </div>
        <p className="mt-2 text-caption text-ink-muted">Les places encore à remplir sont entourées.</p>
      </div>
      <div className={`absolute inset-0 flex items-center ${FADE} ${panel.kind === 'category' ? 'opacity-100' : 'opacity-0'}`}>
        {panel.kind === 'category' ? (
          <p className="flex items-center gap-2 text-caption text-ink-soft lg:text-body">
            <span className={`size-square-s shrink-0 rounded-square ${FILL[panel.category]}`} />
            {panel.words}
          </p>
        ) : null}
      </div>
      <div className={`absolute inset-0 flex items-center ${FADE} ${panel.kind === 'words' ? 'opacity-100' : 'opacity-0'}`}>
        {panel.kind === 'words' ? <p className="text-caption text-ink-soft lg:text-body">{panel.words}</p> : null}
      </div>
    </div>
  )
}

// The way on, once the tour is read: the whole example, and, on a first visit, an account. A device
// where an account has served already has « Me connecter » at the top: nothing more to ask it here.
function TourEnd() {
  const served = useAccountHere()
  return (
    <div className="mt-8 lg:col-start-2 lg:mt-10">
      <p className="text-subtitle font-semibold">Envie de voir en vrai ?</p>
      {/* The room of the pills is kept before the marker is read: nothing jumps (LandingActions). */}
      <div className="mt-4 flex min-h-28 flex-col lg:min-h-13 lg:flex-row lg:items-center lg:gap-3">
        {served === null ? null : (
          <>
            {served ? null : (
              <Link href="/inscription" className={WHITE_PILL}>
                Créer mon compte
              </Link>
            )}
            <Link href="/exemple" className={served ? OUTLINE_PILL.replace('mt-3 ', '') : OUTLINE_PILL}>
              Voir l’exemple en entier
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
