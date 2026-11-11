// @vitest-environment jsdom
// The bank screen on the real hook, with the database cut off: what is typed while a write
// fails stays on screen and in the draft, and the next write that works carries it (F1).
import '@testing-library/jest-dom/vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { ModelState } from '@/lib/app/use-model'
import { setAmountsHidden } from '@/lib/format'
import { exampleProfile, exampleSnapshot } from '@/lib/model/__tests__/fixtures'
import type { UpdateDraft } from '@/lib/model/types'
import { SAVE_FAILED } from '@/lib/setup/use-first-launch'
import { markStep, startDraft } from '@/lib/update/draft'
import { UpdateProvider } from '@/components/update/UpdateProvider'
import BankPage from '../banque/page'

const mocks = vi.hoisted(() => ({
  InvalidDocumentError: class InvalidDocumentError extends Error {},
  state: { current: null as unknown },
  down: { current: false },
  written: [] as unknown[],
  push: vi.fn(),
  replace: vi.fn(),
}))

vi.mock('@/lib/app/use-model', () => ({ useModel: () => mocks.state.current }))
// No line is attached to its price here, and no rate is needed: the market answers at once.
vi.mock('@/lib/market/use-market', () => ({
  useMarket: () => ({ status: 'ready', market: { quotes: {}, rates: null }, retry: () => {} }),
  useRates: () => ({ status: 'idle' }),
}))
vi.mock('@/lib/model/repository', () => {
  const write = async (draft: unknown, id: string) => {
    if (mocks.down.current) throw new Error('Failed to fetch')
    mocks.written.push(draft)
    return id
  }
  return {
    InvalidDocumentError: mocks.InvalidDocumentError,
    DocumentChangedError: class DocumentChangedError extends Error {},
    saveDraft: async (_client: unknown, _key: unknown, draft: unknown, guard: { id: string }) => write(draft, guard.id),
    createDraft: async (_client: unknown, _key: unknown, draft: unknown, id: string) => write(draft, id),
    deleteDraft: async () => {},
    deleteAllDrafts: async () => {},
    saveProfile: async () => 'p1',
    addSnapshot: async () => 's2',
    listUpdateDocuments: async () => [],
  }
})
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}))

// The draft as loaded: the steps before the one to open are done.
function open(done: string[]) {
  const draft = done.reduce((d, id) => markStep(d, id, 'done'), startDraft('s1'))
  mocks.state.current = {
    status: 'ready',
    client: {} as SupabaseClient,
    dataKey: {} as CryptoKey,
    reload: () => {},
    model: {
      profile: { id: 'p1', value: exampleProfile, updatedAt: '' },
      snapshots: [{ id: 's1', value: exampleSnapshot, updatedAt: '' }],
      goals: [],
      settings: null,
      draft: { id: 'd1', value: draft, updatedAt: '' },
      unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
    },
  } satisfies ModelState
  render(
    <UpdateProvider>
      <BankPage />
    </UpdateProvider>,
  )
}

beforeEach(() => {
  mocks.down.current = false
  mocks.written.length = 0
  mocks.push.mockReset()
  mocks.replace.mockReset()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// formatEuros writes no-break spaces (U+00A0, U+202F).
const norm = (s: string) => s.replace(/[  ]/g, ' ')
const region = (name: string) => screen.getByRole('region', { name })
const lastWritten = () => mocks.written[mocks.written.length - 1] as UpdateDraft

async function typeIn(box: HTMLElement, text: string) {
  await userEvent.clear(box)
  await userEvent.type(box, text)
  await userEvent.tab()
}

test('a value typed while the write fails stays in its box; the next write that works carries it', async () => {
  open(['home'])
  mocks.down.current = true
  await typeIn(within(region('Livret A')).getByRole('textbox'), '13000')
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(SAVE_FAILED))
  expect(within(region('Livret A')).getByRole('textbox')).toHaveValue('13\u202f000')
  expect(within(region('Livret A')).getByText((t) => norm(t) === 'avant : 12 000 €')).toBeInTheDocument()

  mocks.down.current = false
  await typeIn(within(region('Compte courant')).getByRole('textbox'), '9000')
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  expect(lastWritten().values).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ lineId: 'livret-a-line', amount: 1_300_000 }),
      expect.objectContaining({ lineId: 'current-line', amount: 900_000 }),
    ]),
  )
})

test('with the amounts hidden, the update still shows its figures: « avant : »', async () => {
  open(['home'])
  setAmountsHidden(true)
  try {
    await typeIn(within(region('Livret A')).getByRole('textbox'), '13000')
    expect(within(region('Livret A')).getByText((t) => norm(t) === 'avant : 12 000 €')).toBeInTheDocument()
    expect(screen.queryByText(/•••/)).not.toBeInTheDocument()
  } finally {
    setAmountsHidden(false)
  }
})

