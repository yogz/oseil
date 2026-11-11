// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Model, ModelState } from '@/lib/app/use-model'
import { exampleProfile } from '@/lib/model/__tests__/fixtures'
import type { Profile } from '@/lib/model/types'
import type { ImportResult, ImportSummary } from '@/lib/transfer/import'
import type { ImportError } from '@/lib/transfer/import-types'
import ImportPage from '../importer/page'
import { AI_LINK_PROMPT, AI_PROMPT } from '@/lib/transfer/instructions'

const mocks = vi.hoisted(() => ({
  state: { current: { status: 'loading' } as unknown },
  replace: vi.fn(),
  importFile: vi.fn(),
  saveImport: vi.fn(),
  downloadBlob: vi.fn(),
  writeWorkbook: vi.fn(),
  templateSheets: vi.fn(),
}))

vi.mock('@/lib/app/use-model', () => ({ useModel: () => mocks.state.current }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}))
vi.mock('@/lib/transfer/import', () => ({ importFile: mocks.importFile }))
vi.mock('@/lib/transfer/save-import', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/transfer/save-import')>()),
  saveImport: mocks.saveImport,
}))
vi.mock('@/lib/transfer/download', () => ({ downloadBlob: mocks.downloadBlob }))
vi.mock('@/lib/transfer/xlsx', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/transfer/xlsx')>()),
  writeWorkbook: mocks.writeWorkbook,
}))
vi.mock('@/lib/transfer/export', () => ({
  templateSheets: mocks.templateSheets,
  TEMPLATE_FILE_NAME: 'modele-mes-chiffres.xlsx',
}))

// The no-break space of French typography. Testing Library folds it into a plain space in the
// text it searches, so a text matcher writes \s where the screen has one.
const NB = String.fromCharCode(0xa0)

const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const NO_UNREADABLE = { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 }

function emptyModel(extra: Partial<Model> = {}): Model {
  return { profile: null, snapshots: [], goals: [], settings: null, draft: null, unreadable: NO_UNREADABLE, ...extra }
}

const CLIENT = { tag: 'client' } as never
const KEY = {} as CryptoKey

function ready(model: Model, reload: () => void = vi.fn()): ModelState {
  return { status: 'ready', model, client: CLIENT, dataKey: KEY, reload }
}

const SUMMARY: ImportSummary = {
  relevés: [
    { takenOn: '2025-03-31', total: 41_200_000, placements: 20 },
    { takenOn: '2026-06-30', total: 85_000_000, placements: 23 },
    { takenOn: '2026-10-31', total: 89_800_000, placements: 23 },
  ],
  banks: 6,
  bankNames: ['BoursoBank', 'Linxea', 'Chez toi'],
  lines: 23,
  goals: 2,
  loans: 1,
  withoutFigure: [],
}
const DATA = { profile: exampleProfile, snapshots: [], goals: [], settings: {} } as never
const GOOD: ImportResult = { ok: true, data: DATA, summary: SUMMARY }
const SAVE_FAILED = 'L’import n’a pas abouti, rien n’est enregistré. Réessaie.'

const file = () => new File(['x'], 'mes-chiffres.xlsx')

async function choose(result: ImportResult = GOOD) {
  mocks.importFile.mockResolvedValueOnce(result)
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  await act(async () => {
    fireEvent.change(input, { target: { files: [file()] } })
  })
}

beforeEach(() => {
  mocks.replace.mockReset()
  mocks.importFile.mockReset()
  mocks.saveImport.mockReset().mockResolvedValue(undefined)
  mocks.downloadBlob.mockReset()
  mocks.writeWorkbook.mockReset().mockResolvedValue(new Blob(['xlsx']))
  mocks.templateSheets.mockReset().mockReturnValue([{ name: 'Mode d’emploi' }])
  mocks.state.current = ready(emptyModel())
})
afterEach(cleanup)

