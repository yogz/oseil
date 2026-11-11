// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { EVOLUTION_BUDGET_NOTE } from '@/lib/screens/evolution-words'
import { GoalsHistory } from '../Goals'

afterEach(cleanup)

const goals = (note: string | null) => ({
  rows: [
    { snapshotId: 'a', date: '2026-01-31', misplaced: [{ category: 'available' as const, count: 3 }] },
    { snapshotId: 'b', date: '2026-02-28', misplaced: [{ category: 'available' as const, count: 2 }] },
  ],
  comparedToFirst: false,
  comparedWords: '',
  note,
  traces: [],
})

test('the gaps say they are counted with today’s budget when the cushion is in months', () => {
  render(<GoalsHistory goals={goals(EVOLUTION_BUDGET_NOTE.expenses)} />)
  expect(screen.getByText(EVOLUTION_BUDGET_NOTE.expenses)).toBeInTheDocument()
})

test('a goal in percents has no such note', () => {
  render(<GoalsHistory goals={goals(null)} />)
  expect(screen.queryByText(EVOLUTION_BUDGET_NOTE.expenses)).toBeNull()
})
