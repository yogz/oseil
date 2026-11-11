import { describe, expect, it } from 'vitest'
import { parseProfile } from '@/lib/model/documents'
import { ACCOUNT_REFUSALS, COLUMNS, EXAMPLE_BANK, HOME_NAME, REFUSALS, SHEETS, type RefusalKey } from '../format'
import { exportSheets, templateSheets } from '../export'
import { AI_EXAMPLE, aiNote, guideNote } from '../instructions'
import { readAccounts, type AccountsResult } from '../import-accounts'
import { formatError, readTable, type ImportError } from '../import-types'
import type { Cell, SheetSpec } from '../xlsx'
import { fixtureProfile, fixtureInput } from './fixtures'

// Messages hold no-break spaces (French typography); expectations are written with plain ones.
const plain = (text: string) => text.replace(/ /g, ' ')

type Values = Partial<Record<string, Cell>>
const header = COLUMNS.accounts.map((c) => c.title)
const rowOf = (values: Values): Cell[] => COLUMNS.accounts.map((c) => values[c.key] ?? null)
const table = (...rows: Values[]) => readTable('accounts', [header, ...rows.map(rowOf)], true)

const counter = () => {
  let n = 0
  return () => `new-${++n}`
}
const run = (...rows: Values[]) => readAccounts(table(...rows), counter())
const messages = (result: AccountsResult) => ('errors' in result ? result.errors.map((e) => plain(formatError(e))) : [])
const success = (result: AccountsResult) => {
  if ('errors' in result) throw new Error(messages(result).join('\n'))
  return result
}
const profileOf = (result: AccountsResult) => success(result).profile
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

const livret = { bank: 'BoursoBank', account: 'Livret A', line: 'Livret A', type: 'Livret A' }
const house = { bank: HOME_NAME, account: 'Ma maison', line: 'Ma maison', type: 'Logement' }
const loan = { bank: 'Crédit Agricole', account: 'Prêt', line: 'Prêt', type: 'Crédit' }

describe('formatError', () => {
  it('starts with the sheet, then the row', () => {
    expect(plain(formatError({ sheet: SHEETS.snapshots, row: 8, message: 'un problème.' }))).toBe(
      'Onglet Relevés, ligne 8 : un problème.',
    )
    expect(plain(formatError({ sheet: SHEETS.accounts, row: null, message: 'un problème.' }))).toBe(
      'Onglet Comptes : un problème.',
    )
  })
})

describe('readTable', () => {
  it('finds the columns by their title, whatever the order, case, accents or spaces, and ignores unknown ones', () => {
    const result = readTable(
      'accounts',
      [
        ['Notes', '  LIGNE ', 'banque', 'Type  de compte', 'compte'],
        ['à voir', 'Livret A', 'BoursoBank', 'Livret A', 'Livret A'],
      ],
      true,
    )
    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(1)
    const [row] = result.rows
    expect(row.row).toBe(2)
    expect(row.get('bank')).toBe('BoursoBank')
    expect(row.get('line')).toBe('Livret A')
    expect(row.get('category')).toBeNull()
  })

  it('ignores empty rows and keeps the spreadsheet’s own row numbers', () => {
    const result = readTable('accounts', [header, rowOf({}), [null, '  ', null], rowOf(livret)], true)
    expect(result.rows.map((r) => r.row)).toEqual([4])
  })

  it('refuses an absent required sheet, and accepts an absent optional one', () => {
    expect(readTable('accounts', undefined, true).errors).toEqual([
      { sheet: SHEETS.accounts, row: null, message: 'cet onglet manque dans le fichier.' },
    ])
    expect(readTable('contributions', undefined, false)).toEqual({ sheet: SHEETS.contributions, rows: [], errors: [] })
  })

  it('refuses each missing required column, and a column written twice', () => {
    const result = readTable('accounts', [['Banque', 'Banque', 'Ligne']], true)
    expect(result.errors.map((e) => plain(formatError(e)))).toEqual([
      'Onglet Comptes : la colonne « Banque » apparaît deux fois.',
      'Onglet Comptes : la colonne « Compte » manque. Les titres des colonnes sont dans la première ligne.',
      'Onglet Comptes : la colonne « Type de compte » manque. Les titres des colonnes sont dans la première ligne.',
    ])
  })

  it('throws on a key that is not a column of the sheet (a typo in the code, not in the file)', () => {
    const [row] = table(livret).rows
    expect(() => row.get('nope')).toThrow()
  })
})

