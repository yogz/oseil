// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactElement } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { GOALS_NEED_BUDGET, GOALS_NEED_BUDGET_LINK } from '@/lib/screens/words'
import type { ModelState } from '@/lib/app/use-model'
import { DisplayModeProvider } from '../DisplayMode'
import { GoalsHeadline } from '../GoalsSimulation'

vi.mock('@/lib/model/repository', () => ({ saveSettings: vi.fn() }))

const READY = {
  status: 'ready',
  client: {} as never,
  dataKey: {} as CryptoKey,
  reload: vi.fn(),
  model: {
    profile: null,
    snapshots: [],
    goals: [],
    settings: null,
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
  },
} as Extract<ModelState, { status: 'ready' }>
const shown = (element: ReactElement) => render(<DisplayModeProvider state={READY}>{element}</DisplayModeProvider>)

vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props} />,
}))

afterEach(cleanup)

const idle = { active: false, showing: false, movesShown: false, toggle: () => {} } as never

// docs/superpowers/specs/2026-11-11-coussin-objectif-design.md: the sentence comes with its way to the spending.
test('a goal in months without a budget leads to the spending', () => {
  shown(
    <GoalsHeadline
      goals={{ headline: GOALS_NEED_BUDGET, detail: null, scale: 0, simulation: null, link: GOALS_NEED_BUDGET_LINK }}
      simulation={idle}
    />,
  )
  expect(screen.getByText(GOALS_NEED_BUDGET)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Renseigner mes dépenses' })).toHaveAttribute('href', '/premier-lancement/depenses?depuis=reglages')
})

test('a goal with its gaps has no such link', () => {
  shown(<GoalsHeadline goals={{ headline: 'Proche de tes objectifs', detail: null, scale: 10, simulation: null }} simulation={idle} />)
  expect(screen.queryByRole('link')).toBeNull()
})
