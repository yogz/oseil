import { describe, expect, it } from 'vitest'
import { computeSituation } from '@/lib/model/situation'
import type { Snapshot } from '@/lib/model/types'
import { COLUMNS, EXAMPLE_BANK, SNAPSHOT_REFUSALS, SHEETS } from '../format'
import { exportSheets } from '../export'
import { aiNote } from '../instructions'
import { readAccounts } from '../import-accounts'
import { readSnapshots, type SnapshotsResult } from '../import-snapshots'
import { formatError, readTable, type ImportError } from '../import-types'
import type { Cell, SheetSpec } from '../xlsx'
import { fixtureInput, fixtureSnapshots } from './fixtures'

// Messages hold no-break spaces (French typography); expectations are written with plain ones.
const plain = (text: string) => text.replace(/ /g, ' ')

type Values = Partial<Record<string, Cell>>
type Kind = 'accounts' | 'snapshots' | 'contributions'
const header = (kind: Kind) => COLUMNS[kind].map((c) => c.title)
const rowOf = (kind: Kind, values: Values): Cell[] => COLUMNS[kind].map((c) => values[c.key] ?? null)
const tableOf = (kind: Kind, rows: Values[]) => readTable(kind, [header(kind), ...rows.map((r) => rowOf(kind, r))], true)
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

const counter = () => {
  let n = 0
  return () => `new-${++n}`
}

// The accounts every test reads its relevés against.
const livret = { bank: 'BoursoBank', account: 'Livret A', line: 'Livret A' }
const apple = { bank: 'BoursoBank', account: 'Compte-titres', line: 'Apple' }
const fund = { bank: 'Crédit Agricole', account: 'Assurance-vie', line: 'Fonds euros' }
const loan = { bank: 'Crédit Agricole', account: 'Prêt', line: 'Prêt' }
const ACCOUNTS: Values[] = [
  { ...livret, type: 'Livret A' },
  { ...apple, type: 'Compte-titres', currency: 'USD' },
  { ...fund, type: 'Assurance-vie', group: 'Fonds euros' },
  { ...loan, type: 'Crédit' },
]

function setup(accounts: Values[] = ACCOUNTS) {
  const result = readAccounts(tableOf('accounts', accounts), counter())
  if ('errors' in result) throw new Error(result.errors.map(formatError).join('\n'))
  return result
}

const idOf = (profile: ReturnType<typeof setup>['profile'], name: string) => profile.lines.find((l) => l.name === name)!.id
const accountIdOf = (profile: ReturnType<typeof setup>['profile'], name: string) =>
  profile.accounts.find((a) => a.name === name)!.id

// The day the tests are read on: a relevé after it is refused.
const TODAY = '2026-11-10'

function run(snapshots: Values[], contributions: Values[] | null = null, accounts: Values[] = ACCOUNTS): SnapshotsResult {
  const { profile, index } = setup(accounts)
  return readSnapshots(
    tableOf('snapshots', snapshots),
    contributions === null ? null : tableOf('contributions', contributions),
    profile,
    index,
    TODAY,
  )
}
const messages = (result: SnapshotsResult) => ('errors' in result ? result.errors.map((e) => plain(formatError(e))) : [])
const errorsOf = (result: SnapshotsResult): ImportError[] => ('errors' in result ? result.errors : [])
const success = (result: SnapshotsResult) => {
  if ('errors' in result) throw new Error(messages(result).join('\n'))
  return result
}

const oct = day('2026-10-31')
const sep = day('2026-09-30')

