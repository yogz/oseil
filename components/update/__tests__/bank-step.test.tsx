// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { exampleProfile, exampleSnapshot, unitsEntry } from '@/lib/model/__tests__/fixtures'
import type { Profile, Snapshot } from '@/lib/model/types'
import { startDraft } from '@/lib/update/draft'
import { BankStep } from '../BankStep'

const mocks = vi.hoisted(() => ({ screen: { current: null as unknown } }))
vi.mock('../UpdateProvider', () => ({ useUpdateScreen: () => mocks.screen.current }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

afterEach(cleanup)

// The ETF (Placements en bourse) and a gold bar, both in units, neither with a purchase price.
const profile: Profile = {
  ...exampleProfile,
  lines: [...exampleProfile.lines, { id: 'bar', accountId: 'gold', name: 'Lingot', kind: 'units', currency: 'EUR' }],
}
const base: Snapshot = {
  ...exampleSnapshot,
  entries: exampleSnapshot.entries
    .filter((e) => e.lineId !== 'etf')
    .concat([unitsEntry('etf', 100, 250, null), unitsEntry('bar', 1, 2_000, null)]),
}

function showStep(establishmentId: string) {
  mocks.screen.current = {
    show: vi.fn(),
    state: {
      status: 'ready',
      session: {
        profile,
        base: { id: 's1', value: base, updatedAt: '' },
        draft: startDraft('s1'),
        market: { prices: {}, rates: null },
        failedPrices: [],
        change: async () => true,
        settled: async () => true,
        saveError: null,
      },
    },
  }
  const establishment = profile.establishments.find((e) => e.id === establishmentId)!
  render(<BankStep establishment={establishment} step={{ index: 0, total: 3 }} previousId={null} next={null} />)
}

const ASK = /^Tu as son prix d’achat sous les yeux.\?$/
const CHANGED = /^Les parts ou le prix moyen ont changé.\?$/

test('a title of Placements en bourse with no purchase price: the button asks for it', () => {
  showStep('boursobank')
  expect(screen.getByRole('button', { name: ASK })).toBeTruthy()
  expect(screen.queryByRole('button', { name: CHANGED })).toBeNull()
})

test('a gold line in units with no purchase price is no gap: the old words', () => {
  showStep('home')
  expect(screen.getByRole('button', { name: CHANGED })).toBeTruthy()
  expect(screen.queryByRole('button', { name: ASK })).toBeNull()
})
