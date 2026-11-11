// The eight profiles of the review of the figures (docs/superpowers/specs/2026-11-11-revue-des-calculs-profils.md),
// written as the model Oseil reads: one Model each. The document is the source; this file only
// translates it, word for word.

import type { Model } from '@/lib/app/use-model'
import type {
  Account,
  AccountTypeId,
  GoalShares,
  IsoDate,
  Line,
  Profile,
  Residence,
  Settings,
  Snapshot,
  SnapshotEntry,
} from '@/lib/model/types'

export const TODAY: IsoDate = '2026-11-10'
const TAKEN: IsoDate = '2026-10-31'
const UPDATED_AT = '2026-11-01T00:00:00Z'

const cents = (euros: number) => Math.round(euros * 100)

type Holding =
  | { kind: 'amount'; euros: number }
  | { kind: 'units'; units: number; price: number; average: number | null }

type LineSpec = { id: string; name: string; holding: Holding; currency?: 'EUR' | 'USD'; category?: Line['category'] }
type AccountSpec = {
  id: string
  type: AccountTypeId
  name: string
  lines: LineSpec[]
  residence?: Residence
  financedLineId?: string
  slow?: true
  unlockOn?: IsoDate
}

type ProfileSpec = {
  accounts: AccountSpec[]
  budget: Settings['budget']
  goals: GoalShares
  // One snapshot per entry: its day, what each line holds then (by line id), the contributions and the rates.
  snapshots?: Array<{ takenOn: IsoDate; holdings: Record<string, Holding>; contributions?: Record<string, number> }>
  fx?: Snapshot['fx']
}

function build(spec: ProfileSpec): Model {
  const accounts: Account[] = spec.accounts.map((a) => ({
    id: a.id,
    establishmentId: 'banque',
    type: a.type,
    name: a.name,
    ...(a.residence ? { residence: a.residence } : {}),
    ...(a.financedLineId ? { financedLineId: a.financedLineId } : {}),
    ...(a.slow ? { slow: a.slow } : {}),
    ...(a.unlockOn ? { unlockOn: a.unlockOn } : {}),
  }))
  const lines: Line[] = spec.accounts.flatMap((a) =>
    a.lines.map((l) => ({
      id: l.id,
      accountId: a.id,
      name: l.name,
      kind: l.holding.kind,
      currency: l.currency ?? 'EUR',
      ...(l.category ? { category: l.category } : {}),
    })),
  )
  const profile: Profile = {
    schema: 1,
    establishments: [{ id: 'banque', name: 'Banque', kind: 'institution' }],
    accounts,
    lines,
    firstLaunch: { planned: [], finished: ['banque'], complete: true },
  } as Profile

  const entry = (lineId: string, h: Holding, takenOn: IsoDate): SnapshotEntry =>
    h.kind === 'amount'
      ? { lineId, kind: 'amount', amount: cents(h.euros), seenOn: takenOn }
      : { lineId, kind: 'units', units: h.units, unitPrice: h.price, averagePrice: h.average, seenOn: takenOn }

  const plan =
    spec.snapshots ??
    [{ takenOn: TAKEN, holdings: Object.fromEntries(spec.accounts.flatMap((a) => a.lines.map((l) => [l.id, l.holding]))) }]
  const snapshots: Snapshot[] = plan.map((s) => ({
    schema: 1,
    takenOn: s.takenOn,
    fx: spec.fx ?? {},
    entries: Object.entries(s.holdings).map(([lineId, h]) => entry(lineId, h, s.takenOn)),
    contributions: Object.fromEntries(Object.entries(s.contributions ?? {}).map(([k, v]) => [k, cents(v)])),
    arrivals: {},
  }))

  const settings: Settings = { schema: 1, budget: spec.budget, display: 'euros', hideAmounts: false }
  return {
    profile: { id: 'profil', value: profile, updatedAt: UPDATED_AT },
    snapshots: snapshots.map((value, i) => ({ id: `releve-${i + 1}`, value, updatedAt: UPDATED_AT })),
    goals: [{ id: 'objectifs', value: { schema: 1, validFrom: plan[0].takenOn, shares: spec.goals }, updatedAt: UPDATED_AT }],
    settings: { id: 'reglages', value: settings, updatedAt: UPDATED_AT },
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
  }
}

