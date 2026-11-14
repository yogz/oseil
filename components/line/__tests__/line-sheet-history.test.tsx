// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import { account, amountEntry, line, profileOf, snapshotOf } from '@/lib/model/__tests__/fixtures'
import type { LineSheetView } from '@/lib/screens/line-sheet'
import { lineSheetView } from '@/lib/screens/line-sheet'
import { LineSheet } from '../LineSheet'

afterEach(cleanup)

const TODAY = '2026-11-12'
const loaded = <T,>(value: T, id: string) => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })

function viewOf(relevés: number): LineSheetView {
  const model: Model = {
    profile: loaded(profileOf([account('cc', 'current', { name: 'Compte courant' })], [line('cc-line', 'cc')]), 'p'),
    snapshots: Array.from({ length: relevés }, (_, i) => loaded({ ...snapshotOf([amountEntry('cc-line', 1_000 + i)]), takenOn: `2026-0${i + 1}-15` }, `s${i}`)),
    goals: [],
    settings: null,
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
  }
  return lineSheetView(model, 'cc-line', TODAY, null)!
}

function show(view: LineSheetView, form: React.ReactNode = null) {
  render(<LineSheet view={view} form={form} onEdit={vi.fn()} onAnswer={vi.fn().mockResolvedValue(true)} />)
}

describe('« Ses relevés précédents › » on the fiche', () => {
  test('is a link to « Tes relevés » of Évolution when the line has older relevés', () => {
    show(viewOf(2))
    const link = screen.getByRole('link', { name: /Ses relevés précédents/ })
    expect(link).toHaveAttribute('href', '/evolution#releves')
    expect(link).toHaveTextContent('›')
  })

  test('is absent with a single relevé', () => {
    show(viewOf(1))
    expect(screen.queryByRole('link', { name: /Ses relevés précédents/ })).toBeNull()
  })

  test('stays reachable while an update locks the fiche', () => {
    show({ ...viewOf(2), locked: 'update-running' })
    expect(screen.getByRole('link', { name: /Ses relevés précédents/ })).toHaveAttribute('href', '/evolution#releves')
  })

  test('steps aside while a form is open', () => {
    show(viewOf(2), <p>form</p>)
    expect(screen.queryByRole('link', { name: /Ses relevés précédents/ })).toBeNull()
  })

  test('is offered on a closed line too', () => {
    show({ ...viewOf(2), state: { kind: 'closed', on: '1er novembre' }, rows: [] })
    expect(screen.getByRole('link', { name: /Ses relevés précédents/ })).toBeInTheDocument()
  })
})