test('before a choice: how to export from Numbers, the pill over a hidden file field, and the template', () => {
  render(<ImportPage />)
  expect(screen.getByText(/Depuis Numbers, exporte d’abord en Excel\s: Partager › Exporter › Excel\.$/)).toBeInTheDocument()
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  expect(input).toHaveAttribute('accept', '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  expect(input.className).toContain('hidden')
  const click = vi.spyOn(input, 'click')
  fireEvent.click(screen.getByRole('button', { name: 'Choisir le fichier' }))
  expect(click).toHaveBeenCalled()
  expect(screen.getByText(/^Ta sauvegarde Oseil, un modèle rempli ou le fichier rendu par l’IA\./)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Avec ton IA' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'À la main' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Télécharger le modèle' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeInTheDocument()
  expect(mocks.replace).not.toHaveBeenCalled()
})

// The AI way (Nicolas, 10 November 2026): the person is told, before anything, that the AI reads
// their figures. Since 11 November 2026 (Nicolas: « trop long à copier ») what is copied is one short
// sentence that sends the AI to the instructions at /consignes-ia.md; it is on screen whole.
test('the AI way says who reads the figures, shows the short sentence and copies it', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
  render(<ImportPage />)
  expect(screen.getByText('Tes chiffres seront lus par cette IA, pas par Oseil.')).toBeInTheDocument()
  expect(screen.getByTestId('ai-prompt').textContent).toBe(AI_LINK_PROMPT)
  expect(AI_LINK_PROMPT).toContain('https://oseil.fr/consignes-ia.md')
  expect(AI_LINK_PROMPT.length).toBeLessThan(400)
  // A proof of reading, and nothing invented when the page cannot be opened (review of 11 November 2026).
  expect(AI_LINK_PROMPT).toContain('cite-moi d’abord les noms des onglets')
  expect(AI_LINK_PROMPT).toContain('sans rien inventer')
  // Claude and Le Chat open a link only with their web search on (their own help pages).
  expect(screen.getByText('Sur Claude ou Le Chat, active d’abord la recherche web.')).toBeInTheDocument()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Copier la consigne' }))
  })
  expect(writeText).toHaveBeenCalledWith(AI_LINK_PROMPT)
  expect(screen.getByRole('button', { name: 'Consigne copiée' })).toBeInTheDocument()
  vi.unstubAllGlobals()
})

// For an AI that cannot open a link: the whole instructions, copied by a touch, folded.
test('the whole instructions stay one touch away, for an AI that opens no link', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
  render(<ImportPage />)
  const details = screen.getByTestId('ai-prompt-full').closest('details')!
  expect(details.open).toBe(false)
  expect(screen.getByTestId('ai-prompt-full').textContent).toBe(AI_PROMPT)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Copier la consigne complète' }))
  })
  expect(writeText).toHaveBeenCalledWith(AI_PROMPT)
  vi.unstubAllGlobals()
})

// The AI way, reordered (Nicolas, 10 November 2026): marked experimental, in three steps, with no
// template to download first; the template belongs to the hand way only.
test('the AI way is marked experimental, in three steps, and asks for no template', () => {
  render(<ImportPage />)
  const heading = screen.getByRole('heading', { name: 'Avec ton IA' })
  expect(heading.parentElement!.textContent).toContain('Expérimental')
  const steps = within(heading.parentElement!.parentElement!.querySelector('ol')!).getAllByRole('listitem')
  expect(steps).toHaveLength(3)
  expect(steps[0].textContent).toContain('Copie la consigne.')
  expect(steps[1].textContent).toContain('sans rien joindre')
  expect(steps[2].textContent).toContain('Reviens ici')
  expect(screen.getByRole('link', { name: 'Ouvrir ChatGPT' })).toHaveAttribute('href', 'https://chatgpt.com/')
  expect(screen.getByRole('link', { name: 'Ouvrir Claude' })).toHaveAttribute('href', 'https://claude.ai/new')
  expect(screen.getByRole('link', { name: 'Ouvrir Gemini' })).toHaveAttribute('href', 'https://gemini.google.com/app')
  for (const name of ['Ouvrir ChatGPT', 'Ouvrir Claude', 'Ouvrir Gemini']) {
    expect(screen.getByRole('link', { name })).toHaveAttribute('rel', 'noopener noreferrer')
  }
  // The template sits under « À la main », after the AI way.
  const hand = screen.getByRole('heading', { name: 'À la main' })
  const download = screen.getByRole('button', { name: 'Télécharger le modèle' })
  expect(heading.compareDocumentPosition(hand) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(hand.compareDocumentPosition(download) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('without a clipboard, the prompt stays on screen and nothing breaks', async () => {
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('refused')) } })
  render(<ImportPage />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Copier la consigne' }))
  })
  expect(screen.getByRole('button', { name: 'Copier la consigne' })).toBeInTheDocument()
  // The short sentence is on screen, whole, to be selected by hand.
  expect(screen.getByTestId('ai-prompt').textContent).toBe(AI_LINK_PROMPT)
  vi.unstubAllGlobals()
})

