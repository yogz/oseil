import { flushSync } from 'react-dom'

// A change of the screen that fades instead of cutting (planche 3, Nicolas, 10 November 2026: the
// figures of a screen flip between euros and percent). The browser takes a picture of the screen,
// the change is drawn, then the old picture fades into the new one with the timings of a screen
// change (globals.css, `root`): no figure ever counts, and at every instant each one shown is true,
// old or new. Without View Transitions (the tests, an older browser) the change is simply drawn;
// with fewer animations asked, globals.css makes it instant.
export function fadeChange(change: () => void) {
  if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function') {
    change()
    return
  }
  document.startViewTransition(() => flushSync(change))
}
