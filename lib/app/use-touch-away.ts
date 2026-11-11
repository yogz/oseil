'use client'

import { useEffect, useRef } from 'react'

// While something a square lit is shown (a line of a category, set forth in the detail), a touch
// anywhere but on a square puts it out (Nicolas, 10 November 2026), as a touch away closes the
// « Tu possèdes… » bubble (components/money/NetAmount.tsx). A touch on a square is left to the grid:
// it lights another line, or the same one again puts it out.
export function useTouchAway(active: boolean, onAway: () => void): void {
  const latest = useRef(onAway)
  useEffect(() => {
    latest.current = onAway
  })
  useEffect(() => {
    if (!active) return
    const away = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-square]')) return
      latest.current()
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [active])
}
