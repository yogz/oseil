'use client'

import { useLayoutEffect, useState, type RefObject } from 'react'

// C1: the whole grid in the first screen of a phone, whatever the text above it and the size of the
// phone (on Nicolas's iPhone, with his two snapshots, its last row went under the tab bar). The
// grid is square: it is never wider than the room between its top and the tab bar, less a little
// to spare. It stops shrinking at 60 % of its column: smaller, it would say less than a scroll costs
// (a phone held sideways). Null: the column is narrow enough, nothing to do.
export const GRID_SPARE_PX = 8
export const GRID_MIN_SHARE = 0.6

export function fittedGridWidth(column: number, gridTop: number, limit: number): number | null {
  if (column <= 0) return null
  const room = Math.floor(limit - gridTop - GRID_SPARE_PX)
  if (room >= column) return null
  return Math.max(room, Math.round(column * GRID_MIN_SHARE))
}

// The height of the first screen with Safari's bars shown (`100svh`): it does not change while
// scrolling, unlike where the tab bar is drawn at that moment and unlike the window's own height.
// A browser older than `svh` (Safari before 15.4) gives 0.
function smallViewportHeight(): number {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;top:0;height:100svh;visibility:hidden;pointer-events:none'
  document.body.appendChild(probe)
  const height = probe.offsetHeight
  probe.remove()
  return height
}

// Measured before the board is first painted (no grid seen at full width, then shrinking) and once
// its font is there, then again only when what it was measured for changes: the width of the window
// (a phone turned) or the height of the first screen itself (a window made taller, a split screen).
// Otherwise Mon argent, fitted to the old screen, and a category opened from it, fitted to the new
// one, would not draw the same grid. Safari's bars come and go while scrolling: they change the
// window's height, never the first screen's, and the grid must not change size under the finger.
// A browser older than `svh` only knows the window's height, bars included: there, only a new width
// measures again. A measure records what it was made for, so the same window never measures twice.
export function useGridFit(ref: RefObject<HTMLElement | null>, on: boolean): number | null {
  const [width, setWidth] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (!on) return
    let alive = true
    let measuredFor = { width: -1, screen: -1 }
    const measure = () => {
      const grid = ref.current
      const tabs = document.querySelector<HTMLElement>('nav[aria-label="Onglets"]')
      if (!alive || !grid?.parentElement || !tabs) return
      const screen = smallViewportHeight()
      measuredFor = { width: window.innerWidth, screen }
      // Both in the page's own coordinates, as at the top of the page: wherever it is scrolled to.
      const gridTop = grid.getBoundingClientRect().top + window.scrollY
      setWidth(fittedGridWidth(grid.parentElement.clientWidth, gridTop, (screen || window.innerHeight) - tabs.offsetHeight))
    }
    const onResize = () => {
      if (window.innerWidth !== measuredFor.width || smallViewportHeight() !== measuredFor.screen) measure()
    }
    measure()
    void document.fonts?.ready.then(measure)
    window.addEventListener('resize', onResize)
    return () => {
      alive = false
      window.removeEventListener('resize', onResize)
    }
  }, [ref, on])
  return on ? width : null
}
