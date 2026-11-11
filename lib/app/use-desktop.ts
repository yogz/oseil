'use client'

import { useSyncExternalStore } from 'react'

// Tailwind's `lg` (64rem, in rem like the CSS, so a larger root font moves both): from here the site is drawn for a computer.
export const DESKTOP_QUERY = '(min-width: 64rem)'

function subscribe(onChange: () => void) {
  const list = window.matchMedia?.(DESKTOP_QUERY)
  list?.addEventListener('change', onChange)
  return () => list?.removeEventListener('change', onChange)
}

// True from 1024 px. A screen uses it for what only the computer layout adds (a second column),
// so that a phone never builds, nor reads out, what it does not show. Before the browser has
// answered, and where it cannot answer, it is false: the phone layout.
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(DESKTOP_QUERY).matches ?? false,
    () => false,
  )
}
