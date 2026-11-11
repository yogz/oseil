'use client'

import { useEffect, useId, useRef, useState } from 'react'

const HERO_FIGURE = 'text-hero font-semibold leading-tight hero-figure tabular-nums text-ink'

// The big amount of Mon argent (option 2, decided by Nicolas on 9 November 2026). With something to
// say about it (what is owned, what is lent for the home), it is touched and opens that sentence in a
// bubble over the grid, which never moves; a second touch, a touch anywhere else, moving on by
// keyboard, or Escape closes it (left open, it would hide the word « Simulation » on the grid). It
// stays the paragraph right after its label: the bubble lives inside it, only while open.
export function NetAmount({ net, owned }: { net: string; owned: string | null }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Said before the screen's own Escape (capture phase): closing the bubble is all this one does.
      event.preventDefault()
      setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', escape, true)
    }
  }, [open])

  if (owned === null) return <p className={HERO_FIGURE}>{net}</p>
  return (
    <p
      ref={ref}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
      className={`relative ${HERO_FIGURE}`}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((was) => !was)}
        className="cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {net}
      </button>
      {open ? (
        <span
          id={id}
          data-bubble=""
          className="absolute inset-x-0 top-full z-10 block animate-board-in rounded-control border border-rule-strong bg-ground px-3.5 py-3 text-body font-normal leading-snug tracking-normal text-ink-soft [font-variation-settings:normal] motion-reduce:animate-none"
        >
          {owned}
        </span>
      ) : null}
    </p>
  )
}
