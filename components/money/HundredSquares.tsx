import type { CSSProperties } from 'react'
import { useReducedMotion } from '@/lib/app/use-reduced-motion'
import type { CategoryId } from '@/lib/model/types'

// Full class names, so Tailwind can see them.
export const FILL: Record<CategoryId, string> = {
  available: 'bg-cat-available',
  secured: 'bg-cat-secured',
  markets: 'bg-cat-markets',
  gold: 'bg-cat-gold',
  property: 'bg-cat-property',
}

// « Chez toi » beside a rental (Nicolas, 11 November 2026): the green of Immobilier, a little darker.
export const HOME_FILL = 'bg-cat-property-home'

// The same colours at low opacity: a square that cannot be had back quickly keeps its category.
export const DIM_FILL: Record<CategoryId, string> = {
  available: 'bg-cat-available/20',
  secured: 'bg-cat-secured/20',
  markets: 'bg-cat-markets/20',
  gold: 'bg-cat-gold/20',
  property: 'bg-cat-property/20',
}

// What is missing: an outline of the tint over a pale veil of it, as in a goal bar (GoalBar.tsx).
const TODO: Record<CategoryId, string> = {
  available: 'border border-cat-available bg-cat-available/25',
  secured: 'border border-cat-secured bg-cat-secured/25',
  markets: 'border border-cat-markets bg-cat-markets/25',
  gold: 'border border-cat-gold bg-cat-gold/25',
  property: 'border border-cat-property bg-cat-property/25',
}

const TOTAL = 100
const GRID = {
  large: 'grid-cols-10 gap-[3px]',
  medium: 'w-max grid-cols-[repeat(10,var(--spacing-square-m))] gap-[3px]',
  small: 'w-max grid-cols-[repeat(10,var(--spacing-square-s))] gap-px [--square-edge:1px]',
} as const
// Planche 1: each square takes 350 ms (--motion-mid), 6 ms after the one before it, in reading
// order: 99 × 6 + 350 = 944 ms, the whole grid in under a second, category after category.
const ARRIVAL_STEP_MS = 6
// Planches 3 and 4: the squares whose colour changes do it one after the other, lightly.
export const RECOLOUR_STEP_MS = 40

type Props = {
  squares: Array<{ category: CategoryId; count: number }>
  empty?: number
  lit?: CategoryId
  animate?: boolean
  // B7: large fills its column (Mon argent), or less on a phone whose first screen is too short
  // (lib/app/grid-fit.ts); medium and small are fixed sizes, the same on every screen.
  size?: 'large' | 'medium' | 'small'
  label: string
  // The colour each square shows, in reading order, when it is not the one `squares` gives
  // (a simulation, another snapshot). A square never moves: only its colour changes.
  cells?: ReadonlyArray<CategoryId>
  // The colours shown just before: the squares that change take theirs one after the other.
  from?: ReadonlyArray<CategoryId | null>
  step?: number
  // A line of `lit` lit alone, its squares from `from` up to `to` (not included): the rest of its
  // category at half, the other categories almost off (option B, Nicolas, 9 November 2026).
  focus?: { from: number; to: number }
  // The echo of the bank just updated (10 November 2026): the squares of its lines, each range from
  // `from` up to `to` (not included), stay lit while every other one dims (`dim`), then all come back
  // (`back`). A category lit wins over it.
  echo?: { lit: ReadonlyArray<{ from: number; to: number }>; phase: 'dim' | 'back' }
  // « Montre-moi mes objectifs », option F (Nicolas, 10 November 2026): only these squares are seen,
  // every other one dims. `lit`: full, with the edge of the hover (where the squares leave from, then
  // the places once filled); `todo`: an outline of its colour over a pale veil, the sign of what is
  // missing in a goal bar (the places still to fill). It wins over every other lighting.
  spotlight?: { lit: ReadonlyArray<number>; todo: ReadonlyArray<number> }
  // The squares of « Chez toi », in their own green (lib/model/squares.ts, homeRange); null or absent
  // without a rental. Only a square of Immobilier there takes it.
  home?: { from: number; to: number } | null
  // A square touched, by its place in reading order (lib/screens/grid-pick.ts says what it lights).
  onSquare?: (index: number) => void
  // The square under the mouse, by its place; null once the mouse has left the grid. Between two
  // squares the last one is kept, so that nothing flickers. A finger is never told.
  onSquareHover?: (index: number | null) => void
}

