// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { StepProgress } from '@/components/setup/StepProgress'

afterEach(cleanup)

test('one square per step: done, current, to come; the step just done fills; read as « 3 sur 4 »', () => {
  const { container } = render(<StepProgress index={2} total={4} />)
  const squares = [...container.querySelectorAll('[data-step]')]
  expect(squares.map((s) => s.getAttribute('data-step'))).toEqual(['done', 'done', 'current', 'next'])
  expect(squares.map((s) => s.classList.contains('animate-step-done'))).toEqual([false, true, false, false])
  expect(screen.getByText('3 sur 4')).toHaveClass('sr-only')
})

test('on the first step nothing fills', () => {
  const { container } = render(<StepProgress index={0} total={3} />)
  expect(container.querySelectorAll('.animate-step-done')).toHaveLength(0)
})
