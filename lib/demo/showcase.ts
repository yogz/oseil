// The wealth of the dev accounts « demo », « manu » and « nico » (`npm run demo:reset`): an invented
// person followed for two years, one relevé at the end of each month from October 2024 to October 2026,
// made to show everything Oseil can do. Every category, both pockets of Immobilier with their loans,
// a line in dollars, crypto and gold kept at home, a locked employee savings, a placement slow to get
// back, totals paid in, a livret opened and one closed along the way, two goals (the second with a
// cushion in months), a budget, and two gaps on purpose for « À compléter » (a fund with no purchase
// price and no price to follow).
//
// Never randomness: the figures come from fixed rules, the same at every reset. Never imported by the
// site: only the demo reset (e2e/comptes.demo.spec.ts) and its test read it.
import type { ExportInput } from '@/lib/transfer/export'
import type { Account, Establishment, GoalAllocation, IsoDate, Line, Profile, Settings, Snapshot, SnapshotEntry } from '@/lib/model/types'

const MONTHS = 25

// The last day of the month `index` months after October 2024.
function monthEnd(index: number): IsoDate {
  return new Date(Date.UTC(2024, 10 + index, 0)).toISOString().slice(0, 10)
}

const wave = (i: number, amplitude: number, period: number, phase = 0) => amplitude * Math.sin((2 * Math.PI * i) / period + phase)
const cents = (euros: number) => Math.round(euros * 100)
const price = (value: number) => Math.round(value * 100) / 100
const count = (value: number) => Math.round(value * 10_000) / 10_000

const establishments: Establishment[] = [
  { id: 'e-bourso', name: 'BoursoBank', kind: 'institution', catalogId: 'boursobank' },
  { id: 'e-ca', name: 'Crédit Agricole', kind: 'institution', catalogId: 'credit-agricole' },
  { id: 'e-fortuneo', name: 'Fortuneo', kind: 'institution', catalogId: 'fortuneo' },
  { id: 'e-tr', name: 'Trade Republic', kind: 'institution', catalogId: 'trade-republic' },
  { id: 'e-linxea', name: 'Linxea', kind: 'institution', catalogId: 'linxea' },
  { id: 'e-yomoni', name: 'Yomoni', kind: 'institution', catalogId: 'yomoni' },
  { id: 'e-amundi', name: 'Amundi Épargne Salariale', kind: 'institution', catalogId: 'amundi-epargne-salariale' },
  { id: 'e-coinbase', name: 'Coinbase', kind: 'institution', catalogId: 'coinbase' },
  // A platform typed by hand, outside the catalogue.
  { id: 'e-crowd', name: 'Financement participatif', kind: 'institution' },
  { id: 'e-home', name: 'Chez toi', kind: 'home' },
]

const accounts: Account[] = [
  { id: 'a-current', establishmentId: 'e-bourso', type: 'current', name: 'Compte courant' },
  { id: 'a-livret-a', establishmentId: 'e-bourso', type: 'livret-a', name: 'Livret A' },
  { id: 'a-ldds', establishmentId: 'e-bourso', type: 'ldds', name: 'LDDS' },
  { id: 'a-joint', establishmentId: 'e-ca', type: 'current', name: 'Compte joint' },
  { id: 'a-lep', establishmentId: 'e-ca', type: 'lep', name: 'LEP' },
  { id: 'a-pel', establishmentId: 'e-ca', type: 'pel-cel', name: 'PEL' },
  { id: 'a-livret-jeune', establishmentId: 'e-ca', type: 'livret-jeune', name: 'Livret jeune' },
  { id: 'a-loan-home', establishmentId: 'e-ca', type: 'loan', name: 'Prêt de l’appartement', financedLineId: 'l-home' },
  { id: 'a-loan-studio', establishmentId: 'e-ca', type: 'loan', name: 'Prêt du studio', financedLineId: 'l-studio' },
  { id: 'a-pea', establishmentId: 'e-fortuneo', type: 'pea', name: 'PEA' },
  { id: 'a-cto', establishmentId: 'e-tr', type: 'securities', name: 'Compte-titres' },
  { id: 'a-av', establishmentId: 'e-linxea', type: 'life-insurance', name: 'Assurance vie' },
  { id: 'a-per', establishmentId: 'e-yomoni', type: 'per', name: 'PER', unlockOn: '2049-01-01' },
  { id: 'a-pee', establishmentId: 'e-amundi', type: 'employee-savings', name: 'PEE', unlockOn: '2029-06-30' },
  { id: 'a-crypto', establishmentId: 'e-coinbase', type: 'crypto', name: 'Crypto' },
  { id: 'a-crowd', establishmentId: 'e-crowd', type: 'other', name: 'Prêts aux PME', slow: true },
  { id: 'a-gold', establishmentId: 'e-home', type: 'gold', name: 'Or' },
  { id: 'a-home', establishmentId: 'e-home', type: 'home', name: 'Mon appartement' },
  { id: 'a-studio', establishmentId: 'e-home', type: 'home', name: 'Studio à Lyon', residence: 'rental' },
]

