'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { FIND_HREF, markFromInside } from '@/lib/app/find-entry'
import { FIND_LABEL } from '@/lib/screens/find-words'
import { FindIcon } from './FindIcon'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

// The magnifier: a link to « Trouver », 44 px to touch, named for VoiceOver. A touch on it says
// « Trouver » was opened from inside Oseil, so that « Fermer » goes back (lib/app/find-entry.ts).
export function FindLink({ className = '' }: { className?: string }) {
  return (
    <Link
      href={FIND_HREF}
      aria-label={FIND_LABEL}
      onClick={markFromInside}
      className={`inline-flex size-11 shrink-0 items-center justify-center text-ink-soft ${FOCUS} ${className}`}
    >
      <FindIcon className="size-5.5" />
    </Link>
  )
}

// The magnifier at the top right of a screen with the tab bar, on a phone (a computer has it in the menu
// at the top). There is no common header: it wraps the first row of the screen (the way back, or the
// title), sits at its right and pushes nothing down. It comes after that row for VoiceOver and the
// keyboard, and the row keeps clear of it, a long name included.
export function FindCorner({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex flex-col pr-9 lg:pr-0">
      {children}
      <FindLink className="absolute top-0 -right-2.5 lg:hidden" />
    </div>
  )
}
