// The hint that a square can be touched (planche of the hint, option B, Nicolas, 10 November 2026):
// right after the grid has arrived, the grid shows once what a touch does. The largest category
// lights (the others dim), its row lights as under the mouse, and a sentence under the grid says it,
// in the place of « Un carré vaut… »; then all comes back. (Before: a trail of four squares passing
// like a finger, which he did not like; and before that a single square lit, « trop discret ».) It
// plays on the first openings of the site only: never
// again once a square has been touched on this device, and never after MAX_VISITS openings either.
//
// What is kept is a word in the browser's local storage, like the appearance: « touché », or how many
// times the hint has played. It says nothing about the person and never leaves the browser. On a new
// device the hint comes back, which is only a few seconds of motion. A storage that refuses (private
// browsing) reads as nothing kept: the hint plays, and is simply not counted.

import type { GridCategory } from '@/lib/model/squares'

export const SQUARE_HINT_KEY = 'oseil-indice-carres'
const TOUCHED = 'touche'
export const MAX_VISITS = 3

function read(): string | null {
  try {
    return localStorage.getItem(SQUARE_HINT_KEY)
  } catch {
    return null
  }
}

function write(value: string): void {
  try {
    localStorage.setItem(SQUARE_HINT_KEY, value)
  } catch {
    // See above: the hint is only not counted.
  }
}

function playedCount(kept: string | null): number {
  const n = Number(kept)
  return Number.isInteger(n) && n > 0 ? n : 0
}

export const squareHint = {
  due(): boolean {
    const kept = read()
    return kept !== TOUCHED && playedCount(kept) < MAX_VISITS
  },
  // Counted when it really starts playing, not when it is only planned.
  played(): void {
    const kept = read()
    if (kept === TOUCHED) return
    write(String(playedCount(kept) + 1))
  },
  touched(): void {
    write(TOUCHED)
  },
}

// The category the hint lights: the largest one, the first on a tie.
export function hintCategory(categories: readonly GridCategory[]): GridCategory['category'] | null {
  let best: GridCategory | null = null
  for (const c of categories) if (c.squares > 0 && (best === null || c.squares > best.squares)) best = c
  return best?.category ?? null
}
