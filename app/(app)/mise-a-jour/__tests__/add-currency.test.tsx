// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { AddFlow } from '@/components/update/AddFlow'
import { exampleProfile } from '@/lib/model/__tests__/fixtures'
import type { UpdateDraft } from '@/lib/model/types'
import { startDraft } from '@/lib/update/draft'

const rates = { on: '2026-11-06', perEuro: { USD: 1.1165, GBP: 0.83415, CHF: 0.9143 } }
vi.mock('@/lib/market/use-market', () => ({
  useRates: (enabled: boolean) => (enabled ? { status: 'ready', rates } : { status: 'idle' }),
}))
afterEach(cleanup)

const establishment = exampleProfile.establishments[0]
const seen: { draft: UpdateDraft | null } = { draft: null }

function Host({ initial, lineId }: { initial: UpdateDraft; lineId?: string }) {
  const [draft, setDraft] = useState(initial)
  return (
    <AddFlow
      profile={exampleProfile}
      draft={draft}
      establishment={establishment}
      lineId={lineId}
      saveError={null}
      change={async (f) => {
        const next = f(draft)
        seen.draft = next
        setDraft(next)
        return true
      }}
      onDone={() => {}}
    />
  )
}

test('« + Ajouter » a LEP in pounds keeps the added line in GBP, and passes no rate', async () => {
  render(<Host initial={startDraft('s1')} />)
  await userEvent.click(screen.getByRole('button', { name: /^LEP/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Ouvert depuis la dernière fois' }))
  await userEvent.click(screen.getByRole('button', { name: 'Changer de devise' }))
  await userEvent.click(screen.getByRole('button', { name: 'livres sterling' }))
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '2000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(seen.draft!.added.lines[0]).toMatchObject({ currency: 'GBP' })
})

test('D7: a line a snapshot already holds is shown in its currency without « changer »', () => {
  const held = exampleProfile.lines.find((l) => l.id === 'current-line')!
  const draft: UpdateDraft = {
    ...startDraft('s1'),
    added: { accounts: [], lines: [held] },
    values: [{ lineId: held.id, kind: 'amount', amount: 100, seenOn: '2026-11-06' }],
  }
  render(<Host initial={draft} lineId={held.id} />)
  expect(screen.getByText(/^En euros/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Changer de devise' })).not.toBeInTheDocument()
})

test('a line added in this update may still change its currency', () => {
  const added = { id: 'new-line', accountId: 'current', name: 'X', kind: 'amount' as const, currency: 'EUR' }
  const draft: UpdateDraft = {
    ...startDraft('s1'),
    added: { accounts: [], lines: [added] },
    values: [{ lineId: 'new-line', kind: 'amount', amount: 100, seenOn: '2026-11-06' }],
  }
  render(<Host initial={draft} lineId="new-line" />)
  expect(screen.getByRole('button', { name: 'Changer de devise' })).toBeInTheDocument()
})
