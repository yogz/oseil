// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import { account, amountEntry, line, profileOf, snapshotOf, unitsEntry } from '@/lib/model/__tests__/fixtures'
import type { Account, Line } from '@/lib/model/types'
import { lineSheetView } from '@/lib/screens/line-sheet'
import { CHANGE_ANSWER_LABEL } from '@/lib/screens/line-words'
import { LineSheet } from '../LineSheet'

afterEach(cleanup)

const TODAY = '2026-11-12'
const loaded = <T,>(value: T, id: string) => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })

const accounts: Account[] = [
  account('pea', 'pea', { name: 'PEA' }),
  account('pee', 'employee-savings', { name: 'PEE' }),
  account('house', 'home', { name: 'Maison' }),
  account('mortgage', 'loan', { name: 'Crédit immo' }),
]
const lines: Line[] = [
  line('etf', 'pea', { kind: 'units', group: 'world' }),
  line('pee-line', 'pee', { group: 'world' }),
  line('house-line', 'house'),
  line('mortgage-line', 'mortgage'),
]
const entries = [
  unitsEntry('etf', 100, 250, null),
  amountEntry('pee-line', 5_000),
  amountEntry('house-line', 300_000),
  amountEntry('mortgage-line', 180_000),
]

function viewOf(lineId: string, ls: Line[] = lines, as: Account[] = accounts) {
  const model: Model = {
    profile: loaded(profileOf(as, ls), 'p'),
    snapshots: [loaded(snapshotOf(entries), 's0')],
    goals: [],
    settings: null,
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
  }
  return lineSheetView(model, lineId, TODAY, null)!
}
const withLine = (id: string, extra: Partial<Line>) => lines.map((l) => (l.id === id ? { ...l, ...extra } : l))
const withAccount = (id: string, extra: Partial<Account>) => accounts.map((a) => (a.id === id ? { ...a, ...extra } : a))

function show(view: ReturnType<typeof viewOf>) {
  const onAnswer = vi.fn().mockResolvedValue(true)
  const onEdit = vi.fn()
  render(<LineSheet view={view} form={null} onEdit={onEdit} onAnswer={onAnswer} />)
  return { onAnswer, onEdit, user: userEvent.setup() }
}

describe('the « je ne sais pas » answers on the fiche', () => {
  test('purchase: « Je ne sais pas son prix d’achat » saves the flag', async () => {
    const { onAnswer, onEdit, user } = show(viewOf('etf'))
    await user.click(screen.getByRole('button', { name: 'Je ne sais pas son prix d’achat' }))
    expect(onAnswer).toHaveBeenCalledWith('purchase', true)
    expect(onEdit).not.toHaveBeenCalled()
  })

  test('purchase answered: « Tu ne le sais pas », and « Changer » removes it', async () => {
    const { onAnswer, user } = show(viewOf('etf', withLine('etf', { purchaseUnknown: true })))
    expect(screen.getByText('Tu ne le sais pas')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Je ne sais pas son prix d’achat' })).toBeNull()
    await user.click(screen.getByRole('button', { name: CHANGE_ANSWER_LABEL.purchase }))
    expect(onAnswer).toHaveBeenCalledWith('purchase', false)
  })

  test('quote: « Pas coté », then « Pas coté » with « Changer »', async () => {
    const first = show(viewOf('etf', withLine('etf', { purchaseUnknown: true })))
    await first.user.click(screen.getByRole('button', { name: 'Pas coté' }))
    expect(first.onAnswer).toHaveBeenCalledWith('quote', true)
    cleanup()
    const second = show(viewOf('etf', withLine('etf', { purchaseUnknown: true, unquoted: true })))
    expect(screen.queryByRole('button', { name: 'Pas coté' })).toBeNull()
    expect(screen.getByText('Pas coté')).toBeInTheDocument()
    // Two answered rows (purchase, quote): each « Changer » is named by its subject.
    await second.user.click(screen.getByRole('button', { name: CHANGE_ANSWER_LABEL.quote }))
    expect(second.onAnswer).toHaveBeenCalledWith('quote', false)
  })

  test('unlock: « Je ne sais pas », then « Tu ne le sais pas » with « Changer »', async () => {
    const first = show(viewOf('pee-line'))
    await first.user.click(screen.getByRole('button', { name: 'Je ne sais pas' }))
    expect(first.onAnswer).toHaveBeenCalledWith('unlock', true)
    cleanup()
    const second = show(viewOf('pee-line', lines, withAccount('pee', { unlockUnknown: true })))
    expect(screen.getByText('Tu ne le sais pas')).toBeInTheDocument()
    await second.user.click(screen.getByRole('button', { name: CHANGE_ANSWER_LABEL.unlock }))
    expect(second.onAnswer).toHaveBeenCalledWith('unlock', false)
  })

  test('loan: « Ce crédit ne finance pas de logement », then « Ne finance pas de logement »', async () => {
    const first = show(viewOf('mortgage-line'))
    await first.user.click(screen.getByRole('button', { name: 'Ce crédit ne finance pas de logement' }))
    expect(first.onAnswer).toHaveBeenCalledWith('loan', true)
    cleanup()
    const second = show(viewOf('mortgage-line', lines, withAccount('mortgage', { noHome: true })))
    expect(screen.getByText('Ne finance pas de logement')).toBeInTheDocument()
    await second.user.click(screen.getByRole('button', { name: CHANGE_ANSWER_LABEL.loan }))
    expect(second.onAnswer).toHaveBeenCalledWith('loan', false)
  })

  test('renders nothing new for a row without an answer', () => {
    const priced = viewOf('etf', withLine('etf', { quoteSymbol: 'CW8.PA' }))
    show({ ...priced, rows: priced.rows.map((r) => (r.kind === 'figures' ? { kind: r.kind, label: r.label, value: r.value } : r)) })
    expect(screen.queryByRole('button', { name: /^Changer(?! de titre)/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pas coté' })).toBeNull()
  })

  test('what an answer could not save is said on the open fiche', () => {
    const onAnswer = vi.fn().mockResolvedValue(true)
    render(<LineSheet view={viewOf('etf')} form={null} notice="Rien n’a été enregistré." onEdit={vi.fn()} onAnswer={onAnswer} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Rien n’a été enregistré.')
  })

  test('while an answer is saved, the answer buttons wait: a double tap saves once', async () => {
    let done: (saved: boolean) => void = () => {}
    const onAnswer = vi.fn(() => new Promise<boolean>((resolve) => (done = resolve)))
    const user = userEvent.setup()
    render(<LineSheet view={viewOf('etf')} form={null} onEdit={vi.fn()} onAnswer={onAnswer} />)
    const purchase = screen.getByRole('button', { name: 'Je ne sais pas son prix d’achat' })
    await user.dblClick(purchase)
    expect(onAnswer).toHaveBeenCalledTimes(1)
    expect(purchase).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Pas coté' })).toBeDisabled()
    await act(async () => done(true))
    expect(purchase).toBeEnabled()
  })

  test('locked: no answer button', () => {
    show({ ...viewOf('etf'), locked: 'update-running' })
    expect(screen.queryByRole('button', { name: 'Je ne sais pas son prix d’achat' })).toBeNull()
  })
})