test('the template is written and handed to the download under its name', async () => {
  render(<ImportPage />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger le modèle' }))
  })
  expect(mocks.writeWorkbook).toHaveBeenCalledWith([{ name: 'Mode d’emploi' }])
  expect(mocks.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'modele-mes-chiffres.xlsx')
})

test('a template that cannot be written says so', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.writeWorkbook.mockRejectedValueOnce(new Error('boom'))
  render(<ImportPage />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger le modèle' }))
  })
  expect(screen.getByRole('alert')).toHaveTextContent('Le modèle n’a pas pu être préparé. Réessaie.')
  expect(mocks.downloadBlob).not.toHaveBeenCalled()
  spy.mockRestore()
})

test('a bad file: the lead sentence, the errors grouped by sheet with the whole-file ones first, nothing saved', async () => {
  const errors: ImportError[] = [
    { sheet: 'Comptes', row: 3, message: 'la banque est vide.' },
    { sheet: 'Relevés', row: 8, message: `le compte «${NB}Livret B${NB}» n’existe pas dans l’onglet Comptes.` },
    { sheet: 'Comptes', row: 5, message: 'la devise est inconnue.' },
    { sheet: null, row: null, message: `Ce fichier fait plus de 5${NB}Mo.` },
  ]
  render(<ImportPage />)
  await choose({ ok: false, errors })
  expect(mocks.importFile).toHaveBeenCalledWith(expect.any(File))
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Rien n’est enregistré. Corrige ces points dans le fichier, puis choisis-le de nouveau.',
  )
  const section = screen.getByRole('region', { name: 'Ce qui ne va pas dans le fichier' })
  const lists = within(section).getAllByRole('list')
  expect(lists.map((list) => within(list).getAllByRole('listitem').map((li) => li.textContent))).toEqual([
    [`Ce fichier fait plus de 5${NB}Mo.`],
    [`Onglet Comptes, ligne 3${NB}: la banque est vide.`, `Onglet Comptes, ligne 5${NB}: la devise est inconnue.`],
    [`Onglet Relevés, ligne 8${NB}: le compte «${NB}Livret B${NB}» n’existe pas dans l’onglet Comptes.`],
  ])
  // Chosen again from here; nothing to import.
  expect(screen.getByRole('button', { name: 'Choisir le fichier' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Importer ces chiffres' })).toBeNull()
  expect(mocks.saveImport).not.toHaveBeenCalled()
})

test('at most twenty errors, then « et N autres »', async () => {
  const errors: ImportError[] = Array.from({ length: 23 }, (_, i) => ({ sheet: 'Relevés', row: i + 2, message: 'le montant est vide.' }))
  render(<ImportPage />)
  await choose({ ok: false, errors })
  const section = screen.getByRole('region', { name: 'Ce qui ne va pas dans le fichier' })
  const items = within(section).getAllByRole('listitem')
  expect(items).toHaveLength(20)
  expect(items[19].textContent).toBe(`Onglet Relevés, ligne 21${NB}: le montant est vide.`)
  expect(screen.getByText('et 3 autres')).toBeInTheDocument()
})

// A file made by an AI goes back to it (Nicolas, 10 November 2026): every message, not only the
// twenty shown, copied by a touch with the reminder to move the dependent lines too.
test('the errors are copied, all of them, to be pasted back to the AI', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
  const errors: ImportError[] = Array.from({ length: 23 }, (_, i) => ({ sheet: 'Relevés', row: i + 2, message: 'le montant est vide.' }))
  render(<ImportPage />)
  await choose({ ok: false, errors })
  expect(screen.getByText(/^Fait avec ton IA\s\? Colle-lui ces messages\s: elle corrigera le fichier\.$/)).toBeInTheDocument()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Copier les messages' }))
  })
  const copied = writeText.mock.calls[0][0] as string
  expect(copied).toContain('L’import d’Oseil refuse le fichier que tu m’as rendu.')
  expect(copied).toContain(`Onglet Relevés, ligne 24${NB}: le montant est vide.`)
  expect(copied.match(/le montant est vide\./g)).toHaveLength(23)
  expect(screen.getByRole('button', { name: 'Messages copiés' })).toBeInTheDocument()
  vi.unstubAllGlobals()
})

