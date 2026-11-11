// The arrival of the grid (planche 1) plays each time the site is opened or reloaded, and never when coming
// back to Mon argent from another tab: a tab is a move inside the same page, an opening is a new page.
// Decided by Nicolas on 9 November 2026 (it used to play once per snapshot on a device, and he never saw it
// again). The other motions of the squares follow the same rule (10 November 2026). Nothing is kept on the
// device: this lives exactly as long as the page, in this tab's memory, and is never sent anywhere.

export type OncePerLoad = {
  due(): boolean
  shown(): void
  // A new page load, for the tests.
  reset(): void
}

export function oncePerLoad(): OncePerLoad {
  let played = false
  return {
    due: () => !played,
    shown: () => {
      played = true
    },
    reset: () => {
      played = false
    },
  }
}

export const gridArrival = oncePerLoad()
// Repères: the months of the cushion fill, and what cannot be had back quickly dims (10 November 2026).
export const cushionArrival = oncePerLoad()
export const recoverArrival = oncePerLoad()

// A goal bar grows to its place, reaching or passing its target (Nicolas, 10 November 2026): each bar of
// each screen once per page load, the first time it is seen, like the motions of the squares. A bar is
// known by its screen, its category and its figures: the same bar seen again does not grow again.
const goalBars = new Map<string, OncePerLoad>()

export function goalBarArrival(bar: string): OncePerLoad {
  let gate = goalBars.get(bar)
  if (!gate) {
    gate = oncePerLoad()
    goalBars.set(bar, gate)
  }
  return gate
}

// The echo of the bank just updated (10 November 2026): « Enregistrer » asks for it, Mon argent plays it
// once and forgets it. Only a yes or no, in this tab's memory: never stored, never sent.
let echoAsked = false

export const updateEcho = {
  ask(): void {
    echoAsked = true
  },
  due(): boolean {
    return echoAsked
  },
  done(): void {
    echoAsked = false
  },
  // A new page load, for the tests.
  reset(): void {
    echoAsked = false
  },
}
