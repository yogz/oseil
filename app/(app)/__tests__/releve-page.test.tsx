// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Model, ModelState } from '@/lib/app/use-model'
import type { CorrectionState } from '@/lib/correct/save'
import type { Planned } from '@/lib/correct/types'
import { amountEntry, exampleProfile, unitsEntry } from '@/lib/model/__tests__/fixtures'
import type { Snapshot, SnapshotEntry, UpdateDraft } from '@/lib/model/types'
import { CHANGED_MEANWHILE, LOCKED_UPDATE } from '@/lib/screens/line-words'
import { ERASE_REFUSED, STATEMENT_CORRECTED, STATEMENT_HISTORY, STATEMENT_LEAD, TODAY_CORRECTED } from '@/lib/screens/statement-words'
import { plain } from '@/lib/__tests__/plain'
import StatementPage from '../releve/[id]/page'
import StatementLinePage from '../releve/[id]/ligne/[lineId]/page'

const mocks = vi.hoisted(() => ({
  state: { current: { status: 'loading' } as ModelState },
  params: { current: { id: 's0' } as Record<string, string> },
  search: { current: '' },
  replace: vi.fn(),
  saveCorrection: vi.fn(),
}))

vi.mock('@/lib/app/use-model', () => ({ useModel: () => mocks.state.current }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useParams: () => mocks.params.current,
  useSearchParams: () => new URLSearchParams(mocks.search.current),
}))
vi.mock('@/lib/correct/save', () => ({ saveCorrection: mocks.saveCorrection }))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props} />,
}))

const loaded = <T,>(value: T, id: string) => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const snapshot = (takenOn: string, entries: SnapshotEntry[]): Snapshot => ({
  schema: 1,
  takenOn,
  fx: {},
  entries,
  contributions: {},
  arrivals: {},
})
const old = snapshot('2025-11-16', [
  amountEntry('current-line', 2_000),
  amountEntry('livret-a-line', 10_000),
  unitsEntry('etf', 80, 200, 180),
  amountEntry('house-line', 300_000),
  amountEntry('mortgage-line', 190_000),
])
const middle = snapshot('2026-06-30', [
  amountEntry('current-line', 2_000),
  amountEntry('livret-a-line', 11_000),
  unitsEntry('etf', 80, 220, 180),
  amountEntry('house-line', 300_000),
  amountEntry('mortgage-line', 185_000),
])
const latest = snapshot('2026-10-30', [
  amountEntry('current-line', 2_500),
  amountEntry('livret-a-line', 12_000),
  unitsEntry('etf', 80, 250, 180),
  amountEntry('house-line', 300_000),
  amountEntry('mortgage-line', 180_000),
])

const stored = (snapshots: Snapshot[]) => snapshots.map((s, i) => ({ id: `s${i}`, value: s }))

function ready(snapshots: Snapshot[] = [old, middle, latest], draft: UpdateDraft | null = null) {
  const model: Model = {
    profile: loaded(exampleProfile, 'p0'),
    snapshots: snapshots.map((s, i) => loaded(s, `s${i}`)),
    goals: [],
    settings: null,
    draft: draft ? loaded(draft, 'd0') : null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
  }
  const reload = vi.fn()
  mocks.state.current = { status: 'ready', model, client: {} as never, dataKey: {} as CryptoKey, reload }
  return reload
}

// The re-read state at save time: the plan is run on it, as saveCorrection does.
function savesOn(snapshots: Snapshot[], updateRunning = false) {
  const results: Planned[] = []
  mocks.saveCorrection.mockImplementation(async (_c: unknown, _k: unknown, plan: (s: CorrectionState) => Planned) => {
    const state: CorrectionState = { profile: { id: 'p0', value: exampleProfile }, snapshots: stored(snapshots) }
    const result = plan(updateRunning ? { ...state, updateRunning: true } : state)
    results.push(result)
    return 'refused' in result ? result.refused : 'saved'
  })
  return results
}

