export type Cents = number
export type IsoDate = string
export type CurrencyCode = string // ISO 4217, 'EUR' by default
export type CategoryId = 'available' | 'secured' | 'markets' | 'gold' | 'property'
// The chapter of a line inside « Épargne sécurisée » or « Placements en bourse ».
export type GroupId = 'euro-fund' | 'money-market' | 'bonds' | 'europe' | 'us' | 'japan' | 'emerging' | 'world' | 'unlisted' | 'unknown'
// A goal key: the four categories that are not property, then the rental homes (shown in the
// property colour). Not a subset of CategoryId: a rental is property in the grid.
export type GoalCategory = Exclude<CategoryId, 'property'> | 'rental'
// The type of a home; absent means 'main'.
export type Residence = 'main' | 'secondary' | 'rental'
export type AccountTypeId =
  | 'current' | 'livret-a' | 'ldds' | 'lep' | 'livret-jeune' | 'pel-cel' | 'other-savings'
  | 'life-insurance' | 'pea' | 'pea-pme' | 'securities' | 'per' | 'employee-savings'
  | 'home' | 'gold' | 'crypto' | 'loan' | 'other'

export type Establishment = {
  id: string
  name: string
  kind: 'institution' | 'home'
  catalogId?: string
}

export type Account = {
  id: string
  establishmentId: string
  type: AccountTypeId
  name: string
  unlockOn?: IsoDate
  financedLineId?: string // loan: the property line it finances
  slow?: true // cannot be got back within a few weeks: unlisted shares, a locked placement
  residence?: Residence // home only; absent: main residence
}

// A line is never removed from the profile: it is closed (closedOn), so older
// snapshots keep their names. Except « Supprimer, saisi par erreur » (lot 4c),
// which first removes it from every snapshot.
export type Line = {
  id: string
  accountId: string
  name: string
  kind: 'amount' | 'units'
  currency: CurrencyCode
  category?: CategoryId // the person's choice
  group?: GroupId // absent: never ranged
  quoteSymbol?: string
  closedOn?: IsoDate
  // A line in another currency: the rate of its purchases typed by the person (« 1 € = 1,20 $ »), or its
  // average price said to be in euros already. Absent: the rate comes from the snapshots
  // (lib/model/purchase-cost.ts, docs/superpowers/specs/2026-11-11-change-a-l-achat-design.md).
  purchase?: { perEuro: number } | { inEuros: true }
  // Quick or slow to get back, this line's own answer, which wins over its account's `slow`. Absent: the
  // account's (docs/superpowers/specs/2026-11-11-tout-corriger-depuis-la-fiche-design.md).
  slow?: boolean
}

// Progress of the first launch, kept in the profile so it can be resumed.
export type FirstLaunch = {
  planned: string[] // ids of OUTSIDE_BANKS the person said they have; also accepts the legacy ids (LEGACY_OUTSIDE_IDS)
  finished: string[] // ids of establishments already filled in
  complete: boolean
}

export type Profile = {
  schema: 1
  establishments: Establishment[]
  accounts: Account[]
  lines: Line[]
  firstLaunch?: FirstLaunch
}

export type SnapshotEntry =
  | { lineId: string; kind: 'amount'; amount: Cents; seenOn: IsoDate } // loan: what is still owed, positive
  | {
      lineId: string
      kind: 'units'
      units: number
      unitPrice: number
      averagePrice: number | null
      seenOn: IsoDate
    }

export type Arrival = 'opened' | 'existing'

export type Snapshot = {
  schema: 1
  takenOn: IsoDate
  fx: Record<CurrencyCode, number>
  entries: SnapshotEntry[]
  contributions: Record<string, Cents> // per account, in euros
  arrivals: Record<string, Arrival> // per new line
}

export type StepStatus = 'done' | 'skipped'

// The monthly update in progress, saved as it is typed. Holds only what changed
// since the snapshot it starts from; never a total.
export type UpdateDraft = {
  schema: 1
  basedOn: string // id of the snapshot document the update starts from
  values: SnapshotEntry[] // typed values, one per line (base or added); seenOn = the day typed
  confirmed: string[] // line ids confirmed unchanged
  progress: Record<string, StepStatus> // per establishment id
  contributions: Record<string, Cents> // per account id, paid in since the base snapshot; negative = taken out
  // `establishments`: a bank or « Chez toi » added during the update; absent in a draft that added none.
  added: { accounts: Account[]; lines: Line[]; establishments?: Establishment[] }
  arrivals: Record<string, Arrival> // per added account id, or per line added to an existing account
  closed: string[] // base line ids closed during the update
  takenOn: IsoDate | null // chosen on the result screen; null: the day it is saved
}

export type GoalShares = Record<GoalCategory, number> // totals 100
// `cushionMonths`: the goal of the available money as months of the budget, its share then 0 and the
// other four totalling 100 (docs/superpowers/specs/2026-11-11-coussin-objectif-design.md). Absent: every
// goal is a percent, as before.
export type GoalAllocation = { schema: 1; validFrom: IsoDate; shares: GoalShares; cushionMonths?: number }
export type Budget = { basis: 'expenses' | 'salary'; monthly: Cents }
export type Settings = {
  schema: 1
  budget: Budget | null
  display: 'euros' | 'percent'
  hideAmounts: boolean
  // « Ta grille : sans chez toi » (docs/superpowers/specs/2026-11-12-grille-sans-chez-toi-design.md); absent:
  // everything counted, as before. Only ever true.
  withoutHome?: true
}