const amount = (euros: number): Holding => ({ kind: 'amount', euros })
const units = (n: number, price: number, average: number | null): Holding => ({ kind: 'units', units: n, price, average })
const expenses = (euros: number): Settings['budget'] => ({ basis: 'expenses', monthly: cents(euros) })
const shares = (available: number, secured: number, markets: number, gold: number, rental: number): GoalShares => ({
  available,
  secured,
  markets,
  gold,
  rental,
})
const single = (id: string, type: AccountTypeId, name: string, holding: Holding, extra: Partial<AccountSpec> = {}): AccountSpec => ({
  id,
  type,
  name,
  lines: [{ id: `${id}-ligne`, name, holding }],
  ...extra,
})

export const PROFILES: Record<string, () => Model> = {
  lea: () =>
    build({
      accounts: [
        single('courant', 'current', 'Compte courant', amount(1_800)),
        single('livret', 'livret-a', 'Livret A', amount(9_500)),
        { id: 'pea', type: 'pea', name: 'PEA', lines: [{ id: 'monde', name: 'Fonds monde', holding: units(12, 350, 320) }] },
      ],
      budget: expenses(1_600),
      goals: shares(10, 15, 65, 10, 0),
    }),

  martin: () =>
    build({
      accounts: [
        single('maison', 'home', 'Résidence principale', amount(320_000)),
        single('credit', 'loan', 'Crédit immobilier', amount(210_000), { financedLineId: 'maison-ligne' }),
        single('livret', 'livret-a', 'Livret A', amount(22_950)),
        single('ldds', 'ldds', 'LDDS', amount(12_000)),
        {
          id: 'av',
          type: 'life-insurance',
          name: 'Assurance-vie',
          lines: [
            { id: 'fonds-euros', name: 'Fonds en euros', holding: amount(35_000) },
            { id: 'uc', name: 'Unités de compte', holding: units(72, 250, 230) },
          ],
        },
        single('pea', 'pea', 'PEA', amount(25_000)),
      ],
      budget: expenses(4_200),
      goals: shares(25, 25, 45, 5, 0),
    }),

  karim: () =>
    build({
      accounts: [
        single('maison', 'home', 'Résidence principale', amount(280_000)),
        single('credit-maison', 'loan', 'Crédit de la maison', amount(90_000), { financedLineId: 'maison-ligne' }),
        single('location', 'home', 'Appartement en location', amount(190_000), { residence: 'rental' }),
        single('credit-location', 'loan', 'Crédit de l’appartement', amount(170_000), { financedLineId: 'location-ligne' }),
        {
          id: 'cto',
          type: 'securities',
          name: 'Compte-titres',
          lines: [{ id: 'us', name: 'Actions américaines', holding: units(40, 230, 180), currency: 'USD' }],
        },
        { id: 'crypto', type: 'crypto', name: 'Crypto', lines: [{ id: 'btc', name: 'Bitcoin', holding: units(0.15, 60_000, 40_000) }] },
        single('livret', 'livret-a', 'Livret A', amount(8_000)),
      ],
      fx: { USD: 1 / 1.08 },
      budget: expenses(3_500),
      goals: shares(10, 10, 40, 10, 30),
    }),

  sophie: () =>
    build({
      accounts: [
        single('maison', 'home', 'Résidence principale', amount(240_000)),
        single('credit', 'loan', 'Crédit immobilier', amount(255_000), { financedLineId: 'maison-ligne' }),
        single('livret', 'livret-a', 'Livret A', amount(3_000)),
        single('courant', 'current', 'Compte courant', amount(1_200)),
      ],
      budget: expenses(1_900),
      goals: shares(40, 45, 15, 0, 0),
    }),

  jean: () =>
    build({
      accounts: [
        single('maison', 'home', 'Résidence principale', amount(350_000)),
        {
          id: 'av',
          type: 'life-insurance',
          name: 'Assurance-vie',
          lines: [
            { id: 'fonds-euros', name: 'Fonds en euros', holding: amount(180_000) },
            { id: 'uc', name: 'Unités de compte', holding: amount(60_000), category: 'markets' },
          ],
        },
        single('or', 'gold', 'Or', amount(15_000)),
        single('livret', 'livret-a', 'Livret A', amount(22_950)),
        single('courant', 'current', 'Compte courant', amount(5_000)),
      ],
      budget: { basis: 'salary', monthly: cents(2_800) },
      goals: shares(40, 45, 15, 0, 0),
    }),

  lucie: () =>
    build({
      accounts: [
        single('courant', 'current', 'Compte courant', amount(900)),
        single('per', 'per', 'PER', amount(6_000)),
        single('epargne-salariale', 'employee-savings', 'Épargne salariale', amount(3_700), { slow: true, unlockOn: '2029-06-30' }),
        { id: 'cto', type: 'securities', name: 'Compte-titres', lines: [{ id: 'titres', name: 'Titres', holding: units(40, 40, 50) }] },
        { id: 'crypto', type: 'crypto', name: 'Crypto', lines: [{ id: 'eth', name: 'Ether', holding: units(0.8, 2_900, null) }] },
      ],
      budget: expenses(1_400),
      goals: shares(25, 25, 45, 5, 0),
    }),

  robert: () =>
    build({
      accounts: [
        single('maison', 'home', 'Résidence principale', amount(400_000)),
        single('credit-maison', 'loan', 'Crédit de la maison', amount(100_000), { financedLineId: 'maison-ligne' }),
        single('secondaire', 'home', 'Résidence secondaire', amount(150_000), { residence: 'secondary' }),
        single('location-a', 'home', 'Appartement A', amount(210_000), { residence: 'rental' }),
        single('credit-a', 'loan', 'Crédit de l’appartement A', amount(120_000), { financedLineId: 'location-a-ligne' }),
        single('location-b', 'home', 'Appartement B', amount(160_000), { residence: 'rental' }),
        single('livret', 'livret-a', 'Livret A', amount(22_950)),
        single('ldds', 'ldds', 'LDDS', amount(12_000)),
        { id: 'av', type: 'life-insurance', name: 'Assurance-vie', lines: [{ id: 'fonds-euros', name: 'Fonds en euros', holding: amount(80_000) }] },
      ],
      budget: expenses(5_500),
      goals: shares(10, 30, 20, 0, 40),
    }),

  thomas: () =>
    build({
      accounts: [
        single('courant', 'current', 'Compte courant', amount(0)),
        single('livret', 'livret-a', 'Livret A', amount(0)),
        { id: 'pea', type: 'pea', name: 'PEA', lines: [{ id: 'monde', name: 'Fonds monde', holding: units(0, 0, null) }] },
      ],
      snapshots: [
        {
          takenOn: '2025-11-30',
          holdings: { 'courant-ligne': amount(2_500), 'livret-ligne': amount(10_000), monde: units(50, 300, 280) },
        },
        {
          takenOn: '2026-03-31',
          holdings: { 'courant-ligne': amount(2_800), 'livret-ligne': amount(12_000), monde: units(60, 320, 290) },
          contributions: { livret: 2_000, pea: 3_000 },
        },
        {
          takenOn: '2026-07-31',
          holdings: { 'courant-ligne': amount(2_600), 'livret-ligne': amount(7_000), monde: units(60, 270, 290) },
          contributions: { livret: -5_000 },
        },
        {
          takenOn: '2026-10-31',
          holdings: { 'courant-ligne': amount(3_000), 'livret-ligne': amount(7_500), monde: units(70, 290, 290) },
          contributions: { livret: 500, pea: 2_900 },
        },
      ],
      budget: expenses(2_200),
      goals: shares(10, 15, 65, 10, 0),
    }),
}
