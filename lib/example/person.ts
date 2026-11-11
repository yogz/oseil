// The person of the example (spec of the landing, « L’exemple »): invented, written here once and
// for all, shown to anyone at /exemple. Nothing is read nor saved: the pages compute their views
// from this model with the same pure functions as the real screens.
//
// 100 000 € at the latest snapshot, one square = 1 000 €, split 12 / 23 / 30 / 5 / 30; names that
// cannot be mistaken for anyone's; no stock symbol, so no price is ever asked for; four snapshots
// over a year, so the evolution has a curve; goals, so the gaps to them show.
// When Mon argent changes, the example does not follow by itself: it is updated here, by hand.

import type { Model } from '@/lib/app/use-model'
import type { GoalAllocation, IsoDate, Profile, Settings, Snapshot, SnapshotEntry } from '@/lib/model/types'

// The day the example is seen from, whatever the real date: its figures never age.
export const EXAMPLE_TODAY: IsoDate = '2026-11-10'

const UPDATED_AT = '2026-11-01T00:00:00Z'

const PROFILE: Profile = {
  schema: 1,
  establishments: [
    { id: 'banque', name: 'Banque Exemple', kind: 'institution' },
    { id: 'assureur', name: 'Assureur Exemple', kind: 'institution' },
    { id: 'chez-soi', name: 'Chez soi', kind: 'home' },
  ],
  accounts: [
    { id: 'courant', establishmentId: 'banque', type: 'current', name: 'Compte courant d’exemple' },
    { id: 'livret', establishmentId: 'banque', type: 'livret-a', name: 'Livret d’exemple' },
    { id: 'pea', establishmentId: 'banque', type: 'pea', name: 'PEA d’exemple' },
    { id: 'assurance-vie', establishmentId: 'assureur', type: 'life-insurance', name: 'Assurance-vie d’exemple' },
    { id: 'or', establishmentId: 'chez-soi', type: 'gold', name: 'Or d’exemple' },
    { id: 'appartement', establishmentId: 'chez-soi', type: 'home', name: 'Appartement d’exemple' },
    {
      id: 'credit',
      establishmentId: 'banque',
      type: 'loan',
      name: 'Crédit d’exemple',
      financedLineId: 'appartement-ligne',
    },
  ],
  lines: [
    { id: 'courant-ligne', accountId: 'courant', name: 'Compte courant d’exemple', kind: 'amount', currency: 'EUR' },
    { id: 'livret-ligne', accountId: 'livret', name: 'Livret d’exemple', kind: 'amount', currency: 'EUR' },
    { id: 'fonds-monde', accountId: 'pea', name: 'Fonds monde (exemple)', kind: 'units', currency: 'EUR', group: 'world' },
    // Bought at the last snapshot: one fund down since its purchase, one typed as an amount (no purchase
    // price), so the stock-market detail shows a gain, a loss and an unknown.
    { id: 'fonds-europe', accountId: 'pea', name: 'Fonds Europe (exemple)', kind: 'units', currency: 'EUR', group: 'europe' },
    { id: 'fonds-usa', accountId: 'pea', name: 'Fonds États-Unis (exemple)', kind: 'amount', currency: 'EUR', group: 'us' },
    {
      id: 'fonds-euros',
      accountId: 'assurance-vie',
      name: 'Fonds en euros (exemple)',
      kind: 'amount',
      currency: 'EUR',
      group: 'euro-fund',
    },
    { id: 'or-ligne', accountId: 'or', name: 'Or d’exemple', kind: 'amount', currency: 'EUR' },
    { id: 'appartement-ligne', accountId: 'appartement', name: 'Appartement d’exemple', kind: 'amount', currency: 'EUR' },
    { id: 'credit-ligne', accountId: 'credit', name: 'Crédit d’exemple', kind: 'amount', currency: 'EUR' },
  ],
  firstLaunch: { planned: [], finished: ['banque', 'assureur', 'chez-soi'], complete: true },
}

const euros = (value: number) => Math.round(value * 100)

