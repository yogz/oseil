import { describe, expect, test } from 'vitest'
import { cometAt, cubicBezier, loopMs, traceTiming } from '../trace-motion'

const linear = (t: number) => t

describe('cubicBezier', () => {
  test('starts at 0 and ends at 1', () => {
    const ease = cubicBezier('cubic-bezier(0.4, 0, 1, 1)')
    expect(ease(0)).toBe(0)
    expect(ease(1)).toBe(1)
  })

  test('the curve to leave starts slowly and ends fast', () => {
    const ease = cubicBezier('cubic-bezier(0.4, 0, 1, 1)')
    const early = ease(0.2) - ease(0)
    const late = ease(1) - ease(0.8)
    expect(early).toBeLessThan(0.1)
    expect(late).toBeGreaterThan(0.3)
  })

  test('a value it cannot read is the straight line', () => {
    expect(cubicBezier('ease')(0.3)).toBeCloseTo(0.3)
  })
})

describe('traceTiming', () => {
  test('up to three trips, each takes the long duration', () => {
    const t = traceTiming(3, { long: 1200, mid: 350 })
    expect(t.hopMs).toBe(1200)
  })

  test('with many snapshots, the trips shorten so one loop stays short', () => {
    const few = loopMs(traceTiming(3, { long: 1200, mid: 350 }), 3)
    const many = loopMs(traceTiming(20, { long: 1200, mid: 350 }), 20)
    expect(many).toBeLessThan(few * 1.6)
    expect(traceTiming(20, { long: 1200, mid: 350 }).hopMs).toBeGreaterThanOrEqual(250)
  })
})

describe('cometAt', () => {
  const timing = { hopMs: 1000, holdMs: 500, endMs: 2000, fadeMs: 200, lagMs: 300 }
  const positions = [10, 50, 30]

  test('appears at the first snapshot, without a tail', () => {
    const f = cometAt(positions, 0, timing, linear)
    expect(f.head).toBe(10)
    expect(f.tail).toBe(10)
    expect(f.opacity).toBe(0)
    expect(cometAt(positions, 200, timing, linear).opacity).toBe(1)
  })

  test('travels to each snapshot in turn, the tail behind it', () => {
    // fade 200 + hold 500: the first trip starts at 700 ms.
    const mid = cometAt(positions, 1200, timing, linear)
    expect(mid.head).toBeCloseTo(30)
    expect(mid.tail).toBeCloseTo(18)
    expect(cometAt(positions, 1700, timing, linear).head).toBe(50)
    // second trip: 1700 + hold 500 = 2200 → 3200
    expect(cometAt(positions, 2700, timing, linear).head).toBeCloseTo(40)
  })

  test('the tail pulls back into the dot once it has arrived', () => {
    const arrived = cometAt(positions, 1700 + timing.lagMs, timing, linear)
    expect(arrived.tail).toBe(arrived.head)
  })

  test('rests on the latest snapshot, fades, then starts again', () => {
    const loop = loopMs(timing, positions.length)
    expect(cometAt(positions, 3200 + 1000, timing, linear).head).toBe(30)
    expect(cometAt(positions, loop - 1, timing, linear).opacity).toBeLessThan(0.05)
    expect(cometAt(positions, loop, timing, linear)).toEqual(cometAt(positions, 0, timing, linear))
  })

  test('a single snapshot never moves', () => {
    const f = cometAt([42], 900, timing, linear)
    expect(f.head).toBe(42)
    expect(f.tail).toBe(42)
  })
})