describe('readSnapshots: what makes a relevé', () => {
  it('groups rows by date when no number is written, oldest first', () => {
    const { snapshots } = success(
      run([
        { date: oct, ...livret, amount: 1100 },
        { date: sep, ...livret, amount: 1000 },
        { date: oct, ...fund, amount: 500 },
      ]),
    )
    expect(snapshots.map((s) => s.takenOn)).toEqual(['2026-09-30', '2026-10-31'])
    expect(snapshots[1].entries).toHaveLength(2)
    expect(snapshots[0].entries[0]).toEqual({ lineId: expect.any(String), kind: 'amount', amount: 100000, seenOn: '2026-09-30' })
  })

  it('separates two relevés of the same day by their number, in the order of the numbers', () => {
    const { snapshots } = success(
      run([
        { date: oct, number: 3, ...livret, amount: 1300 },
        { date: oct, number: 2, ...livret, amount: 1200 },
        { date: sep, number: 1, ...livret, amount: 1000 },
      ]),
    )
    expect(snapshots.map((s) => [s.takenOn, s.entries[0].kind === 'amount' && s.entries[0].amount])).toEqual([
      ['2026-09-30', 100000],
      ['2026-10-31', 120000],
      ['2026-10-31', 130000],
    ])
  })

  it('orders by date first, whatever the numbers say', () => {
    const { snapshots } = success(
      run([
        { date: oct, number: 1, ...livret, amount: 1100 },
        { date: sep, number: 2, ...livret, amount: 1000 },
      ]),
    )
    expect(snapshots.map((s) => s.takenOn)).toEqual(['2026-09-30', '2026-10-31'])
  })

  it('refuses a number on two dates', () => {
    const result = run([
      { date: sep, number: 1, ...livret, amount: 1000 },
      { date: oct, number: 1, ...fund, amount: 1100 },
    ])
    expect(messages(result)).toEqual([
      'Onglet Relevés, ligne 3 : le relevé n° 1 est daté du 30/09/2026 à la ligne 2. Un même « N° du relevé » ne sert qu’à une date.',
    ])
  })

  it('refuses a date whose rows are numbered for some and not for others', () => {
    const result = run([
      { date: oct, number: 1, ...livret, amount: 1000 },
      { date: oct, ...fund, amount: 1100 },
    ])
    expect(messages(result)).toEqual([
      'Onglet Relevés, ligne 3 : d’autres lignes du 31/10/2026 ont un « N° du relevé ». Numérote aussi celle-ci, pour dire de quel relevé elle est.',
    ])
  })

  it('refuses a number that is not a whole number from 1', () => {
    expect(messages(run([{ date: oct, number: 1.5, ...livret, amount: 1000 }]))).toEqual([
      'Onglet Relevés, ligne 2 : dans « N° du relevé », un nombre entier est attendu, par exemple 2.',
    ])
  })

  it('refuses a sheet without a relevé', () => {
    expect(messages(run([]))).toEqual(['Onglet Relevés : il n’a aucune ligne. Il faut au moins un relevé.'])
  })

  // The site keeps a relevé with no placement (a first launch finished with no account, an update
  // that closed everything): the export writes it as a row with its date and number only.
  it('reads a row with only a date and a number as a relevé with no placement', () => {
    const { snapshots, closedOn } = success(
      run([
        { date: sep, number: 1, ...livret, amount: 1000 },
        { date: oct, number: 2 },
      ]),
    )
    expect(snapshots.map((s) => [s.takenOn, s.entries.length])).toEqual([
      ['2026-09-30', 1],
      ['2026-10-31', 0],
    ])
    expect(snapshots[1]).toEqual({ schema: 1, takenOn: '2026-10-31', fx: {}, entries: [], contributions: {}, arrivals: {} })
    // A line without identifier, missing from the empty relevé, is closed at its date, as for any absence.
    expect(Object.values(closedOn)).toEqual(['2026-10-31'])
  })

  it('reads a « Versements » row of a relevé with no placement', () => {
    const { snapshots } = success(
      run([{ date: oct, number: 1 }], [{ date: oct, number: 1, bank: fund.bank, account: fund.account, paid: 200 }]),
    )
    expect(snapshots[0].entries).toEqual([])
    expect(Object.values(snapshots[0].contributions)).toEqual([20000])
  })

  // The export always numbers its relevés. A row typed by hand with only a date is far more likely
  // a forgotten placement than an empty relevé: read as one, the latest would close every line.
  it('refuses a row with only a date and no number, and closes nothing', () => {
    const result = run([
      { date: sep, ...livret, amount: 1000 },
      { date: oct },
    ])
    expect(messages(result)).toEqual([
      'Onglet Relevés, ligne 3 : cette ligne n’a que sa date. Écris le placement et son chiffre, ou, pour un relevé sans aucun placement, son « N° du relevé ».',
    ])
    expect('closedOn' in result).toBe(false)
  })

  it('refuses a row with only a date and no number in a relevé that has placements', () => {
    expect(messages(run([{ date: oct, ...livret, amount: 1000 }, { date: oct }]))[0]).toContain('cette ligne n’a que sa date')
  })

  it('still refuses a numbered row with nothing else in a relevé that has placements', () => {
    const result = run([
      { date: oct, number: 1, ...livret, amount: 1000 },
      { date: oct, number: 1 },
    ])
    expect(messages(result)).toEqual(['Onglet Relevés, ligne 3 : il manque la Banque, le Compte ou la Ligne, et l’identifiant.'])
  })

  it('refuses a row with no placement but a figure', () => {
    expect(messages(run([{ date: oct, amount: 1000 }]))).toEqual([
      'Onglet Relevés, ligne 2 : il manque la Banque, le Compte ou la Ligne, et l’identifiant.',
    ])
  })

  it('refuses an empty date', () => {
    expect(messages(run([{ ...livret, amount: 1000 }]))).toEqual(['Onglet Relevés, ligne 2 : la case « Date du relevé » est vide.'])
  })

  it('refuses the template’s example rows', () => {
    expect(messages(run([{ date: oct, bank: EXAMPLE_BANK, account: 'Livret A', line: 'Livret A', amount: 12000 }]))).toEqual([
      'Onglet Relevés, ligne 2 : c’est la ligne d’exemple du modèle. Efface-la ou remplace-la.',
    ])
  })

  it('returns the table’s own errors untouched', () => {
    const result = readSnapshots(readTable('snapshots', [['Banque']], true), null, setup().profile, setup().index)
    expect(messages(result)[0]).toContain('la colonne « Date du relevé » manque')
  })
})