describe('readAccounts', () => {
  it('builds banks, accounts and lines, with the type’s defaults', () => {
    const { profile } = success(
      run(
        livret,
        { bank: 'BoursoBank', account: 'PEA', line: 'Fonds monde', type: 'pea', group: 'fonds monde' },
        { ...house, bank: 'chez toi' },
        { bank: 'epargne salariale', account: 'PEE', line: 'Fonds', type: 'Épargne salariale' },
        { bank: 'trade republic', account: 'CTO', line: 'Apple', type: 'Compte-titres', currency: 'usd', symbol: 'AAPL' },
        { bank: 'Ma petite banque', account: 'Divers', line: 'Divers', type: 'Autre compte', category: 'argent disponible' },
      ),
    )
    expect(profile.establishments).toEqual([
      { id: 'new-1', name: 'BoursoBank', kind: 'institution', catalogId: 'boursobank' },
      // Ids are drawn in row order: BoursoBank, Livret A and its line, PEA and its line, then « Chez toi »…
      { id: 'new-6', name: HOME_NAME, kind: 'home' },
      { id: 'new-9', name: 'epargne salariale', kind: 'institution', catalogId: 'employee-savings' },
      { id: 'new-12', name: 'trade republic', kind: 'institution', catalogId: 'trade-republic' },
      { id: 'new-15', name: 'Ma petite banque', kind: 'institution' },
    ])
    const lines = Object.fromEntries(profile.lines.map((l) => [l.name, l]))
    expect(lines['Livret A']).toEqual({ id: 'new-3', accountId: 'new-2', name: 'Livret A', kind: 'amount', currency: 'EUR' })
    // Empty « Catégorie »: the type’s default, so no category is written; empty « Façon de compter »: the first kind.
    expect(lines['Fonds monde']).toMatchObject({ kind: 'units', group: 'world' })
    expect(lines['Fonds monde'].category).toBeUndefined()
    expect(lines['Apple']).toMatchObject({ currency: 'USD', quoteSymbol: 'AAPL' })
    expect(lines['Divers'].category).toBe('available')
    expect(profile.firstLaunch).toEqual({ planned: [], finished: profile.establishments.map((e) => e.id), complete: true })
    expect(parseProfile(profile)).toEqual(profile)
  })

  it('reads the account fields: unlock date, slow, closed lines', () => {
    const profile = profileOf(
      run({
        bank: 'BoursoBank',
        account: 'CTO',
        line: 'Ancienne',
        type: 'Compte-titres',
        unlockOn: '01/03/2027',
        slow: 'Oui',
        closedOn: day('2026-10-01'),
      }),
    )
    expect(profile.accounts[0]).toMatchObject({ unlockOn: '2027-03-01', slow: true })
    expect(profile.lines[0].closedOn).toBe('2026-10-01')
  })

  it('keeps a filled identifier as the id, and draws one when it is empty', () => {
    const profile = profileOf(
      run({ ...livret, reference: 'l-1', accountReference: 'a-1' }, { ...livret, account: 'LDDS', line: 'LDDS', type: 'LDDS' }),
    )
    expect(profile.accounts.map((a) => a.id)).toEqual(['a-1', 'new-2'])
    expect(profile.lines.map((l) => l.id)).toEqual(['l-1', 'new-3'])
  })

  it('reads an account with no line yet, and a bank with no account yet', () => {
    const profile = profileOf(
      run({ bank: 'BoursoBank', account: 'PEA', type: 'PEA', unlockOn: day('2029-05-01') }, { bank: 'Fortuneo' }),
    )
    expect(profile.establishments.map((e) => e.name)).toEqual(['BoursoBank', 'Fortuneo'])
    expect(profile.accounts).toEqual([
      { id: 'new-2', establishmentId: 'new-1', type: 'pea', name: 'PEA', unlockOn: '2029-05-01' },
    ])
    expect(profile.lines).toEqual([])
  })

  it('collects every error, one per bad cell, not only the first', () => {
    const result = run(
      { ...livret, type: 'Livret Z', currency: 'JPY' },
      { ...livret, account: 'Autre', line: 'Autre', unlockOn: '31/02/2027' },
    )
    expect(messages(result)).toEqual([
      'Onglet Comptes, ligne 2 : dans « Type de compte », « Livret Z » n’est pas un mot accepté. La liste est dans l’onglet « Mode d’emploi ».',
      'Onglet Comptes, ligne 2 : dans « Devise », « JPY » n’est pas un mot accepté. La liste est dans l’onglet « Mode d’emploi ».',
      'Onglet Comptes, ligne 3 : dans « Débloqué le », une date est attendue, par exemple 05/11/2026.',
    ])
  })

  it('refuses the example rows of the template', () => {
    expect(messages(run({ ...livret, bank: 'exemple — a effacer' }))).toEqual([
      'Onglet Comptes, ligne 2 : c’est la ligne d’exemple du modèle. Efface-la ou remplace-la.',
    ])
    const template = templateSheets().find((s) => s.name === SHEETS.accounts)!
    const result = readAccounts(readTable('accounts', [header, ...template.rows], true), counter())
    expect(messages(result)).toHaveLength(template.rows.length)
    expect(messages(result).every((m) => m.endsWith('c’est la ligne d’exemple du modèle. Efface-la ou remplace-la.'))).toBe(true)
    expect(template.rows.every((r) => r[0] === EXAMPLE_BANK)).toBe(true)
  })

  it('refuses a category on a loan', () => {
    expect(messages(run({ ...loan, category: 'Immobilier' }))).toEqual([
      'Onglet Comptes, ligne 2 : un « Crédit » n’a pas de catégorie : laisse « Catégorie » vide.',
    ])
  })

  it('requires a category when the type has none by default', () => {
    expect(messages(run({ bank: 'B', account: 'X', line: 'X', type: 'Autre compte' }))).toEqual([
      'Onglet Comptes, ligne 2 : un compte « Autre compte » n’a pas de catégorie par défaut : remplis « Catégorie ».',
    ])
  })

  it('refuses two lines on the same names without an identifier, on each row', () => {
    const result = run(livret, { ...livret, bank: 'boursobank', line: ' livret a ' })
    const message = 'les lignes 2 et 3 portent les mêmes Banque, Compte et Ligne, sans identifiant pour les distinguer. Donne un autre nom à l’un des placements.'
    expect(messages(result)).toEqual([`Onglet Comptes, ligne 2 : ${message}`, `Onglet Comptes, ligne 3 : ${message}`])
  })

  it('keeps two lines of the same names when identifiers tell them apart', () => {
    const profile = profileOf(run({ ...livret, reference: 'l-1' }, { ...livret, reference: 'l-2' }))
    expect(profile.lines.map((l) => l.id)).toEqual(['l-1', 'l-2'])
    expect(profile.accounts).toHaveLength(1)
  })

  it('refuses one identifier on two lines', () => {
    const result = run({ ...livret, reference: 'l-1' }, { ...livret, account: 'LDDS', line: 'LDDS', type: 'LDDS', reference: 'l-1' })
    expect(messages(result)).toEqual([
      'Onglet Comptes, ligne 3 : l’identifiant « l-1 » est déjà celui de la ligne 2 : deux placements ne peuvent pas avoir le même.',
    ])
  })

  it('refuses the rows of one account that disagree, on the disagreeing row', () => {
    const pea = { bank: 'BoursoBank', account: 'PEA', type: 'PEA' }
    const result = run(
      { ...pea, line: 'Fonds A', unlockOn: day('2029-05-01') },
      { ...pea, line: 'Fonds B', type: 'Compte-titres', unlockOn: day('2029-05-01') },
      { ...pea, line: 'Fonds C', slow: 'oui' },
    )
    expect(messages(result)).toEqual([
      'Onglet Comptes, ligne 3 : le compte « BoursoBank › PEA » dit « PEA » dans « Type de compte » à la ligne 2, et « Compte-titres » ici. Ces cases se répètent sans changer sur chaque ligne d’un compte.',
      'Onglet Comptes, ligne 4 : le compte « BoursoBank › PEA » dit « 01/05/2029 » dans « Débloqué le » à la ligne 2, et rien ici. Ces cases se répètent sans changer sur chaque ligne d’un compte.',
      'Onglet Comptes, ligne 4 : le compte « BoursoBank › PEA » dit « non » dans « Long à récupérer » à la ligne 2, et « oui » ici. Ces cases se répètent sans changer sur chaque ligne d’un compte.',
    ])
  })

  it('tells two accounts of the same name apart by their identifier, and refuses one identifier on two accounts', () => {
    const profile = profileOf(
      run(
        { ...livret, account: 'Livret', line: 'Livret', accountReference: 'a-1' },
        { ...livret, account: 'Livret', line: 'Livret', type: 'Autre livret', accountReference: 'a-2' },
      ),
    )
    expect(profile.accounts.map((a) => [a.id, a.type])).toEqual([
      ['a-1', 'livret-a'],
      ['a-2', 'other-savings'],
    ])
    expect(
      messages(run({ ...livret, accountReference: 'a-1' }, { ...livret, account: 'LDDS', line: 'LDDS', type: 'Livret A', accountReference: 'a-1' })),
    ).toEqual([
      'Onglet Comptes, ligne 3 : l’identifiant du compte « a-1 » est celui de « BoursoBank › Livret A » à la ligne 2 : un même identifiant ne peut pas désigner un autre compte.',
    ])
  })

  it('puts a row without account identifier in the one account of its names, and refuses when several have them', () => {
    const profile = profileOf(run({ ...livret, accountReference: 'a-1' }, { ...livret, line: 'Bonus' }))
    expect(profile.accounts.map((a) => a.id)).toEqual(['a-1'])
    expect(profile.lines.map((l) => l.accountId)).toEqual(['a-1', 'a-1'])
    expect(
      messages(run({ ...livret, accountReference: 'a-1' }, { ...livret, line: 'B', accountReference: 'a-2' }, { ...livret, line: 'C' })),
    ).toEqual([
      'Onglet Comptes, ligne 4 : plusieurs comptes s’appellent « BoursoBank › Livret A » (lignes 2 et 3) : recopie l’identifiant du compte pour dire lequel.',
    ])
  })

  it('allows a chapter only in the categories that have them', () => {
    const av = { bank: 'CA', account: 'AV', type: 'Assurance-vie' }
    expect(profileOf(run({ ...av, line: 'Fonds euros', group: 'Fonds euros' })).lines[0].group).toBe('euro-fund')
    expect(
      messages(
        run(
          { ...av, line: 'Fonds euros', group: 'Europe' },
          { ...livret, group: 'Monétaire' },
          { ...loan, group: 'Monétaire' },
        ),
      ),
    ).toEqual([
      'Onglet Comptes, ligne 2 : « Europe » n’est pas un chapitre de la catégorie « Épargne sécurisée ». Les chapitres sont dans l’onglet « Mode d’emploi ».',
      'Onglet Comptes, ligne 3 : la catégorie « Argent disponible » n’a pas de chapitre : laisse « Chapitre » vide.',
      'Onglet Comptes, ligne 4 : un « Crédit » n’a pas de chapitre : laisse « Chapitre » vide.',
    ])
  })

  it('refuses a way of counting the type does not allow', () => {
    expect(messages(run({ ...livret, kind: 'Parts' }))).toEqual([
      'Onglet Comptes, ligne 2 : un compte « Livret A » ne se compte pas en « Parts » : écris « Montant ».',
    ])
  })

  it('keeps a loan in euros, and checks the followed symbol', () => {
    expect(messages(run({ ...loan, currency: 'USD' }, { ...livret, type: 'PEA', kind: 'Parts', symbol: 'CW8 PA' }))).toEqual([
      'Onglet Comptes, ligne 2 : un « Crédit » se compte en euros : laisse « Devise » vide, ou écris EUR.',
      'Onglet Comptes, ligne 3 : dans « Symbole suivi », « CW8 PA » n’est pas un symbole boursier : des lettres, des chiffres, des points et des tirets, par exemple CW8.PA.',
    ])
  })

  it('requires the bank, the type, and the account of a line', () => {
    expect(messages(run({ ...livret, bank: null }, { ...livret, type: null }, { ...livret, account: null }))).toEqual([
      'Onglet Comptes, ligne 2 : la case « Banque » est vide.',
      'Onglet Comptes, ligne 3 : la case « Type de compte » est vide.',
      'Onglet Comptes, ligne 4 : la case « Compte » est vide, alors que « Ligne » est remplie : un placement appartient à un compte.',
    ])
  })

  it('refuses cells of an account or a line on a row that has none', () => {
    expect(messages(run({ bank: 'Fortuneo', type: 'Livret A' }, { bank: 'B', account: 'PEA', type: 'PEA', category: 'Or et crypto', currency: 'EUR' }))).toEqual([
      'Onglet Comptes, ligne 2 : cette ligne n’a pas de « Compte », mais des cases sont remplies (« Type de compte ») : remplis « Compte », ou efface ces cases.',
      'Onglet Comptes, ligne 3 : cette ligne n’a pas de « Ligne », mais des cases de placement sont remplies (« Catégorie », « Devise ») : remplis « Ligne », ou efface ces cases.',
    ])
  })

  it('refuses a sheet with no row, and passes the table’s errors on', () => {
    expect(messages(run())).toEqual(['Onglet Comptes : il n’a aucune ligne. Il faut au moins une banque et ses comptes.'])
    const missing = readTable('accounts', undefined, true)
    expect(readAccounts(missing, counter())).toEqual({ errors: missing.errors })
  })

  it('gives an error, never a throw, when the result fails the last guard', () => {
    const result = readAccounts(table(livret), () => '')
    expect(messages(result)).toEqual([
      'Onglet Comptes : le site n’a pas pu assembler ces comptes. Vérifie l’onglet, puis réessaie.',
    ])
  })

  it('gives an error, never a throw, when new ids keep colliding', () => {
    // Every drawn id is « l-1 », already the identifier of the first line.
    const result = readAccounts(table({ ...livret, reference: 'l-1' }, { ...livret, line: 'B' }), () => 'l-1')
    expect(messages(result)).toEqual([
      'Onglet Comptes : le site n’a pas pu assembler ces comptes. Vérifie l’onglet, puis réessaie.',
    ])
  })

  it('makes one bank of two names equal once accents, case and spaces are ignored, on purpose', () => {
    const profile = profileOf(run(livret, { ...livret, bank: '  boursobank ', account: 'LDDS', line: 'LDDS', type: 'LDDS' }))
    expect(profile.establishments).toEqual([{ id: 'new-1', name: 'BoursoBank', kind: 'institution', catalogId: 'boursobank' }])
    expect(profile.accounts.map((a) => a.establishmentId)).toEqual(['new-1', 'new-1'])
  })

  it('ranges each account where the site ranges it', () => {
    expect(
      messages(
        run(
          { ...house, bank: 'BNP Paribas' },
          { ...livret, bank: 'Chez toi' },
          { ...loan, bank: 'Épargne salariale' },
          { ...loan, bank: 'Binance', account: 'Prêt 2', line: 'Prêt 2' },
          { bank: 'Chez toi', account: 'Lingots', line: 'Lingots', type: 'Or' },
        ),
      ),
    ).toEqual([
      'Onglet Comptes, ligne 2 : un compte « Logement » se range dans « Chez toi », pas chez « BNP Paribas ».',
      'Onglet Comptes, ligne 3 : « Chez toi » ne garde que les comptes « Logement », « Or » et « Crypto » : un compte « Livret A » se range dans sa banque.',
      'Onglet Comptes, ligne 4 : un « Crédit » se range dans une banque qui prête, pas chez « Épargne salariale ».',
      'Onglet Comptes, ligne 5 : un « Crédit » se range dans une banque qui prête, pas chez « Binance ».',
    ])
  })

  it('refuses « Long à récupérer » on a home, a PER or a loan: their type decides', () => {
    expect(messages(run({ ...house, slow: 'oui' }, { bank: 'CA', account: 'PER', line: 'PER', type: 'PER', slow: 'oui' }))).toEqual([
      'Onglet Comptes, ligne 2 : un compte « Logement » est long à récupérer ou non selon son type : laisse « Long à récupérer » vide.',
      'Onglet Comptes, ligne 3 : un compte « PER » est long à récupérer ou non selon son type : laisse « Long à récupérer » vide.',
    ])
  })

  describe('« Type de logement »', () => {
    const typeOf = (result: AccountsResult, name: string) => profileOf(result).accounts.find((a) => a.name === name)!
    const second = { ...house, account: 'Studio', line: 'Studio' }
    const third = { ...house, account: 'Chalet', line: 'Chalet' }

    it('reads the three words, loosely written; « Résidence principale » or empty is no mark, as before the types', () => {
      const result = run(
        { ...house, residence: 'Résidence principale' },
        { ...second, residence: '  investissement LOCATIF ' },
        { ...third, residence: 'residence secondaire' },
        { ...house, account: 'Maison', line: 'Maison' },
      )
      expect(typeOf(result, 'Ma maison')).not.toHaveProperty('residence')
      expect(typeOf(result, 'Studio').residence).toBe('rental')
      expect(typeOf(result, 'Chalet').residence).toBe('secondary')
      expect(typeOf(result, 'Maison')).not.toHaveProperty('residence')
    })

    it('keeps the type of a home with no line yet', () => {
      const result = run({ bank: HOME_NAME, account: 'Studio', type: 'Logement', residence: 'Investissement locatif' })
      expect(typeOf(result, 'Studio').residence).toBe('rental')
    })

    it('refuses an unknown word, a type on an account that is not a home, and rows of a home that disagree', () => {
      expect(
        messages(
          run(
            { ...house, residence: 'Location' },
            { ...livret, residence: 'Investissement locatif' },
            { ...second, residence: 'Investissement locatif' },
            { ...second, line: 'Parking', residence: 'Résidence secondaire' },
          ),
        ),
      ).toEqual([
        'Onglet Comptes, ligne 2 : dans « Type de logement », « Location » n’est pas un mot accepté. La liste est dans l’onglet « Mode d’emploi ».',
        'Onglet Comptes, ligne 3 : « Type de logement » ne se remplit que pour un compte « Logement ». Ici, c’est un compte « Livret A ».',
        'Onglet Comptes, ligne 5 : le compte « Chez toi › Studio » dit « Investissement locatif » dans « Type de logement » à la ligne 4, et « Résidence secondaire » ici. Ces cases se répètent sans changer sur chaque ligne d’un compte.',
      ])
    })

    it('reads a principal residence written on one row and left empty on another as one type, the same', () => {
      // Empty means « Résidence principale »: the two rows say the same thing.
      const result = run({ ...house, residence: 'Résidence principale' }, { ...house, line: 'Garage' })
      expect(typeOf(result, 'Ma maison')).not.toHaveProperty('residence')
    })

    it('refuses a type on an account that is not a home once, not also as rows that disagree', () => {
      // Empty would read as « Résidence principale » next to « Résidence secondaire »: one refusal is enough.
      expect(
        messages(run({ ...livret, residence: 'Résidence secondaire' }, { ...livret, line: 'Livret bis' })),
      ).toEqual([
        'Onglet Comptes, ligne 2 : « Type de logement » ne se remplit que pour un compte « Logement ». Ici, c’est un compte « Livret A ».',
      ])
    })
  })

  describe('« Logement financé »', () => {
    const financed = (value: Cell, ...more: Values[]) => run(house, ...more, { ...loan, financedLine: value })

    it('finds the home by its path, written loosely', () => {
      const profile = profileOf(financed('chez toi›MA MAISON ›  ma maison'))
      const home = profile.lines.find((l) => l.name === 'Ma maison')!
      expect(profile.accounts.find((a) => a.type === 'loan')!.financedLineId).toBe(home.id)
    })

    it('finds the home by its identifier first', () => {
      const profile = profileOf(run({ ...house, reference: 'l-home' }, { ...loan, financedLine: 'l-home' }))
      expect(profile.accounts.find((a) => a.type === 'loan')!.financedLineId).toBe('l-home')
    })

    it('accepts a closed home: a loan keeps the house it financed', () => {
      const profile = profileOf(run({ ...house, closedOn: day('2026-06-30') }, { ...loan, financedLine: 'Chez toi › Ma maison › Ma maison' }))
      expect(profile.accounts.find((a) => a.type === 'loan')!.financedLineId).toBeDefined()
    })

    it('refuses it on an account that is not a loan', () => {
      expect(messages(run(house, { ...livret, financedLine: 'Chez toi › Ma maison › Ma maison' }))).toEqual([
        'Onglet Comptes, ligne 3 : « Logement financé » ne se remplit que pour un compte « Crédit ». Ici, c’est un compte « Livret A ».',
      ])
    })

    it('refuses a path that names nothing, several lines, or a line that is not a home', () => {
      expect(messages(financed('Chez toi › Maison'))).toEqual([
        'Onglet Comptes, ligne 3 : dans « Logement financé », « Chez toi › Maison » ne désigne aucun placement de cet onglet. Écris-le Banque › Compte › Ligne, ou recopie son identifiant.',
      ])
      const twins = run({ ...house, reference: 'l-1' }, { ...house, reference: 'l-2' }, { ...loan, financedLine: 'Chez toi › Ma maison › Ma maison' })
      expect(messages(twins)).toEqual([
        'Onglet Comptes, ligne 4 : dans « Logement financé », « Chez toi › Ma maison › Ma maison » désigne plusieurs placements (lignes 2 et 3) : recopie plutôt l’identifiant du logement.',
      ])
      expect(messages(financed('BoursoBank › Livret A › Livret A', livret))).toEqual([
        'Onglet Comptes, ligne 4 : dans « Logement financé », « BoursoBank › Livret A › Livret A » n’est pas un logement : il désigne un placement d’un compte « Logement ».',
      ])
    })
  })

  describe('the index, for the other sheets', () => {
    const { index, profile } = success(
      run({ ...livret, reference: 'l-1', accountReference: 'a-1' }, { ...livret, reference: 'l-2', accountReference: 'a-1' }, house),
    )
    const home = profile.lines.find((l) => l.name === 'Ma maison')!

    it('finds a line by its names, loosely written', () => {
      expect(index.lineFor('chez toi', 'MA MAISON', 'ma maison', null)).toEqual({ ok: true, value: home })
    })

    it('finds a line by its identifier, whose names must agree when they are written', () => {
      expect(index.lineFor('BoursoBank', 'Livret A', 'Livret A', 'l-2')).toMatchObject({ ok: true, value: { id: 'l-2' } })
      expect(index.lineFor(null, null, null, 'l-2')).toMatchObject({ ok: true, value: { id: 'l-2' } })
      expect(index.lineFor(HOME_NAME, 'Ma maison', 'Ma maison', 'l-2')).toEqual({
        ok: false,
        reason: plainless('l’identifiant « l-2 » est celui de « BoursoBank › Livret A › Livret A » dans l’onglet « Comptes », pas de « Chez toi › Ma maison › Ma maison ».'),
      })
      expect(index.lineFor(null, null, null, 'l-9')).toEqual({
        ok: false,
        reason: plainless('l’identifiant « l-9 » ne désigne aucun placement de l’onglet « Comptes ».'),
      })
    })

    it('says when names find nothing, or several lines', () => {
      expect(index.lineFor('BoursoBank', 'Livret B', 'Livret B', null)).toEqual({
        ok: false,
        reason: plainless('le placement « BoursoBank › Livret B › Livret B » n’existe pas dans l’onglet « Comptes ».'),
      })
      expect(index.lineFor('BoursoBank', 'Livret A', 'Livret A', null)).toEqual({
        ok: false,
        reason: plainless('plusieurs placements s’appellent « BoursoBank › Livret A › Livret A » dans l’onglet « Comptes » : recopie l’identifiant pour dire lequel.'),
      })
    })

    it('finds an account by its names or its identifier', () => {
      expect(index.accountFor('boursobank', 'livret a', null)).toMatchObject({ ok: true, value: { id: 'a-1' } })
      expect(index.accountFor(null, null, 'a-1')).toMatchObject({ ok: true, value: { id: 'a-1' } })
      expect(index.accountFor('BoursoBank', 'Livret B', null)).toEqual({
        ok: false,
        reason: plainless('le compte « BoursoBank › Livret B » n’existe pas dans l’onglet « Comptes ».'),
      })
      expect(index.accountFor(null, null, 'a-9')).toEqual({
        ok: false,
        reason: plainless('l’identifiant du compte « a-9 » ne désigne aucun compte de l’onglet « Comptes ».'),
      })
    })
  })
})