test('the cap of twenty counts the whole-file errors first', async () => {
  const errors: ImportError[] = [
    ...Array.from({ length: 20 }, (_, i) => ({ sheet: 'Relevés', row: i + 2, message: 'le montant est vide.' })),
    { sheet: null, row: null, message: 'Une erreur du fichier entier.' },
  ]
  render(<ImportPage />)
  await choose({ ok: false, errors })
  const items = within(screen.getByRole('region', { name: 'Ce qui ne va pas dans le fichier' })).getAllByRole('listitem')
  expect(items[0].textContent).toBe('Une erreur du fichier entier.')
  expect(items).toHaveLength(20)
  expect(screen.getByText('et 1 autre')).toBeInTheDocument()
})

test('a good file: the summary, the relevés newest first with their totals, the banks, the question', async () => {
  render(<ImportPage />)
  await choose()
  expect(screen.getByText('3 relevés · 6 banques · 23 placements · 2 objectifs')).toBeInTheDocument()
  const rows = within(screen.getByRole('list', { name: 'Les relevés' })).getAllByRole('listitem')
  const text = (row: HTMLElement) => Array.from(row.children, (cell) => cell.textContent).join(' ').replace(/\s/g, ' ')
  expect(rows.map(text)).toEqual(['31 octobre 898 000 €', '30 juin 850 000 €', '31 mars 2025 412 000 €'])
  expect(rows[0].querySelector('.tabular-nums')).not.toBeNull()
  expect(screen.getByText('BoursoBank, Linxea, Chez toi')).toBeInTheDocument()
  expect(screen.getByText(/^Ça ressemble à tes chiffres\s\?$/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Importer ces chiffres' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Choisir un autre fichier' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Choisir le fichier' })).toBeNull()
})

test('a relevé with no placement says so instead of a total of 0 €', async () => {
  render(<ImportPage />)
  await choose({
    ok: true,
    data: DATA,
    summary: { ...SUMMARY, relevés: [...SUMMARY.relevés, { takenOn: '2026-11-30', total: null, placements: 0 }] },
  })
  const rows = within(screen.getByRole('list', { name: 'Les relevés' })).getAllByRole('listitem')
  expect(Array.from(rows[0].children, (cell) => cell.textContent)).toEqual(['30 novembre', 'aucun placement'])
  expect(rows[0].textContent).not.toMatch(/€/)
  expect(rows[1].textContent).toMatch(/898\s000\s€/)
})

// A relevé that is a piece of the patrimoine, not a photo of it (a ChatGPT file, 10 November 2026):
// said before the import, never refused.
test('a relevé far smaller than the fullest one is pointed out, and the import stays possible', async () => {
  render(<ImportPage />)
  await choose({
    ok: true,
    data: DATA,
    summary: {
      ...SUMMARY,
      relevés: [
        { takenOn: '2025-11-16', total: 1_043_588, placements: 1 },
        { takenOn: '2026-11-05', total: 66_831_086, placements: 27 },
        { takenOn: '2026-11-16', total: 283_919, placements: 6 },
      ],
    },
  })
  expect(screen.getByText(/^Le relevé du 16 novembre 2025 ne contient que 1 placement, contre 27 dans le plus complet\.$/)).toBeInTheDocument()
  expect(screen.getByText(/^Le relevé du 16 novembre ne contient que 6 placements, contre 27 dans le plus complet\.$/)).toBeInTheDocument()
  expect(screen.getByText(/Un placement absent d’un relevé n’y est pas compté\./)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Importer ces chiffres' })).toBeEnabled()
})

test('relevés of a similar size say nothing more', async () => {
  render(<ImportPage />)
  await choose()
  expect(screen.queryByText(/ne contient que/)).toBeNull()
})

// What the file leaves out is said, never guessed (a ChatGPT file had no loan and dropped two PEE).
test('a file with no loan says so, and names the placements with no figure', async () => {
  render(<ImportPage />)
  await choose({
    ok: true,
    data: DATA,
    summary: { ...SUMMARY, loans: 0, withoutFigure: ['PEE Criteo', 'PEE OVHcloud', 'PER', 'OpenAI', 'Livret jeune'] },
  })
  expect(screen.getByText(/^Ce fichier ne contient aucun crédit\. Si tu en as un, ajoute-le avant d’importer\s: sans lui, ton patrimoine net serait trop haut\.$/)).toBeInTheDocument()
  expect(screen.getByText(/^5 placements n’ont aucun chiffre\s: PEE Criteo, PEE OVHcloud, PER et 2 autres\. Ils ne comptent qu’une fois remplis, à ta prochaine mise à jour\.$/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Importer ces chiffres' })).toBeEnabled()
})

test('one placement with no figure is named alone; a file with a loan says nothing of loans', async () => {
  render(<ImportPage />)
  await choose({ ok: true, data: DATA, summary: { ...SUMMARY, withoutFigure: ['Crédit 7RSVP'] } })
  expect(screen.getByText(/^Un placement n’a aucun chiffre\s: Crédit 7RSVP\. Il ne compte qu’une fois rempli, à ta prochaine mise à jour\.$/)).toBeInTheDocument()
  expect(screen.queryByText(/aucun crédit/)).toBeNull()
})

test('one of each, and no goal: the words agree', async () => {
  render(<ImportPage />)
  await choose({ ok: true, data: DATA, summary: { relevés: [SUMMARY.relevés[0]], banks: 1, bankNames: ['BoursoBank'], lines: 1, goals: 0, loans: 1, withoutFigure: [] } })
  expect(screen.getByText('1 relevé · 1 banque · 1 placement · aucun objectif')).toBeInTheDocument()
})

test('« Choisir un autre fichier » opens the file choice again', async () => {
  render(<ImportPage />)
  await choose()
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const click = vi.spyOn(input, 'click')
  fireEvent.click(screen.getByRole('button', { name: 'Choisir un autre fichier' }))
  expect(click).toHaveBeenCalled()
})

test('« Importer ces chiffres » saves once, even on a double click, then goes to Mon argent', async () => {
  let finish: () => void = () => {}
  mocks.saveImport.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)))
  const model = emptyModel()
  mocks.state.current = ready(model)
  render(<ImportPage />)
  await choose()
  const button = screen.getByRole('button', { name: 'Importer ces chiffres' })
  await act(async () => {
    fireEvent.click(button)
    fireEvent.click(button)
  })
  expect(mocks.saveImport).toHaveBeenCalledTimes(1)
  expect(mocks.saveImport).toHaveBeenCalledWith(CLIENT, KEY, model, DATA)
  expect(button).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Choisir un autre fichier' })).toBeDisabled()
  expect(mocks.replace).not.toHaveBeenCalled()
  await act(async () => finish())
  expect(mocks.replace).toHaveBeenCalledWith('/')
})

test('while it imports, the preview gives its place to the vault locking; a failure brings it back', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  let fail: (reason: unknown) => void = () => {}
  mocks.saveImport.mockImplementationOnce(() => new Promise<void>((_, reject) => (fail = reject)))
  mocks.state.current = ready(emptyModel())
  render(<ImportPage />)
  await choose()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Importer ces chiffres' }))
  })
  expect(await screen.findByText('Mise sous clé…', { selector: 'p' }, { timeout: 1000 })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Importer ces chiffres', hidden: true })).not.toBeVisible()
  await act(async () => fail(new Error('network')))
  expect(screen.queryByText('Mise sous clé…', { selector: 'p' })).not.toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent(SAVE_FAILED)
  spy.mockRestore()
})