describe('readSnapshots: the line and its figures', () => {
  it('finds a line by its names, or by its identifier even with empty names', () => {
    const { profile, index } = setup()
    const id = idOf(profile, 'Livret A')
    const result = readSnapshots(
      tableOf('snapshots', [
        { date: sep, reference: id, amount: 1000 },
        { date: oct, ...livret, amount: 1100 },
      ]),
      null,
      profile,
      index,
    )
    expect(success(result).snapshots.map((s) => s.entries[0].lineId)).toEqual([id, id])
  })

  it('refuses a line that « Comptes » does not have', () => {
    expect(messages(run([{ date: oct, bank: 'BoursoBank', account: 'Livret B', line: 'Livret B', amount: 1 }]))).toEqual([
      'Onglet Relevés, ligne 2 : le placement « BoursoBank › Livret B › Livret B » n’existe pas dans l’onglet « Comptes ».',
    ])
  })

  it('reads parts, their price and the average price for a line in « Parts »', () => {
    const { profile, index } = setup()
    const { snapshots } = success(
      readSnapshots(
        tableOf('snapshots', [{ date: oct, ...apple, units: 10, unitPrice: 230, averagePrice: 180.25, fx: 0.93 }]),
        null,
        profile,
        index,
      ),
    )
    expect(snapshots[0]).toEqual({
      schema: 1,
      takenOn: '2026-10-31',
      fx: { USD: 0.93 },
      entries: [{ lineId: idOf(profile, 'Apple'), kind: 'units', units: 10, unitPrice: 230, averagePrice: 180.25, seenOn: '2026-10-31' }],
      contributions: {},
      arrivals: {},
    })
  })

  it('keeps an unknown average price unknown', () => {
    const { snapshots } = success(run([{ date: oct, ...apple, units: 10, unitPrice: 230, fx: 0.93 }]))
    expect(snapshots[0].entries[0]).toMatchObject({ averagePrice: null })
  })

  it('refuses a missing figure, or a figure of the other way of counting', () => {
    const result = run([
      { date: oct, ...livret },
      { date: oct, ...fund, amount: 1, units: 2 },
      { date: oct, ...apple, units: 10, fx: 0.93 },
      { date: sep, ...apple, units: 10, unitPrice: 5, amount: 50, fx: 0.93 },
    ])
    expect(messages(result)).toEqual([
      'Onglet Relevés, ligne 2 : « Livret A » se compte en « Montant » : remplis « Montant ».',
      'Onglet Relevés, ligne 3 : « Fonds euros » se compte en « Montant » : laisse vides « Parts ».',
      'Onglet Relevés, ligne 4 : « Apple » se compte en « Parts » : remplis « Prix d’une part ».',
      'Onglet Relevés, ligne 5 : « Apple » se compte en « Parts » : laisse vides « Montant ».',
    ])
  })

  it('refuses negative parts or prices', () => {
    expect(messages(run([{ date: oct, ...apple, units: -1, unitPrice: 5, averagePrice: -2, fx: 0.93 }]))).toEqual([
      'Onglet Relevés, ligne 2 : « Parts » ne peut pas être négatif.',
      'Onglet Relevés, ligne 2 : « Prix moyen d’achat » ne peut pas être négatif.',
    ])
  })

  it('refuses a figure that does not read', () => {
    expect(messages(run([{ date: oct, ...livret, amount: 'beaucoup' }]))).toEqual([
      'Onglet Relevés, ligne 2 : dans « Montant », un montant est attendu, par exemple 1 200,50.',
    ])
  })

  it('stores a loan positive, written negative in the file; a positive one is refused', () => {
    const { profile, index } = setup()
    const { snapshots } = success(
      readSnapshots(tableOf('snapshots', [{ date: oct, ...loan, amount: -180000 }, { date: sep, ...loan, amount: 0 }]), null, profile, index),
    )
    expect(snapshots[1].entries[0]).toMatchObject({ kind: 'amount', amount: 18000000 })
    expect(Object.is((snapshots[0].entries[0] as { amount: number }).amount, 0)).toBe(true)
    expect(messages(run([{ date: oct, ...loan, amount: 180000 }]))).toEqual([
      'Onglet Relevés, ligne 2 : un crédit s’écrit en négatif (ce qu’il reste à rembourser), par exemple -180 000.',
    ])
  })

  it('keeps a negative amount on another account (an overdraft)', () => {
    const { snapshots } = success(run([{ date: oct, ...livret, amount: -12.5 }]))
    expect(snapshots[0].entries[0]).toMatchObject({ amount: -1250 })
  })

  it('reads « Chiffre vu le » when older, refuses it after the relevé', () => {
    const { snapshots } = success(run([{ date: oct, ...fund, amount: 1, seenOn: day('2026-10-15') }]))
    expect(snapshots[0].entries[0].seenOn).toBe('2026-10-15')
    expect(messages(run([{ date: oct, ...fund, amount: 1, seenOn: day('2026-11-01') }]))).toEqual([
      'Onglet Relevés, ligne 2 : « Chiffre vu le (si plus ancien) » dit 01/11/2026, après la date du relevé (31/10/2026). Un chiffre ne peut pas être vu après son relevé.',
    ])
  })

  it('refuses a line twice in one relevé', () => {
    expect(messages(run([{ date: oct, ...livret, amount: 1 }, { date: oct, ...livret, amount: 2 }]))).toEqual([
      'Onglet Relevés, ligne 3 : « BoursoBank › Livret A › Livret A » est déjà dans ce relevé, à la ligne 2.',
    ])
  })
})

