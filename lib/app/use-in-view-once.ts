'use client'

import { useEffect, useState, type RefObject } from 'react'
import type { OncePerLoad } from './arrival'
import { useReducedMotion } from './use-reduced-motion'

// A motion of the squares that plays the first time they come into view, once per page load
// (lib/app/arrival.ts). `waiting`: drawn as before the motion, not yet seen; `playing`: the final
// state, reached through its transitions; `still`: the final state at once, with no motion at all
// (played already, fewer animations asked, or a browser that cannot say what is in view).
export type InViewMotion = 'waiting' | 'playing' | 'still'

// « In view » means seen (10 November 2026): all the squares on screen, not a first pixel of them, and
// above the tab bar fixed at the bottom of a phone (about 80 px with the iPhone's home bar), which the
// browser would count as in view. 0.99 rather than 1: a browser sometimes reports 0.999 for a whole
// block. The squares that move here are small (a row of months, a grid of 270 px): they always fit.
const SEEN_RATIO = 0.99
const BELOW_TAB_BAR = '0px 0px -96px 0px'

export function useInViewOnce(gate: OncePerLoad, ref: RefObject<Element | null>): InViewMotion {
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState<InViewMotion>(() =>
    gate.due() && typeof IntersectionObserver !== 'undefined' ? 'waiting' : 'still',
  )
  useEffect(() => {
    const element = ref.current
    if (phase !== 'waiting' || reduced || !element) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= SEEN_RATIO)) return
        observer.disconnect()
        gate.shown()
        setPhase('playing')
      },
      { threshold: SEEN_RATIO, rootMargin: BELOW_TAB_BAR },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [phase, reduced, gate, ref])
  return reduced ? 'still' : phase
}
