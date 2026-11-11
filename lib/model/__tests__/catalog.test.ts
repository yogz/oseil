import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  ACCOUNT_TYPES,
  BANKS,
  CATEGORIES,
  CATEGORY_ORDER,
  CRYPTO_PLATFORMS,
  CURRENCIES,
  FAMILY_LABELS,
  GOAL_CATEGORIES,
  GOAL_COLOR,
  GOAL_LABELS,
  GOAL_PRESETS,
  LEGACY_OUTSIDE_IDS,
  OTHER_BANKS,
  OUTSIDE_BANKS,
  RESIDENCE_LABELS,
  RESIDENCES,
  bankAt,
  canFollowPrice,
  searchBanks,
} from '@/lib/catalog'
import { parseEcbDaily } from '@/lib/market/ecb'
import type { AccountTypeId, CategoryId, Establishment } from '../types'

const ALL_TYPES: AccountTypeId[] = [
  'current', 'livret-a', 'ldds', 'lep', 'livret-jeune', 'pel-cel', 'other-savings',
  'life-insurance', 'pea', 'pea-pme', 'securities', 'per', 'employee-savings',
  'home', 'gold', 'crypto', 'loan', 'other',
]

describe('catalog', () => {
  test('lists the twelve banks in order', () => {
    expect(BANKS.map((b) => b.name)).toEqual([
      'Crédit Agricole', 'BNP Paribas', 'Société Générale', 'Crédit Mutuel',
      'La Banque Postale', 'Caisse d’Épargne', 'Banque Populaire', 'LCL', 'CIC',
      'BoursoBank', 'Fortuneo', 'Revolut',
    ])
    for (const bank of BANKS) expect(bank.id).toMatch(/^[a-z]+(-[a-z]+)*$/)
  })

  test('every account type has an entry', () => {
    expect(Object.keys(ACCOUNT_TYPES).sort()).toEqual([...ALL_TYPES].sort())
  })

  test('outside banks: five things held by the person, no loan', () => {
    expect(OUTSIDE_BANKS.map((b) => [b.id, b.label])).toEqual([
      ['my-home', 'Mon logement'],
      ['other-home', 'Un autre logement'],
      ['gold', 'De l’or que tu gardes toi-même'],
      ['crypto', 'De la crypto sur ton propre portefeuille'],
      ['employee-savings', 'Mon épargne salariale'],
    ])
    expect(LEGACY_OUTSIDE_IDS).toEqual(['loan'])
    expect(CRYPTO_PLATFORMS).toEqual(['binance', 'coinbase', 'kraken'])
  })

  test('loan, gold and crypto form the « Crédit, or et crypto » family; home stays outside', () => {
    expect(FAMILY_LABELS.holdings).toBe('Crédit, or et crypto')
    for (const type of ['loan', 'gold', 'crypto'] as const) expect(ACCOUNT_TYPES[type].family).toBe('holdings')
    expect(ACCOUNT_TYPES.home.family).toBe('outside')
    expect(ACCOUNT_TYPES.loan.explanation).toBe('ce qu’il te reste à rembourser')
  })

  test('outside banks point at known account types', () => {
    for (const outside of OUTSIDE_BANKS) expect(ACCOUNT_TYPES[outside.accountType]).toBeDefined()
  })

  test('every line kind has a default category, except loan and other', () => {
    for (const id of ALL_TYPES) {
      if (id === 'loan' || id === 'other') continue
      for (const kind of ACCOUNT_TYPES[id].lineKinds) {
        expect(ACCOUNT_TYPES[id].defaultCategory[kind], `${id}/${kind}`).toBeDefined()
      }
    }
  })

  test('goal presets total 100, cover the five goal keys and leave the rental at 0', () => {
    for (const preset of Object.values(GOAL_PRESETS)) {
      expect(Object.keys(preset.shares).sort()).toEqual(['available', 'gold', 'markets', 'rental', 'secured'])
      expect(preset.shares.rental).toBe(0)
      expect(Object.values(preset.shares).reduce((a, b) => a + b, 0)).toBe(100)
    }
  })

  test('the goal keys: five, from the most liquid to the rental, each with a label and a colour', () => {
    expect([...GOAL_CATEGORIES]).toEqual(['available', 'secured', 'markets', 'gold', 'rental'])
    expect(GOAL_LABELS).toEqual({
      available: 'Argent disponible',
      secured: 'Épargne sécurisée',
      markets: 'Placements en bourse',
      gold: 'Or et crypto',
      rental: 'Immobilier locatif',
    })
    expect(GOAL_COLOR).toEqual({ available: 'available', secured: 'secured', markets: 'markets', gold: 'gold', rental: 'property' })
  })

  test('the three residence types, in order, with their labels', () => {
    expect(RESIDENCE_LABELS).toEqual({
      main: 'Résidence principale',
      secondary: 'Résidence secondaire',
      rental: 'Investissement locatif',
    })
    expect(Object.keys(RESIDENCE_LABELS)).toEqual(['main', 'secondary', 'rental'])
    expect([...RESIDENCES]).toEqual(['main', 'secondary', 'rental'])
  })

  test('category order has the five categories once each', () => {
    const expected: CategoryId[] = ['available', 'secured', 'markets', 'gold', 'property']
    expect([...CATEGORY_ORDER]).toEqual(expected)
    expect(Object.keys(CATEGORIES).sort()).toEqual([...expected].sort())
  })

  test('pins change and default categories per account type', () => {
    type Row = [AccountTypeId, string, Partial<Record<'amount' | 'units', CategoryId>>]
    const table: Row[] = [
      ['current', 'all', { amount: 'available' }],
      ['livret-a', 'all', { amount: 'available' }],
      ['ldds', 'all', { amount: 'available' }],
      ['lep', 'all', { amount: 'available' }],
      ['livret-jeune', 'all', { amount: 'available' }],
      ['pel-cel', 'all', { amount: 'available' }],
      ['other-savings', 'all', { amount: 'available' }],
      ['life-insurance', 'contributions', { amount: 'secured', units: 'markets' }],
      ['per', 'contributions', { amount: 'secured', units: 'markets' }],
      ['employee-savings', 'contributions', { amount: 'markets', units: 'markets' }],
      ['pea', 'cost-basis', { amount: 'markets', units: 'markets' }],
      ['pea-pme', 'cost-basis', { amount: 'markets', units: 'markets' }],
      ['securities', 'cost-basis', { amount: 'markets', units: 'markets' }],
      ['gold', 'cost-basis', { amount: 'gold', units: 'gold' }],
      ['crypto', 'cost-basis', { amount: 'gold', units: 'gold' }],
      ['home', 'property', { amount: 'property' }],
      ['loan', 'repayment', {}],
      ['other', 'all', {}],
    ]
    expect(table.map((r) => r[0]).sort()).toEqual([...ALL_TYPES].sort())
    for (const [id, change, categories] of table) {
      expect(ACCOUNT_TYPES[id].change, `${id} change`).toBe(change)
      expect(ACCOUNT_TYPES[id].defaultCategory, `${id} categories`).toEqual(categories)
    }
  })
})