describe('readSnapshots: rates', () => {
  it('needs a rate for a line in another currency, and writes it into fx', () => {
    expect(messages(run([{ date: oct, ...apple, units: 1, unitPrice: 2 }]))).toEqual([
      'Onglet Relevés, ligne 2 : « Apple » est en USD : remplis « Taux de change », ce que vaut 1 USD en euros ce jour-là.',
    ])
  })

  it('refuses a rate on a line in euros, and a rate of zero', () => {
    expect(messages(run([{ date: oct, ...livret, amount: 1, fx: 1 }, { date: sep, ...apple, units: 1, unitPrice: 2, fx: 0 }]))).toEqual([
      'Onglet Relevés, ligne 2 : « Livret A » est en euros : laisse « Taux de change » vide.',
      'Onglet Relevés, ligne 3 : « Taux de change » doit être plus grand que zéro.',
    ])
  })

  it('refuses two rates for one currency in one relevé, accepts them in two relevés', () => {
    const accounts = [...ACCOUNTS, { bank: 'BoursoBank', account: 'Compte-titres', line: 'Microsoft', type: 'Compte-titres', currency: 'USD' }]
    const microsoft = { bank: 'BoursoBank', account: 'Compte-titres', line: 'Microsoft' }
    expect(
      messages(run([{ date: oct, ...apple, units: 1, unitPrice: 2, fx: 0.93 }, { date: oct, ...microsoft, units: 1, unitPrice: 2, fx: 0.92 }], null, accounts)),
    ).toEqual(['Onglet Relevés, ligne 3 : le taux de USD est 0,93 à la ligne 2 de ce relevé. Une devise n’a qu’un taux par relevé.'])
    const { snapshots } = success(
      run([{ date: sep, ...apple, units: 1, unitPrice: 2, fx: 0.92 }, { date: oct, ...microsoft, units: 1, unitPrice: 2, fx: 0.93 }], null, accounts),
    )
    expect(snapshots.map((s) => s.fx)).toEqual([{ USD: 0.92 }, { USD: 0.93 }])
  })
})

describe('readSnapshots: « Devise (calculé) »', () => {
  it('refuses a currency that is not the line’s: a figure in euros would be read as dollars', () => {
    expect(messages(run([{ date: oct, ...apple, units: 1, unitPrice: 2, fx: 0.93, currencyShown: 'EUR' }]))).toEqual([
      'Onglet Relevés, ligne 2 : « Devise (calculé) » dit EUR, mais « Apple » est en USD dans l’onglet « Comptes ». Corrige l’une des deux, ou laisse « Devise (calculé) » vide.',
    ])
    expect(messages(run([{ date: oct, ...livret, amount: 1, currencyShown: 12 }]))).toEqual([
      'Onglet Relevés, ligne 2 : « Devise (calculé) » dit 12, mais « Livret A » est en EUR dans l’onglet « Comptes ». Corrige l’une des deux, ou laisse « Devise (calculé) » vide.',
    ])
  })

  it('accepts the line’s own currency, written in any case, and an empty cell', () => {
    success(run([{ date: oct, ...apple, units: 1, unitPrice: 2, fx: 0.93, currencyShown: ' usd ' }, { date: oct, ...livret, amount: 1 }]))
  })
})