// The expected reasons are written with plain spaces; the index speaks French typography.
function plainless(text: string): string {
  return text.replace(/« /g, '« ').replace(/ »/g, ' »').replace(/ :/g, ' :')
}

describe('a file the site produced reads back', () => {
  const sheet = (sheets: SheetSpec[], name: string) => sheets.find((s) => s.name === name)!

  it('gives back the same accounts and lines from the export, ids included', () => {
    const exported = sheet(exportSheets(fixtureInput()), SHEETS.accounts)
    const { profile } = success(readAccounts(readTable('accounts', [header, ...exported.rows], true), counter()))
    const original = fixtureProfile()
    const bankName = (p: typeof profile, id: string) => p.establishments.find((e) => e.id === id)!.name
    const byBank = (p: typeof profile) => p.accounts.map(({ establishmentId, ...rest }) => ({ ...rest, bank: bankName(p, establishmentId) }))
    expect(byBank(profile)).toEqual(byBank(original))
    expect(profile.lines).toEqual(original.lines)
    // Only the banks’ ids do not come back (they are not in the file).
    const withoutId = (p: typeof profile) => p.establishments.map((e) => ({ ...e, id: 'any' }))
    expect(withoutId(profile)).toEqual(withoutId(original))
  })

  it('reads the example of the « Pour une IA » sheet without an error', () => {
    const example = sheet(AI_EXAMPLE, SHEETS.accounts)
    const { profile } = success(readAccounts(readTable('accounts', [header, ...example.rows], true), counter()))
    expect(profile.accounts.find((a) => a.type === 'loan')!.financedLineId).toBe(profile.lines.find((l) => l.name === 'Appartement')!.id)
  })
})