describe('currencies', () => {
  test('offers euros, dollars, pounds and Swiss francs, each published by the ECB', () => {
    expect(CURRENCIES.map((c) => c.code)).toEqual(['EUR', 'USD', 'GBP', 'CHF'])
    expect(CURRENCIES.map((c) => c.words)).toEqual(['euros', 'dollars américains', 'livres sterling', 'francs suisses'])
    const ecb = parseEcbDaily(readFileSync(join(__dirname, '../../market/__tests__/ecb-2026-11-06.xml'), 'utf8'))
    for (const { code } of CURRENCIES) {
      if (code === 'EUR') continue
      expect(ecb?.perEuro[code], code).toBeGreaterThan(0)
    }
  })

  test('only the pound is feminine', () => {
    expect(CURRENCIES.filter((c) => c.feminine).map((c) => c.code)).toEqual(['GBP'])
  })
})

describe('canFollowPrice', () => {
  test('a units line can follow its price, except gold', () => {
    expect(canFollowPrice('pea')).toBe(true)
    expect(canFollowPrice('securities')).toBe(true)
    expect(canFollowPrice('life-insurance')).toBe(true)
    expect(canFollowPrice('gold')).toBe(false)
    expect(canFollowPrice('crypto')).toBe(true)
    expect(canFollowPrice('livret-a')).toBe(false)
  })

  test('only account types that hold units', () => {
    for (const id of ALL_TYPES) {
      if (canFollowPrice(id)) expect(ACCOUNT_TYPES[id].lineKinds, id).toContain('units')
    }
    expect(ALL_TYPES.filter(canFollowPrice)).toEqual(['life-insurance', 'pea', 'pea-pme', 'securities', 'per', 'employee-savings', 'crypto', 'other'])
  })
})

