// Writes one change to the profile for « Tes titres », and nothing else (never a snapshot).
// The screen's model may be older than the database (another tab, another device, an update
// begun since): the profile is read again just before, and the change is applied to THAT one,
// so a line added by an update is never lost. The version guard of lot 4a protects drafts, not
// the profile, so a running update is refused here instead of being raced (decision 5).

import type { SupabaseClient } from '@supabase/supabase-js'
import { readForCorrection } from '@/lib/correct/save'
import { saveProfile } from '@/lib/model/repository'
import type { Profile } from '@/lib/model/types'

export type TitlesSave = 'saved' | 'update-running' | 'unreadable'

/** Throws when a read or the write fails, or when `change` refuses the profile as it is now. */
export async function saveTitleChange(
  client: SupabaseClient,
  dataKey: CryptoKey,
  change: (profile: Profile) => Profile,
): Promise<TitlesSave> {
  const state = await readForCorrection(client, dataKey)
  if (typeof state === 'string') return state
  await saveProfile(client, dataKey, change(state.profile.value), state.profile.id)
  return 'saved'
}