const lines: Line[] = [
  { id: 'l-current', accountId: 'a-current', name: 'Compte courant', kind: 'amount', currency: 'EUR' },
  { id: 'l-livret-a', accountId: 'a-livret-a', name: 'Livret A', kind: 'amount', currency: 'EUR' },
  { id: 'l-ldds', accountId: 'a-ldds', name: 'LDDS', kind: 'amount', currency: 'EUR' },
  { id: 'l-joint', accountId: 'a-joint', name: 'Compte joint', kind: 'amount', currency: 'EUR' },
  { id: 'l-lep', accountId: 'a-lep', name: 'LEP', kind: 'amount', currency: 'EUR' },
  { id: 'l-pel', accountId: 'a-pel', name: 'PEL', kind: 'amount', currency: 'EUR' },
  { id: 'l-livret-jeune', accountId: 'a-livret-jeune', name: 'Livret jeune', kind: 'amount', currency: 'EUR', closedOn: '2025-09-15' },
  { id: 'l-loan-home', accountId: 'a-loan-home', name: 'Prêt de l’appartement', kind: 'amount', currency: 'EUR' },
  { id: 'l-loan-studio', accountId: 'a-loan-studio', name: 'Prêt du studio', kind: 'amount', currency: 'EUR' },
  { id: 'l-world', accountId: 'a-pea', name: 'Amundi MSCI World', kind: 'units', currency: 'EUR', group: 'world', quoteSymbol: 'CW8.PA' },
  { id: 'l-europe', accountId: 'a-pea', name: 'Amundi Stoxx Europe 600', kind: 'units', currency: 'EUR', group: 'europe', quoteSymbol: 'MEUD.PA' },
  { id: 'l-apple', accountId: 'a-cto', name: 'Apple', kind: 'units', currency: 'USD', group: 'us', quoteSymbol: 'AAPL' },
  { id: 'l-euro-fund', accountId: 'a-av', name: 'Fonds euros', kind: 'amount', currency: 'EUR', group: 'euro-fund' },
  // The two gaps of « À compléter »: no purchase price, no price to follow.
  { id: 'l-patrimoine', accountId: 'a-av', name: 'Carmignac Patrimoine', kind: 'units', currency: 'EUR', group: 'world' },
  { id: 'l-per', accountId: 'a-per', name: 'Gestion pilotée', kind: 'units', currency: 'EUR', group: 'world' },
  { id: 'l-pee', accountId: 'a-pee', name: 'Amundi Actions Monde', kind: 'units', currency: 'EUR', group: 'world' },
  { id: 'l-btc', accountId: 'a-crypto', name: 'Bitcoin', kind: 'units', currency: 'EUR', quoteSymbol: 'BTC-EUR' },
  { id: 'l-eth', accountId: 'a-crypto', name: 'Ethereum', kind: 'units', currency: 'EUR', quoteSymbol: 'ETH-EUR' },
  { id: 'l-crowd', accountId: 'a-crowd', name: 'Prêts aux PME', kind: 'amount', currency: 'EUR', category: 'markets', group: 'unlisted' },
  { id: 'l-gold', accountId: 'a-gold', name: 'Napoléons', kind: 'units', currency: 'EUR' },
  { id: 'l-home', accountId: 'a-home', name: 'Mon appartement', kind: 'amount', currency: 'EUR' },
  { id: 'l-studio', accountId: 'a-studio', name: 'Studio à Lyon', kind: 'amount', currency: 'EUR' },
]

export const showcaseProfile = (): Profile => ({
  schema: 1,
  establishments: structuredClone(establishments),
  accounts: structuredClone(accounts),
  lines: structuredClone(lines),
  firstLaunch: { planned: [], finished: establishments.map((e) => e.id), complete: true },
})

// A position bought month after month: its units and the average price they cost.
type Position = { units: number; cost: number }
const buy = (position: Position, units: number, unitPrice: number): Position => ({
  units: position.units + units,
  cost: position.cost + units * unitPrice,
})
const average = (position: Position) => price(position.cost / position.units)

