// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { GoalBar } from '@/components/money/GoalBar'

type Tell = (entries: Array<{ isIntersecting: boolean; intersectionRatio: number; target: Element }>) => void
let watched: Array<{ element: Element; tell: Tell }> = []
const comeIntoView = (element: Element) =>
  act(() => {
    for (const w of watched.filter((w) => w.element === element)) w.tell([{ isIntersecting: true, intersectionRatio: 1, target: element }])
  })
// The bar's clip while it grows; nothing when it does not.
const veil = (c: ParentNode) => {
  const clip = c.querySelector<HTMLElement>('[data-part="clip"]')
  return clip?.style.clipPath ? clip : null
}
const extent = (c: ParentNode) => c.querySelector<HTMLElement>('[data-part="extent"]')!

beforeEach(() => {
  watched = []
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private tell: Tell) {}
      observe(element: Element) {
        watched.push({ element, tell: this.tell })
      }
      disconnect() {
        watched = watched.filter((w) => w.tell !== this.tell)
      }
      unobserve() {}
      takeRecords() {
        return []
      }
    },
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// Each test its own figures: a bar grows once per page load, and the tests share one.
test('until it is seen, the bar is hidden behind its clip; seen, it is uncovered from the left in --motion-long', () => {
  const { container } = render(<GoalBar category="markets" actual={10} target={6} scale={20} />)
  expect(veil(container)!.style.clipPath).toBe('inset(0 100% 0 0)')
  // The target line, outside the clip, waits at the left and travels with the bar to its place.
  const line = () => container.querySelector<HTMLElement>('[data-part="target-line"]')!
  expect(veil(container)!.querySelector('[data-part="target-line"]')).toBeNull()
  expect(line().style.left).toBe('0%')
  comeIntoView(extent(container))
  expect(veil(container)!.style.clipPath).toBe('inset(0 0 0 0)')
  expect(line().style.left).toBe('60%')
  expect(line()).toHaveClass('transition-[left]', 'duration-(--motion-long)', 'ease-(--motion-enter)')
  expect(veil(container)).toHaveClass('duration-(--motion-long)', 'ease-(--motion-enter)')
})

// Nicolas, 10 November 2026: the outline of what is missing, shown before the colour, was « pas beau ».
// And no veil of the ground: on a row lit under the mouse it showed as a dark block.
test('short of its target, the outline of what is missing is clipped too: it appears after the colour', () => {
  const { container } = render(<GoalBar category="gold" actual={15} target={20} scale={20} />)
  expect(veil(container)!.contains(container.querySelector('[data-part="missing"]'))).toBe(true)
  expect(container.querySelector('.bg-ground')).toBeNull()
})

test('the same bar seen again in the same page load does not grow again', () => {
  const first = render(<GoalBar category="secured" actual={7} target={9} scale={20} />)
  comeIntoView(extent(first.container))
  first.unmount()
  const again = render(<GoalBar category="secured" actual={7} target={9} scale={20} />)
  expect(veil(again.container)).toBeNull()
})

test('nothing held, nothing to grow', () => {
  const { container } = render(<GoalBar category="secured" actual={0} target={12} scale={20} />)
  expect(veil(container)).toBeNull()
})
