// A complete wealth, used by the export, import and round-trip tests (and the e2e fixture,
// generated from `exportSheets(fixtureInput())`). Every case the file must carry is here:
// two banks and « Chez toi », a loan financing the house, an assurance-vie with a fund in
// units and a fonds euros, a line in dollars, a closed line, a line seen earlier than its
// relevé, two relevés on the same day, two accounts (and two lines) of the same name in one
// bank, an account with no line, a bank with no account, a bank typed by hand (no catalogId),
// the « Épargne salariale » establishment, contributions paid in and taken out,
// a total paid in beside a contribution and a total alone on a securities account,
// two goals, settings that are not the default.
import type { GoalAllocation, Profile, Settings, Snapshot } from '@/lib/model/types'
import type { ExportInput } from '../export'

export const fixtureProfile = (): Profile => ({
  schema: 1,
  establishments: [
    { id: 'e-bourso', name: 'BoursoBank', kind: 'institution', catalogId: 'boursobank' },
    { id: 'e-ca', name: 'Crédit Agricole', kind: 'institution', catalogId: 'credit-agricole' },
    // A bank with no account yet.
    { id: 'e-fortuneo', name: 'Fortuneo', kind: 'institution', catalogId: 'fortuneo' },
    // A bank typed by hand, outside the catalogue: no catalogId.
    { id: 'e-local', name: 'Banque du coin', kind: 'institution' },
    // The establishment the first launch creates for employee savings.
    { id: 'e-es', name: 'Épargne salariale', kind: 'institution', catalogId: 'employee-savings' },
    { id: 'e-home', name: 'Chez toi', kind: 'home' },
  ],
  accounts: [
    { id: 'a-current', establishmentId: 'e-bourso', type: 'current', name: 'Compte courant' },
    { id: 'a-livret1', establishmentId: 'e-bourso', type: 'livret-a', name: 'Livret' },
    { id: 'a-livret2', establishmentId: 'e-bourso', type: 'other-savings', name: 'Livret' },
    { id: 'a-cto', establishmentId: 'e-bourso', type: 'securities', name: 'Compte-titres', slow: true },
    // An account with no line yet.
    { id: 'a-pea', establishmentId: 'e-bourso', type: 'pea', name: 'PEA', unlockOn: '2029-05-01' },
    { id: 'a-av', establishmentId: 'e-ca', type: 'life-insurance', name: 'Assurance-vie', unlockOn: '2027-03-01' },
    { id: 'a-loan', establishmentId: 'e-ca', type: 'loan', name: 'Prêt immobilier', financedLineId: 'l-home' },
    { id: 'a-local', establishmentId: 'e-local', type: 'current', name: 'Compte joint' },
    { id: 'a-pee', establishmentId: 'e-es', type: 'employee-savings', name: 'PEE' },
    { id: 'a-home', establishmentId: 'e-home', type: 'home', name: 'Ma maison' },
  ],
  lines: [
    { id: 'l-current', accountId: 'a-current', name: 'Compte courant', kind: 'amount', currency: 'EUR' },
    { id: 'l-livret1', accountId: 'a-livret1', name: 'Livret', kind: 'amount', currency: 'EUR' },
    { id: 'l-livret2', accountId: 'a-livret2', name: 'Livret', kind: 'amount', currency: 'EUR' },
    { id: 'l-usd', accountId: 'a-cto', name: 'Apple', kind: 'units', currency: 'USD', category: 'markets', group: 'us', quoteSymbol: 'AAPL' },
    { id: 'l-closed', accountId: 'a-cto', name: 'Ancienne action', kind: 'units', currency: 'EUR', closedOn: '2026-10-01' },
    { id: 'l-fund', accountId: 'a-av', name: 'Fonds monde', kind: 'units', currency: 'EUR', group: 'world', quoteSymbol: 'CW8.PA' },
    { id: 'l-euro', accountId: 'a-av', name: 'Fonds euros', kind: 'amount', currency: 'EUR', group: 'euro-fund' },
    { id: 'l-loan', accountId: 'a-loan', name: 'Prêt immobilier', kind: 'amount', currency: 'EUR' },
    // In no relevé yet: the site allows it.
    { id: 'l-local', accountId: 'a-local', name: 'Compte joint', kind: 'amount', currency: 'EUR' },
    { id: 'l-pee', accountId: 'a-pee', name: 'Fonds actions', kind: 'units', currency: 'EUR' },
    { id: 'l-home', accountId: 'a-home', name: 'Ma maison', kind: 'amount', currency: 'EUR' },
  ],
  firstLaunch: { planned: [], finished: ['e-bourso', 'e-ca', 'e-local', 'e-es', 'e-home'], complete: true },
})

