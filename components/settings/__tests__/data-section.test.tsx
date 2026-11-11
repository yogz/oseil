// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Model, ModelState } from '@/lib/app/use-model'
import { exampleProfile, exampleSnapshot } from '@/lib/model/__tests__/fixtures'
import { todayIso } from '@/lib/dates'
import { exportFileName } from '@/lib/transfer/export'
import { DataSection } from '../DataSection'

const mocks = vi.hoisted(() => ({
  writeWorkbook: vi.fn(),
  downloadBlob: vi.fn(),
  exportSheets: vi.fn(),
}))

vi.mock('@/lib/transfer/xlsx', async (original) => ({
  ...(await original<typeof import('@/lib/transfer/xlsx')>()),
  writeWorkbook: mocks.writeWorkbook,
}))
vi.mock('@/lib/transfer/download', () => ({ downloadBlob: mocks.downloadBlob }))
vi.mock('@/lib/transfer/export', async (original) => ({
  ...(await original<typeof import('@/lib/transfer/export')>()),
  exportSheets: mocks.exportSheets,
}))

const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const SHEETS = [{ name: 'Comptes', columns: [], rows: [] }]
const BLOB = new Blob(['x'])

function ready(
  parts: { draft?: boolean; unreadableSnapshots?: number; noProfile?: boolean; unreadableProfile?: number } = {},
): Extract<ModelState, { status: 'ready' }> {
  const model: Model = {
    profile: parts.noProfile ? null : loaded(exampleProfile),
    snapshots: parts.noProfile ? [] : [loaded(exampleSnapshot, 's0')],
    goals: [],
    settings: null,
    draft: parts.draft ? ({ id: 'd', value: {}, updatedAt: '' } as never) : null,
    unreadable: {
      profile: parts.unreadableProfile ?? 0,
      snapshots: parts.unreadableSnapshots ?? 0,
      goals: 0,
      settings: 0,
      draft: 0,
    },
  }
  return { status: 'ready', model, client: {} as never, dataKey: {} as CryptoKey, reload: vi.fn() }
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.exportSheets.mockReturnValue(SHEETS)
  mocks.writeWorkbook.mockResolvedValue(BLOB)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('the title, the caption and an outlined button; no draft or unreadable sentence by default', () => {
  render(<DataSection state={ready()} />)
  expect(screen.getByRole('heading', { level: 2, name: 'Mes chiffres en fichier' })).toBeInTheDocument()
  // Testing Library folds the non-breaking space into a plain one.
  expect(
    screen.getByText(
      'Tout ton historique dans un fichier Excel, à ouvrir dans Numbers ou à montrer à un conseiller. C’est aussi ta sauvegarde. Il est en clair : garde-le en lieu sûr.',
    ),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Télécharger mes chiffres' })).toBeEnabled()
  expect(screen.queryByText(/mise à jour en cours/)).toBeNull()
  expect(screen.queryByText(/n’ont? pas pu être lus?/)).toBeNull()
})

test('the draft sentence appears only with a draft', () => {
  render(<DataSection state={ready({ draft: true })} />)
  expect(screen.getByText('Ta mise à jour en cours n’y est pas, seulement les relevés terminés.')).toBeInTheDocument()
})

test('unreadable documents are said on screen with the guide’s own sentence', () => {
  render(<DataSection state={ready({ unreadableSnapshots: 2 })} />)
  const sentence = screen.getByText(/^2 relevés n’ont pas pu être lus\s: ils manquent dans ce fichier\.$/)
  // Said on the page from the start, so not an alert (an alert is read out the moment the page opens).
  expect(sentence).not.toHaveAttribute('role', 'alert')
  expect(screen.queryByRole('alert')).toBeNull()
})

test('an unreadable profile: the file cannot be prepared, the button is disabled and the screen says why', async () => {
  render(<DataSection state={ready({ noProfile: true, unreadableProfile: 1 })} />)
  expect(
    screen.getByText(
      /^Tes banques et tes comptes n’ont pas pu être lus\s: le fichier ne peut pas être préparé pour l’instant\.$/,
    ),
  ).toBeInTheDocument()
  // The sentence of a file that would still be prepared is not said.
  expect(screen.queryByText(/ils manquent dans ce fichier/)).toBeNull()
  const button = screen.getByRole('button', { name: 'Télécharger mes chiffres' })
  expect(button).toBeDisabled()
  await userEvent.click(button)
  expect(mocks.exportSheets).not.toHaveBeenCalled()
})

test('no profile yet (a new account, nothing unreadable): the file is offered, with an empty profile', async () => {
  const state = ready({ noProfile: true })
  render(<DataSection state={state} />)
  expect(screen.queryByText(/n’ont pas pu être lus/)).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Télécharger mes chiffres' }))
  expect(mocks.exportSheets).toHaveBeenCalledWith(
    expect.objectContaining({ profile: { schema: 1, establishments: [], accounts: [], lines: [] }, snapshots: [] }),
  )
  await waitFor(() => expect(mocks.downloadBlob).toHaveBeenCalled())
})

test('pressing the button writes the workbook of the model and downloads it under the dated name', async () => {
  const state = ready()
  render(<DataSection state={state} />)
  await userEvent.click(screen.getByRole('button', { name: 'Télécharger mes chiffres' }))

  expect(mocks.exportSheets).toHaveBeenCalledWith({
    profile: exampleProfile,
    snapshots: [exampleSnapshot],
    goals: [],
    settings: null,
    unreadable: state.model.unreadable,
  })
  expect(mocks.writeWorkbook).toHaveBeenCalledWith(SHEETS)
  await waitFor(() => expect(mocks.downloadBlob).toHaveBeenCalledWith(BLOB, exportFileName(todayIso())))
  expect(await screen.findByText('C’est dans tes Téléchargements (app Fichiers sur iPhone).')).toBeInTheDocument()
})

test('the button is disabled while the file is being prepared', async () => {
  let finish: (blob: Blob) => void = () => {}
  mocks.writeWorkbook.mockReturnValue(new Promise<Blob>((resolve) => (finish = resolve)))
  render(<DataSection state={ready()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Télécharger mes chiffres' }))
  expect(screen.getByRole('button', { name: 'Télécharger mes chiffres' })).toBeDisabled()
  finish(BLOB)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Télécharger mes chiffres' })).toBeEnabled())
})

test.each([
  ['writeWorkbook', () => mocks.writeWorkbook.mockRejectedValue(new Error('boom'))],
  ['exportSheets', () => mocks.exportSheets.mockImplementation(() => { throw new Error('dangling') })],
])('a failure of %s says so and downloads nothing', async (_name, fail) => {
  fail()
  render(<DataSection state={ready()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Télécharger mes chiffres' }))
  expect(await screen.findByText('Le fichier n’a pas pu être préparé. Réessaie.')).toBeInTheDocument()
  expect(mocks.downloadBlob).not.toHaveBeenCalled()
  expect(screen.queryByText(/Téléchargements/)).toBeNull()
  expect(screen.getByRole('button', { name: 'Télécharger mes chiffres' })).toBeEnabled()
})
