'use client'

import { useSyncExternalStore } from 'react'

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void) {
  const list = window.matchMedia?.(REDUCED_MOTION_QUERY)
  list?.addEventListener('change', onChange)
  return () => list?.removeEventListener('change', onChange)
}

// True when the phone asks for fewer animations: then everything shows its final state at once.
// The CSS says the same (globals.css); this is for what a screen decides itself (a square that
// arrives, a simulation that fades, a replay that steps). Where the browser cannot answer, false.
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false,
    () => false,
  )
}