const amount = (lineId: string, cents: number, seenOn: string) => ({ lineId, kind: 'amount' as const, amount: cents, seenOn })
const units = (lineId: string, count: number, unitPrice: number, averagePrice: number | null, seenOn: string) => ({
  lineId,
  kind: 'units' as const,
  units: count,
  unitPrice,
  averagePrice,
  seenOn,
})

export const fixtureSnapshots = (): Snapshot[] => [
  {
    schema: 1,
    takenOn: '2026-09-30',
    fx: { USD: 0.92 },
    entries: [
      amount('l-current', 245050, '2026-09-30'),
      amount('l-livret1', 1200000, '2026-09-30'),
      units('l-usd', 10, 225.5, 180.25, '2026-09-30'),
      units('l-closed', 3, 41.2, null, '2026-09-30'),
      units('l-fund', 12.3456, 512.37, 480, '2026-09-30'),
      amount('l-euro', 3000000, '2026-09-30'),
      amount('l-loan', 18000000, '2026-09-30'),
      amount('l-home', 32000000, '2026-09-30'),
    ],
    contributions: { 'a-av': 50000 },
    arrivals: {},
  },
  {
    schema: 1,
    takenOn: '2026-10-31',
    fx: { USD: 0.93 },
    entries: [
      amount('l-current', 198000, '2026-10-31'),
      amount('l-livret1', 1210000, '2026-10-31'),
      amount('l-livret2', 500000, '2026-10-31'),
      units('l-usd', 10, 230, 180.25, '2026-10-31'),
      units('l-fund', 12.3456, 520.01, 480, '2026-10-31'),
      amount('l-euro', 2985000, '2026-10-15'),
      amount('l-loan', 17900000, '2026-10-31'),
      amount('l-home', 32000000, '2026-10-31'),
    ],
    contributions: { 'a-av': -20000, 'a-cto': 0 },
    // A total beside a contribution, on one row of « Versements ».
    paidTotals: { 'a-av': 3100000 },
    arrivals: { 'l-livret2': 'opened' },
  },
  {
    schema: 1,
    takenOn: '2026-10-31',
    fx: { USD: 0.93 },
    entries: [
      amount('l-current', 198000, '2026-10-31'),
      amount('l-livret1', 1210000, '2026-10-31'),
      amount('l-livret2', 500000, '2026-10-31'),
      units('l-usd', 10, 230, 180.25, '2026-10-31'),
      units('l-fund', 12.3456, 520.01, 480, '2026-10-31'),
      amount('l-euro', 2990000, '2026-10-31'),
      amount('l-loan', 17900000, '2026-10-31'),
      amount('l-home', 32500000, '2026-10-31'),
    ],
    contributions: {},
    // A total alone, on an account at its cost basis.
    paidTotals: { 'a-cto': 400000 },
    arrivals: { 'l-current': 'existing' },
  },
]

export const fixtureGoals = (): GoalAllocation[] => [
  { schema: 1, validFrom: '2026-01-01', shares: { available: 15, secured: 35, markets: 45, gold: 5, rental: 0 } },
  { schema: 1, validFrom: '2026-10-01', shares: { available: 20, secured: 60, markets: 15, gold: 5, rental: 0 } },
]

export const fixtureSettings = (): Settings => ({
  schema: 1,
  budget: { basis: 'salary', monthly: 350000 },
  display: 'percent',
  hideAmounts: true,
})

export const fixtureInput = (): ExportInput => ({
  profile: fixtureProfile(),
  snapshots: fixtureSnapshots(),
  goals: fixtureGoals(),
  settings: fixtureSettings(),
  unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0 },
})
