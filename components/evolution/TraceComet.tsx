'use client'

import { useEffect, useRef } from 'react'
import { motionToken } from '@/lib/app/motion-tokens'
import { cometAt, cubicBezier, traceTiming } from '@/lib/app/trace-motion'
import { useReducedMotion } from '@/lib/app/use-reduced-motion'
import type { CategoryId } from '@/lib/model/types'

// The dot that travels on a trace of « Catégorie par catégorie » (planche of 11 November 2026, chosen by
// Nicolas): on a loop, from the first snapshot to the latest, with a tail like a shooting star. Its
// tail is the one gradient of the site outside the evolution chart (DEGRADES_PERMIS, decided by
// Nicolas the same day): as wide as the dot where it touches it, thinning to a point and fading behind.
// The still dots stay drawn underneath it: whenever one looks, the trace reads as before. It plays only
// while on screen; with fewer animations asked, or a browser that cannot say what is on screen, nothing
// travels. Decoration only: the trace already says it in words to VoiceOver.

const HEAD: Record<CategoryId, string> = {
  available: 'bg-cat-available',
  secured: 'bg-cat-secured',
  markets: 'bg-cat-markets',
  gold: 'bg-cat-gold',
  property: 'bg-cat-property',
}

const TAIL: Record<CategoryId, string> = {
  available: 'from-cat-available/0 to-cat-available/90',
  secured: 'from-cat-secured/0 to-cat-secured/90',
  markets: 'from-cat-markets/0 to-cat-markets/90',
  gold: 'from-cat-gold/0 to-cat-gold/90',
  property: 'from-cat-property/0 to-cat-property/90',
}

// A point at the tail's end, the dot's full height at its head.
const TAPER = 'polygon(0 50%, 100% 0, 100% 100%)'

export function TraceComet({
  positions,
  color,
  startedAt,
}: {
  // Where each snapshot sits on the line, in percent of its width, the oldest first.
  positions: readonly number[]
  color: CategoryId
  // The same clock for every trace: their dots travel together.
  startedAt: number
}) {
  const reduced = useReducedMotion()
  const head = useRef<HTMLSpanElement>(null)
  const tail = useRef<HTMLSpanElement>(null)
  const moves = positions.some((p) => p !== positions[0])

  useEffect(() => {
    const h = head.current
    const t = tail.current
    if (reduced || !moves || !h || !t || typeof IntersectionObserver === 'undefined') return
    const timing = traceTiming(positions.length, { long: motionToken('--motion-long'), mid: motionToken('--motion-mid') })
    const ease = cubicBezier(motionToken('--motion-leave'))
    let frame = 0
    const draw = (now: number) => {
      const f = cometAt(positions, now - startedAt, timing, ease)
      h.style.left = `${f.head}%`
      h.style.opacity = String(f.opacity)
      const length = Math.abs(f.head - f.tail)
      t.style.left = `${Math.min(f.head, f.tail)}%`
      t.style.width = `${length}%`
      // Drawn going right; going left, the same tail turned round.
      t.style.transform = f.head < f.tail ? 'scaleX(-1)' : ''
      t.style.opacity = length > 0.2 ? String(f.opacity) : '0'
      frame = requestAnimationFrame(draw)
    }
    const observer = new IntersectionObserver((entries) => {
      cancelAnimationFrame(frame)
      if (entries.some((e) => e.isIntersecting)) frame = requestAnimationFrame(draw)
    })
    observer.observe(h.parentElement ?? h)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [reduced, moves, positions, startedAt])

  if (reduced || !moves) return null
  return (
    <>
      <span
        ref={tail}
        aria-hidden="true"
        data-comet="tail"
        className={`absolute top-0.5 h-2 bg-linear-to-r opacity-0 ${TAIL[color]}`}
        style={{ clipPath: TAPER }}
      />
      <span
        ref={head}
        aria-hidden="true"
        data-comet="head"
        className={`absolute top-0.5 size-2 -translate-x-1/2 rounded-full opacity-0 ${HEAD[color]}`}
      />
    </>
  )
}
