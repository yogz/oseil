// What every sheet of the import shares: the error a person reads, and the reading of a
// sheet into rows whose cells are found by column key, wherever the column stands.
import { COLUMNS, SHEETS, normalizeWord, type Column, type RefusalKey } from './format'
import type { Cell } from './xlsx'

// `row`: the spreadsheet's own row number (titles = 1); null for an error of the whole sheet.
// `sheet` null: an error of the whole file (not an Excel file, too big), its message a whole
// sentence with its capital; otherwise the message starts lower case, after « Onglet … : ».
export type ImportError = { sheet: string | null; row: number | null; message: string }

export const NB = ' '
export const q = (text: string) => `«${NB}${text}${NB}»`

// « Onglet Relevés, ligne 8 : le compte « Livret B » n’existe pas dans l’onglet Comptes. »
export function formatError(error: ImportError): string {
  if (error.sheet === null) return error.message
  return error.row === null
    ? `Onglet ${error.sheet}${NB}: ${error.message}`
    : `Onglet ${error.sheet}, ligne ${error.row}${NB}: ${error.message}`
}

// Every refusal goes through here, under one of the keys the « Pour une IA » note lists
// (REFUSALS): the key is not kept, it only forbids a refusal the note does not announce.
export function refuse(_key: RefusalKey, sheet: string | null, row: number | null, message: string): ImportError {
  return { sheet, row, message }
}

export type TableKind = keyof typeof COLUMNS
export type TableRow = { row: number; get: (key: string) => Cell }
export type SheetTable = { sheet: string; rows: TableRow[]; errors: ImportError[] }

export const isEmpty = (cell: Cell) => cell === null || (typeof cell === 'string' && cell.trim() === '')

// The sheet's cells (titles in the first row) into rows. Columns are found by their title,
// compared as words are; unknown columns and empty rows are ignored. An absent required
// sheet, a missing required column or a column written twice is an error.
export function readTable(kind: TableKind, cells: Cell[][] | undefined, required: boolean): SheetTable {
  const sheet = SHEETS[kind]
  if (cells === undefined) {
    return {
      sheet,
      rows: [],
      errors: required ? [refuse('missingSheet', sheet, null, 'cet onglet manque dans le fichier.')] : [],
    }
  }
  const columns = COLUMNS[kind] as readonly Column[]
  const titles = (cells[0] ?? []).map((cell) => (typeof cell === 'string' ? normalizeWord(cell) : null))
  const errors: ImportError[] = []
  const at = new Map<string, number>()
  for (const column of columns) {
    const found = titles.flatMap((title, index) => (title === normalizeWord(column.title) ? [index] : []))
    if (found.length > 1) {
      errors.push(refuse('duplicateColumn', sheet, null, `la colonne ${q(column.title)} apparaît deux fois.`))
    } else if (found.length === 1) {
      at.set(column.key, found[0])
    } else if (column.required) {
      errors.push(
        refuse('missingColumn', sheet, null, `la colonne ${q(column.title)} manque. Les titres des colonnes sont dans la première ligne.`),
      )
    }
  }
  const keys = new Set(columns.map((column) => column.key))
  // Computed columns are written for reading: a row that holds only them is empty.
  const read = columns.filter((column) => !column.computed && at.has(column.key)).map((column) => at.get(column.key)!)
  const rows: TableRow[] = []
  cells.slice(1).forEach((cellsOfRow, index) => {
    if (read.every((position) => isEmpty(cellsOfRow[position] ?? null))) return
    rows.push({
      row: index + 2,
      get: (key) => {
        if (!keys.has(key)) throw new Error(`import: no column ${kind}.${key}`)
        const position = at.get(key)
        return position === undefined ? null : (cellsOfRow[position] ?? null)
      },
    })
  })
  return { sheet, rows, errors }
}