test('the save error is said near the top, under the header, before the bank’s name', async () => {
  open(['home'])
  mocks.down.current = true
  await typeIn(within(region('Livret A')).getByRole('textbox'), '13000')
  const alert = await screen.findByRole('alert')
  const name = screen.getByRole('heading', { level: 1 })
  expect(alert.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  // Still said under the actions too, once, without a second announcement.
  expect(screen.getAllByText(SAVE_FAILED)).toHaveLength(2)
})

test('a failed write: « Fermer » takes two taps', async () => {
  open(['home'])
  mocks.down.current = true
  await typeIn(within(region('Livret A')).getByRole('textbox'), '13000')
  await screen.findByRole('alert')
  await userEvent.click(screen.getByRole('button', { name: 'Fermer' }))
  expect(
    await screen.findByText('Ta dernière saisie n’a pas été enregistrée. Touche Fermer encore pour quitter sans elle.'),
  ).toBeInTheDocument()
  expect(mocks.push).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Fermer' }))
  expect(mocks.push).toHaveBeenCalledWith('/')
})

test('units and what was paid in: after a failed write their boxes show the draft’s value', async () => {
  open(['home', 'boursobank'])
  mocks.down.current = true
  await typeIn(within(region('Unité de compte')).getByLabelText('Combien vaut une part aujourd’hui ?'), '520')
  await screen.findByRole('alert')
  expect(within(region('Unité de compte')).getByLabelText('Combien vaut une part aujourd’hui ?')).toHaveValue('520,00')
  expect(within(region('Unité de compte')).getByText((t) => norm(t) === '10 parts = 5 200 €')).toBeInTheDocument()
  await typeIn(screen.getByLabelText('Combien a été versé dessus ?'), '-2000')
  expect(screen.getByLabelText('Combien a été versé dessus ?')).toHaveValue('-2\u202f000')

  mocks.down.current = false
  await typeIn(within(region('Fonds euros')).getByRole('textbox'), '31000')
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  expect(lastWritten().contributions).toEqual({ life: -200_000 })
  expect(lastWritten().values).toEqual(
    expect.arrayContaining([expect.objectContaining({ lineId: 'life-uc', unitPrice: 520 })]),
  )
})

test('adding while the write fails, then trying again: exactly one added account', async () => {
  open(['home'])
  mocks.down.current = true
  await userEvent.click(screen.getByRole('button', { name: '+ Ajouter un compte' }))
  await userEvent.click(screen.getByRole('button', { name: /^LEP/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Ouvert depuis la dernière fois' }))
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '2000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument()
  // The flow stays, with the error: it can be tried again.
  expect(screen.getByLabelText('Combien y a-t-il dessus ?')).toBeInTheDocument()

  mocks.down.current = false
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('BoursoBank'))
  expect(lastWritten().added.accounts).toHaveLength(1)
  expect(lastWritten().added.lines).toHaveLength(1)
  expect(screen.getAllByRole('button', { name: /nouveau$/ })).toHaveLength(1)
})

// The added lines' values, as written.
const addedValues = (draft: UpdateDraft) =>
  draft.values.filter((v) => draft.added.lines.some((l) => l.id === v.lineId)).map((v) => (v.kind === 'amount' ? v.amount : null))

test('the figure corrected after a failed add is the one saved when trying again', async () => {
  open(['home'])
  mocks.down.current = true
  await userEvent.click(screen.getByRole('button', { name: '+ Ajouter un compte' }))
  await userEvent.click(screen.getByRole('button', { name: /^LEP/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Ouvert depuis la dernière fois' }))
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '2000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument()

  await userEvent.clear(screen.getByLabelText('Combien y a-t-il dessus ?'))
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '3000')
  mocks.down.current = false
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('BoursoBank'))
  expect(lastWritten().added.accounts).toHaveLength(1)
  expect(addedValues(lastWritten())).toEqual([300_000])
  expect(screen.getAllByRole('button', { name: /nouveau$/ }).map((b) => norm((b.textContent ?? '').replace('›', '')))).toEqual([
    'LEP · 3 000 € · nouveau',
  ])
})

test('another add made after backing out of a failed one is the one saved, in its place', async () => {
  open(['home'])
  mocks.down.current = true
  await userEvent.click(screen.getByRole('button', { name: '+ Ajouter un compte' }))
  await userEvent.click(screen.getByRole('button', { name: /^LEP/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Ouvert depuis la dernière fois' }))
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '2000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument()

  // Back to the list of types, and a Livret jeune instead: the LEP's form was left unsaved.
  await userEvent.click(screen.getByRole('button', { name: '‹ Retour' }))
  await userEvent.click(screen.getByRole('button', { name: '‹ Retour' }))
  await userEvent.click(screen.getByRole('button', { name: /^Livret jeune/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Ouvert depuis la dernière fois' }))
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '500')
  mocks.down.current = false
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('BoursoBank'))
  expect(lastWritten().added.accounts.map((a) => a.type)).toEqual(['livret-jeune'])
  expect(addedValues(lastWritten())).toEqual([50_000])
  expect(screen.getAllByRole('button', { name: /nouveau$/ }).map((b) => norm((b.textContent ?? '').replace('›', '')))).toEqual([
    'Livret jeune · 500 € · nouveau',
  ])
})
