import type { Cents, Profile, Snapshot } from '@/lib/model/types'

export type StoredSnapshot = { id: string; value: Snapshot } // oldest first, as loadSnapshots orders them
export type Write = { kind: 'profile'; value: Profile } | { kind: 'snapshot'; id: string; value: Snapshot }
// 'update-running': the plan would write the base of an update in progress, found running at save.
export type Refusal = 'only-line' | 'too-early' | 'in-the-future' | 'not-held' | 'not-allowed' | 'no-rate' | 'update-running'
export type Planned = { writes: Write[] } | { refused: Refusal }
export type Figures =
  | { kind: 'amount'; amount: Cents }
  | { kind: 'units'; units: number; unitPrice: number; averagePrice: number | null }
