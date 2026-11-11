import type { Account, Line, Profile, Snapshot, SnapshotEntry } from '@/lib/model/types'

export const exampleProfile: Profile = {
  schema: 1,
  establishments: [
    { id: 'boursobank', name: 'BoursoBank', kind: 'institution', catalogId: 'boursobank' },
    { id: 'linxea', name: 'Linxea', kind: 'institution' },
    { id: 'home', name: 'Chez toi', kind: 'home' },
  ],
  accounts: [
    { id: 'current', establishmentId: 'boursobank', type: 'current', name: 'Compte courant' },
    { id: 'livret-a', establishmentId: 'boursobank', type: 'livret-a', name: 'Livret A' },
    { id: 'pea', establishmentId: 'boursobank', type: 'pea', name: 'PEA' },
    { id: 'life', establishmentId: 'linxea', type: 'life-insurance', name: 'Assurance-vie' },
    { id: 'house', establishmentId: 'home', type: 'home', name: 'Maison' },
    { id: 'mortgage', establishmentId: 'home', type: 'loan', name: 'Crédit', financedLineId: 'house-line' },
    { id: 'gold', establishmentId: 'home', type: 'gold', name: 'Or' },
  ],
  lines: [
    { id: 'current-line', accountId: 'current', name: 'Compte courant', kind: 'amount', currency: 'EUR' },
    { id: 'livret-a-line', accountId: 'livret-a', name: 'Livret A', kind: 'amount', currency: 'EUR' },
    { id: 'etf', accountId: 'pea', name: 'ETF', kind: 'units', currency: 'EUR' },
    { id: 'euro-fund', accountId: 'life', name: 'Fonds euros', kind: 'amount', currency: 'EUR' },
    { id: 'life-uc', accountId: 'life', name: 'Unité de compte', kind: 'units', currency: 'EUR' },
    { id: 'house-line', accountId: 'house', name: 'Maison', kind: 'amount', currency: 'EUR' },
    { id: 'mortgage-line', accountId: 'mortgage', name: 'Crédit', kind: 'amount', currency: 'EUR' },
    { id: 'gold-line', accountId: 'gold', name: 'Or', kind: 'amount', currency: 'EUR' },
  ],
}

export const amountEntry = (lineId: string, euros: number, seenOn = '2026-09-30'): SnapshotEntry => ({
  lineId,
  kind: 'amount',
  amount: Math.round(euros * 100),
  seenOn,
})

export const unitsEntry = (
  lineId: string,
  units: number,
  unitPrice: number,
  averagePrice: number | null,
  seenOn = '2026-09-30',
): SnapshotEntry => ({ lineId, kind: 'units', units, unitPrice, averagePrice, seenOn })

export const exampleSnapshot: Snapshot = {
  schema: 1,
  takenOn: '2026-09-30',
  fx: {},
  entries: [
    amountEntry('current-line', 8_000),
    amountEntry('livret-a-line', 12_000),
    unitsEntry('etf', 100, 250, 200),
    amountEntry('euro-fund', 30_000),
    unitsEntry('life-uc', 10, 500, 450),
    amountEntry('house-line', 300_000),
    amountEntry('mortgage-line', 180_000),
    amountEntry('gold-line', 2_000),
  ],
  contributions: {},
  arrivals: {},
}

// Small builders for tests that need their own profile or snapshot.
export const account = (id: string, type: Account['type'], extra: Partial<Account> = {}): Account => ({
  id,
  establishmentId: 'e',
  type,
  name: id,
  ...extra,
})

export const line = (id: string, accountId: string, extra: Partial<Line> = {}): Line => ({
  id,
  accountId,
  name: id,
  kind: 'amount',
  currency: 'EUR',
  ...extra,
})

export const profileOf = (accounts: Account[], lines: Line[]): Profile => ({
  schema: 1,
  establishments: [{ id: 'e', name: 'e', kind: 'institution' }],
  accounts,
  lines,
})

export const snapshotOf = (entries: SnapshotEntry[], fx: Snapshot['fx'] = {}): Snapshot => ({
  schema: 1,
  takenOn: '2026-09-30',
  fx,
  entries,
  contributions: {},
  arrivals: {},
})