describe('readSnapshots: « Ouverte avec de l’argent neuf »', () => {
  it('writes oui as opened, non as existing, nothing when empty, on the row that says it only', () => {
    const { profile, index } = setup()
    const { snapshots } = success(
      readSnapshots(
        tableOf('snapshots', [
          { date: sep, ...livret, amount: 1, opened: 'non' },
          { date: oct, ...livret, amount: 1 },
          { date: oct, ...fund, amount: 1, opened: 'oui' },
          { date: oct, ...loan, amount: -1 },
        ]),
        null,
        profile,
        index,
      ),
    )
    expect(snapshots.map((s) => s.arrivals)).toEqual([
      { [idOf(profile, 'Livret A')]: 'existing' },
      { [idOf(profile, 'Fonds euros')]: 'opened' },
    ])
  })

  it('refuses another word', () => {
    expect(messages(run([{ date: oct, ...livret, amount: 1, opened: 'peut-être' }]))).toEqual([
      'Onglet Relevés, ligne 2 : dans « Ouverte avec de l’argent neuf », « peut-être » n’est pas un mot accepté. Écris « oui », « non », ou laisse vide.',
    ])
  })
})

describe('readSnapshots: closures', () => {
  it('closes a line without identifier at the first relevé it is missing from, after its last appearance', () => {
    const result = success(
      run([
        { date: day('2026-08-31'), ...livret, amount: 1 },
        { date: day('2026-08-31'), ...fund, amount: 1 },
        { date: sep, ...fund, amount: 1 },
        { date: sep, ...livret, amount: 1 },
        { date: oct, ...fund, amount: 1 },
        { date: day('2026-11-08'), ...fund, amount: 1 },
      ]),
    )
    const { profile } = setup()
    expect(result.closedOn).toEqual({ [idOf(profile, 'Livret A')]: '2026-10-31' })
  })

  it('leaves alone a line with « Fermée le », a line with an identifier, and a line in no relevé', () => {
    const accounts = [
      { ...livret, type: 'Livret A', closedOn: day('2026-10-15') },
      { ...fund, type: 'Assurance-vie', reference: 'l-fund' },
      { ...loan, type: 'Crédit' },
      { bank: 'BoursoBank', account: 'Compte courant', line: 'Compte courant', type: 'Compte courant' },
    ]
    const result = success(
      run(
        [
          { date: sep, ...livret, amount: 1 },
          { date: sep, ...fund, amount: 1 },
          { date: oct, ...loan, amount: -1 },
        ],
        null,
        accounts,
      ),
    )
    expect(result.closedOn).toEqual({})
  })

  it('accepts a closing left unfinished: a relevé on or after « Fermée le » still holding the line', () => {
    const accounts = [{ ...livret, type: 'Livret A', closedOn: sep }, ...ACCOUNTS.slice(1)]
    const result = success(run([{ date: sep, ...livret, amount: 1 }, { date: oct, ...livret, amount: 1 }], null, accounts))
    expect(result.snapshots).toHaveLength(2)
    expect(result.closedOn).toEqual({})
  })
})

