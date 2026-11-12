// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { GoalBar } from '../GoalBar'
import { HundredSquares } from '../HundredSquares'

afterEach(cleanup)

// The phone asks for fewer animations; returns what undoes it.
function reduceMotion(): () => void {
  const before = window.matchMedia
  window.matchMedia = ((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  return () => {
    window.matchMedia = before
  }
}

const SQUARES = [
  { category: 'available' as const, count: 10 },
  { category: 'secured' as const, count: 15 },
  { category: 'markets' as const, count: 15 },
  { category: 'gold' as const, count: 1 },
  { category: 'property' as const, count: 59 },
]

function cells(container: ParentNode) {
  return Array.from(container.querySelectorAll('[data-category]'))
}

test('draws 100 coloured squares in the given order, none empty', () => {
  render(<HundredSquares squares={SQUARES} label="Ta situation" />)
  const grid = screen.getByRole('img', { name: 'Ta situation' })
  const all = cells(grid)
  expect(all).toHaveLength(100)
  const count = (c: string) => all.filter((e) => e.getAttribute('data-category') === c).length
  expect([count('available'), count('secured'), count('markets'), count('gold'), count('property')]).toEqual([
    10, 15, 15, 1, 59,
  ])
  expect(all.map((e) => e.getAttribute('data-category')).slice(0, 11)).toEqual([
    ...Array(10).fill('available'),
    'secured',
  ])
  expect(grid.querySelectorAll('[data-empty]')).toHaveLength(0)
})

test('completes the grid with empty outlines', () => {
  const { container } = render(
    <HundredSquares squares={[{ category: 'available', count: 97 }]} empty={3} label="g" />,
  )
  expect(container.querySelectorAll('[data-empty]')).toHaveLength(3)
  expect(container.querySelectorAll('[data-category]')).toHaveLength(97)
  expect(container.querySelectorAll('[data-square]')).toHaveLength(100)
})

test('lit dims every other category', () => {
  const { container } = render(<HundredSquares squares={SQUARES} lit="markets" label="g" />)
  const full = cells(container).filter((e) => !e.className.includes('opacity-'))
  expect(full).toHaveLength(15)
  expect(full.every((e) => e.getAttribute('data-category') === 'markets')).toBe(true)
})

test('animate brings the squares in reading order, the whole grid in under a second', () => {
  const { container } = render(<HundredSquares squares={SQUARES} animate label="g" />)
  const all = Array.from(container.querySelectorAll<HTMLElement>('[data-square]'))
  expect(all[0].style.animationDelay).toBe('0ms')
  expect(parseFloat(all[1].style.animationDelay)).toBe(6)
  expect(parseFloat(all[99].style.animationDelay) + 350).toBeLessThan(1000)
  expect(all[0].className).toContain('animate-square-arrive')
  expect(all[0].className).toContain('motion-reduce:animate-none')
})

test('every square moves with the vocabulary; a dimmed one says so, for its gentler pace', () => {
  const { container } = render(<HundredSquares squares={SQUARES} lit="markets" label="g" />)
  const all = Array.from(container.querySelectorAll<HTMLElement>('[data-square]'))
  expect(all.every((e) => e.classList.contains('square-motion'))).toBe(true)
  expect(all.filter((e) => e.hasAttribute('data-dim'))).toHaveLength(85)
})

test('with fewer animations asked, the squares are in their final state at once', () => {
  const restore = reduceMotion()
  try {
    const { container } = render(<HundredSquares squares={SQUARES} animate label="g" />)
    const all = Array.from(container.querySelectorAll<HTMLElement>('[data-square]'))
    expect(all).toHaveLength(100)
    expect(all.some((e) => e.className.includes('animate-'))).toBe(false)
    expect(all.some((e) => e.classList.contains('square-motion'))).toBe(false)
    expect(all.every((e) => e.style.animationDelay === '')).toBe(true)
  } finally {
    restore()
  }
})

test('cells recolour squares in place; only those that change are staggered', () => {
  const real = [...Array(10).fill('available'), ...Array(90).fill('property')] as Array<'available' | 'property' | 'secured'>
  const shown = [...real]
  shown[8] = 'secured'
  shown[9] = 'secured'
  const { container } = render(<HundredSquares squares={SQUARES} cells={shown} from={real} label="g" />)
  const all = Array.from(container.querySelectorAll<HTMLElement>('[data-square]'))
  expect(all).toHaveLength(100)
  expect(all[8]).toHaveClass('bg-cat-secured')
  expect(all[8].getAttribute('data-category')).toBe('secured')
  expect(all[7]).toHaveClass('bg-cat-available')
  expect(all[7].style.transitionDelay).toBe('')
  expect(all[8].style.transitionDelay).toBe('0ms, 0ms, 0ms, 0ms')
  expect(all[9].style.transitionDelay).toBe('0ms, 40ms, 40ms, 0ms')
})

test('does not animate by default', () => {
  const { container } = render(<HundredSquares squares={SQUARES} label="g" />)
  expect(container.querySelector<HTMLElement>('[data-square]')!.style.animationDelay).toBe('')
})

function part(c: ParentNode, p: string) {
  return c.querySelector<HTMLElement>(`[data-part="${p}"]`)
}

test('GoalBar at (10, 6) has an excess of 4 and no shortfall', () => {
  const { container } = render(<GoalBar category="markets" actual={10} target={6} scale={20} />)
  expect(screen.getByRole('img', { name: '10 carrés, objectif 6' })).toBeInTheDocument()
  expect(part(container, 'excess')).toHaveAttribute('data-squares', '4')
  expect(part(container, 'missing')).toBeNull()
  expect(part(container, 'target-line')).not.toBeNull()
})

test('GoalBar at (15, 19) has a shortfall of 4 and no excess', () => {
  const { container } = render(<GoalBar category="gold" actual={15} target={19} scale={19} />)
  expect(part(container, 'missing')).toHaveAttribute('data-squares', '4')
  expect(part(container, 'excess')).toBeNull()
  expect(part(container, 'filled')).toHaveAttribute('data-squares', '15')
})

test('GoalBar width is max(actual, target) over the shared scale', () => {
  const { container } = render(<GoalBar category="markets" actual={10} target={6} scale={20} />)
  expect(part(container, 'extent')!.style.width).toBe('50%')
})

test('GoalBar takes the tint of its category, the tick stays neutral', () => {
  const { container } = render(<GoalBar category="markets" actual={10} target={6} scale={20} />)
  expect(part(container, 'filled')).toHaveClass('bg-cat-markets')
  expect(part(container, 'target-line')).toHaveClass('bg-ink')
  cleanup()
  const short = render(<GoalBar category="gold" actual={15} target={19} scale={19} />)
  expect(part(short.container, 'missing')).toHaveClass('border-cat-gold')
})

// Planche 7, option C (Nicolas, 10 November 2026): what is missing is an outline with a pale veil
// of its tint, so the shortfall shows from afar; the full part stays the only solid one.
test('GoalBar draws what is missing as an outline with a pale veil of its tint', () => {
  const { container } = render(<GoalBar category="gold" actual={15} target={19} scale={19} />)
  expect(part(container, 'missing')).toHaveClass('border-cat-gold', 'bg-cat-gold/25')
  expect(part(container, 'filled')).toHaveClass('bg-cat-gold')
})

test('GoalBar with nothing held is a closed outline up to the target', () => {
  const { container } = render(<GoalBar category="secured" actual={0} target={14} scale={19} />)
  expect(container.querySelector('[data-part="filled"]')?.getAttribute('data-squares')).toBe('0')
  const missing = container.querySelector('[data-part="missing"]')!
  expect(missing.getAttribute('data-squares')).toBe('14')
  // Nothing filled sits on its left: the outline needs its own left edge.
  expect(missing.className).not.toContain('border-l-0')
  expect(missing.className).toContain('border-cat-secured')
})

test('GoalBar keeps the outline open on the left when a filled part meets it', () => {
  const { container } = render(<GoalBar category="gold" actual={15} target={19} scale={19} />)
  expect(container.querySelector('[data-part="missing"]')!.className).toContain('border-l-0')
})

test('GoalBar names its squares in the singular for one', () => {
  render(<GoalBar category="gold" actual={1} target={2} scale={2} />)
  expect(screen.getByRole('img', { name: '1 carré, objectif 2' })).toBeInTheDocument()
  cleanup()
  render(<GoalBar category="gold" actual={0} target={2} scale={2} />)
  expect(screen.getByRole('img', { name: '0 carré, objectif 2' })).toBeInTheDocument()
  cleanup()
  render(<GoalBar category="gold" actual={3} target={2} scale={3} />)
  expect(screen.getByRole('img', { name: '3 carrés, objectif 2' })).toBeInTheDocument()
})

test('GoalBar never exceeds 100 % when the scale is too small', () => {
  const { container } = render(<GoalBar category="secured" actual={30} target={10} scale={20} />)
  expect(part(container, 'extent')!.style.width).toBe('100%')
})

test('animate with lit keeps the dimming: the animation cannot override opacity afterwards', () => {
  const { container } = render(<HundredSquares squares={SQUARES} lit="markets" animate label="g" />)
  const dimmed = cells(container).filter((e) => e.className.includes('opacity-25'))
  expect(dimmed).toHaveLength(85)
  expect(dimmed[0].className).toContain('animate-square-arrive')
  const css = readFileSync('app/globals.css', 'utf8')
  expect(css).toMatch(/--animate-square-arrive:[^;]*\bbackwards\b/)
  expect(css).not.toMatch(/--animate-square-arrive:[^;]*\bboth\b/)
})

// Option 2½ of the hover planche, chosen by Nicolas on 9 November 2026: the square under the mouse
// takes a white edge and grows by 8 %, which stays inside the 3 px between squares, so the lines
// around it never disappear (at 12 % over 2 px, they did).
test('on a computer a square under the mouse takes a white edge and grows slightly and quickly; never under a finger', () => {
  const css = readFileSync('app/globals.css', 'utf8')
  const hover = css.match(/@media \(hover: hover\) and \(pointer: fine\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
  expect(hover).toMatch(/\.square-motion:hover\s*\{[^}]*transform:\s*scale\(1\.08\)/)
  expect(hover).toMatch(/outline:\s*var\(--square-edge, 2px\) solid var\(--ink\)/)
  expect(hover).toMatch(/outline-offset:\s*calc\(-1 \* var\(--square-edge, 2px\)\)/)
  // Its size, its edge and its curve, nothing more: no glow.
  const properties = [...hover.matchAll(/^\s*([a-z-]+):/gm)].map((m) => m[1])
  expect(properties).toEqual(['transform', 'outline', 'outline-offset', 'transition-timing-function'])
  // The size answers at the short pace.
  expect(css).toMatch(/\.square-motion\s*\{[^}]*transition-duration:[^;]*var\(--motion-short\);/)
})

// Option B of the planche (Nicolas, 9 November 2026): a line lit alone stands out of its category.
test('a line lit alone: its squares in full, the rest of its category at half, the other categories almost off', () => {
  render(<HundredSquares squares={SQUARES} lit="secured" focus={{ from: 12, to: 16 }} label="grille" />)
  const squares = Array.from(screen.getByRole('img', { name: 'grille' }).children)
  const opacity = (i: number) => squares[i].className.match(/opacity-\d+/)?.[0] ?? 'full'
  expect([12, 13, 14, 15].map(opacity)).toEqual(['full', 'full', 'full', 'full'])
  expect(opacity(10)).toBe('opacity-50') // secured, another line
  expect(opacity(16)).toBe('opacity-50')
  expect(opacity(0)).toBe('opacity-12') // available
  expect(opacity(99)).toBe('opacity-12') // property
  expect(squares[0]).toHaveAttribute('data-dim')
  expect(squares[12]).not.toHaveAttribute('data-dim')
})

test('a touched square says which it is; without a hand to hold it, a square is not offered', () => {
  const touched: number[] = []
  render(<HundredSquares squares={SQUARES} onSquare={(i) => touched.push(i)} label="grille" />)
  const grid = screen.getByRole('img', { name: 'grille' })
  fireEvent.click(grid.children[41])
  expect(touched).toEqual([41])
  expect(grid.children[41].className).toContain('cursor-pointer')
  cleanup()
  render(<HundredSquares squares={SQUARES} label="seule" />)
  expect(screen.getByRole('img', { name: 'seule' }).children[41].className).not.toContain('cursor-pointer')
})

// C (Nicolas, 9 November 2026): the square under the mouse is told, by its place; a finger tells nothing.
test('the mouse over a square says which, and leaving the grid says none; a finger says nothing', async () => {
  const { default: userEvent } = await import('@testing-library/user-event')
  const user = userEvent.setup()
  const told: Array<number | null> = []
  render(<HundredSquares squares={SQUARES} onSquareHover={(i) => told.push(i)} label="grille" />)
  const grid = screen.getByRole('img', { name: 'grille' })
  const squares = () => told.filter((i) => i !== null)
  await user.hover(grid.children[41])
  await user.hover(grid.children[7])
  expect(squares()).toEqual([41, 7])
  expect(told[told.length - 1]).toBe(7)
  // On the grid between two squares: no square, so nothing new is said (the last one stays).
  const before = told.length
  fireEvent.pointerOver(grid, { pointerType: 'mouse' })
  expect(told).toHaveLength(before)
  await user.unhover(grid)
  expect(told[told.length - 1]).toBeNull()
  // A finger tells nothing.
  const after = told.length
  fireEvent.pointerOver(grid.children[3], { pointerType: 'touch' })
  expect(told).toHaveLength(after)
})

test('the big grid and the medium ones leave 3 px between squares; the small one draws a thinner edge', () => {
  for (const size of ['large', 'medium'] as const) {
    render(<HundredSquares squares={SQUARES} size={size} label={size} />)
    expect(screen.getByRole('img', { name: size }).className).toContain('gap-[3px]')
  }
  render(<HundredSquares squares={SQUARES} size="small" label="small" />)
  expect(screen.getByRole('img', { name: 'small' }).className).toContain('[--square-edge:1px]')
})

test('the motion vocabulary: three durations, one curve to enter, one to leave, no bounce', () => {
  const css = readFileSync('app/globals.css', 'utf8')
  expect(css).toMatch(/--motion-short:\s*150ms/)
  expect(css).toMatch(/--motion-mid:\s*350ms/)
  expect(css).toMatch(/--motion-long:\s*1200ms/)
  const curves = [...css.matchAll(/cubic-bezier\(([^)]*)\)/g)].map((m) => m[1].split(',').map(Number))
  // A bounce is a control point outside [0, 1] on the progress axis.
  for (const [, y1, , y2] of curves) {
    expect(y1).toBeGreaterThanOrEqual(0)
    expect(y1).toBeLessThanOrEqual(1)
    expect(y2).toBeGreaterThanOrEqual(0)
    expect(y2).toBeLessThanOrEqual(1)
  }
  // The squares' motion and the arrival are written with the vocabulary, not with raw values.
  expect(css).toMatch(/--animate-square-arrive:\s*square-arrive var\(--motion-mid\) var\(--motion-enter\)/)
  expect(css).toMatch(/prefers-reduced-motion: reduce/)
})

// The echo of the bank just updated (Nicolas, 10 November 2026): the squares of its lines stay lit,
// every other one dims, with the same dimming as a lit category.
test('an echo keeps its lines lit and dims every other square; the grid says which half of it plays', () => {
  render(<HundredSquares squares={SQUARES} echo={{ lit: [{ from: 2, to: 5 }, { from: 40, to: 42 }], phase: 'dim' }} label="g" />)
  const grid = screen.getByRole('img', { name: 'g' })
  expect(grid).toHaveAttribute('data-echo', 'dim')
  const all = cells(grid)
  const full = all.flatMap((e, i) => (e.className.includes('opacity-') ? [] : [i]))
  expect(full).toEqual([2, 3, 4, 40, 41])
  expect(all[0].className).toContain('opacity-25')
  expect(all[0]).toHaveAttribute('data-dim')
})

test('an echo coming back dims nothing, and the grid says it comes back', () => {
  render(<HundredSquares squares={SQUARES} echo={{ lit: [{ from: 2, to: 5 }], phase: 'back' }} label="g" />)
  const grid = screen.getByRole('img', { name: 'g' })
  expect(grid).toHaveAttribute('data-echo', 'back')
  expect(cells(grid).some((e) => e.className.includes('opacity-'))).toBe(false)
})

test('a category lit wins over an echo', () => {
  const { container } = render(
    <HundredSquares squares={SQUARES} lit="markets" echo={{ lit: [{ from: 0, to: 2 }], phase: 'dim' }} label="g" />,
  )
  const full = cells(container).filter((e) => !e.className.includes('opacity-'))
  expect(full.every((e) => e.getAttribute('data-category') === 'markets')).toBe(true)
})

test('the echo moves with the vocabulary: dims quickly with the curve to leave, comes back at the medium pace', () => {
  const css = readFileSync('app/globals.css', 'utf8')
  const rule = (phase: string) => css.match(new RegExp(`\\[data-echo='${phase}'\\] > \\.square-motion \\{([^}]*)\\}`))?.[1] ?? ''
  expect(rule('dim')).toMatch(/transition-duration:\s*var\(--motion-short\)/)
  expect(rule('dim')).toMatch(/transition-timing-function:\s*var\(--motion-leave\)/)
  expect(rule('back')).toMatch(/transition-duration:\s*var\(--motion-mid\)/)
  expect(rule('back')).toMatch(/transition-timing-function:\s*var\(--motion-enter\)/)
})

// Planche 3, option B (Nicolas, 12 November 2026): beyond the goal, the solid part stops at the target
// line and what is beyond is an outline with the pale veil, as what is missing: a full bar read « reached,
// well done » when three times the goal was held.
test('GoalBar beyond its goal: solid up to the line, the rest outlined over a pale veil', () => {
  const { container } = render(<GoalBar category="available" actual={15} target={5} scale={15} />)
  expect(part(container, 'filled')).toHaveAttribute('data-squares', '5')
  expect(part(container, 'filled')).toHaveClass('bg-cat-available')
  const beyond = part(container, 'excess')!
  expect(beyond).toHaveAttribute('data-squares', '10')
  expect(beyond).toHaveClass('border-cat-available', 'bg-cat-available/25', 'border-l-0')
  expect(beyond).not.toHaveClass('bg-cat-available')
})

test('GoalBar with a goal of 0: the outline keeps its own left edge', () => {
  const { container } = render(<GoalBar category="gold" actual={4} target={0} scale={4} />)
  expect(part(container, 'excess')).not.toHaveClass('border-l-0')
})