test('a failed save says so; the retry reloads the model first and saves with the reloaded one', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const reload = vi.fn()
  mocks.state.current = ready(emptyModel(), reload)
  mocks.saveImport.mockRejectedValueOnce(new Error('network'))
  const { rerender } = render(<ImportPage />)
  await choose()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Importer ces chiffres' }))
  })
  expect(screen.getByRole('alert')).toHaveTextContent(SAVE_FAILED)
  expect(mocks.replace).not.toHaveBeenCalled()

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Importer ces chiffres' }))
    fireEvent.click(screen.getByRole('button', { name: 'Importer ces chiffres' }))
  })
  expect(reload).toHaveBeenCalledTimes(1)
  // Nothing is written with the model the failure was met with.
  expect(mocks.saveImport).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Importer ces chiffres' })).toBeDisabled()

  // The reloaded model, holding what the failed import could not delete.
  const reloaded = emptyModel({ snapshots: [loaded({} as never, 'left-1')] })
  mocks.state.current = ready(reloaded, reload)
  await act(async () => rerender(<ImportPage />))
  expect(mocks.saveImport).toHaveBeenCalledTimes(2)
  expect(mocks.saveImport.mock.calls[1][2]).toBe(reloaded)
  expect(mocks.replace).toHaveBeenCalledWith('/')
  spy.mockRestore()
})