describe('readSnapshots: « Versements »', () => {
  const twoRelevés = [
    { date: sep, ...fund, amount: 1 },
    { date: oct, number: 2, ...fund, amount: 1 },
    { date: oct, number: 3, ...fund, amount: 1 },
  ]
  const av = { bank: fund.bank, account: fund.account }

  it('puts the amounts, in cents, on the relevé of their date or number', () => {
    const { profile, index } = setup()
    const { snapshots } = success(
      readSnapshots(
        tableOf('snapshots', twoRelevés),
        tableOf('contributions', [
          { date: sep, ...av, paid: 500 },
          { date: oct, number: 3, ...av, paid: -200.5 },
          { date: oct, number: 2, ...av, paid: 0 },
        ]),
        profile,
        index,
      ),
    )
    const id = accountIdOf(profile, 'Assurance-vie')
    // A zero is a known answer, nothing paid in: kept, like the site keeps a typed 0.
    expect(snapshots.map((s) => s.contributions)).toEqual([{ [id]: 50000 }, { [id]: 0 }, { [id]: -20050 }])
  })

  it('finds the account by its identifier, even with empty names', () => {
    const { profile, index } = setup()
    const id = accountIdOf(profile, 'Assurance-vie')
    const { snapshots } = success(
      readSnapshots(tableOf('snapshots', twoRelevés.slice(0, 1)), tableOf('contributions', [{ date: sep, accountReference: id, paid: 5 }]), profile, index),
    )
    expect(snapshots[0].contributions).toEqual({ [id]: 500 })
  })

  it('refuses a relevé that does not exist, a date of several relevés without number, a number of another date', () => {
    const result = run(twoRelevés, [
      { date: day('2026-08-31'), ...av, paid: 1 },
      { date: oct, ...av, paid: 1 },
      { date: sep, number: 2, ...av, paid: 1 },
      { date: sep, number: 7, ...av, paid: 1 },
    ])
    expect(messages(result)).toEqual([
      'Onglet Versements, ligne 2 : aucun relevé n’est daté du 31/08/2026 dans l’onglet « Relevés ».',
      'Onglet Versements, ligne 3 : plusieurs relevés sont datés du 31/10/2026 : écris le « N° du relevé » pour dire lequel.',
      'Onglet Versements, ligne 4 : le relevé n° 2 est daté du 31/10/2026 dans l’onglet « Relevés », pas du 30/09/2026.',
      'Onglet Versements, ligne 5 : aucun relevé ne porte le n° 7 dans l’onglet « Relevés ».',
    ])
  })

  it('refuses an account that does not take contributions, an unknown account, and two rows for one account and relevé', () => {
    const result = run(twoRelevés, [
      { date: sep, bank: livret.bank, account: livret.account, paid: 1 },
      { date: sep, bank: 'BoursoBank', account: 'Inconnu', paid: 1 },
      { date: sep, ...av, paid: 1 },
      { date: sep, ...av, paid: 2 },
    ])
    expect(messages(result)).toEqual([
      'Onglet Versements, ligne 2 : un compte « Livret A » ne reçoit pas de versements. Seuls les comptes « Assurance-vie », « PER » et « Épargne salariale » en reçoivent.',
      'Onglet Versements, ligne 3 : le compte « BoursoBank › Inconnu » n’existe pas dans l’onglet « Comptes ».',
      'Onglet Versements, ligne 5 : ce compte a déjà un versement pour ce relevé, à la ligne 4.',
    ])
  })

  it('reads a total alone, or beside a contribution, on the accounts that take one', () => {
    const { profile, index } = setup()
    const { snapshots } = success(
      readSnapshots(
        tableOf('snapshots', [{ date: sep, ...fund, amount: 1 }]),
        tableOf('contributions', [
          { date: sep, ...av, paid: 500, paidTotal: 12000.5 },
          { date: sep, bank: apple.bank, account: apple.account, paidTotal: 0 },
        ]),
        profile,
        index,
      ),
    )
    const avId = accountIdOf(profile, 'Assurance-vie')
    const ctoId = accountIdOf(profile, 'Compte-titres')
    expect(snapshots[0].contributions).toEqual({ [avId]: 50000 })
    // A 0 is a known answer, as typed.
    expect(snapshots[0].paidTotals).toEqual({ [avId]: 1200050, [ctoId]: 0 })
  })

  it('writes no totals on a relevé without any', () => {
    const { snapshots } = success(run(twoRelevés.slice(0, 1), [{ date: sep, ...av, paid: 5 }]))
    expect(snapshots[0]).not.toHaveProperty('paidTotals')
  })

  it('refuses a negative total, a total where none is kept, a Versé on a cost-basis account, two totals for one account', () => {
    const result = run(twoRelevés, [
      { date: sep, ...av, paidTotal: -1 },
      { date: sep, bank: livret.bank, account: livret.account, paidTotal: 1 },
      { date: sep, bank: apple.bank, account: apple.account, paid: 1, paidTotal: 1 },
      { date: oct, number: 2, ...av, paidTotal: 1 },
      { date: oct, number: 2, ...av, paid: 1 },
    ])
    expect(messages(result)).toEqual([
      'Onglet Versements, ligne 2 : « Total versé » ne peut pas être négatif.',
      'Onglet Versements, ligne 3 : un compte « Livret A » n’a pas de total versé. Seuls les comptes « Assurance-vie », « PER », « Épargne salariale », « PEA », « PEA-PME », « Compte-titres », « Or » et « Crypto » en ont un.',
      'Onglet Versements, ligne 4 : un compte « Compte-titres » ne reçoit pas de versements. Seuls les comptes « Assurance-vie », « PER » et « Épargne salariale » en reçoivent.',
      'Onglet Versements, ligne 6 : ce compte a déjà un versement pour ce relevé, à la ligne 5.',
    ])
  })

  it('refuses an empty amount and the template’s example rows', () => {
    expect(messages(run(twoRelevés, [{ date: sep, ...av }, { date: sep, bank: EXAMPLE_BANK, account: 'Assurance-vie', paid: 500 }]))).toEqual([
      'Onglet Versements, ligne 2 : les cases « Versé » et « Total versé » sont vides. Remplis l’une ou l’autre, ou efface la ligne.',
      'Onglet Versements, ligne 3 : c’est la ligne d’exemple du modèle. Efface-la ou remplace-la.',
    ])
  })
})

