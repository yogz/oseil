import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@/lib/model/documents'
import { computeSituation } from '@/lib/model/situation'
import { exportSheets, templateSheets } from '../export'
import { COLUMNS, EXAMPLE_BANK, FILE_REFUSALS, GOAL_REFUSALS, SETTING_REFUSALS, SHEETS } from '../format'
import { importFile, readImport, type ImportResult } from '../import'
import { partialRelevés } from '../preview'
import { formatError, type ImportError } from '../import-types'
import { AI_EXAMPLE, aiNote } from '../instructions'
import { MAX_IMPORT_BYTES, readWorkbook, writeWorkbook, type Cell, type SheetSpec } from '../xlsx'
import { fixtureInput } from './fixtures'

// Messages hold no-break spaces (French typography); expectations are written with plain ones.
const plain = (text: string) => text.replace(/ /g, ' ')

type Kind = keyof typeof COLUMNS
type Values = Partial<Record<string, Cell>>
const header = (kind: Kind): Cell[] => COLUMNS[kind].map((c) => c.title)
const rowOf = (kind: Kind, values: Values): Cell[] => COLUMNS[kind].map((c) => values[c.key] ?? null)
const sheetOf = (kind: Kind, rows: Values[]): Cell[][] => [header(kind), ...rows.map((r) => rowOf(kind, r))]
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const oct = day('2026-10-31')
const sep = day('2026-09-30')

const counter = () => {
  let n = 0
  return () => `new-${++n}`
}

const livret = { bank: 'BoursoBank', account: 'Livret A', line: 'Livret A' }
const ACCOUNTS: Values[] = [{ ...livret, type: 'Livret A' }]
const SNAPSHOTS: Values[] = [{ date: oct, ...livret, amount: 1000 }]

// A book in the shape `readWorkbook` gives: the sheet's name to its cells, titles first.
function book(parts: Partial<Record<Kind, Values[]>> = {}, extra: [string, Cell[][]][] = []): Map<string, Cell[][]> {
  const all = { accounts: ACCOUNTS, snapshots: SNAPSHOTS, ...parts }
  const map = new Map<string, Cell[][]>()
  for (const [kind, rows] of Object.entries(all) as [Kind, Values[]][]) map.set(SHEETS[kind], sheetOf(kind, rows))
  for (const [name, cells] of extra) map.set(name, cells)
  return map
}

const toBook = (sheets: SheetSpec[]): Map<string, Cell[][]> =>
  new Map(sheets.map((s) => [s.name, s.note ? s.note.map((line) => [line]) : [s.columns.map((c) => c.title), ...s.rows]]))

const run = (b: Map<string, Cell[][]>) => readImport(b, counter())
const messages = (result: ImportResult) => (result.ok ? [] : result.errors.map((e) => plain(formatError(e))))
const errorsOf = (result: ImportResult): ImportError[] => (result.ok ? [] : result.errors)
function success(result: ImportResult) {
  if (!result.ok) throw new Error(result.errors.map(formatError).join('\n'))
  return result
}

const goal = (from: Cell, available: Cell, secured: Cell, markets: Cell, gold: Cell, rental?: Cell): Values => ({
  from,
  available,
  secured,
  markets,
  gold,
  rental,
})
const setting = (name: Cell, value: Cell): Values => ({ name, value })

