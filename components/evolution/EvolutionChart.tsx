'use client'

// The curve of what is yours (interface spec §4.2, planches 16-17): a real calendar on the x axis,
// a smooth line that never goes beyond the snapshots around it, a veil in gradient under it (the
// only gradient of the application), the next cap dotted, a drawing on opening, and a bubble that
// snaps to the nearest snapshot. Arrow keys move it.
// B2 (Nicolas, 11 November 2026): one unit, the euros of the total, the cap and the right axis
// too; the axis closes in on the snapshots, so the slope shows; the months of the first and the
// latest snapshots under the plot.
// It is given two days or more and a positive net somewhere (the screen says why otherwise);
// every label sits inside the plot at a fixed offset, so none can run over another.

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatEurosCompact, formatEurosShown, formatShortMonthYear } from '@/lib/format'
import type { Cents, IsoDate } from '@/lib/model/types'
import { withYear, type EvolutionPoint } from '@/lib/screens/evolution'
import { bubbleLabel, CURVE_LABEL, nextCapLabel } from '@/lib/screens/evolution-words'

type XY = { x: number; y: number }
type Segment = { c1: XY; c2: XY; to: XY }

// Monotone cubic interpolation (Fritsch-Carlson): between two points the curve stays between
// their two heights, so it cannot draw a peak or a dip that did not happen. `points` go left to right.
export function monotone(points: readonly XY[]): Segment[] {
  const n = points.length
  if (n < 2) return []
  const h = points.slice(1).map((p, k) => p.x - points[k].x)
  const d = points.slice(1).map((p, k) => (p.y - points[k].y) / h[k])
  const m = points.map((_, k) => {
    if (k === 0) return d[0]
    if (k === n - 1) return d[n - 2]
    return d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2
  })
  for (let k = 0; k < n - 1; k++) {
    if (d[k] === 0) {
      m[k] = 0
      m[k + 1] = 0
      continue
    }
    const a = m[k] / d[k]
    const b = m[k + 1] / d[k]
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[k] = t * a * d[k]
      m[k + 1] = t * b * d[k]
    }
  }
  return points.slice(1).map((to, k) => ({
    c1: { x: points[k].x + h[k] / 3, y: points[k].y + (m[k] * h[k]) / 3 },
    c2: { x: to.x - h[k] / 3, y: to.y - (m[k + 1] * h[k]) / 3 },
    to,
  }))
}

const W = 356
const H = 212
const LEFT = 6
const TOP = 30
const BOTTOM = 182

// Planche 8 (Nicolas, 10 November 2026): the labels are 13 px, the caption, and the latest value
// 15 px, the body, at whatever width the drawing is shown. The drawing grows with the screen, so
// their size in its units follows the width measured. On the smallest phones they shrink a little
// (to 15 units at most), so the cap's words never reach the right axis.
const CAPTION_PX = 13
const BODY_PX = 15
const MAX_UNIT = 15 / 13
// What the right axis keeps for its labels, in label sizes: « 1,2 M€ » fits.
const AXIS_ROOM = 41 / 11
const round = (n: number) => Math.round(n * 100) / 100

// Round totals strictly inside the scale, a step of 1, 2, 2,5 or 5 times a power of ten: two or three.
export function roundTicks(floor: number, ceiling: number): number[] {
  const raw = (ceiling - floor) / 3
  if (!(raw > 0)) return []
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((k) => k * power).find((s) => s >= raw) ?? 10 * power
  const ticks: number[] = []
  for (let tick = Math.ceil(floor / step) * step; tick < ceiling; tick += step) if (tick > floor) ticks.push(tick)
  return ticks
}

const day = (date: IsoDate): number => {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}
const f = (n: number) => n.toFixed(1)

// `label`: what VoiceOver calls the curve; the example says it in its own words.
type Props = { points: readonly EvolutionPoint[]; nextCap: Cents | null; label?: string }