export const showcaseSnapshots = (): Snapshot[] => {
  const snapshots: Snapshot[] = []
  let world: Position = { units: 20, cost: 20 * 455 }
  let per: Position = { units: 100, cost: 10_000 }
  let pee: Position = { units: 50, cost: 50 * 29 }
  let peePaid = 1_450
  let perPaid = 10_000

  for (let i = 0; i < MONTHS; i++) {
    const on = monthEnd(i)
    const amount = (lineId: string, euros: number): SnapshotEntry => ({ lineId, kind: 'amount', amount: cents(euros), seenOn: on })
    const units = (lineId: string, held: number, unitPrice: number, averagePrice: number | null): SnapshotEntry => ({
      lineId,
      kind: 'units',
      units: count(held),
      unitPrice: price(unitPrice),
      averagePrice,
      seenOn: on,
    })

    const worldPrice = 520 * (1 + (0.08 * i) / 12) + wave(i, 25, 5)
    if (i > 0 && i % 2 === 0) world = buy(world, 1, worldPrice)
    const perPrice = 105 * (1 + (0.06 * i) / 12) + wave(i, 2, 5)
    if (i > 0) {
      per = buy(per, 150 / perPrice, perPrice)
      perPaid += 150
    }
    const peePrice = 32 * (1 + (0.07 * i) / 12) + wave(i, 1.2, 5)
    // The profit-sharing of May, put in the PEE.
    if (monthEnd(i).slice(5, 7) === '05') {
      pee = buy(pee, 15, peePrice)
      peePaid += 15 * peePrice
    }

    const entries: SnapshotEntry[] = [
      amount('l-current', 3_200 + wave(i, 900, 3) + wave(i, 300, 7, 1)),
      amount('l-livret-a', Math.min(22_950, 15_000 + 330 * i)),
      amount('l-joint', 1_800 + wave(i, 600, 4, 2)),
      amount('l-lep', Math.min(10_000, 6_000 + 180 * i)),
      amount('l-pel', 18_000 * (1 + (0.0175 * i) / 12)),
      units('l-world', world.units, worldPrice, average(world)),
      units('l-europe', 40, 245 * (1 + (0.05 * i) / 12) + wave(i, 10, 6, 1), 215),
      units('l-apple', 12, 228 + 2 * i + wave(i, 14, 4), 172.4),
      amount('l-euro-fund', 25_000 * (1 + (0.025 * i) / 12) + 100 * i),
      units('l-patrimoine', 30 + 0.15 * i, 680 * (1 + (0.04 * i) / 12) + wave(i, 15, 6), null),
      units('l-per', per.units, perPrice, average(per)),
      units('l-pee', pee.units, peePrice, average(pee)),
      units('l-btc', 0.08, 62_000 + 1_500 * i + wave(i, 9_000, 7), 41_000),
      amount('l-crowd', 3_000 + 60 * i),
      units('l-gold', 6, 480 + 9 * i + wave(i, 12, 5), 410),
      amount('l-home', 320_000 + 5_000 * Math.floor(i / 12)),
      amount('l-loan-home', 212_000 - 640 * i),
      amount('l-studio', 142_000 + 3_000 * Math.floor(i / 12)),
      amount('l-loan-studio', 96_000 - 410 * i),
    ]
    const arrivals: Snapshot['arrivals'] = {}
    // The LDDS opened in March 2025, Ethereum bought in June 2025, the livret jeune closed in September 2025.
    if (i >= 5) entries.push(amount('l-ldds', Math.min(12_000, 4_000 + 400 * (i - 5))))
    if (i === 5) arrivals['l-ldds'] = 'opened'
    if (i >= 8) entries.push(units('l-eth', 1.5, 2_400 + 30 * i + wave(i, 500, 5), 2_300))
    if (i === 8) arrivals['l-eth'] = 'opened'
    if (i <= 10) entries.push(amount('l-livret-jeune', 1_600 + 2 * i))

    snapshots.push({
      schema: 1,
      takenOn: on,
      fx: { USD: Math.round((0.95 - 0.004 * i + wave(i, 0.01, 6)) * 10_000) / 10_000 },
      entries,
      contributions: {},
      paidTotals: { 'a-av': cents(24_000 + 200 * i), 'a-per': cents(perPaid), 'a-pee': cents(peePaid) },
      arrivals,
    })
  }
  return snapshots
}

export const showcaseGoals = (): GoalAllocation[] => [
  { schema: 1, validFrom: '2024-10-01', shares: { available: 10, secured: 30, markets: 45, gold: 5, rental: 10 } },
  // From 2026, the available money is a cushion of six months of the budget.
  { schema: 1, validFrom: '2026-01-01', shares: { available: 0, secured: 30, markets: 50, gold: 5, rental: 15 }, cushionMonths: 6 },
]

export const showcaseSettings = (): Settings => ({
  schema: 1,
  budget: { basis: 'expenses', monthly: cents(2_800) },
  display: 'euros',
  hideAmounts: false,
})

export const showcaseInput = (): ExportInput => ({
  profile: showcaseProfile(),
  snapshots: showcaseSnapshots(),
  goals: showcaseGoals(),
  settings: showcaseSettings(),
  unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0 },
})
