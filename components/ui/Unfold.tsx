'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { motionToken } from '@/lib/app/motion-tokens'
import { useReducedMotion } from '@/lib/app/use-reduced-motion'

type Phase = 'still' | 'opening' | 'closing'

// Planche 2 (Nicolas, 10 November 2026): what a chapter holds unfolds, never appears in one block. It
// opens at the medium pace with the curve to enter (its height and its opacity), and closes quickly
// with the curve to leave, staying on screen, untouchable, until it is folded. With fewer animations
// asked, or a browser that cannot animate (the tests), it opens and closes at once, as before.
const canAnimate = () => typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function'

export function Unfold({ open, id, children }: { open: boolean; id?: string; children: ReactNode }) {
  const reduced = useReducedMotion()
  const [was, setWas] = useState(open)
  const [phase, setPhase] = useState<Phase>('still')
  if (was !== open) {
    setWas(open)
    setPhase(reduced || !canAnimate() ? 'still' : open ? 'opening' : 'closing')
  }
  const ref = useRef<HTMLDivElement>(null)
  const running = useRef<Animation | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || phase === 'still') return
    running.current?.cancel()
    const opening = phase === 'opening'
    const duration = motionToken(opening ? '--motion-mid' : '--motion-short')
    const easing = motionToken(opening ? '--motion-enter' : '--motion-leave')
    const full = { height: `${element.scrollHeight}px`, opacity: 1 }
    const folded = { height: '0px', opacity: 0 }
    const animation = element.animate(opening ? [folded, full] : [full, folded], { duration, easing })
    running.current = animation
    // A fold cancelled by the next touch rejects: the next phase has taken over.
    animation.finished.then(
      () => setPhase('still'),
      () => {},
    )
  }, [phase])

  if (!open && phase !== 'closing') return null
  return (
    <div ref={ref} id={id} inert={phase === 'closing'} className={phase === 'still' ? undefined : 'overflow-hidden'}>
      {children}
    </div>
  )
}
