// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fittedGridWidth, GRID_SPARE_PX, useGridFit } from '../grid-fit'

test('room enough under the grid: it keeps the width of its column', () => {
  expect(fittedGridWidth(353, 300, 695)).toBeNull()
})

// Nicolas's iPhone, 9 November 2026: the grid began at 348 px and the tab bar at 695 px, for a
// column of 353 px; its last row went under the tab bar.
test('not enough room: the grid shrinks to end above the tab bar, with a little to spare', () => {
  const width = fittedGridWidth(353, 348, 695)!
  expect(width).toBe(695 - 348 - GRID_SPARE_PX)
  expect(348 + width).toBeLessThanOrEqual(695 - GRID_SPARE_PX)
})

test('a phone held sideways: the grid stops shrinking at 60 % of its column, and the page scrolls', () => {
  expect(fittedGridWidth(400, 300, 390)).toBe(240)
})

test('nothing measured yet (no layout): nothing is changed', () => {
  expect(fittedGridWidth(0, 0, 0)).toBeNull()
})

// The hook, on the numbers of the monthly update's journey (e2e/mise-a-jour.spec.ts): a phone 375 px
// wide, a column of 335 px, the grid's top at 176 px, a tab bar of 60 px. jsdom lays nothing out, so
// what the hook reads is given here: the first screen (`100svh`, 0 in a browser older than `svh`),
// the window, the column, the grid's top and the tab bar.
const TABS_PX = 60
const shown = { svh: 560, innerWidth: 375, innerHeight: 560 }
const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!

function setWindow(size: Partial<typeof shown>) {
  Object.assign(shown, size)
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: shown.innerWidth })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: shown.innerHeight })
}

function resize(size: Partial<typeof shown>) {
  act(() => {
    setWindow(size)
    window.dispatchEvent(new Event('resize'))
  })
}

function phone() {
  const tabs = document.createElement('nav')
  tabs.setAttribute('aria-label', 'Onglets')
  const column = document.createElement('div')
  Object.defineProperty(column, 'clientWidth', { configurable: true, value: 335 })
  const grid = document.createElement('div')
  column.appendChild(grid)
  document.body.append(column, tabs)
  // Each measure reads where the grid begins: counting it counts the measures.
  const measures = vi.fn(() => ({ top: 176 }) as DOMRect)
  grid.getBoundingClientRect = measures
  // One ref for every render, as `useRef` gives.
  const ref = { current: grid }
  const { result } = renderHook(() => useGridFit(ref, true))
  return { result, measures }
}

describe('the grid fitted to the first screen of a phone', () => {
  beforeEach(() => {
    setWindow({ svh: 560, innerWidth: 375, innerHeight: 560 })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        if (this.matches('nav[aria-label="Onglets"]')) return TABS_PX
        // The probe of the first screen, the only element fixed to the window.
        if (this.style.position === 'fixed') return shown.svh
        return 0
      },
    })
  })

  afterEach(() => {
    cleanup()
    document.body.replaceChildren()
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight)
  })

  test('a small first screen: the grid ends above the tab bar', () => {
    const { result } = phone()
    expect(result.current).toBe(560 - TABS_PX - 176 - GRID_SPARE_PX)
  })

  // The e2e journey of 9 November 2026: Mon argent was fitted to a first screen of 560 px, which then
  // grew to 812 px at the same width. Mon argent kept its 316 px while the category it opened,
  // measured afresh, took its whole column (335 px): the grid jumped by 19 px between the two.
  test('the first screen itself changes height (a window made taller, a split screen): the grid is fitted again', () => {
    const { result } = phone()
    expect(result.current).toBe(316)
    resize({ svh: 812, innerHeight: 812 })
    expect(result.current).toBeNull()
    resize({ svh: 560, innerHeight: 560 })
    expect(result.current).toBe(316)
  })

  test('Safari’s bars come and go while scrolling: the first screen stays, so the grid keeps its size', () => {
    const { result, measures } = phone()
    resize({ innerHeight: 640 })
    resize({ innerHeight: 560 })
    expect(result.current).toBe(316)
    expect(measures).toHaveBeenCalledTimes(1)
  })

  test('a browser older than svh: the bars change the only height it has, and the grid keeps its size', () => {
    setWindow({ svh: 0 })
    const { result, measures } = phone()
    expect(result.current).toBe(316)
    resize({ innerHeight: 640 })
    expect(result.current).toBe(316)
    expect(measures).toHaveBeenCalledTimes(1)
  })

  test('a measure is made once for a window: a resize that changes nothing measures nothing again', () => {
    const { result, measures } = phone()
    resize({ svh: 812, innerHeight: 812 })
    expect(measures).toHaveBeenCalledTimes(2)
    resize({})
    resize({})
    expect(measures).toHaveBeenCalledTimes(2)
    expect(result.current).toBeNull()
  })

  test('a phone turned: a new width, the grid is fitted again', () => {
    const { result } = phone()
    resize({ innerWidth: 812, innerHeight: 375, svh: 375 })
    // Wider than its room: 60 % of the column (still 335 px here) at least.
    expect(result.current).toBe(Math.round(335 * 0.6))
  })
})