// One snapshot: its day, then each line in euros (the fund in parts, at a price per part), and what
// was paid in since the one before, per account.
function snapshot(
  takenOn: IsoDate,
  figures: {
    courant: number
    livret: number
    fondsEuros: number
    parts: number
    partPrice: number
    averagePrice: number
    or: number
    appartement: number
    credit: number
  },
  contributions: Record<string, number> = {},
  more: SnapshotEntry[] = [],
): Snapshot {
  const amount = (lineId: string, value: number): SnapshotEntry => ({ lineId, kind: 'amount', amount: euros(value), seenOn: takenOn })
  return {
    schema: 1,
    takenOn,
    fx: {},
    entries: [
      amount('courant-ligne', figures.courant),
      amount('livret-ligne', figures.livret),
      {
        lineId: 'fonds-monde',
        kind: 'units',
        units: figures.parts,
        unitPrice: figures.partPrice,
        averagePrice: figures.averagePrice,
        seenOn: takenOn,
      },
      amount('fonds-euros', figures.fondsEuros),
      amount('or-ligne', figures.or),
      amount('appartement-ligne', figures.appartement),
      amount('credit-ligne', figures.credit),
      ...more,
    ],
    contributions: Object.fromEntries(Object.entries(contributions).map(([account, value]) => [account, euros(value)])),
    arrivals: {},
  }
}

// Net: 75 000 €, 85 340 €, 94 000 €, then 100 000 € (4 000 + 8 000 + 23 000 + 30 000 + 5 000 + 180 000 − 150 000).
// The story of her goals (Nicolas, 10 November 2026): 12 squares out of place at the start, 14 in March as
// the livret piles up, then in July she rebalances, about 11 000 € taken out of the livret for 45 parts of
// the world fund and 3 000 € more on her life insurance, and only 2 are; 4 by October. Written as money
// taken out of one account and paid into the others, the move adds nothing to her effort.
// At the last one the 30 000 € of the PEA are 90 parts of the world fund at 250 € (22 500 €, bought at 213 €:
// a gain), 50 parts of the Europe fund at 100 € (5 000 €, bought at 110 €: a loss) and 2 500 € of the US fund
// typed as an amount (no purchase price: unknown).
const SNAPSHOTS: Snapshot[] = [
  snapshot('2025-11-30', {
    courant: 3_000,
    livret: 13_000,
    fondsEuros: 17_000,
    parts: 80,
    partPrice: 215,
    averagePrice: 200,
    or: 4_300,
    appartement: 178_000,
    credit: 157_500,
  }),
  snapshot(
    '2026-03-31',
    { courant: 3_800, livret: 16_340, fondsEuros: 18_200, parts: 80, partPrice: 230, averagePrice: 200, or: 4_600, appartement: 179_000, credit: 155_000 },
    { livret: 1_500, 'assurance-vie': 1_000, pea: 1_800 },
  ),
  // The rebalancing: 11 200 € out of the livret; 3 700 € into the life insurance (3 000 € of them from the
  // livret); 45 parts bought on the PEA at 240 € (10 800 €).
  snapshot(
    '2026-07-31',
    { courant: 4_500, livret: 5_100, fondsEuros: 22_100, parts: 125, partPrice: 240, averagePrice: 213, or: 4_800, appartement: 180_000, credit: 152_500 },
    { livret: -11_200, 'assurance-vie': 3_700, pea: 10_800 },
  ),
  snapshot(
    '2026-10-31',
    { courant: 4_000, livret: 8_000, fondsEuros: 23_000, parts: 90, partPrice: 250, averagePrice: 213, or: 5_000, appartement: 180_000, credit: 150_000 },
    { livret: 700, 'assurance-vie': 800, pea: 1_200 },
    [
      { lineId: 'fonds-europe', kind: 'units', units: 50, unitPrice: 100, averagePrice: 110, seenOn: '2026-10-31' },
      { lineId: 'fonds-usa', kind: 'amount', amount: euros(2_500), seenOn: '2026-10-31' },
    ],
  ),
]

const GOALS: GoalAllocation = {
  schema: 1,
  validFrom: '2025-11-30',
  // Her own split, close to the examples the first launch offers.
  shares: { available: 15, secured: 35, markets: 45, gold: 5, rental: 0 },
}

const SETTINGS: Settings = {
  schema: 1,
  budget: { basis: 'expenses', monthly: euros(2_500) },
  display: 'euros',
  hideAmounts: false,
}

// A fresh copy each time: a screen that changed what it was given would not change the next one's.
export function examplePerson(): Model {
  return structuredClone({
    profile: { id: 'exemple-profil', value: PROFILE, updatedAt: UPDATED_AT },
    snapshots: SNAPSHOTS.map((value, i) => ({ id: `exemple-releve-${i + 1}`, value, updatedAt: UPDATED_AT })),
    goals: [{ id: 'exemple-objectifs', value: GOALS, updatedAt: UPDATED_AT }],
    settings: { id: 'exemple-reglages', value: SETTINGS, updatedAt: UPDATED_AT },
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
  })
}
