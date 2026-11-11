import { describe, expect, test } from 'vitest'
import type { Account, Line } from '@/lib/model/types'
import { REASON_WORDS, suggestGroup, UNGUESSED } from '../suggest-group'

const line = (name: string, extra: Partial<Line> = {}): Line => ({
  id: 'l1',
  accountId: 'a1',
  name,
  kind: 'units',
  currency: 'EUR',
  ...extra,
})

const account = (type: string): Account =>
  ({ id: 'a1', establishmentId: 'e1', type, name: 'Compte' }) as Account

const pea = account('pea')
const lifeInsurance = account('life-insurance')
const per = account('per')

describe('suggestGroup: name and index', () => {
  test('S&P 500 → us, by index', () => {
    expect(suggestGroup(line('Amundi PEA S&P 500 UCITS ETF'), pea, 'markets')).toEqual({ group: 'us', reason: 'index' })
  })
  test('Euro Stoxx → europe, by index', () => {
    expect(suggestGroup(line('iShares Core Euro Stoxx 50'), pea, 'markets')).toEqual({ group: 'europe', reason: 'index' })
  })
  test('MSCI World → world, by index', () => {
    expect(suggestGroup(line('Amundi MSCI World Swap ETF'), pea, 'markets')).toEqual({ group: 'world', reason: 'index' })
  })
  test('Chine → emerging, by name', () => {
    expect(suggestGroup(line('Amundi PEA Chine MSCI'), pea, 'markets')).toEqual({ group: 'emerging', reason: 'name' })
  })
  test('accents and case do not matter', () => {
    expect(suggestGroup(line('FONDS ÉMERGENTS'), pea, 'markets')).toEqual({ group: 'emerging', reason: 'name' })
    expect(suggestGroup(line('fonds emergents'), pea, 'markets')).toEqual({ group: 'emerging', reason: 'name' })
  })
  test('EUR is a currency, not Europe', () => {
    expect(suggestGroup(line('iShares MSCI EUR-ACC'), pea, 'markets')).toBeNull()
  })
  // 9 November 2026 (Nicolas): Japan has its own chapter. The trap still holds: never emerging.
  test('MSCI Japan → japan, by index', () => {
    expect(suggestGroup(line('Amundi MSCI Japan ESG Broad Transition'), pea, 'markets')).toEqual({ group: 'japan', reason: 'index' })
  })
  test('Japan is not emerging, even listed in Amsterdam: it is Japan, by its index', () => {
    const found = suggestGroup(line('iShares MSCI Japan', { quoteSymbol: 'IJPA.AS' }), pea, 'markets')
    expect(found).toEqual({ group: 'japan', reason: 'index' })
    expect(found?.group).not.toBe('emerging')
  })
  // The review of 9 November 2026: « ex Japan » means everything but Japan.
  test('Japan left out (« ex », « ex- », « hors ») proposes nothing', () => {
    for (const name of ['iShares Core MSCI Pacific ex-Japan', 'Xtrackers MSCI Pacific ex Japan', 'MSCI AC Asia ex Japan', 'Actions Asie hors Japon']) {
      expect(suggestGroup(line(name), pea, 'markets')).toBeNull()
    }
    expect(suggestGroup(line('Amundi MSCI World ex Japan'), pea, 'markets')).toEqual({ group: 'world', reason: 'index' })
    expect(suggestGroup(line('Amundi MSCI Japan ESG Broad Transition'), pea, 'markets')).toEqual({ group: 'japan', reason: 'index' })
    // « ex » must be a word of its own: the end of « Index » is not one.
    expect(suggestGroup(line('Amundi Index MSCI Japan'), pea, 'markets')).toEqual({ group: 'japan', reason: 'index' })
  })
  test('Nikkei and Topix → japan, by index; Japon and Japan alone → japan, by name', () => {
    expect(suggestGroup(line('Lyxor Japan (Topix) UCITS ETF'), pea, 'markets')).toEqual({ group: 'japan', reason: 'index' })
    expect(suggestGroup(line('Amundi Nikkei 225'), pea, 'markets')).toEqual({ group: 'japan', reason: 'index' })
    expect(suggestGroup(line('Comgest Growth Japan'), pea, 'markets')).toEqual({ group: 'japan', reason: 'name' })
    expect(suggestGroup(line('Fonds actions Japon'), pea, 'markets')).toEqual({ group: 'japan', reason: 'name' })
  })
  test('a keyword inside another word does not match', () => {
    expect(suggestGroup(line('Index maison'), pea, 'markets')).toBeNull()
    expect(suggestGroup(line('Mondelez'), pea, 'markets')).toBeNull()
  })
})

describe('suggestGroup: listing', () => {
  test('European suffix → europe', () => {
    expect(suggestGroup(line('Air Liquide', { quoteSymbol: 'AI.PA' }), pea, 'markets')).toEqual({ group: 'europe', reason: 'listing' })
  })
  test('no suffix → us', () => {
    expect(suggestGroup(line('Apple', { quoteSymbol: 'AAPL' }), pea, 'markets')).toEqual({ group: 'us', reason: 'listing' })
  })
  test('any other suffix → not guessed', () => {
    for (const symbol of ['NOVO-B.CO', 'VOLV-B.ST', '7203.T', '0P0000XYZ.F', 'SHOP.TO']) {
      expect(suggestGroup(line('Titre', { quoteSymbol: symbol }), pea, 'markets')).toBeNull()
    }
  })
  test('no symbol → not guessed', () => {
    expect(suggestGroup(line('Air Liquide'), pea, 'markets')).toBeNull()
  })
})

describe('suggestGroup: secured', () => {
  test('life insurance amount line → euro-fund, by account', () => {
    expect(suggestGroup(line('Fonds euros', { kind: 'amount' }), lifeInsurance, 'secured')).toEqual({ group: 'euro-fund', reason: 'account' })
  })
  test('PER amount line → euro-fund, by account', () => {
    expect(suggestGroup(line('Fonds euros', { kind: 'amount' }), per, 'secured')).toEqual({ group: 'euro-fund', reason: 'account' })
  })
  test('a precise name beats the account', () => {
    expect(suggestGroup(line('Fonds monétaire', { kind: 'amount' }), lifeInsurance, 'secured')).toEqual({ group: 'money-market', reason: 'name' })
    expect(suggestGroup(line('Fonds obligataire', { kind: 'amount' }), lifeInsurance, 'secured')).toEqual({ group: 'bonds', reason: 'name' })
  })
})

describe('suggestGroup: other category ignored', () => {
  test('a money-market name in markets → null', () => {
    expect(suggestGroup(line('Fonds monétaire'), pea, 'markets')).toBeNull()
  })
})

describe('suggestGroup: not guessed', () => {
  test.each(['Cap Immo 518 Villa', 'Robot-Advisor', 'OpenAI', 'PEA Profil offensif Select C', 'Le Fourgon 9% 2026'])('%s', (name) => {
    expect(suggestGroup(line(name), pea, 'markets')).toBeNull()
  })
})

describe('copy', () => {
  test('words', () => {
    expect(REASON_WORDS).toEqual({
      index: 'deviné d’après son indice',
      name: 'deviné d’après son nom',
      account: 'deviné d’après son type de compte',
      listing: 'deviné d’après sa place de cotation',
    })
    expect(UNGUESSED).toBe('ne se devine pas')
  })
})