test('after a failed save, another file chosen is still saved with a reloaded model, never the old one', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const reload = vi.fn()
  mocks.state.current = ready(emptyModel(), reload)
  mocks.saveImport.mockRejectedValueOnce(new Error('network'))
  const { rerender } = render(<ImportPage />)
  await choose()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Importer ces chiffres' }))
  })
  expect(screen.getByRole('alert')).toHaveTextContent(SAVE_FAILED)

  // Another file: the failure sentence goes, but the vault must still be read again.
  await choose()
  expect(screen.queryByText(SAVE_FAILED)).toBeNull()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Importer ces chiffres' }))
  })
  expect(reload).toHaveBeenCalledTimes(1)
  expect(mocks.saveImport).toHaveBeenCalledTimes(1)

  const reloaded = emptyModel({ snapshots: [loaded({} as never, 'left-1')] })
  mocks.state.current = ready(reloaded, reload)
  await act(async () => rerender(<ImportPage />))
  expect(mocks.saveImport).toHaveBeenCalledTimes(2)
  expect(mocks.saveImport.mock.calls[1][2]).toBe(reloaded)
  expect(mocks.replace).toHaveBeenCalledWith('/')
  spy.mockRestore()
})

test('a retry refused because the profile write had in fact landed counts as done', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { VaultNotEmptyError } = await import('@/lib/transfer/save-import')
  const reload = vi.fn()
  mocks.state.current = ready(emptyModel(), reload)
  mocks.saveImport.mockRejectedValueOnce(new Error('lost answer'))
  const { rerender } = render(<ImportPage />)
  await choose()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Importer ces chiffres' }))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Importer ces chiffres' }))
  })
  mocks.saveImport.mockRejectedValueOnce(new VaultNotEmptyError())
  // A reloaded model that still looks empty to this page (written by another device in between).
  mocks.state.current = ready(emptyModel(), reload)
  await act(async () => rerender(<ImportPage />))
  expect(mocks.saveImport).toHaveBeenCalledTimes(2)
  expect(mocks.replace).toHaveBeenCalledWith('/')
  expect(screen.queryByText(SAVE_FAILED)).toBeNull()
  spy.mockRestore()
})

test('a vault that is not empty is sent back to Mon argent, with nothing offered', () => {
  mocks.state.current = ready(emptyModel({ profile: loaded(exampleProfile) }))
  render(<ImportPage />)
  expect(mocks.replace).toHaveBeenCalledWith('/')
  expect(screen.queryByRole('button', { name: 'Choisir le fichier' })).toBeNull()
})

test.each([
  ['an unreadable profile', emptyModel({ unreadable: { ...NO_UNREADABLE, profile: 1 } })],
  [
    'a first launch marked complete',
    emptyModel({
      profile: loaded({ schema: 1, establishments: [], accounts: [], lines: [], firstLaunch: { planned: [], finished: [], complete: true } } as Profile),
    }),
  ],
])('%s is not an empty vault: back to Mon argent', (_name, model) => {
  mocks.state.current = ready(model)
  render(<ImportPage />)
  expect(mocks.replace).toHaveBeenCalledWith('/')
})

test('a model that cannot be loaded says so and offers to try again', () => {
  const retry = vi.fn()
  mocks.state.current = { status: 'failed', retry }
  render(<ImportPage />)
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  expect(retry).toHaveBeenCalled()
})
