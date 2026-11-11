// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { chooseWhere, type SetupDraft } from '@/lib/setup/first-launch'
import StepPage from '../etape/page'

const mocks = vi.hoisted(() => ({
  initial: { current: null as unknown },
  last: { current: null as unknown },
}))

vi.mock('@/lib/setup/use-first-launch', async (original) => {
  const react = await import('react')
  return {
    ...(await original<typeof import('@/lib/setup/use-first-launch')>()),
    useFirstLaunch: () => {
      const [draft, setDraft] = react.useState(mocks.initial.current as SetupDraft | null)
      const ref = react.useRef(draft)
      const apply = react.useCallback(async (change: (d: SetupDraft | null) => SetupDraft) => {
        const next = change(ref.current)
        ref.current = next
        mocks.last.current = next
        setDraft(next)
        return true
      }, [])
      return { status: 'ready', draft, apply, saveError: null, retry: () => {} }
    },
  }
})
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props} />,
}))
const rates = { on: '2026-11-06', perEuro: { USD: 1.1165, GBP: 0.83415, CHF: 0.9143 } }
vi.mock('@/lib/market/use-market', () => ({
  useRates: (enabled: boolean) => (enabled ? { status: 'ready', rates } : { status: 'idle' }),
}))

beforeEach(() => {
  mocks.initial.current = chooseWhere(null, { banks: [{ catalogId: 'revolut', name: 'Revolut' }], outside: [] }, '2026-11-06')
  mocks.last.current = null
})
afterEach(cleanup)

const saved = () => mocks.last.current as SetupDraft

test('a current account at Revolut in dollars at 1000 saves a USD line with its rate, and the list shows euros', async () => {
  render(<StepPage />)
  await userEvent.click(screen.getByRole('button', { name: '+ Ajouter un compte' }))
  await userEvent.click(screen.getByRole('button', { name: /^Compte courant/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Changer de devise' }))
  await userEvent.click(screen.getByRole('button', { name: 'dollars américains' }))
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '1000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(saved().profile.lines[0]).toMatchObject({ currency: 'USD' })
  expect(saved().snapshot.fx.USD).toBeCloseTo(0.895656, 5)
  expect(screen.getByRole('button', { name: /896\s€/ })).toBeInTheDocument()
})

test('R5: rewriting a line without touching its currency leaves the shared rate alone', async () => {
  render(<StepPage />)
  await userEvent.click(screen.getByRole('button', { name: '+ Ajouter un compte' }))
  await userEvent.click(screen.getByRole('button', { name: /^Compte courant/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Changer de devise' }))
  await userEvent.click(screen.getByRole('button', { name: 'dollars américains' }))
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '1000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  await userEvent.click(screen.getByRole('button', { name: /^Compte courant/ }))
  const box = screen.getByLabelText('Combien y a-t-il dessus ?')
  await userEvent.clear(box)
  await userEvent.type(box, '2000')
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(saved().profile.lines[0]).toMatchObject({ currency: 'USD' })
  expect(saved().snapshot.entries[0]).toMatchObject({ amount: 200_000 })
  // Nothing was chosen in this form: the currency and its rate are kept, not rewritten.
  expect(saved().snapshot.fx.USD).toBeCloseTo(0.895656, 5)
})
