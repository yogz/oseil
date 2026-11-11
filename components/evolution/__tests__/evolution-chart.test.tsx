// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { EvolutionChart, monotone } from '../EvolutionChart'

afterEach(cleanup)

const plain = (text: string | null) => text?.replace(/[  ]/g, ' ') ?? ''

describe('monotone', () => {
  // A Bézier curve sampled between its two end points.
  const bezier = (p0: number, c1: number, c2: number, p3: number, t: number) =>
    (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t ** 2 * c2 + t ** 3 * p3

  test('never leaves the values of the two snapshots around it', () => {
    const shapes = [
      [100, 134, 156, 172],
      [100, 100, 100, 100],
      [100, 300, 110, 120], // a spike
      [300, 100, 290, 100], // a dip
      [100, 100, 200, 200], // a plateau, then a step
      [5, 1, 1, 9],
    ]
    for (const ys of shapes) {
      const points = ys.map((y, i) => ({ x: i * 30 + (i % 2) * 7, y }))
      const segments = monotone(points)
      expect(segments).toHaveLength(points.length - 1)
      segments.forEach((s, k) => {
        const lo = Math.min(points[k].y, points[k + 1].y)
        const hi = Math.max(points[k].y, points[k + 1].y)
        for (let t = 0; t <= 1.0001; t += 0.05) {
          const y = bezier(points[k].y, s.c1.y, s.c2.y, s.to.y, t)
          expect(y).toBeGreaterThanOrEqual(lo - 1e-9)
          expect(y).toBeLessThanOrEqual(hi + 1e-9)
        }
        expect(s.to).toEqual(points[k + 1])
      })
    }
  })

  test('two points make a straight segment', () => {
    const [s] = monotone([
      { x: 0, y: 0 },
      { x: 30, y: 60 },
    ])
    expect(s.c1.y / s.c1.x).toBeCloseTo(2)
    expect(s.c2.y).toBeCloseTo(60 - (30 - s.c2.x) * 2)
  })
})

const points = [
  { snapshotId: 'a', date: '2024-01-15', net: 10_200_000, squareValue: 102_000 },
  { snapshotId: 'b', date: '2025-01-15', net: 13_450_000, squareValue: 134_500 },
  { snapshotId: 'c', date: '2026-09-30', net: 17_200_000, squareValue: 172_000 },
]

function setup() {
  const view = render(<EvolutionChart points={points} nextCap={200_000} />)
  const slider = screen.getByRole('slider')
  // jsdom has no layout: the plot is 356 px wide, as its viewBox.
  slider.getBoundingClientRect = () => ({ left: 0, top: 0, right: 356, bottom: 212, width: 356, height: 212, x: 0, y: 0, toJSON: () => ({}) })
  return { ...view, slider }
}

describe('the bubble', () => {
  test('is hidden until the curve is touched', () => {
    setup()
    expect(screen.queryByTestId('bubble')).toBeNull()
  })

  test('snaps to the nearest snapshot: its date, its amount, its square value', () => {
    const { slider } = setup()
    // The middle snapshot (January 2025) is at x = 115 of 356.
    fireEvent.pointerMove(slider, { clientX: 150, pointerType: 'mouse' })
    const bubble = screen.getByTestId('bubble')
    expect(plain(bubble.textContent)).toContain('15 janvier 2025')
    expect(plain(bubble.textContent)).toContain('134 500 €')
    expect(plain(bubble.textContent)).toContain('1 345 €')
  })

  test('stays inside the plot, on the side away from its point', () => {
    const { slider } = setup()
    // The first point is at the left end: the bubble sits at the right of the plot, before the axis.
    fireEvent.pointerMove(slider, { clientX: 10, pointerType: 'mouse' })
    expect(screen.getByTestId('bubble').style.right).not.toBe('')
    expect(screen.getByTestId('bubble').style.left).toBe('')
    // The latest point is at the right end: the bubble sits at the left of the plot.
    fireEvent.pointerMove(slider, { clientX: 350, pointerType: 'mouse' })
    expect(screen.getByTestId('bubble').style.left).not.toBe('')
    expect(screen.getByTestId('bubble').style.right).toBe('')
  })

  test('does not invent a value between two snapshots', () => {
    const { slider } = setup()
    fireEvent.pointerMove(slider, { clientX: 250, pointerType: 'mouse' })
    expect(plain(screen.getByTestId('bubble').textContent)).toContain('30 septembre 2026')
  })

  test('moves with the arrow keys', () => {
    const { slider } = setup()
    fireEvent.focus(slider)
    expect(plain(screen.getByTestId('bubble').textContent)).toContain('30 septembre 2026')
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    expect(plain(screen.getByTestId('bubble').textContent)).toContain('15 janvier 2025')
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    expect(plain(screen.getByTestId('bubble').textContent)).toContain('15 janvier 2024')
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    expect(plain(screen.getByTestId('bubble').textContent)).toContain('15 janvier 2024')
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(plain(screen.getByTestId('bubble').textContent)).toContain('15 janvier 2025')
    expect(slider).toHaveAttribute('aria-valuenow', '1')
  })
})

describe('the drawing', () => {
  // B2 (Nicolas, 11 November 2026): everything in euros of the total, the cap too.
  test('has a dotted next cap told as a total, and a veil', () => {
    const { container } = setup()
    expect(plain(container.textContent)).toContain('prochain cap : 200 000 €')
    expect(plain(container.textContent)).not.toContain('1 carré')
    expect(container.querySelector('[data-part="cap"]')).not.toBeNull()
    expect(container.querySelector('linearGradient')).not.toBeNull()
    expect(container.querySelector('[data-part="line"]')).toHaveClass('motion-reduce:animate-none')
  })

  test('keeps the first and the latest values inside the plot, one at each end', () => {
    const { container } = render(<EvolutionChart points={points} nextCap={200_000} />)
    const first = container.querySelector('[data-part="first-value"]')!
    const last = container.querySelector('[data-part="last-value"]')!
    // The first value starts at the left of the plot, the latest ends at its right (300 of 356).
    expect(first.getAttribute('text-anchor') ?? 'start').toBe('start')
    expect(Number(first.getAttribute('x'))).toBeGreaterThanOrEqual(6)
    expect(last.getAttribute('text-anchor')).toBe('end')
    expect(Number(last.getAttribute('x'))).toBeLessThanOrEqual(300)
    expect(Number(last.getAttribute('x'))).toBeGreaterThan(150)
    for (const text of container.querySelectorAll('text')) {
      expect(Number(text.getAttribute('y'))).toBeGreaterThanOrEqual(10)
      expect(Number(text.getAttribute('y'))).toBeLessThanOrEqual(212)
    }
  })

  test('moves the first value under its point when it would sit on the cap label', () => {
    // The first point at the cap's height: its label goes below it, not over « prochain cap ».
    const high = [
      { snapshotId: 'a', date: '2024-01-15', net: 20_000_000, squareValue: 200_000 },
      { snapshotId: 'b', date: '2026-09-30', net: 17_200_000, squareValue: 172_000 },
    ]
    const { container } = render(<EvolutionChart points={high} nextCap={200_000} />)
    const capLabel = container.querySelector('[data-part="cap"] text')!
    const first = container.querySelector('[data-part="first-value"]')!
    expect(Math.abs(Number(first.getAttribute('y')) - Number(capLabel.getAttribute('y')))).toBeGreaterThanOrEqual(14)
  })

  test('never draws a negative value below the axis', () => {
    const owing = [
      { snapshotId: 'a', date: '2024-01-15', net: -500_000, squareValue: null },
      { snapshotId: 'b', date: '2026-09-30', net: 1_000_000, squareValue: 10_000 },
    ]
    const { container } = render(<EvolutionChart points={owing} nextCap={null} />)
    for (const circle of container.querySelectorAll('circle')) expect(Number(circle.getAttribute('cy'))).toBeLessThanOrEqual(182)
  })

  test('has no cap line without a cap', () => {
    const { container } = render(<EvolutionChart points={points} nextCap={null} />)
    expect(container.querySelector('[data-part="cap"]')).toBeNull()
  })

  // Planche 8, option B (Nicolas, 10 November 2026): white is the colour of a reference, never of
  // a figure. The cap is the reference, in white; the curve of the total is in the soft ink.
  test('draws the curve in the soft ink and the cap in white', () => {
    const { container } = setup()
    expect(container.querySelector('[data-part="line"]')).toHaveClass('stroke-ink-soft')
    expect(container.querySelector('[data-part="line"]')).not.toHaveClass('stroke-ink')
    expect(container.querySelector('[data-part="cap"] line')).toHaveClass('stroke-ink')
    expect(container.querySelector('[data-part="cap"] text')).toHaveClass('fill-ink')
    for (const circle of container.querySelectorAll('circle')) expect(circle).toHaveClass('stroke-ink-soft')
    // The veil under the curve takes the colour of the curve.
    expect(container.querySelector('svg')).toHaveClass('text-ink-soft')
  })
})

// B2 (Nicolas, 11 November 2026): the axis closes in on the snapshots, so the slope shows; one unit,
// the euros of the total; the months of the first and the latest snapshots under the plot.
describe('the scale', () => {
  test('closes in on the snapshots: the lowest and the highest use most of the height', () => {
    const { container } = render(<EvolutionChart points={points} nextCap={null} />)
    const ys = [...container.querySelectorAll('circle')].map((c) => Number(c.getAttribute('cy')))
    // 30 to 182: the plot is 152 high; the curve rises over more than half of it.
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(76)
  })

  test('the right axis is in euros of the total, never a square value', () => {
    const { container } = render(<EvolutionChart points={points} nextCap={null} />)
    const axis = [...container.querySelectorAll('[data-part="tick"]')].map((t) => plain(t.textContent))
    expect(axis.length).toBeGreaterThanOrEqual(2)
    for (const label of axis) expect(label).toMatch(/^\d[\d,]* (k€|M€)$/)
  })

  test('says the month of the first and of the latest snapshots, one at each end', () => {
    const { container } = render(<EvolutionChart points={points} nextCap={null} />)
    const months = [...container.querySelectorAll('[data-part="month"]')].map((t) => plain(t.textContent))
    expect(months).toEqual(['janv. 2024', 'sept. 2026'])
  })

  test('puts the latest value under its point when the cap line runs just above it', () => {
    const near = [
      { snapshotId: 'a', date: '2025-11-10', net: 41_200_000, squareValue: 412_000 },
      { snapshotId: 'b', date: '2026-11-10', net: 44_800_000, squareValue: 448_000 },
    ]
    const { container } = render(<EvolutionChart points={near} nextCap={450_000} />)
    const capLine = Number(container.querySelector('[data-part="cap"] line')!.getAttribute('y1'))
    const point = Number([...container.querySelectorAll('circle')].at(-1)!.getAttribute('cy'))
    const last = Number(container.querySelector('[data-part="last-value"]')!.getAttribute('y'))
    expect(capLine).toBeLessThan(point)
    expect(last).toBeGreaterThan(point)
  })
})

describe('the size of the labels', () => {
  const sizes = (container: HTMLElement) =>
    [...container.querySelectorAll('text')].map((t) => Number(t.getAttribute('font-size')))

  test('are 13 px, the caption size, when the plot is as wide as its drawing', () => {
    const { container } = render(<EvolutionChart points={points} nextCap={200_000} />)
    const last = Number(container.querySelector('[data-part="last-value"]')!.getAttribute('font-size'))
    expect(last).toBe(15)
    for (const size of sizes(container)) if (size !== last) expect(size).toBe(13)
  })

  test('stay 13 px on a wider screen, where the drawing is shown larger', () => {
    const before = globalThis.ResizeObserver
    globalThis.ResizeObserver = class {
      constructor(private readonly report: ResizeObserverCallback) {}
      observe() {
        this.report([{ contentRect: { width: 712 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    try {
      // 712 px for a drawing of 356: every unit is shown twice as large, so a label is 6.5 units.
      const { container } = render(<EvolutionChart points={points} nextCap={200_000} />)
      expect(sizes(container)).toContain(6.5)
      expect(Number(container.querySelector('[data-part="last-value"]')!.getAttribute('font-size'))).toBe(7.5)
    } finally {
      globalThis.ResizeObserver = before
    }
  })

  test('shrink a little on the smallest phones, so the cap and the axis never meet', () => {
    const before = globalThis.ResizeObserver
    globalThis.ResizeObserver = class {
      constructor(private readonly report: ResizeObserverCallback) {}
      observe() {
        this.report([{ contentRect: { width: 272 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    try {
      const { container } = render(<EvolutionChart points={points} nextCap={200_000} />)
      // At most 15 units for a label and 17.3 for the latest value, in a drawing shown at 272 px.
      expect(Math.max(...sizes(container))).toBeLessThanOrEqual(17.5)
      const last = container.querySelector('[data-part="last-value"]')!
      expect(Number(last.getAttribute('x'))).toBeLessThan(300)
    } finally {
      globalThis.ResizeObserver = before
    }
  })
})