// How much a square fades when it is not what is lit.
function dimOf(
  category: CategoryId,
  i: number,
  lit: CategoryId | undefined,
  focus: Props['focus'],
  echo: Props['echo'],
): string {
  if (lit === undefined) {
    if (echo?.phase !== 'dim') return ''
    return echo.lit.some((range) => i >= range.from && i < range.to) ? '' : 'opacity-25'
  }
  if (focus) {
    if (i >= focus.from && i < focus.to) return ''
    return category === lit ? 'opacity-50' : 'opacity-12'
  }
  return category === lit ? '' : 'opacity-25'
}

export function HundredSquares({
  squares,
  empty = 0,
  lit,
  animate = false,
  size = 'large',
  label,
  cells: shown,
  from,
  step = RECOLOUR_STEP_MS,
  focus,
  echo,
  spotlight,
  home,
  onSquare,
  onSquareHover,
}: Props) {
  const reduced = useReducedMotion()
  const cells: Array<CategoryId | null> = []
  if (shown) cells.push(...shown)
  else {
    for (const { category, count } of squares) {
      for (let i = 0; i < count; i++) cells.push(category)
    }
  }
  for (let i = 0; i < empty; i++) cells.push(null)
  cells.length = Math.min(cells.length, TOTAL)

  // With fewer animations asked, no motion at all: every square is in its final state at once.
  const motion = reduced ? '' : `square-motion ${animate ? 'animate-square-arrive motion-reduce:animate-none' : ''}`
  let changed = 0
  return (
    <div
      role="img"
      aria-label={label}
      // The echo's pace (globals.css): quick to dim, gentle to come back.
      data-echo={echo && lit === undefined ? echo.phase : undefined}
      className={`grid ${GRID[size]}`}
      onClick={
        onSquare
          ? (event) => {
              const square = (event.target as HTMLElement).closest('[data-square]')
              if (square) onSquare(Array.prototype.indexOf.call(event.currentTarget.children, square))
            }
          : undefined
      }
      onPointerOver={
        onSquareHover
          ? (event) => {
              if (event.pointerType !== 'mouse') return
              const square = (event.target as HTMLElement).closest('[data-square]')
              if (square && square.parentElement === event.currentTarget) {
                onSquareHover(Array.prototype.indexOf.call(event.currentTarget.children, square))
              }
            }
          : undefined
      }
      onPointerLeave={onSquareHover ? () => onSquareHover(null) : undefined}
    >
      {cells.map((category, i) => {
        const style: CSSProperties = {}
        if (animate && !reduced) style.animationDelay = `${i * ARRIVAL_STEP_MS}ms`
        // Only the colour waits its turn; the opacity and the size answer at once.
        if (from && !reduced && from[i] !== undefined && from[i] !== category) {
          const delay = `${changed * step}ms`
          style.transitionDelay = `0ms, ${delay}, ${delay}, 0ms`
          changed++
        }
        if (category === null) {
          return (
            <span
              key={i}
              data-square=""
              data-empty=""
              style={style}
              className={`aspect-square rounded-square border border-rule-strong ${motion}`}
            />
          )
        }
        const spot = spotlight ? (spotlight.lit.includes(i) ? 'lit' : spotlight.todo.includes(i) ? 'todo' : 'off') : null
        const dim = spot ? (spot === 'off' ? 'opacity-25' : '') : dimOf(category, i, lit, focus, echo)
        const atHome = category === 'property' && home != null && i >= home.from && i < home.to
        const fill = spot === 'todo' ? TODO[category] : atHome ? HOME_FILL : FILL[category]
        return (
          <span
            key={i}
            data-square=""
            data-category={category}
            data-dim={dim ? '' : undefined}
            data-spot={spot === 'lit' || spot === 'todo' ? spot : undefined}
            data-home={atHome ? '' : undefined}
            style={style}
            className={`aspect-square rounded-square ${fill} ${dim} ${onSquare ? 'cursor-pointer' : ''} ${motion}`}
          />
        )
      })}
    </div>
  )
}
