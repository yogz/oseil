'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { ViewTransition } from './view-transition'

// Planche 1, option C (Nicolas, 10 November 2026): a screen changes by a short fade, never a cut;
// nothing travels from one screen to the other (asked on his phone the same day). A new key on each
// screen is what makes React ask the browser for a view transition; this boundary itself animates
// nothing (`default="none"`). What fades is the whole screen as seen (the browser's `root`), the old
// one into the new one: what sits at the same place on both (the grid, on a phone; the tab bar)
// stays still, and a page scrolled down never jumps. Timings in globals.css; a browser without View
// Transitions, or fewer animations asked, changes screen at once.
export function ScreenTransition({ children }: { children: ReactNode }) {
  const path = usePathname() ?? '/'
  return (
    <ViewTransition key={path} default="none">
      <div className="flex flex-1 flex-col">{children}</div>
    </ViewTransition>
  )
}
