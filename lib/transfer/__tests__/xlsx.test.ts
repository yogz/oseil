import { describe, expect, it } from 'vitest'
import { MAX_IMPORT_BYTES, readWorkbook, writeWorkbook, type SheetSpec } from '../xlsx'

const day = new Date(Date.UTC(2026, 10, 5))

const table: SheetSpec = {
  name: 'Comptes',
  columns: [
    { title: 'Nom', format: 'text', width: 20 },
    { title: 'Montant', format: 'euros', width: 14 },
    { title: 'Part', format: 'number', width: 10 },
    { title: 'Le', format: 'date', width: 12 },
    { title: 'Taux', format: 'percent', width: 8, quiet: true },
  ],
  rows: [
    ['Livret d’épargne à 100 €', 1234.56, 0.5, day, null],
    ['Crédit', -12000, 3, day, 0.25],
  ],
}

const note: SheetSpec = {
  name: 'Mode d’emploi',
  columns: [],
  rows: [],
  note: ['Un titre', 'Une phrase avec « € » et ’.', 'Une autre.'],
}

describe('xlsx wrapper', () => {
  it('writes then reads back every sheet by name, header included', async () => {
    const blob = await writeWorkbook([note, table])
    const book = await readWorkbook(blob)
    expect([...book.keys()]).toEqual(['Mode d’emploi', 'Comptes'])
    expect(book.get('Comptes')).toEqual([
      ['Nom', 'Montant', 'Part', 'Le', 'Taux'],
      ['Livret d’épargne à 100 €', 1234.56, 0.5, day, null],
      ['Crédit', -12000, 3, day, 0.25],
    ])
  })

  it('reads a date back as the same calendar day (UTC)', async () => {
    const book = await readWorkbook(await writeWorkbook([table]))
    const read = book.get('Comptes')![1][3] as Date
    expect(read.getUTCFullYear()).toBe(2026)
    expect(read.getUTCMonth()).toBe(10)
    expect(read.getUTCDate()).toBe(5)
  })

  it('reads a note sheet as one text per row', async () => {
    const book = await readWorkbook(await writeWorkbook([note]))
    expect(book.get('Mode d’emploi')).toEqual([
      ['Un titre'],
      ['Une phrase avec « € » et ’.'],
      ['Une autre.'],
    ])
  })

  it('keeps integer and decimal columns exact', async () => {
    const sheet: SheetSpec = {
      name: 'Nombres',
      columns: [
        { title: 'N°', format: 'integer', width: 8 },
        { title: 'Parts', format: 'number', width: 8 },
      ],
      rows: [[3, 12.345678]],
    }
    const book = await readWorkbook(await writeWorkbook([sheet]))
    expect(book.get('Nombres')).toEqual([['N°', 'Parts'], [3, 12.345678]])
  })

  it('exposes the import size limit', () => {
    expect(MAX_IMPORT_BYTES).toBe(5 * 1024 * 1024)
  })
})