describe('bank phrases and search', () => {
  test('every bank has its phrase', () => {
    expect(BANKS.map((b) => b.at)).toEqual([
      'au Crédit Agricole', 'chez BNP Paribas', 'à la Société Générale', 'au Crédit Mutuel',
      'à La Banque Postale', 'à la Caisse d’Épargne', 'à la Banque Populaire', 'chez LCL',
      'au CIC', 'chez BoursoBank', 'chez Fortuneo', 'chez Revolut',
    ])
  })

  test('other banks are in order with clean unique ids', () => {
    expect(OTHER_BANKS.map((b) => b.name)).toEqual([
      'Hello bank!', 'Monabanq', 'N26', 'Nickel', 'Sumeria', 'Trade Republic', 'Degiro',
      'Bourse Direct', 'Interactive Brokers', 'Saxo Banque', 'Linxea', 'Placement-direct',
      'Yomoni', 'Nalo', 'Ramify', 'Binance', 'Coinbase', 'Kraken', 'HSBC', 'Crédit Coopératif',
      'Axa', 'Generali', 'Amundi Épargne Salariale', 'Natixis Interépargne',
    ])
    const ids = [...BANKS, ...OTHER_BANKS].map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const bank of OTHER_BANKS) expect(bank.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(OTHER_BANKS[0].id).toBe('hello-bank')
  })

  test('search ignores accents and case, matches anywhere', () => {
    expect(searchBanks('societe').map((b) => b.name)).toEqual(['Société Générale'])
    expect(searchBanks('SOCIÉTÉ')[0].at).toBe('à la Société Générale')
    expect(searchBanks('trade')).toEqual([
      { id: 'trade-republic', name: 'Trade Republic', at: 'chez Trade Republic' },
    ])
    expect(searchBanks('epargne').map((b) => b.name)).toEqual([
      'Caisse d’Épargne', 'Amundi Épargne Salariale', 'Natixis Interépargne',
    ])
  })

  test('a straight apostrophe finds a name written with the typographic one', () => {
    expect(searchBanks("d’epargne").map((b) => b.name)).toEqual(['Caisse d’Épargne'])
    expect(searchBanks('d’epargne').map((b) => b.name)).toEqual(['Caisse d’Épargne'])
  })

  test('search puts BANKS first, then OTHER_BANKS, each in list order', () => {
    expect(searchBanks('credit').map((b) => b.name)).toEqual([
      'Crédit Agricole', 'Crédit Mutuel', 'Crédit Coopératif',
    ])
  })

  test('an empty or unmatched query finds nothing', () => {
    expect(searchBanks('')).toEqual([])
    expect(searchBanks('zzzz')).toEqual([])
  })

  test('bankAt uses the catalog phrase, else « chez {name} »', () => {
    const known: Establishment = { id: 'e1', name: 'Mon CA', kind: 'institution', catalogId: 'credit-agricole' }
    const other: Establishment = { id: 'e2', name: 'x', kind: 'institution', catalogId: 'hello-bank' }
    const free: Establishment = { id: 'e3', name: 'Ma banque', kind: 'institution' }
    expect(bankAt(known)).toBe('au Crédit Agricole')
    expect(bankAt(other)).toBe('chez Hello bank!')
    expect(bankAt(free)).toBe('chez Ma banque')
  })
})