describe('readImport: a small file', () => {
  it('reads the accounts, the relevés, default settings and no goals', () => {
    const { data, summary } = success(run(book()))
    expect(data.profile.lines.map((l) => l.name)).toEqual(['Livret A'])
    expect(data.snapshots).toHaveLength(1)
    expect(data.snapshots[0].value.entries).toEqual([{ lineId: data.profile.lines[0].id, kind: 'amount', amount: 100000, seenOn: '2026-10-31' }])
    expect(data.goals).toEqual([])
    expect(data.settings).toEqual(DEFAULT_SETTINGS)
    expect(summary).toEqual({
      relevés: [{ takenOn: '2026-10-31', total: 100000, placements: 1 }],
      banks: 1,
      bankNames: ['BoursoBank'],
      lines: 1,
      goals: 0,
      loans: 0,
      withoutFigure: [],
    })
  })

  it('draws the snapshot ids with newId, so the same newId gives the same ids again', () => {
    const b = book({ snapshots: [...SNAPSHOTS, { date: sep, ...livret, amount: 900 }] })
    const first = success(run(b)).data.snapshots.map((s) => s.id)
    const second = success(run(b)).data.snapshots.map((s) => s.id)
    expect(first).toEqual(second)
    expect(new Set(first).size).toBe(2)
    expect(first.every((id) => id.startsWith('new-'))).toBe(true)
  })

  it('draws random ids when no newId is given', () => {
    const result = readImport(book())
    expect(result.ok && result.data.snapshots[0].id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('writes the closings it infers for lines without identifier on the profile', () => {
    const accounts = [...ACCOUNTS, { bank: 'BoursoBank', account: 'Livret B', line: 'Livret B', type: 'Autre livret' }]
    const b = book({
      accounts,
      snapshots: [
        { date: sep, ...livret, amount: 1 },
        { date: sep, bank: 'BoursoBank', account: 'Livret B', line: 'Livret B', amount: 1 },
        { date: oct, ...livret, amount: 1 },
      ],
    })
    const { data } = success(run(b))
    expect(data.profile.lines.find((l) => l.name === 'Livret B')?.closedOn).toBe('2026-10-31')
    expect(data.profile.lines.find((l) => l.name === 'Livret A')?.closedOn).toBeUndefined()
  })
})

describe('readImport: the sheets', () => {
  it('finds a sheet whatever its case and accents, and ignores the sheets it does not know', () => {
    const b = new Map<string, Cell[][]>([
      ['COMPTES', sheetOf('accounts', ACCOUNTS)],
      [' releves ', sheetOf('snapshots', SNAPSHOTS)],
      ['Résumé de l’exportation', [['Ce document a été exporté depuis Numbers.'], ['Comptes'], ['Relevés']]],
      [SHEETS.guide, [['Tes chiffres en un fichier'], ['n’importe quoi']]],
      [SHEETS.ai, [['Copie tout le texte'], [12]]],
    ])
    success(run(b))
  })

  it('says which required sheets are missing', () => {
    expect(messages(run(new Map()))).toEqual([
      'Onglet Comptes : cet onglet manque dans le fichier.',
      'Onglet Relevés : cet onglet manque dans le fichier.',
    ])
  })

  it('refuses two sheets of one name, compared as words are', () => {
    const b = book({}, [['releves', sheetOf('snapshots', SNAPSHOTS)]])
    expect(messages(run(b))).toEqual([
      'Onglet Relevés : il y a deux onglets de ce nom (« Relevés » et « releves »). Garde-en un seul.',
    ])
  })
})

describe('readImport: « Objectifs », the available money in months', () => {
  const months = (from: Cell, cushion: Cell, available: Cell = 0): Values => ({ ...goal(from, available, 33, 60, 7, 0), cushionMonths: cushion })

  it('reads the months, the available share at 0', () => {
    const { data } = success(run(book({ goals: [months(oct, 4)] })))
    expect(data.goals[0]).toMatchObject({ cushionMonths: 4, shares: { available: 0, secured: 33, markets: 60, gold: 7, rental: 0 } })
  })

  it('a file without the column reads as before, every goal in percents', () => {
    const { data } = success(run(book({ goals: [goal(oct, 20, 60, 15, 5)] })))
    expect(data.goals[0]).not.toHaveProperty('cushionMonths')
  })

  it('refuses months that are not a choice, and months beside a share of available money', () => {
    expect(messages(run(book({ goals: [months(oct, 3.5), { ...goal(sep, 10, 23, 60, 7, 0), cushionMonths: 4 }] })))).toEqual([
      'Onglet Objectifs, ligne 2 : dans « Argent disponible (mois) », 3,5 n’est pas un nombre de mois proposé : de 1 à 24, par demi-mois en dessous de 3.',
      'Onglet Objectifs, ligne 3 : avec des mois pour l’argent disponible, sa part en pour cent vaut 0.',
    ])
  })
})

describe('readImport: « Objectifs »', () => {
  it('reads each row as a goal, in the order of the rows, two on the same day included', () => {
    const { data } = success(
      run(book({ goals: [goal(oct, 20, 60, 15, 5), goal(oct, 10, 40, 45, 5), goal(sep, '25 %', '25', 25, 25)] })),
    )
    expect(data.goals).toEqual([
      { schema: 1, validFrom: '2026-10-31', shares: { available: 20, secured: 60, markets: 15, gold: 5, rental: 0 } },
      { schema: 1, validFrom: '2026-10-31', shares: { available: 10, secured: 40, markets: 45, gold: 5, rental: 0 } },
      { schema: 1, validFrom: '2026-09-30', shares: { available: 25, secured: 25, markets: 25, gold: 25, rental: 0 } },
    ])
  })

  it('reads a row whose total is 1 as fractions (« 25 % » typed in Excel is kept as 0,25)', () => {
    const { data } = success(run(book({ goals: [goal(oct, 0.15, 0.35, 0.45, 0.05), goal(sep, 100, 0, 0, 0)] })))
    expect(data.goals.map((g) => g.shares)).toEqual([
      { available: 15, secured: 35, markets: 45, gold: 5, rental: 0 },
      { available: 100, secured: 0, markets: 0, gold: 0, rental: 0 },
    ])
  })

  it('refuses a row of one share at 1 and the others at 0: 1 % or 100 % would be a guess', () => {
    expect(messages(run(book({ goals: [goal(oct, 0, 1, 0, 0)] })))).toEqual([
      'Onglet Objectifs, ligne 2 : écris les pourcentages en nombres simples, par exemple 100 et non 1.',
    ])
  })

  it('refuses a row that does not total 100, and a share that is not a whole number', () => {
    expect(messages(run(book({ goals: [goal(oct, 20, 60, 15, 0), goal(sep, 12.5, 37.5, 45, 5), goal(sep, 0.125, 0.375, 0.45, 0.05)] })))).toEqual([
      'Onglet Objectifs, ligne 2 : les parts font 95 en tout : il en faut 100.',
      'Onglet Objectifs, ligne 3 : dans « Argent disponible (%) », 12,5 n’est pas un nombre entier : écris des pour cent entiers, par exemple 25.',
      'Onglet Objectifs, ligne 3 : dans « Épargne sécurisée (%) », 37,5 n’est pas un nombre entier : écris des pour cent entiers, par exemple 25.',
      'Onglet Objectifs, ligne 4 : dans « Argent disponible (%) », 12,5 n’est pas un nombre entier : écris des pour cent entiers, par exemple 25.',
      'Onglet Objectifs, ligne 4 : dans « Épargne sécurisée (%) », 37,5 n’est pas un nombre entier : écris des pour cent entiers, par exemple 25.',
    ])
  })

  it('refuses an empty or unreadable share and date', () => {
    expect(messages(run(book({ goals: [goal(null, 20, 60, 15, 5), goal('hier', 20, null, 'vingt', -5)] })))).toEqual([
      'Onglet Objectifs, ligne 2 : la case « À partir du » est vide.',
      'Onglet Objectifs, ligne 3 : dans « À partir du », une date est attendue, par exemple 05/11/2026.',
      'Onglet Objectifs, ligne 3 : la case « Épargne sécurisée (%) » est vide. Écris 0 pour une part nulle.',
      'Onglet Objectifs, ligne 3 : dans « Placements en bourse (%) », un pourcentage est attendu, par exemple 25.',
      'Onglet Objectifs, ligne 3 : dans « Or et crypto (%) », un pourcentage est attendu, par exemple 25.',
    ])
  })

  it('accepts an absent or empty sheet', () => {
    expect(success(run(book({ goals: [] }))).data.goals).toEqual([])
  })

  it('reads the rental share, counted in the total of 100 and in the rule of fractions', () => {
    const { data } = success(run(book({ goals: [goal(oct, 10, 30, 25, 5, 30), goal(sep, 0.1, 0.3, 0.25, 0.05, 0.3), goal(sep, 0, 0, 0, 0, 100)] })))
    expect(data.goals.map((g) => g.shares)).toEqual([
      { available: 10, secured: 30, markets: 25, gold: 5, rental: 30 },
      { available: 10, secured: 30, markets: 25, gold: 5, rental: 30 },
      { available: 0, secured: 0, markets: 0, gold: 0, rental: 100 },
    ])
    expect(messages(run(book({ goals: [goal(oct, 20, 60, 15, 5, 10), goal(oct, 0, 0, 0, 0, 1), goal(sep, 10, 30, 25, 5, 'trente')] })))).toEqual([
      'Onglet Objectifs, ligne 2 : les parts font 110 en tout : il en faut 100.',
      'Onglet Objectifs, ligne 3 : écris les pourcentages en nombres simples, par exemple 100 et non 1.',
      'Onglet Objectifs, ligne 4 : dans « Immobilier locatif (%) », un pourcentage est attendu, par exemple 25.',
    ])
  })

  it('reads an empty rental share, or a sheet written before its column, as 0', () => {
    const old = [COLUMNS.goals.filter((c) => c.key !== 'rental').map((c) => c.title), [oct, 20, 60, 15, 5]]
    const { data } = success(run(book({}, [[SHEETS.goals, old]])))
    expect(data.goals.map((g) => g.shares)).toEqual([{ available: 20, secured: 60, markets: 15, gold: 5, rental: 0 }])
    expect(success(run(book({ goals: [goal(oct, 20, 60, 15, 5, null)] }))).data.goals[0].shares.rental).toBe(0)
  })
})

describe('readImport: a file written before the immobilier locatif', () => {
  // The same file as the site exported it before « Type de logement » and « Immobilier locatif (%) ».
  const withoutColumn = (cells: Cell[][], title: string): Cell[][] => {
    const at = cells[0].indexOf(title)
    expect(at).toBeGreaterThan(-1)
    return cells.map((row) => row.filter((_, index) => index !== at))
  }

  it('imports, every home a main residence and every goal with a rental share of 0', () => {
    const exported = toBook(exportSheets(fixtureInput()))
    exported.set(SHEETS.accounts, withoutColumn(exported.get(SHEETS.accounts)!, 'Type de logement'))
    exported.set(SHEETS.goals, withoutColumn(exported.get(SHEETS.goals)!, 'Immobilier locatif (%)'))
    const { data } = success(run(exported))
    // The banks' ids are not in the file: they are drawn again.
    expect(data.profile.accounts.find((a) => a.id === 'a-home')).toEqual({ id: 'a-home', establishmentId: expect.any(String), type: 'home', name: 'Ma maison' })
    expect(data.profile.accounts.some((a) => 'residence' in a)).toBe(false)
    expect(data.goals).toEqual(fixtureInput().goals)
  })
})

describe('readImport: « Réglages »', () => {
  it('reads every setting, words compared as words are', () => {
    const { data } = success(
      run(
        book({
          settings: [
            setting('budget mensuel', '3 500,00 €'),
            setting('Budget calculé sur', 'Salaire'),
            setting('Affichage', 'pour cent'),
            setting('Montants masqués', 'OUI'),
          ],
        }),
      ),
    )
    expect(data.settings).toEqual({ schema: 1, budget: { basis: 'salary', monthly: 350000 }, display: 'percent', hideAmounts: true })
  })

  it('reads a true or false cell a tableur wrote for « Montants masqués »', () => {
    expect(success(run(book({ settings: [setting('Montants masqués', true)] }))).data.settings.hideAmounts).toBe(true)
    expect(messages(run(book({ settings: [setting('Montants masqués', 1)] })))).toEqual([
      'Onglet Réglages, ligne 2 : pour « Montants masqués », « 1 » n’est pas un mot accepté. Écris « oui » ou « non ».',
    ])
  })

  it('keeps the default of a setting absent from the sheet', () => {
    expect(success(run(book({ settings: [setting('Affichage', 'pour cent')] }))).data.settings).toEqual({
      ...DEFAULT_SETTINGS,
      display: 'percent',
    })
  })

  it('refuses a budget without its basis, and a basis without its budget', () => {
    expect(messages(run(book({ settings: [setting('Budget mensuel', 2000)] })))).toEqual([
      'Onglet Réglages, ligne 2 : « Budget mensuel » va avec « Budget calculé sur » : ajoute la ligne qui manque, ou efface celle-ci.',
    ])
    expect(messages(run(book({ settings: [setting('Affichage', 'euros'), setting('Budget calculé sur', 'dépenses')] })))).toEqual([
      'Onglet Réglages, ligne 3 : « Budget calculé sur » va avec « Budget mensuel » : ajoute la ligne qui manque, ou efface celle-ci.',
    ])
  })

  it('refuses a budget of zero or less, and one that does not read', () => {
    expect(messages(run(book({ settings: [setting('Budget mensuel', 0), setting('Budget calculé sur', 'dépenses')] })))).toEqual([
      'Onglet Réglages, ligne 2 : le budget mensuel doit être plus grand que zéro.',
    ])
    expect(messages(run(book({ settings: [setting('Budget mensuel', '-100'), setting('Budget calculé sur', 'dépenses')] })))).toEqual([
      'Onglet Réglages, ligne 2 : le budget mensuel doit être plus grand que zéro.',
    ])
    expect(messages(run(book({ settings: [setting('Budget mensuel', 'beaucoup'), setting('Budget calculé sur', 'dépenses')] })))).toEqual([
      'Onglet Réglages, ligne 2 : dans « Valeur », un montant en euros est attendu, par exemple 1 200,50.',
    ])
  })

  it('refuses an unknown setting, an unknown word, an empty cell and a setting written twice', () => {
    expect(
      messages(
        run(
          book({
            settings: [
              setting('Thème', 'sombre'),
              setting('Affichage', 'dollars'),
              setting('Montants masqués', 'peut-être'),
              setting(null, 'oui'),
              setting('Budget mensuel', null),
              setting('affichage', 'euros'),
              setting('Budget calculé sur', 'loyer'),
            ],
          }),
        ),
      ),
    ).toEqual([
      'Onglet Réglages, ligne 2 : « Thème » n’est pas un réglage. Les réglages sont « Budget mensuel », « Budget calculé sur », « Affichage » et « Montants masqués ».',
      'Onglet Réglages, ligne 3 : pour « Affichage », « dollars » n’est pas un mot accepté. Écris « euros » ou « pour cent ».',
      'Onglet Réglages, ligne 4 : pour « Montants masqués », « peut-être » n’est pas un mot accepté. Écris « oui » ou « non ».',
      'Onglet Réglages, ligne 5 : la case « Réglage » est vide.',
      'Onglet Réglages, ligne 6 : la case « Valeur » est vide.',
      'Onglet Réglages, ligne 7 : « Affichage » est déjà réglé à la ligne 3.',
      'Onglet Réglages, ligne 8 : pour « Budget calculé sur », « loyer » n’est pas un mot accepté. Écris « dépenses » ou « salaire ».',
    ])
  })
})

describe('readImport: the errors of the whole file', () => {
  it('come back together, sorted by sheet then by row', () => {
    const b = book({
      accounts: [...ACCOUNTS, { bank: 'BoursoBank', account: 'PEA', line: 'Fonds', type: 'Inconnu' }, { bank: 'X', line: 'Y' }],
      snapshots: [],
      settings: [setting('Thème', 'sombre')],
      goals: [goal(oct, 1, 2, 3, 4), goal(null, 25, 25, 25, 25)],
    })
    // Relevés written without its « Date du relevé » column: an error of the table, kept even
    // when « Comptes » does not read.
    b.set(SHEETS.snapshots, [header('snapshots').slice(1)])
    const errors = errorsOf(run(b))
    expect(errors.map((e) => [e.sheet, e.row])).toEqual([
      [SHEETS.accounts, 3],
      [SHEETS.accounts, 4],
      [SHEETS.snapshots, null],
      [SHEETS.goals, 2],
      [SHEETS.goals, 3],
      [SHEETS.settings, 2],
    ])
  })

  it('reads the relevés once the accounts read, and sorts their errors among the others', () => {
    const b = book({
      snapshots: [{ date: oct, ...livret, amount: 'mille' }],
      contributions: [{ date: oct, bank: 'BoursoBank', account: 'Livret A', paid: 10 }],
      settings: [setting('Affichage', 'dollars')],
    })
    expect(errorsOf(run(b)).map((e) => [e.sheet, e.row])).toEqual([
      [SHEETS.snapshots, 2],
      [SHEETS.contributions, 2],
      [SHEETS.settings, 2],
    ])
  })

  it('never throws: a broken book or a failing newId becomes one error', () => {
    const broken = new Map<string, Cell[][]>([[SHEETS.accounts, 'pas un tableau' as never], [SHEETS.snapshots, sheetOf('snapshots', SNAPSHOTS)]])
    const failing = () => {
      throw new Error('no id')
    }
    for (const result of [readImport(broken, counter()), readImport(book(), failing), readImport(null as never)]) {
      expect(messages(result)).toEqual(['Le fichier n’a pas pu être lu jusqu’au bout. Vérifie-le, puis réessaie.'])
    }
  })
})

describe('readImport: the template and the example of the note', () => {
  it('refuses the template as is, with its example rows in every sheet', async () => {
    const result = readImport(await readWorkbook(await writeWorkbook(templateSheets())), counter())
    const example = 'c’est la ligne d’exemple du modèle. Efface-la ou remplace-la.'
    expect(messages(result)).toEqual([
      `Onglet Comptes, ligne 2 : ${example}`,
      `Onglet Comptes, ligne 3 : ${example}`,
      `Onglet Comptes, ligne 4 : ${example}`,
      `Onglet Relevés, ligne 2 : ${example}`,
      `Onglet Relevés, ligne 3 : ${example}`,
      `Onglet Relevés, ligne 4 : ${example}`,
      `Onglet Versements, ligne 2 : ${example}`,
    ])
  })

  it('imports the example of « Pour une IA », written then read as a file', async () => {
    const { data, summary } = success(readImport(await readWorkbook(await writeWorkbook(AI_EXAMPLE)), counter()))
    // 30/09: 20 × 500,50 + 250 000 − 180 000 + 10 × 230 $ × 0,90 = 82 080 €.
    // 31/10: 20 × 512,30 + 250 000 − 179 200 + 10 × 240 $ × 0,92 = 83 254 €.
    expect(summary.relevés).toEqual([
      { takenOn: '2026-09-30', total: 8208000, placements: 4 },
      { takenOn: '2026-10-31', total: 8325400, placements: 4 },
    ])
    expect(data.snapshots.map((s) => computeSituation(data.profile, s.value).net)).toEqual([8208000, 8325400])
    expect(summary).toMatchObject({ banks: 2, bankNames: ['Ma banque', 'Chez toi'], lines: 4, goals: 0 })
  })
})

describe('readImport: the summary', () => {
  it('counts the banks, the lines and the goals, and gives each relevé oldest first with its net total', () => {
    const { data, summary } = success(run(toBook(exportSheets(fixtureInput()))))
    expect(summary.bankNames).toEqual(['BoursoBank', 'Crédit Agricole', 'Fortuneo', 'Banque du coin', 'Épargne salariale', 'Chez toi'])
    expect(summary.banks).toBe(6)
    expect(summary.lines).toBe(11)
    expect(summary.goals).toBe(2)
    expect(summary.relevés.map((r) => r.takenOn)).toEqual(['2026-09-30', '2026-10-31', '2026-10-31'])
    expect(summary.relevés.map((r) => r.total)).toEqual(data.snapshots.map((s) => computeSituation(data.profile, s.value).net))
  })

  it('counts the placements of each relevé', () => {
    const { data, summary } = success(run(toBook(exportSheets(fixtureInput()))))
    expect(summary.relevés.map((r) => r.placements)).toEqual(data.snapshots.map((s) => s.value.entries.length))
  })

  it('gives no total, not 0, for a relevé with no placement', () => {
    const input = fixtureInput()
    input.snapshots = [...input.snapshots, { schema: 1, takenOn: '2026-11-08', fx: {}, entries: [], contributions: {}, arrivals: {} }]
    const { summary } = success(run(toBook(exportSheets(input))))
    expect(summary.relevés.at(-1)).toEqual({ takenOn: '2026-11-08', total: null, placements: 0 })
    expect(summary.relevés[0].total).not.toBeNull()
  })
})

describe('importFile', () => {
  it('imports an exported file', async () => {
    const blob = await writeWorkbook(exportSheets(fixtureInput()))
    const result = await importFile(new File([blob], 'mes-chiffres-2026-11-09.xlsx'))
    expect(result.ok).toBe(true)
  })

  const NOT_EXCEL = 'Ce fichier n’est pas un fichier Excel (.xlsx). Depuis Numbers, exporte d’abord en Excel : Partager › Exporter › Excel.'

  it('refuses a Numbers file, by its name, and a file that does not open as Excel', async () => {
    const blob = await writeWorkbook(exportSheets(fixtureInput()))
    expect(messages(await importFile(new File([blob], 'Mes chiffres.NUMBERS')))).toEqual([NOT_EXCEL])
    expect(messages(await importFile(new File(['Banque;Compte'], 'mes-chiffres.xlsx')))).toEqual([NOT_EXCEL])
    expect(messages(await importFile(new File([], 'vide.xlsx')))).toEqual([NOT_EXCEL])
  })

  it('refuses a file over the size limit before reading it', async () => {
    const result = await importFile(new File([new Uint8Array(MAX_IMPORT_BYTES + 1)], 'gros.xlsx'))
    expect(errorsOf(result)).toEqual([
      { sheet: null, row: null, message: expect.stringContaining('plus de 5') },
    ])
    expect(messages(result)).toEqual(['Ce fichier fait plus de 5 Mo : c’est trop pour un fichier de chiffres. Vérifie que c’est le bon fichier.'])
  })
})

// The refusals of the file, of « Objectifs » and of « Réglages », each produced by the import and
// listed by the note. The Record type makes the list exhaustive (see import-accounts.test.ts).
type Case = { errors: () => ImportError[] | Promise<ImportError[]>; says: string }
const REFUSAL_CASES: Record<keyof typeof FILE_REFUSALS | keyof typeof GOAL_REFUSALS | keyof typeof SETTING_REFUSALS, Case> = {
  notExcel: { errors: async () => errorsOf(await importFile(new File(['x'], 'a.numbers'))), says: 'n’est pas un fichier Excel' },
  tooBig: { errors: async () => errorsOf(await importFile(new File([new Uint8Array(MAX_IMPORT_BYTES + 1)], 'a.xlsx'))), says: 'plus de 5 Mo' },
  duplicateSheet: { errors: () => errorsOf(run(book({}, [['COMPTES', sheetOf('accounts', ACCOUNTS)]]))), says: 'deux onglets de ce nom' },
  goalTotal: { errors: () => errorsOf(run(book({ goals: [goal(oct, 1, 1, 1, 1)] }))), says: 'il en faut 100' },
  goalShare: { errors: () => errorsOf(run(book({ goals: [goal(oct, 0.5, 49.5, 25, 25)] }))), says: 'n’est pas un nombre entier' },
  goalFraction: { errors: () => errorsOf(run(book({ goals: [goal(oct, 1, 0, 0, 0)] }))), says: 'par exemple 100 et non 1' },
  cushionMonths: {
    errors: () => errorsOf(run(book({ goals: [{ ...goal(oct, 0, 33, 60, 7, 0), cushionMonths: 30 }] }))),
    says: 'n’est pas un nombre de mois proposé',
  },
  cushionShare: {
    errors: () => errorsOf(run(book({ goals: [{ ...goal(oct, 10, 23, 60, 7, 0), cushionMonths: 4 }] }))),
    says: 'sa part en pour cent vaut 0',
  },
  duplicateSetting: {
    errors: () => errorsOf(run(book({ settings: [setting('Affichage', 'euros'), setting('Affichage', 'euros')] }))),
    says: 'est déjà réglé',
  },
  budgetPair: { errors: () => errorsOf(run(book({ settings: [setting('Budget mensuel', 1)] }))), says: 'va avec' },
  budgetAmount: {
    errors: () => errorsOf(run(book({ settings: [setting('Budget mensuel', 0), setting('Budget calculé sur', 'salaire')] }))),
    says: 'plus grand que zéro',
  },
}

const ALL_GROUPS = { ...FILE_REFUSALS, ...GOAL_REFUSALS, ...SETTING_REFUSALS }

describe('the « Pour une IA » note and the import of the file, the goals and the settings agree on what is refused', () => {
  const note = plain(aiNote().join('\n')).toLowerCase()

  for (const [key, { errors, says }] of Object.entries(REFUSAL_CASES)) {
    it(`the import makes the refusal « ${key} », and the note lists it`, async () => {
      expect((await errors()).map((e) => plain(e.message)).some((m) => m.includes(says))).toBe(true)
      expect(note).toContain(plain(ALL_GROUPS[key as keyof typeof ALL_GROUPS]).toLowerCase())
    })
  }

  it('says when « Ouverte avec de l’argent neuf » counts: on a relevé where the line was not in the one before', () => {
    expect(note).toContain('ne compte que sur un relevé où la ligne n’était pas au relevé précédent')
    expect(note).not.toContain('premier relevé où')
  })

  it('says that a goal row totalling 1 is read as fractions', () => {
    expect(note).toContain('une ligne dont le total fait 1 est lue en fractions')
    expect(note).toContain('une ligne d’une seule part à 1 et des autres à 0 est refusée')
  })
})

describe('an example row is refused even when « Comptes » does not read', () => {
  it('lists the example rows of « Relevés » with the errors of « Comptes »', () => {
    const b = book({
      accounts: [{ ...livret, type: 'Inconnu' }],
      snapshots: [{ date: oct, bank: EXAMPLE_BANK, account: 'Livret A', line: 'Livret A', amount: 1 }, { date: oct, ...livret, amount: 1 }],
    })
    expect(errorsOf(run(b)).map((e) => [e.sheet, e.row])).toEqual([
      [SHEETS.accounts, 2],
      [SHEETS.snapshots, 2],
    ])
  })
})

// A relevé made of a piece of the patrimoine (a ChatGPT file, 10 November 2026: 1, 27 and 6 lines).
describe('partialRelevés', () => {
  const relevé = (takenOn: string, placements: number) => ({ takenOn, total: placements === 0 ? null : 1, placements })
  const summary = (...relevés: ReturnType<typeof relevé>[]) => ({ relevés, banks: 1, bankNames: [], lines: 30, goals: 0, loans: 0, withoutFigure: [] })

  it('points out a relevé holding less than half of the fullest one', () => {
    expect(partialRelevés(summary(relevé('2025-11-16', 1), relevé('2026-11-05', 27), relevé('2026-11-16', 6)))).toEqual([
      { takenOn: '2025-11-16', placements: 1, most: 27 },
      { takenOn: '2026-11-16', placements: 6, most: 27 },
    ])
  })

  it('leaves alone relevés of a similar size, a single relevé and a relevé written empty on purpose', () => {
    expect(partialRelevés(summary(relevé('2025-11-16', 48), relevé('2026-11-05', 40)))).toEqual([])
    expect(partialRelevés(summary(relevé('2026-11-05', 3)))).toEqual([])
    expect(partialRelevés(summary(relevé('2026-10-31', 0), relevé('2026-11-05', 12)))).toEqual([])
  })

  it('takes exactly half as whole', () => {
    expect(partialRelevés(summary(relevé('2026-10-31', 5), relevé('2026-11-05', 10)))).toEqual([])
  })
})

// A loan known but with no figure stays in « Comptes » and is said on the preview, never dropped
// (a ChatGPT file left the loans out when the person did not answer, 10 November 2026).
describe('readImport: what the preview says is missing', () => {
  const lineAt = COLUMNS.snapshots.findIndex((c) => c.key === 'line')
  const withoutLoanFigure: SheetSpec[] = AI_EXAMPLE.map((sheet) =>
    sheet.name === SHEETS.snapshots ? { ...sheet, rows: sheet.rows.filter((row) => row[lineAt] !== 'Prêt immobilier') } : sheet,
  )

  it('imports a line of « Comptes » that no relevé gives a figure, and names it', async () => {
    const { data, summary } = success(readImport(await readWorkbook(await writeWorkbook(withoutLoanFigure)), counter()))
    expect(data.profile.lines.find((l) => l.name === 'Prêt immobilier')!.closedOn).toBeUndefined()
    expect(summary.withoutFigure).toEqual(['Prêt immobilier'])
    expect(summary.loans).toBe(1)
  })

  it('counts no loan, and no line without figure, when the file has neither', async () => {
    const { summary } = success(readImport(await readWorkbook(await writeWorkbook(AI_EXAMPLE)), counter()))
    expect(summary.withoutFigure).toEqual([])
    expect(summary.loans).toBe(1)
    const { summary: none } = success(run(book()))
    expect(none.loans).toBe(0)
  })
})