describe('readSnapshots: a whole file', () => {
  const sheet = (sheets: SheetSpec[], name: string): Cell[][] => {
    const found = sheets.find((s) => s.name === name)!
    return [found.columns.map((c) => c.title), ...found.rows]
  }

  it('reads back the fixture’s relevés exactly, from the export', () => {
    const sheets = exportSheets(fixtureInput())
    const accounts = readAccounts(readTable('accounts', sheet(sheets, SHEETS.accounts), true), counter())
    if ('errors' in accounts) throw new Error(accounts.errors.map(formatError).join('\n'))
    const result = success(
      readSnapshots(
        readTable('snapshots', sheet(sheets, SHEETS.snapshots), true),
        readTable('contributions', sheet(sheets, SHEETS.contributions), false),
        accounts.profile,
        accounts.index,
      ),
    )
    // What the file does not carry, and has no effect: a contribution of zero.
    const expected: Snapshot[] = fixtureSnapshots().map((s) => ({
      ...s,
      contributions: Object.fromEntries(Object.entries(s.contributions).filter(([, cents]) => cents !== 0)),
    }))
    expect(result.snapshots).toEqual(expected)
    // Every line carries its identifier: nothing is closed by inference.
    expect(result.closedOn).toEqual({})
  })

  it('gives the totals of three hand-made relevés, to the cent', () => {
    const house = { bank: 'Chez toi', account: 'Ma maison', line: 'Ma maison' }
    const { profile, index } = setup([
      ...ACCOUNTS.slice(0, 3),
      { ...house, type: 'Logement' },
      { ...loan, type: 'Crédit', financedLine: 'Chez toi › Ma maison › Ma maison' },
    ])
    const result = success(
      readSnapshots(
        tableOf('snapshots', [
          { date: day('2026-08-31'), ...livret, amount: '12 000,50' },
          { date: day('2026-08-31'), ...apple, units: 10, unitPrice: 225.55, fx: 0.92 },
          { date: day('2026-08-31'), ...house, amount: 320000 },
          { date: day('2026-08-31'), ...loan, amount: -180000 },
          { date: sep, ...livret, amount: 12100.01 },
          { date: sep, ...apple, units: 10, unitPrice: 230.07, fx: 0.93 },
          { date: sep, ...fund, amount: 5000, opened: 'oui' },
          { date: sep, ...house, amount: 320000 },
          { date: sep, ...loan, amount: '−179 000' },
          { date: oct, ...apple, units: 12.5, unitPrice: 231, fx: 0.931 },
          { date: oct, ...fund, amount: 5010.1 },
          { date: oct, ...house, amount: 325000 },
          { date: oct, ...loan, amount: -178000.99 },
        ]),
        null,
        profile,
        index,
      ),
    )
    const totals = result.snapshots.map((s) => {
      const { owned, owed, net } = computeSituation(profile, s)
      return { owned, owed, net }
    })
    // 12 000,50 + round(10 × 225,55 × 100 × 0,92) = 1 200 050 + 207 506 + 32 000 000.
    expect(totals).toEqual([
      { owned: 33407556, owed: 18000000, net: 15407556 },
      // 1 210 001 + round(230 070 × 0,93) = 213 965 ; + 500 000 + 32 000 000.
      { owned: 33923966, owed: 17900000, net: 16023966 },
      // round(288 750 × 0,931) = 268 826 ; + 501 010 + 32 500 000.
      { owned: 33269836, owed: 17800099, net: 15469737 },
    ])
    expect(result.closedOn).toEqual({ [idOf(profile, 'Livret A')]: '2026-10-31' })
  })
})

