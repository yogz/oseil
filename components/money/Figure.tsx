'use client'

import { useId } from 'react'
import { useDisplayMode } from './display-mode-context'

const TONES = { gain: 'text-gain', loss: 'text-loss', zero: 'text-ink-muted' } as const
type Tone = keyof typeof TONES

// A figure that flips between euros and percent for the whole screen. Dotted underline says it
// can be touched. It stays part of its sentence (a 44 px high box inside a line would leave a blank
// around it); its 44 px touch zone is an invisible one drawn around the text, which pushes nothing.
// VoiceOver is told what a touch does, as a description, so the figure itself is still read first.
// C4 (decided by Nicolas on 9 November 2026): the dotted underline only in lists. A figure set apart
// (`quiet`: the big amount of a screen, the progress under it) has none, and is touched all the same.
export function Figure({
  euros,
  percent,
  tone,
  quiet = false,
}: {
  euros: string
  percent: string
  // One tone, or one per mode (a gain can be « +30 € » and « 0,0 % » at once).
  tone?: Tone | { euros: Tone; percent: Tone }
  quiet?: boolean
}) {
  const { mode, toggle } = useDisplayMode()
  const hintId = useId()
  const shown = typeof tone === 'object' ? tone[mode] : tone
  const classes = [
    'relative inline tabular-nums',
    quiet ? '' : 'underline decoration-dotted underline-offset-4',
    'after:absolute after:-inset-y-3.5 after:inset-x-0',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
    shown ? TONES[shown] : '',
  ]
  return (
    <>
      <button type="button" onClick={toggle} aria-describedby={hintId} className={classes.filter(Boolean).join(' ')}>
        {mode === 'percent' ? percent : euros}
      </button>
      <span id={hintId} hidden>
        {mode === 'percent' ? 'passer en euros' : 'passer en %'}
      </span>
    </>
  )
}
