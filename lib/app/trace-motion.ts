// The dot that travels in « Catégorie par catégorie » (planche of 11 November 2026, chosen by Nicolas):
// on a loop, from the first snapshot to the latest, one trip at a time. Each trip starts slowly and ends
// fast (the curve to leave of globals.css), with a tail behind it that thins and fades like a shooting
// star: the tail ends where the dot was a moment ago, so it is longer when the dot goes faster, and
// pulls back into it on arrival. These are timings only: the component draws them.

export type TraceTiming = {
  hopMs: number // one trip from a snapshot to the next
  holdMs: number // the stop on each snapshot
  endMs: number // the stop on the latest one, before the loop starts again
  fadeMs: number // the dot appears at the start, disappears at the end
  lagMs: number // the tail ends where the dot was this long ago
}

export type CometFrame = { head: number; tail: number; opacity: number }

// Up to three trips, each takes the long duration (planche: about a second); with more snapshots they
// shorten together, so one loop stays about ten seconds long at most; a trip never gets under a quarter
// of a second, nor a stop under a sixth.
const FULL_TRIPS = 3
const MIN_HOP_MS = 250
const MIN_HOLD_MS = 150
const HOLD_RATIO = 1.15
const END_RATIO = 1.8
const LAG_MS = 260

export function traceTiming(snapshots: number, { long, mid }: { long: number; mid: number }): TraceTiming {
  const trips = Math.max(1, snapshots - 1)
  const scale = Math.min(1, FULL_TRIPS / trips)
  return {
    hopMs: Math.max(MIN_HOP_MS, Math.round(long * scale)),
    holdMs: Math.max(MIN_HOLD_MS, Math.round(long * HOLD_RATIO * scale)),
    endMs: Math.round(long * END_RATIO),
    fadeMs: mid,
    lagMs: LAG_MS,
  }
}

// fade in, a stop on the first snapshot, then (trip, stop) for each snapshot after it, the last stop
// being the long one, then fade out.
export function loopMs(t: TraceTiming, snapshots: number): number {
  const trips = Math.max(0, snapshots - 1)
  return t.fadeMs + t.holdMs + trips * (t.hopMs + t.holdMs) - t.holdMs + t.endMs + t.fadeMs
}

// Where the dot is, `ms` into its loop (any time: it wraps).
function headAt(positions: readonly number[], ms: number, t: TraceTiming, ease: (x: number) => number): number {
  let left = ms - t.fadeMs - t.holdMs
  if (left <= 0) return positions[0]
  for (let i = 1; i < positions.length; i++) {
    if (left < t.hopMs) return positions[i - 1] + (positions[i] - positions[i - 1]) * ease(left / t.hopMs)
    left -= t.hopMs + t.holdMs
    if (left < 0) return positions[i]
  }
  return positions[positions.length - 1]
}

export function cometAt(
  positions: readonly number[],
  elapsedMs: number,
  t: TraceTiming,
  ease: (x: number) => number,
): CometFrame {
  const loop = loopMs(t, positions.length)
  const ms = ((elapsedMs % loop) + loop) % loop
  const head = headAt(positions, ms, t, ease)
  const tail = headAt(positions, Math.max(0, ms - t.lagMs), t, ease)
  const fadeIn = Math.min(1, ms / t.fadeMs)
  const fadeOut = Math.min(1, (loop - ms) / t.fadeMs)
  return { head, tail, opacity: Math.max(0, Math.min(fadeIn, fadeOut)) }
}

// The easing written in CSS (`cubic-bezier(x1, y1, x2, y2)`), for a motion drawn by script. Anything
// else is read as the straight line.
export function cubicBezier(css: string): (x: number) => number {
  const n = css.match(/-?[\d.]+/g)?.map(Number)
  if (!css.trim().startsWith('cubic-bezier') || !n || n.length !== 4 || n.some((v) => !Number.isFinite(v))) return (x) => x
  const [x1, y1, x2, y2] = n
  const at = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3
  return (x) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    // The curve's x grows with s: halve the interval until it finds x.
    let lo = 0
    let hi = 1
    for (let i = 0; i < 30; i++) {
      const s = (lo + hi) / 2
      if (at(x1, x2, s) < x) lo = s
      else hi = s
    }
    return at(y1, y2, (lo + hi) / 2)
  }
}
