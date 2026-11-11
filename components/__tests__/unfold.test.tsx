// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { Unfold } from '@/components/ui/Unfold'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete (Element.prototype as { animate?: unknown }).animate
})

// A browser's animation, finished by hand.
function animations() {
  const made: { keyframes: Keyframe[]; options: KeyframeAnimationOptions; finish: () => void }[] = []
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value(keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      let finish = () => {}
      const finished = new Promise<void>((resolve) => (finish = resolve))
      made.push({ keyframes, options, finish })
      return { finished, cancel() {} }
    },
  })
  return made
}

test('without animations (the tests, fewer animations asked), it opens and closes at once', () => {
  const { rerender } = render(<Unfold open={false}>Fonds monde</Unfold>)
  expect(screen.queryByText('Fonds monde')).toBeNull()
  rerender(<Unfold open>Fonds monde</Unfold>)
  expect(screen.getByText('Fonds monde')).toBeInTheDocument()
  rerender(<Unfold open={false}>Fonds monde</Unfold>)
  expect(screen.queryByText('Fonds monde')).toBeNull()
})

test('it unfolds at the medium pace, then folds quickly, untouchable until it is gone', async () => {
  const made = animations()
  const { rerender } = render(<Unfold open={false}>Fonds monde</Unfold>)

  rerender(<Unfold open>Fonds monde</Unfold>)
  expect(made).toHaveLength(1)
  expect(made[0].keyframes[0]).toMatchObject({ height: '0px', opacity: 0 })
  await act(async () => made[0].finish())

  rerender(<Unfold open={false}>Fonds monde</Unfold>)
  expect(made).toHaveLength(2)
  expect(made[1].keyframes[1]).toMatchObject({ height: '0px', opacity: 0 })
  // Still there while it folds, but nothing in it can be touched or reached.
  const folding = screen.getByText('Fonds monde')
  expect(folding).toHaveAttribute('inert')
  await act(async () => made[1].finish())
  expect(screen.queryByText('Fonds monde')).toBeNull()
})