// Every refusal the « Pour une IA » note lists for « Comptes » is one the import makes, and the
// import refuses only under a listed key (its error helper takes a RefusalKey). The Record type
// makes this list exhaustive: a new key fails `tsc` until it has its case here.
// The refusals of « Relevés » and « Versements » have their cases in import-snapshots.test.ts.
const REFUSAL_CASES: Record<keyof typeof ACCOUNT_REFUSALS, { errors: () => ImportError[]; says: string }> = {
  missingSheet: { errors: () => readTable('accounts', undefined, true).errors, says: 'cet onglet manque' },
  missingColumn: { errors: () => readTable('accounts', [['Banque']], true).errors, says: 'la colonne « Compte » manque' },
  duplicateColumn: { errors: () => readTable('accounts', [[...header, 'Banque']], true).errors, says: 'apparaît deux fois' },
  missingValue: { errors: () => errorsOf(run({ ...livret, type: null })), says: 'est vide' },
  unknownWord: { errors: () => errorsOf(run({ ...livret, slow: 'peut-être' })), says: 'n’est pas un mot accepté' },
  unreadable: { errors: () => errorsOf(run({ ...livret, closedOn: 'hier' })), says: 'une date est attendue' },
  example: { errors: () => errorsOf(run({ ...livret, bank: EXAMPLE_BANK })), says: 'ligne d’exemple' },
  emptyAccounts: { errors: () => errorsOf(run()), says: 'aucune ligne' },
  strayValue: { errors: () => errorsOf(run({ bank: 'B', slow: 'oui' })), says: 'n’a pas de « Compte »' },
  duplicateLine: { errors: () => errorsOf(run(livret, livret)), says: 'sans identifiant pour les distinguer' },
  duplicateId: { errors: () => errorsOf(run({ ...livret, reference: 'x' }, { ...livret, line: 'B', reference: 'x' })), says: 'est déjà celui' },
  accountDisagrees: { errors: () => errorsOf(run(livret, { ...livret, line: 'B', slow: 'oui' })), says: 'se répètent sans changer' },
  ambiguousAccount: {
    errors: () => errorsOf(run({ ...livret, accountReference: 'a' }, { ...livret, line: 'B', accountReference: 'b' }, { ...livret, line: 'C' })),
    says: 'plusieurs comptes',
  },
  categoryNeeded: { errors: () => errorsOf(run({ ...livret, type: 'Autre compte' })), says: 'pas de catégorie par défaut' },
  categoryOnLoan: { errors: () => errorsOf(run({ ...loan, category: 'Immobilier' })), says: 'n’a pas de catégorie' },
  groupNotAllowed: { errors: () => errorsOf(run({ ...livret, group: 'Europe' })), says: 'n’a pas de chapitre' },
  kindNotAllowed: { errors: () => errorsOf(run({ ...livret, kind: 'Parts' })), says: 'ne se compte pas en' },
  loanCurrency: { errors: () => errorsOf(run({ ...loan, currency: 'CHF' })), says: 'se compte en euros' },
  badSymbol: { errors: () => errorsOf(run({ ...livret, symbol: 'É' })), says: 'n’est pas un symbole boursier' },
  badPurchase: {
    errors: () => errorsOf(run({ bank: 'Trade Republic', account: 'CTO', line: 'Apple', type: 'Compte-titres', currency: 'usd', purchase: '0' })),
    says: 'n’est pas un taux d’achat',
  },
  financedNotLoan: { errors: () => errorsOf(run(house, { ...livret, financedLine: 'Chez toi › Ma maison › Ma maison' })), says: 'ne se remplit que' },
  residenceNotHome: {
    errors: () => errorsOf(run({ ...loan, residence: 'Investissement locatif' })),
    says: '« Type de logement » ne se remplit que pour un compte « Logement »',
  },
  financedLine: { errors: () => errorsOf(run({ ...loan, financedLine: 'nulle part' })), says: 'ne désigne aucun placement' },
  placementNotAllowed: { errors: () => errorsOf(run({ ...house, bank: 'BoursoBank' })), says: 'se range dans' },
  slowByType: { errors: () => errorsOf(run({ ...loan, slow: 'oui' })), says: 'selon son type' },
}