beforeEach(() => {
  mocks.replace.mockReset()
  mocks.saveCorrection.mockReset().mockResolvedValue('saved')
  mocks.params.current = { id: 's0' }
  mocks.search.current = ''
  ready()
})
afterEach(cleanup)

describe('the page of a relevé', () => {
  test('its date, its total, what a square was worth, its lead, and its lines by bank', () => {
    render(<StatementPage />)
    expect(screen.getByRole('link', { name: '‹ Évolution' })).toHaveAttribute('href', '/evolution#releves')
    expect(screen.getByRole('heading', { level: 1, name: 'Relevé du 16 novembre 2025' })).toBeInTheDocument()
    expect(plain(screen.getByTestId('statement-total').textContent ?? '')).toBe('138 000 €')
    expect(screen.getByText(plain('un carré valait 1 380 €'))).toBeInTheDocument()
    expect(screen.getByText(plain(STATEMENT_LEAD))).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Chez toi', 'BoursoBank'])
    const bank = screen.getByRole('region', { name: 'BoursoBank' })
    const etf = within(bank).getByRole('link', { name: /^ETF/ })
    expect(etf).toHaveAttribute('href', '/releve/s0/ligne/etf')
    expect(plain(etf.textContent ?? '')).toMatch(/^ETF\s*16 000 €\s*›$/)
    // The figure of a list: dotted.
    expect(within(etf).getByText(plain('16 000 €'))).toHaveClass('underline', 'decoration-dotted')
  })

  test('just after a correction: « Corrigé… » in place of the lead, until the next visit', () => {
    mocks.search.current = 'corrige=1'
    render(<StatementPage />)
    expect(screen.getByText(STATEMENT_CORRECTED)).toBeInTheDocument()
    expect(screen.queryByText(plain(STATEMENT_LEAD))).toBeNull()
    // The address forgets it: a reload, or a later visit, shows the lead again.
    expect(mocks.replace).toHaveBeenCalledWith('/releve/s0')
  })

  test('an unknown relevé has no page: back to Évolution', () => {
    mocks.params.current = { id: 'nope' }
    render(<StatementPage />)
    expect(mocks.replace).toHaveBeenCalledWith('/evolution')
  })
})

