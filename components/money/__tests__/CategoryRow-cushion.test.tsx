// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import type { ModelState } from '@/lib/app/use-model'
import type { Board } from '@/lib/screens/mon-argent'
import { CategoryRow } from '../CategoryRow'
import { DisplayModeProvider } from '../DisplayMode'

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

afterEach(cleanup)

const row = (cushion?: { months: number; euros: string; basis: 'expenses' | 'salary' }): Board['categories'][number] => ({
  category: 'available',
  name: 'Argent disponible',
  euros: '11 300 €',
  percent: '73 %',
  goal: { actual: 73, target: 41, words: 'au-delà de ton coussin', ...(cushion ? { cushion } : {}) },
  note: null,
  linked: false,
})

test('the available money aimed at in months says its goal in months and in euros', () => {
  const { container } = shown(<CategoryRow row={row({ months: 4, euros: '6 400 €', basis: 'expenses' })} scale={73} />)
  expect(container.textContent?.replace(/[  ]/g, ' ')).toContain('au-delà de ton coussin · objectif : 4 mois de dépenses, 6 400 €')
})

test('a budget given as income says months of income', () => {
  const { container } = shown(<CategoryRow row={row({ months: 2.5, euros: '7 000 €', basis: 'salary' })} scale={73} />)
  expect(container.textContent?.replace(/[  ]/g, ' ')).toContain('objectif : 2,5 mois de revenus, 7 000 €')
})

test('a goal in percents shows its words alone', () => {
  const { container } = shown(<CategoryRow row={row()} scale={73} />)
  expect(container.textContent).not.toContain('objectif')
})
