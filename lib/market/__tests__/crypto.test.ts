import { describe, expect, test } from 'vitest'
import { fitsAccount, symbolsToTry } from '../crypto'
import type { SecurityMatch } from '../types'

const BTC: SecurityMatch = { symbol: 'BTC-USD', name: 'Bitcoin', exchange: '', kind: 'crypto' }
const AIRBUS: SecurityMatch = { symbol: 'AIR.PA', name: 'Airbus', exchange: 'Paris', kind: 'action' }

describe('symbolsToTry', () => {
  test('a coin quoted in another currency tries the line’s currency first, then the one found', () => {
    expect(symbolsToTry(BTC, 'EUR')).toEqual(['BTC-EUR', 'BTC-USD'])
    expect(symbolsToTry({ ...BTC, symbol: 'USDE29470-USD' }, 'EUR')).toEqual(['USDE29470-EUR', 'USDE29470-USD'])
  })

  test('a coin already in the line’s currency, or a share, is tried as found', () => {
    expect(symbolsToTry({ ...BTC, symbol: 'BTC-EUR' }, 'EUR')).toEqual(['BTC-EUR'])
    expect(symbolsToTry(BTC, 'USD')).toEqual(['BTC-USD'])
    expect(symbolsToTry(AIRBUS, 'USD')).toEqual(['AIR.PA'])
  })

  test('a coin symbol without a currency is tried as found', () => {
    expect(symbolsToTry({ ...BTC, symbol: 'BTC' }, 'EUR')).toEqual(['BTC'])
  })
})

describe('fitsAccount', () => {
  test('a crypto account shows only coins; any other account, never a coin', () => {
    expect(fitsAccount(BTC, 'crypto')).toBe(true)
    expect(fitsAccount(AIRBUS, 'crypto')).toBe(false)
    expect(fitsAccount(BTC, 'pea')).toBe(false)
    expect(fitsAccount(AIRBUS, 'pea')).toBe(true)
    expect(fitsAccount({ ...AIRBUS, kind: 'ETF' }, 'securities')).toBe(true)
  })
})