describe('correcting a line at that relevé', () => {
  beforeEach(() => {
    mocks.params.current = { id: 's0', lineId: 'livret-a-line' }
  })

  test('is dated with that relevé everywhere, and says today’s figure', () => {
    render(<StatementLinePage />)
    expect(screen.getByRole('link', { name: '‹ Relevé du 16 novembre 2025' })).toHaveAttribute('href', '/releve/s0')
    expect(screen.getByRole('heading', { level: 1, name: 'Son montant au 16 novembre 2025' })).toBeInTheDocument()
    expect(screen.getByLabelText('Son montant ce jour-là (EUR)')).toHaveValue('10 000')
    expect(screen.getByText(plain('Aujourd’hui : 12 000 €, inchangé'))).toBeInTheDocument()
    expect(screen.getByText(plain(STATEMENT_HISTORY))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Corriger le 16 novembre 2025' })).toBeInTheDocument()
  })

  test('says, as the figure is typed, the other relevés corrected with it', async () => {
    mocks.params.current = { id: 's0', lineId: 'current-line' }
    render(<StatementLinePage />)
    const field = screen.getByLabelText('Son montant ce jour-là (EUR)')
    await userEvent.clear(field)
    await userEvent.type(field, '3000')
    expect(screen.getByText(plain('Ce chiffre est le même dans 1 autre relevé : on le corrige aussi.'))).toBeInTheDocument()
    expect(screen.getByText(plain('Aujourd’hui : 2 500 €, inchangé'))).toBeInTheDocument()
  })

  test('says when today is corrected too', async () => {
    mocks.params.current = { id: 's0', lineId: 'house-line' }
    render(<StatementLinePage />)
    const field = screen.getByLabelText('Son montant ce jour-là (EUR)')
    await userEvent.clear(field)
    await userEvent.type(field, '310000')
    expect(screen.getByText(plain('Ce chiffre est le même dans 2 autres relevés : on les corrige aussi.'))).toBeInTheDocument()
    expect(screen.getByText(plain(TODAY_CORRECTED))).toBeInTheDocument()
  })

  test('refuses to erase a known figure of that day, and writes nothing', async () => {
    mocks.params.current = { id: 's0', lineId: 'etf' }
    render(<StatementLinePage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Ses parts et son prix moyen au 16 novembre 2025' })).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText(/Son prix moyen ce jour-là/))
    expect(screen.getByText(ERASE_REFUSED)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Corriger le 16 novembre 2025' }))
    expect(mocks.saveCorrection).not.toHaveBeenCalled()
  })

  test('a refused erase keeps the history sentence, and a tap repeats the refusal by the button', async () => {
    mocks.params.current = { id: 's0', lineId: 'etf' }
    render(<StatementLinePage />)
    await userEvent.clear(screen.getByLabelText(/Son prix moyen ce jour-là/))
    expect(screen.getByText(plain(STATEMENT_HISTORY))).toBeInTheDocument()
    expect(screen.getAllByText(ERASE_REFUSED)).toHaveLength(1)
    const history = screen.getByText(plain(STATEMENT_HISTORY))
    // Before the tap, the refusal opens the notes, above the history.
    expect(history.compareDocumentPosition(screen.getByText(ERASE_REFUSED)) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Corriger le 16 novembre 2025' }))
    // After it, the same single alert, moved by the button: never said twice.
    expect(screen.getAllByText(ERASE_REFUSED)).toHaveLength(1)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(history.compareDocumentPosition(screen.getByText(ERASE_REFUSED)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(mocks.saveCorrection).not.toHaveBeenCalled()
    // Fixed, the refusal is gone everywhere.
    await userEvent.type(screen.getByLabelText(/Son prix moyen ce jour-là/), '180')
    expect(screen.queryByText(ERASE_REFUSED)).toBeNull()
  })

  test('before the model is ready, the back link says where it goes', () => {
    mocks.state.current = { status: 'loading' } as ModelState
    render(<StatementLinePage />)
    expect(screen.getByRole('link', { name: '‹ Évolution' })).toHaveAttribute('href', '/evolution#releves')
  })

  test('the latest relevé, while an update runs: refused with the fiche’s words, no form', () => {
    ready([old, middle, latest], { basedOn: 's2' } as unknown as UpdateDraft)
    mocks.params.current = { id: 's2', lineId: 'livret-a-line' }
    render(<StatementLinePage />)
    expect(screen.getByText(LOCKED_UPDATE)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Corriger le/ })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  test('saves as a past relevé, then goes back to the relevé with « Corrigé… »', async () => {
    const reload = ready()
    mocks.params.current = { id: 's0', lineId: 'current-line' }
    const results = savesOn([old, middle, latest])
    render(<StatementLinePage />)
    const field = screen.getByLabelText('Son montant ce jour-là (EUR)')
    await userEvent.clear(field)
    await userEvent.type(field, '3000')
    await userEvent.click(screen.getByRole('button', { name: 'Corriger le 16 novembre 2025' }))
    expect(mocks.saveCorrection.mock.calls[0][3]).toEqual({ pastOnly: true })
    const written = results[0]
    if ('refused' in written) throw new Error('refused')
    expect(written.writes.map((w) => (w.kind === 'snapshot' ? w.id : 'profile'))).toEqual(['s1', 's0'])
    expect(reload).toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledWith('/releve/s0?corrige=1')
  })

  // Review Focus 4: what is written is what was announced, or nothing is.
  test('refuses when the number of relevés corrected is no longer the one announced, and reloads', async () => {
    const reload = ready()
    mocks.params.current = { id: 's0', lineId: 'current-line' }
    // Meanwhile, the middle relevé's figure was corrected elsewhere: only this one would be written.
    const changed = snapshot(middle.takenOn, middle.entries.map((e) => (e.lineId === 'current-line' ? amountEntry('current-line', 2_100) : e)))
    savesOn([old, changed, latest])
    render(<StatementLinePage />)
    const field = screen.getByLabelText('Son montant ce jour-là (EUR)')
    await userEvent.clear(field)
    await userEvent.type(field, '3000')
    await userEvent.click(screen.getByRole('button', { name: 'Corriger le 16 novembre 2025' }))
    expect(screen.getByText(plain(CHANGED_MEANWHILE))).toBeInTheDocument()
    expect(reload).toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  test('refuses when the figure of that relevé changed meanwhile', async () => {
    mocks.params.current = { id: 's0', lineId: 'livret-a-line' }
    const changed = snapshot(old.takenOn, old.entries.map((e) => (e.lineId === 'livret-a-line' ? amountEntry('livret-a-line', 10_500) : e)))
    savesOn([changed, middle, latest])
    render(<StatementLinePage />)
    await userEvent.click(screen.getByRole('button', { name: 'Corriger le 16 novembre 2025' }))
    expect(screen.getByText(plain(CHANGED_MEANWHILE))).toBeInTheDocument()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  test('refuses when an update began meanwhile and the same figure would have reached today', async () => {
    mocks.params.current = { id: 's0', lineId: 'house-line' }
    savesOn([old, middle, latest], true)
    render(<StatementLinePage />)
    const field = screen.getByLabelText('Son montant ce jour-là (EUR)')
    await userEvent.clear(field)
    await userEvent.type(field, '310000')
    await userEvent.click(screen.getByRole('button', { name: 'Corriger le 16 novembre 2025' }))
    expect(screen.getByText(plain(CHANGED_MEANWHILE))).toBeInTheDocument()
  })

  // A save cut short writes the farthest relevés first: redone, it announces the ones still to correct.
  test('after a cut, the redo announces fewer relevés, and writes exactly those', async () => {
    const corrected = (s: Snapshot) => snapshot(s.takenOn, s.entries.map((e) => (e.lineId === 'house-line' ? amountEntry('house-line', 310_000) : e)))
    const cut = [old, middle, corrected(latest)]
    ready(cut)
    mocks.params.current = { id: 's0', lineId: 'house-line' }
    const results = savesOn(cut)
    render(<StatementLinePage />)
    const field = screen.getByLabelText('Son montant ce jour-là (EUR)')
    await userEvent.clear(field)
    await userEvent.type(field, '310000')
    expect(screen.getByText(plain('Ce chiffre est le même dans 1 autre relevé : on le corrige aussi.'))).toBeInTheDocument()
    expect(screen.getByText(plain('Aujourd’hui : 310 000 €, inchangé'))).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Corriger le 16 novembre 2025' }))
    const written = results[0]
    if ('refused' in written) throw new Error('refused')
    expect(written.writes.map((w) => (w.kind === 'snapshot' ? w.id : 'profile'))).toEqual(['s1', 's0'])
    expect(mocks.replace).toHaveBeenCalledWith('/releve/s0?corrige=1')
  })
})

// One magnifier per screen, while the vault opens as once it is open (a wrapper nested in another drew two).
describe('exactly one magnifier « Trouver », loading as ready', () => {
  test('the page of a relevé', () => {
    mocks.state.current = { status: 'loading' } as ModelState
    const { rerender } = render(<StatementPage />)
    expect(screen.getAllByRole('link', { name: 'Trouver' })).toHaveLength(1)
    ready()
    rerender(<StatementPage />)
    expect(screen.getAllByRole('link', { name: 'Trouver' })).toHaveLength(1)
  })

  test('the correction of a line of a relevé', () => {
    mocks.params.current = { id: 's0', lineId: 'livret-a-line' }
    mocks.state.current = { status: 'loading' } as ModelState
    const { rerender } = render(<StatementLinePage />)
    expect(screen.getAllByRole('link', { name: 'Trouver' })).toHaveLength(1)
    ready()
    rerender(<StatementLinePage />)
    expect(screen.getAllByRole('link', { name: 'Trouver' })).toHaveLength(1)
  })
})
