// Saves a correction (lot 4c). The screen's model may be older than the database, so the profile,
// the snapshots and the draft are read again just before writing, and the plan is applied to THAT
// state. A running update is refused rather than raced, and so is data that cannot be read; only a
// past relevé may be corrected during an update, and never into the update's base (`pastOnly`).
// A correction never creates a snapshot nor touches the draft: only existing documents, by id.

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDraft, loadProfile, loadSnapshots, saveProfile, saveSnapshot } from '@/lib/model/repository'
import type { Profile } from '@/lib/model/types'
import { isStale } from '@/lib/update/draft'
import type { Planned, Refusal, StoredSnapshot } from './types'

// `updateRunning`: only with `pastOnly`, when an update runs on the latest snapshot.
export type CorrectionState = { profile: { id: string; value: Profile }; snapshots: StoredSnapshot[]; updateRunning?: true }
export type CorrectionOutcome = 'saved' | 'update-running' | 'unreadable' | Refusal
// `pastOnly`: the correction is of a past relevé. A running update then no longer refuses it,
// as long as it writes neither the latest snapshot (the update's base) nor the profile.
export type CorrectionOptions = { pastOnly?: true }

/** Throws when a read fails. */
export async function readForCorrection(
  client: SupabaseClient,
  dataKey: CryptoKey,
  options: CorrectionOptions = {},
): Promise<CorrectionState | 'update-running' | 'unreadable'> {
  const [profile, snapshots, draft] = await Promise.all([
    loadProfile(client, dataKey),
    loadSnapshots(client, dataKey),
    loadDraft(client, dataKey),
  ])
  if (profile.profile === null || profile.unreadable > 0 || snapshots.unreadable > 0) return 'unreadable'
  const latest = snapshots.snapshots[snapshots.snapshots.length - 1]
  // An unreadable draft may be an update in progress: it is not raced either, past relevé or not.
  if (draft.unreadable > 0) return 'update-running'
  const running = draft.draft !== null && (!latest || !isStale(draft.draft.value, latest.id))
  if (running && !options.pastOnly) return 'update-running'
  const state: CorrectionState = {
    profile: { id: profile.profile.id, value: profile.profile.value },
    snapshots: snapshots.snapshots.map((s) => ({ id: s.id, value: s.value })),
  }
  return running ? { ...state, updateRunning: true } : state
}

/** Throws when a read or a write fails; the writes run in the plan's order, the first failure stops them. */
export async function saveCorrection(
  client: SupabaseClient,
  dataKey: CryptoKey,
  plan: (state: CorrectionState) => Planned,
  options: CorrectionOptions = {},
): Promise<CorrectionOutcome> {
  const state = await readForCorrection(client, dataKey, options)
  if (typeof state === 'string') return state
  const planned = plan(state)
  if ('refused' in planned) return planned.refused
  // The last guard of a running update: whatever the plan, its base is never written.
  const latestId = state.snapshots.at(-1)?.id
  if (state.updateRunning && planned.writes.some((w) => w.kind === 'profile' || w.id === latestId)) {
    return 'update-running'
  }
  for (const write of planned.writes) {
    if (write.kind === 'profile') await saveProfile(client, dataKey, write.value, state.profile.id)
    else await saveSnapshot(client, dataKey, write.value, write.id)
  }
  return 'saved'
}