function errorsOf(result: AccountsResult): ImportError[] {
  return 'errors' in result ? result.errors : []
}

describe('the « Pour une IA » note and the import agree on what is refused', () => {
  const note = plain(aiNote().join('\n'))

  for (const [key, { errors, says }] of Object.entries(REFUSAL_CASES)) {
    it(`the import makes the refusal « ${key} », and the note lists it`, () => {
      expect(errors().map((e) => plain(e.message)).some((m) => m.includes(says))).toBe(true)
      // The sentence opens with a capital: compared without case.
      expect(note.toLowerCase()).toContain(plain(REFUSALS[key as RefusalKey]).toLowerCase())
    })
  }

  it('says that a new line of an existing account needs no identifier', () => {
    expect(note).toContain('Une nouvelle ligne d’un compte existant n’a pas besoin de l’identifiant')
  })

  it('says that an empty « Type de logement » and « Résidence principale » are the same, not a change', () => {
    expect(note).toContain(
      'sauf dans « Type de logement », où une case vide et « Résidence principale » disent la même chose',
    )
  })

  it('says that an empty bank or an empty account still has its own row', () => {
    for (const text of [note, plain(guideNote({ profile: 0, snapshots: 0, goals: 0, settings: 0 }).join('\n'))]) {
      expect(text).toContain('Une banque ou un compte encore vide a aussi sa ligne')
    }
  })
})

// docs/superpowers/specs/2026-11-11-change-a-l-achat-design.md: the rate of a line's purchases.
describe('the rate of purchases of a line in another currency', () => {
  const apple = { bank: 'Trade Republic', account: 'CTO', line: 'Apple', type: 'Compte-titres', currency: 'usd' }
  const lineOf = (purchase: string) => success(run({ ...apple, purchase })).profile.lines.find((l) => l.name === 'Apple')
  it('reads a rate, or « euros »', () => {
    expect(lineOf('1,2')?.purchase).toEqual({ perEuro: 1.2 })
    expect(lineOf('euros')?.purchase).toEqual({ inEuros: true })
    expect(lineOf('')).not.toHaveProperty('purchase')
  })
  it('refuses a rate on a line in euros', () => {
    expect(messages(run({ ...livret, purchase: '1,2' })).join(' ')).toContain('n’est pas un taux d’achat')
  })
})
