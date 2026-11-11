'use client'

import { useEffect, useRef } from 'react'
import { motionToken } from '@/lib/app/motion-tokens'
import { useReducedMotion } from '@/lib/app/use-reduced-motion'

const DISPLAY_MS = 1800

// A short message at the bottom of the screen, above the tab bar. A new
// message restarts the delay; `onDone` is called when it is time to remove it.
// Planche 4 (Nicolas, 10 November 2026): it rises 8 px as it fades in (--motion-short, the curve to
// enter), and fades out gently before it goes (--motion-mid, the curve to leave). With fewer
// animations asked, or a browser that cannot animate (the tests), it comes and goes at once.
export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let leaving: Animation | null = null
    const timer = setTimeout(() => {
      const element = ref.current
      if (reduced || !element || typeof element.animate !== 'function') {
        onDone()
        return
      }
      leaving = element.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: motionToken('--motion-mid'),
        easing: motionToken('--motion-leave'),
        fill: 'forwards',
      })
      leaving.finished.then(onDone, () => {})
    }, DISPLAY_MS)
    // A new message while the old one fades: it is seen whole again, for its own delay.
    return () => {
      clearTimeout(timer)
      leaving?.cancel()
    }
  }, [message, onDone, reduced])

  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-24 z-10 mx-auto max-w-sm animate-toast-in rounded-control border border-rule-strong bg-ground px-4 py-3 text-center text-body text-ink motion-reduce:animate-none"
    >
      {message}
    </div>
  )
}