// Every refusal of « Relevés » and « Versements » the note lists is one the import makes.
// The Record makes the list exhaustive: a new key fails `tsc` until it has its case here.
const REFUSAL_CASES: Record<keyof typeof SNAPSHOT_REFUSALS, { errors: () => ImportError[]; says: string }> = {
  noSnapshot: { errors: () => errorsOf(run([])), says: 'au moins un relevé' },
  emptyRow: { errors: () => errorsOf(run([{ date: oct }])), says: 'cette ligne n’a que sa date' },
  snapshotNumber: {
    errors: () => errorsOf(run([{ date: sep, number: 1, ...livret, amount: 1 }, { date: oct, number: 1, ...livret, amount: 1 }])),
    says: 'ne sert qu’à une date',
  },
  unknownLine: { errors: () => errorsOf(run([{ date: oct, bank: 'X', account: 'Y', line: 'Z', amount: 1 }])), says: 'n’existe pas' },
  wrongColumns: { errors: () => errorsOf(run([{ date: oct, ...livret }])), says: 'se compte en' },
  negativeUnits: { errors: () => errorsOf(run([{ date: oct, ...apple, units: -1, unitPrice: 1, fx: 1 }])), says: 'ne peut pas être négatif' },
  positiveLoan: { errors: () => errorsOf(run([{ date: oct, ...loan, amount: 1 }])), says: 'un crédit s’écrit en négatif' },
  seenAfter: { errors: () => errorsOf(run([{ date: sep, ...livret, amount: 1, seenOn: oct }])), says: 'après son relevé' },
  futureSnapshot: { errors: () => errorsOf(run([{ date: day('2026-11-11'), ...livret, amount: 1 }])), says: 'après aujourd’hui' },
  rate: { errors: () => errorsOf(run([{ date: oct, ...apple, units: 1, unitPrice: 1 }])), says: 'remplis « Taux de change »' },
  currencyShown: {
    errors: () => errorsOf(run([{ date: oct, ...livret, amount: 1, currencyShown: 'USD' }])),
    says: 'mais « Livret A » est en EUR',
  },
  duplicateEntry: { errors: () => errorsOf(run([{ date: oct, ...livret, amount: 1 }, { date: oct, ...livret, amount: 1 }])), says: 'est déjà dans ce relevé' },
  contributionSnapshot: {
    errors: () => errorsOf(run([{ date: oct, ...fund, amount: 1 }], [{ date: sep, bank: fund.bank, account: fund.account, paid: 1 }])),
    says: 'aucun relevé n’est daté',
  },
  contributionNotAllowed: {
    errors: () => errorsOf(run([{ date: oct, ...livret, amount: 1 }], [{ date: oct, bank: livret.bank, account: livret.account, paid: 1 }])),
    says: 'ne reçoit pas de versements',
  },
  duplicateContribution: {
    errors: () =>
      errorsOf(
        run(
          [{ date: oct, ...fund, amount: 1 }],
          [
            { date: oct, bank: fund.bank, account: fund.account, paid: 1 },
            { date: oct, bank: fund.bank, account: fund.account, paid: 1 },
          ],
        ),
      ),
    says: 'a déjà un versement',
  },
  negativePaidTotal: {
    errors: () => errorsOf(run([{ date: oct, ...fund, amount: 1 }], [{ date: oct, bank: fund.bank, account: fund.account, paidTotal: -1 }])),
    says: 'ne peut pas être négatif',
  },
  paidTotalNotAllowed: {
    errors: () => errorsOf(run([{ date: oct, ...livret, amount: 1 }], [{ date: oct, bank: livret.bank, account: livret.account, paidTotal: 1 }])),
    says: 'n’a pas de total versé',
  },
}

describe('the « Pour une IA » note and the import of the relevés agree on what is refused', () => {
  const note = plain(aiNote().join('\n')).toLowerCase()
  for (const [key, { errors, says }] of Object.entries(REFUSAL_CASES)) {
    it(`the import makes the refusal « ${key} », and the note lists it`, () => {
      expect(errors().map((e) => plain(e.message)).some((m) => m.includes(says))).toBe(true)
      expect(note).toContain(plain(SNAPSHOT_REFUSALS[key as keyof typeof SNAPSHOT_REFUSALS]).toLowerCase())
    })
  }
})

// A relevé says what was seen, never what will be: a ChatGPT file dated one 16/11/2026 on the 10th,
// from a table filled ahead (Nicolas, 10 November 2026).
describe('readSnapshots: a relevé in the future', () => {
  it('refuses it once per date, on its first row, with both days', () => {
    const result = run([
      { date: day('2026-11-05'), ...livret, amount: 1 },
      { date: day('2026-11-16'), ...livret, amount: 1 },
      { date: day('2026-11-16'), ...fund, amount: 1 },
    ])
    expect(messages(result)).toEqual([
      'Onglet Relevés, ligne 3 : le relevé est daté du 16/11/2026, après aujourd’hui (10/11/2026). Un relevé dit les chiffres vus ce jour-là : date-le du jour où ils ont été vus.',
    ])
  })

  it('takes a relevé dated today', () => {
    expect('errors' in run([{ date: day(TODAY), ...livret, amount: 1 }])).toBe(false)
  })
})

