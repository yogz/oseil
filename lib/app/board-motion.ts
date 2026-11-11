'use client'

// The motions of Mon argent's grid, out of the screens that play them: the echo of an update just
// saved, the hint that a square can be touched, and the short wait before a touched square opens its
// category. Each is a timing only; what lights and where it leads is decided by the screen.

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { squareHint, hintCategory } from '@/lib/app/square-hint'
import { useReducedMotion } from '@/lib/app/use-reduced-motion'
import type { GridCategory } from '@/lib/model/squares'
import type { CategoryId } from '@/lib/model/types'
import { lineRange } from '@/lib/screens/grid-pick'

// One square's dimming (--motion-mid) is done before the page changes.
export const OPEN_DELAY_MS = 350

// A touched square opens `target` once its dimming is done, at once with fewer animations asked.
// `replace` keeps the history as it is (a category's page opening another one: back returns to
// Mon argent). Null: nothing to open.
export function useOpenAfterDim(target: string | null, { replace = false }: { replace?: boolean } = {}) {
  const router = useRouter()
  const reduced = useReducedMotion()
  useEffect(() => {
    if (target === null) return
    const go = () => (replace ? router.replace(target) : router.push(target))
    if (reduced) {
      go()
      return
    }
    const timer = setTimeout(go, OPEN_DELAY_MS)
    return () => clearTimeout(timer)
  }, [target, replace, reduced, router])
}

// The echo of the bank just updated (planche of 10 November 2026, « un aller-retour »): it waits for the
// board's own fade (--motion-mid), or for the grid's arrival when there is one (944 ms); the other
// squares dim in 150 ms and stay so 350 ms, then all come back in 350 ms: about 850 ms in all.
const ECHO_AFTER_FADE_MS = 350
const ECHO_AFTER_ARRIVAL_MS = 950
const ECHO_DIM_MS = 150 + 350
const ECHO_BACK_MS = 350

export type UpdateEcho = { lit: ReadonlyArray<{ from: number; to: number }>; phase: 'dim' | 'back' }

// Played once, right after an update that left some banks aside (lib/app/arrival.ts); never with
// fewer animations asked, whose final state is the grid as it is. Mon argent takes the flag as soon
// as it is reached, whatever it then shows (see HomePage); the board plays it only if it appears on
// that same visit, and only the first time it does: `taken` tells Mon argent it is spent.
export function useUpdateEcho(
  squares: readonly GridCategory[] | null,
  given: string[] | null,
  taken: () => void,
  arrive: boolean,
  reduced: boolean,
): UpdateEcho | undefined {
  // Decided once, when the board appears.
  const [lines] = useState(() => given ?? [])
  useEffect(() => {
    taken()
  }, [taken])
  const lit = squares ? lines.flatMap((id) => lineRange(squares, id) ?? []) : []
  const plays = !reduced && lit.length > 0
  const [phase, setPhase] = useState<UpdateEcho['phase'] | null>(null)
  useEffect(() => {
    if (!plays) return
    const start = arrive ? ECHO_AFTER_ARRIVAL_MS : ECHO_AFTER_FADE_MS
    const timers = [
      setTimeout(() => setPhase('dim'), start),
      setTimeout(() => setPhase('back'), start + ECHO_DIM_MS),
      setTimeout(() => setPhase(null), start + ECHO_DIM_MS + ECHO_BACK_MS),
    ]
    return () => timers.forEach(clearTimeout)
  }, [plays, arrive])
  return plays && phase !== null ? { lit, phase } : undefined
}

// The hint that a square can be touched (lib/app/square-hint.ts, option B): after the grid's arrival
// (944 ms) and a short pause, the largest category lights as a touch would light it, its row too, and
// the sentence says it; it stays long enough to be read, then all comes back.
const HINT_AFTER_ARRIVAL_MS = 950 + 400
const HINT_HOLD_MS = 2200

// What decides whether the hint is due and counts it: the site's own (squareHint), or the example's,
// which counts nothing (lib/example/arrival.ts).
export type HintCounter = { due(): boolean; played(): void }

// Decided once, when the board appears: only on an opening of the site whose grid arrives, never with
// fewer animations asked, never on the same visit as the echo of an update (one motion at a time), never
// under the reminder of an update (it would spend one of its openings under the veil), and only while
// the counter says it is due (for the site: no square touched yet on this device, and fewer than
// MAX_VISITS hints seen).
export function useSquareHint(
  squares: readonly GridCategory[] | null,
  arrive: boolean,
  echoes: boolean,
  reduced: boolean,
  counter: HintCounter = squareHint,
  reminded = false,
): CategoryId | null {
  const [shown] = useState(() =>
    squares && arrive && !echoes && !reduced && !reminded && counter.due() ? hintCategory(squares) : null,
  )
  const [hint, setHint] = useState<CategoryId | null>(null)
  useEffect(() => {
    if (!shown) return
    const timers = [
      // Counted here, when it really plays: a visit left before it does not count.
      setTimeout(() => {
        counter.played()
        setHint(shown)
      }, HINT_AFTER_ARRIVAL_MS),
      setTimeout(() => setHint(null), HINT_AFTER_ARRIVAL_MS + HINT_HOLD_MS),
    ]
    return () => timers.forEach(clearTimeout)
  }, [shown, counter])
  return hint
}
