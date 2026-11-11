'use client'

import { useRef, useState, useSyncExternalStore } from 'react'
import { goalBarArrival, type OncePerLoad } from '@/lib/app/arrival'
import { useInViewOnce } from '@/lib/app/use-in-view-once'
import type { CategoryId } from '@/lib/model/types'
import { FILL } from './HundredSquares'

// Full class names, so Tailwind can see them. What is missing is an outline with a pale veil of
// the tint (planche 7, option C, Nicolas, 10 November 2026): the shortfall shows from afar, and the
// full part stays the only solid one.
const OUTLINE: Record<CategoryId, string> = {
  available: 'border-cat-available bg-cat-available/25',
  secured: 'border-cat-secured bg-cat-secured/25',
  markets: 'border-cat-markets bg-cat-markets/25',
  gold: 'border-cat-gold bg-cat-gold/25',
  property: 'border-cat-property bg-cat-property/25',
}

// Nothing to listen to: whether this is the browser never changes.
const noChange = () => () => {}
// The turn of a bar that does not grow: never due.
const NEVER: OncePerLoad = { due: () => false, shown: () => {}, reset: () => {} }

// `place`: the screen it is on, Mon argent's rows or a category's detail; each grows once there.
type Props = { category: CategoryId; actual: number; target: number; scale: number; place?: 'mon-argent' | 'detail' }

// Widths are percentages, never above 100; `scale` is shared by every bar on a screen.
const pct = (n: number, of: number) => `${of > 0 ? Math.min((n / of) * 100, 100) : 0}%`

export function GoalBar({ category, actual, target, scale, place = 'mon-argent' }: Props) {
  const extent = Math.max(actual, target)
  const filled = Math.min(actual, target)
  const excess = Math.max(actual - target, 0)
  const missing = Math.max(target - actual, 0)
  // The bar grows (Nicolas, 10 November 2026): the first time it is seen in a page load, the bar is
  // uncovered from the left in --motion-long, with the curve to enter (a clip, never a veil: a veil of
  // the page's ground showed as a dark block on a row lit under the mouse). The colour runs up to the
  // target line, or past it, and what is missing follows it (an outline shown from the start, before
  // the colour, was « pas beau »). The target line travels with it, from the left to its place. Nothing
  // moves with fewer animations asked.
  const ref = useRef<HTMLDivElement>(null)
  // A bar the server drew (the example's pages) is shown as drawn: veiled once in the browser, it
  // would blink. Only a bar first drawn in the browser grows, and only it spends its turn.
  const drawnHere = useSyncExternalStore(noChange, () => true, () => false)
  const [grows] = useState(drawnHere)
  const motion = useInViewOnce(grows ? goalBarArrival(`${place}|${category}|${actual}|${target}`) : NEVER, ref)
  const veiled = grows && motion !== 'still' && actual > 0

  return (
    <div role="img" aria-label={`${actual} ${actual > 1 ? 'carrés' : 'carré'}, objectif ${target}`} className="relative h-3 w-full">
      <div ref={ref} data-part="extent" className="relative h-full" style={{ width: pct(extent, scale) }}>
        {/* Clipping the whole bar keeps the corners on the outer ends only, with no seam between segments. */}
        <div
          data-part="clip"
          className={`relative flex h-full overflow-hidden rounded-square ${motion === 'playing' && veiled ? 'transition-[clip-path] duration-(--motion-long) ease-(--motion-enter)' : ''}`}
          style={veiled ? { clipPath: motion === 'waiting' ? 'inset(0 100% 0 0)' : 'inset(0 0 0 0)' } : undefined}
        >
          <div
            data-part="filled"
            data-squares={filled}
            className={`h-full ${FILL[category]}`}
            style={{ width: pct(filled, extent) }}
          />
          {excess > 0 && (
            <div
              data-part="excess"
              data-squares={excess}
              className={`h-full ${FILL[category]}`}
              style={{ width: pct(excess, extent) }}
            />
          )}
          {/* Against a filled part the outline stays open on the left; alone, it needs its own left edge. */}
          {missing > 0 && (
            <div
              data-part="missing"
              data-squares={missing}
              className={`h-full border ${filled > 0 ? 'border-l-0' : ''} ${OUTLINE[category]}`}
              style={{ width: pct(missing, extent) }}
            />
          )}
        </div>
        {/* The target line travels with the bar as it grows, from the left to its place, at the
            same pace (Nicolas, 10 November 2026). */}
        <div
          data-part="target-line"
          className={`absolute -top-1 -bottom-1 w-0.5 bg-ink ${motion === 'playing' && veiled ? 'transition-[left] duration-(--motion-long) ease-(--motion-enter)' : ''}`}
          style={{ left: veiled && motion === 'waiting' ? '0%' : pct(target, extent) }}
        />
      </div>
    </div>
  )
}
