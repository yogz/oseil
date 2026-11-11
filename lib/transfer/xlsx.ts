// Thin wrapper around the two Excel libraries. Everything else in lib/transfer
// talks to this file, never to the libraries.
//
// We use the `/universal` entries (Blob in, Blob out): one code path for the
// browser, Node (vitest, scripts) and Playwright. The `/browser` entries rely
// on workers built from `Function.toString()`, which a production minifier can
// break and which Node lacks.

export type Cell = string | number | boolean | Date | null

export type ColumnFormat = 'text' | 'euros' | 'number' | 'integer' | 'date' | 'percent'

export type SheetSpec = {
  name: string
  // `quiet` paints the header paler: used for identifiers a person leaves alone.
  columns: { title: string; format: ColumnFormat; width: number; quiet?: boolean }[]
  rows: Cell[][]
  // Lines of plain text written instead of a table (« Mode d’emploi », « Pour une IA »).
  note?: string[]
}

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024

// Files have no colour token (the design tokens live in the CSS): plain greys.
const HEADER_BACKGROUND = '#D9D9D9'
const HEADER_BACKGROUND_QUIET = '#F0F0F0'

const EURO_FORMAT = '#,##0.00 "€"'
const DATE_FORMAT = 'dd/mm/yyyy'
const INTEGER_FORMAT = '0'
const PERCENT_FORMAT = '0.00%'

const NOTE_COLUMN_WIDTH = 110

const FORMATS: Record<ColumnFormat, string | undefined> = {
  text: undefined,
  euros: EURO_FORMAT,
  // 'number' = « General »: shows the decimals the value has, no trailing separator.
  number: undefined,
  integer: INTEGER_FORMAT,
  date: DATE_FORMAT,
  percent: PERCENT_FORMAT,
}

type WriteCell = Record<string, unknown> | null

function bodyCell(value: Cell, format: ColumnFormat): WriteCell {
  if (value === null) return null
  if (value instanceof Date) return { value, type: Date, format: DATE_FORMAT }
  if (typeof value === 'number') {
    const numberFormat = FORMATS[format]
    return numberFormat ? { value, type: Number, format: numberFormat } : { value, type: Number }
  }
  if (typeof value === 'boolean') return { value, type: Boolean }
  // « @ » keeps the spreadsheet from reinterpreting a text as a number or a date.
  return { value, type: String, format: '@' }
}

function sheetData(spec: SheetSpec): { data: WriteCell[][]; columns: { width: number }[] } {
  if (spec.note) {
    const data = spec.note.map((line, index) => [
      {
        value: line,
        type: String,
        wrap: true,
        alignVertical: 'top',
        ...(index === 0 ? { fontWeight: 'bold' } : {}),
      },
    ])
    return { data, columns: [{ width: NOTE_COLUMN_WIDTH }] }
  }
  const header = spec.columns.map((column) => ({
    value: column.title,
    type: String,
    fontWeight: 'bold',
    wrap: true,
    alignVertical: 'center',
    backgroundColor: column.quiet ? HEADER_BACKGROUND_QUIET : HEADER_BACKGROUND,
  }))
  const body = spec.rows.map((row) =>
    spec.columns.map((column, index) => bodyCell(row[index] ?? null, column.format)),
  )
  return {
    data: [header, ...body],
    columns: spec.columns.map((column) => ({ width: column.width })),
  }
}

export async function writeWorkbook(sheets: SheetSpec[]): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/universal')
  const written = sheets.map((spec) => {
    const { data, columns } = sheetData(spec)
    return {
      sheet: spec.name,
      data,
      columns,
      stickyRowsCount: spec.note ? 0 : 1,
    }
  })
  // The library's cell types are narrower than our plain objects; the shapes
  // are the documented ones (README, « Sheet » and « Style »).
  return writeXlsxFile(written as never).toBlob()
}

export async function readWorkbook(file: Blob): Promise<Map<string, Cell[][]>> {
  const { default: readXlsxFile } = await import('read-excel-file/universal')
  const sheets = await readXlsxFile(file)
  const book = new Map<string, Cell[][]>()
  for (const { sheet, data } of sheets) {
    book.set(sheet, data as Cell[][])
  }
  return book
}