export function EvolutionChart({ points, nextCap, label = CURVE_LABEL }: Props) {
  const gradient = useId().replace(/:/g, '')
  const [active, setActive] = useState<number | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const [shownWidth, setShownWidth] = useState<number | null>(null)

  useEffect(() => {
    const element = frame.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setShownWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // One unit of the drawing, in screen pixels; until the width is known, the drawing's own.
  const unit = Math.min(shownWidth === null ? 1 : W / shownWidth, MAX_UNIT)
  const caption = round(CAPTION_PX * unit)
  const body = round(BODY_PX * unit)
  const RIGHT = W - 8 - AXIS_ROOM * caption
  const LABEL_GAP = caption + 3 // the height of a label line: two labels closer than this would overlap

  const t0 = day(points[0].date)
  const t1 = day(points[points.length - 1].date)
  const x = (date: IsoDate) => (t1 === t0 ? LEFT : LEFT + ((day(date) - t0) / (t1 - t0)) * (RIGHT - LEFT))
  // The cap is a square value; a net is a hundred squares.
  const capNet = nextCap === null ? null : nextCap * 100
  // The scale closes in on what is drawn (B2): the snapshots and the cap, a margin below and above.
  // A net below zero sits on the axis: the curve never goes under it.
  const nets = points.map((p) => Math.max(0, p.net))
  const highest = Math.max(1, capNet ?? 0, ...nets)
  const lowest = Math.min(...nets)
  const span = highest - lowest > 0 ? highest - lowest : highest * 0.1
  const floor = Math.max(0, lowest - span * 0.15)
  const ceiling = highest + span * 0.08
  const y = (net: Cents) => BOTTOM - ((Math.max(floor, net) - floor) / (ceiling - floor)) * (BOTTOM - TOP)

  const xy = points.map((p) => ({ x: x(p.date), y: y(p.net) }))
  const segments = monotone(xy)
  const line =
    `M${f(xy[0].x)},${f(xy[0].y)}` +
    segments.map((s) => ` C${f(s.c1.x)},${f(s.c1.y)} ${f(s.c2.x)},${f(s.c2.y)} ${f(s.to.x)},${f(s.to.y)}`).join('')
  const veil = `${line} L${f(xy[xy.length - 1].x)},${BOTTOM} L${f(xy[0].x)},${BOTTOM} Z`

  // The right axis: round totals inside the scale, two or three of them.
  const ticks = roundTicks(floor, ceiling)

  // The value labels: the first at the left end, the latest at the right end, each just above
  // its point; each goes under its point when it would sit on the cap's line or its words.
  const capY = capNet === null ? null : y(capNet)
  const capLabelY = capY === null ? null : capY - 6
  const firstAbove = xy[0].y - (10 / 11) * caption
  const firstBelow = xy[0].y + (18 / 11) * caption
  const firstY =
    capLabelY !== null && Math.abs(firstAbove - capLabelY) < LABEL_GAP && firstBelow <= BOTTOM - 4 ? firstBelow : firstAbove
  const lastPoint = xy[xy.length - 1]
  const lastAbove = lastPoint.y - (10 / 11) * caption
  const lastBelow = lastPoint.y + (18 / 11) * caption
  const lastY = capY !== null && lastPoint.y - capY < LABEL_GAP + caption && lastBelow <= BOTTOM - 4 ? lastBelow : lastAbove

  function nearest(clientX: number, rect: DOMRect): number {
    const at = rect.width > 0 ? ((clientX - rect.left) / rect.width) * W : 0
    let best = 0
    xy.forEach((p, i) => {
      if (Math.abs(p.x - at) < Math.abs(xy[best].x - at)) best = i
    })
    return best
  }

  function onPointer(event: PointerEvent<HTMLDivElement>) {
    setActive(nearest(event.clientX, event.currentTarget.getBoundingClientRect()))
  }

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const last = points.length - 1
    const current = active ?? last
    const next =
      event.key === 'ArrowLeft' ? current - 1 : event.key === 'ArrowRight' ? current + 1 : event.key === 'Home' ? 0 : event.key === 'End' ? last : null
    if (next === null) return
    event.preventDefault()
    setActive(Math.min(last, Math.max(0, next)))
  }

  const shown = active === null ? null : points[active]
  const squareOf = (p: EvolutionPoint) => (p.squareValue === null ? null : formatEurosShown(Math.round(p.squareValue)))
  const labelOf = (p: EvolutionPoint) => bubbleLabel(withYear(p.date), formatEurosShown(p.net), squareOf(p))
  const first = points[0]
  const last = points[points.length - 1]

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={points.length - 1}
      aria-valuenow={active ?? points.length - 1}
      aria-valuetext={labelOf(shown ?? last)}
      onPointerMove={onPointer}
      onPointerDown={onPointer}
      onFocus={() => setActive((a) => a ?? points.length - 1)}
      onBlur={() => setActive(null)}
      onKeyDown={onKey}
      ref={frame}
      className="relative touch-none select-none text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      {/* The veil takes the colour of the curve, through `currentColor`. */}
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full tabular-nums text-ink-soft" aria-hidden="true">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={LEFT} x2={RIGHT} y1={y(tick)} y2={y(tick)} className="stroke-hairline" strokeWidth="1" />
            <text data-part="tick" x={RIGHT + 8} y={y(tick) + 0.35 * caption} className="fill-ink-muted" fontSize={caption}>
              {formatEurosCompact(tick)}
            </text>
          </g>
        ))}
        <line x1={LEFT} x2={RIGHT} y1={BOTTOM} y2={BOTTOM} className="stroke-hairline" strokeWidth="1" />

        {/* The cap is the reference of this drawing: it takes the white, the curve does not. */}
        {capNet !== null && capY !== null && capLabelY !== null && (
          <g data-part="cap">
            <line x1={LEFT} x2={RIGHT} y1={capY} y2={capY} className="stroke-ink" strokeWidth="1.5" strokeDasharray="2 4" />
            {/* Under the bubble, which takes a side of the plot, the cap's words are hidden. */}
            {active === null && (
              <text x={LEFT} y={capLabelY} className="fill-ink" fontSize={caption}>
                {nextCapLabel(formatEurosShown(capNet))}
              </text>
            )}
          </g>
        )}

        <path d={veil} fill={`url(#${gradient})`} className="animate-evo-fade motion-reduce:animate-none" />
        <path
          data-part="line"
          d={line}
          pathLength={1}
          fill="none"
          className="animate-evo-draw stroke-ink-soft [stroke-dasharray:1] motion-reduce:animate-none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <text data-part="month" x={LEFT} y={BOTTOM + 18} className="fill-ink-muted" fontSize={caption}>
          {formatShortMonthYear(points[0].date)}
        </text>
        {points.length > 1 && t1 !== t0 && (
          <text data-part="month" x={RIGHT} y={BOTTOM + 18} textAnchor="end" className="fill-ink-muted" fontSize={caption}>
            {formatShortMonthYear(points[points.length - 1].date)}
          </text>
        )}

        {xy.map((p, i) => (
          <circle
            key={points[i].snapshotId}
            cx={p.x}
            cy={p.y}
            r={active === i ? 6 : 4}
            className={active === i ? 'fill-ink-soft stroke-ink-soft' : 'fill-ground stroke-ink-soft'}
            strokeWidth="2"
          />
        ))}
        {active === null && (
          <>
            <text data-part="first-value" x={LEFT} y={firstY} className="fill-ink-soft" fontSize={caption}>
              {formatEurosShown(first.net)}
            </text>
            <text data-part="last-value" x={RIGHT} y={lastY} textAnchor="end" className="fill-ink" fontSize={body} fontWeight="600">
              {formatEurosShown(last.net)}
            </text>
          </>
        )}
      </svg>

      {shown && active !== null ? (
        <div
          data-testid="bubble"
          aria-hidden="true"
          className="pointer-events-none absolute top-0 rounded-control border border-rule-strong bg-ground px-3 py-2 text-caption leading-snug whitespace-nowrap text-ink"
          // At the top of the plot, on the side away from the point: inside the plot, never over
          // the point it describes nor over the axis on the right.
          style={
            xy[active].x <= (LEFT + RIGHT) / 2
              ? { right: `${((W - RIGHT) / W) * 100}%` }
              : { left: `${(LEFT / W) * 100}%` }
          }
        >
          <span className="block text-ink-soft">{withYear(shown.date)}</span>
          <span className="block font-semibold tabular-nums">{formatEurosShown(shown.net)}</span>
          {squareOf(shown) === null ? null : <span className="block text-ink-muted">{`1 carré = ${squareOf(shown)}`}</span>}
        </div>
      ) : null}
    </div>
  )
}
