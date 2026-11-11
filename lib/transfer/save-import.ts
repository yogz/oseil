// Saves an imported file into an empty vault, all or nothing as the person sees it.
//
// Nothing of an import shows until its profile is written: while the profile has no
// establishment, Mon argent shows the first launch (monArgentView), whatever snapshots,
// goals or settings are stored. So the profile is written last, over its own id, and a
// failure before it deletes what this call wrote. After the profile write starts, nothing is
// undone: its answer may be lost while it is written, and deleting then could leave a profile
// with no relevés.
//
// The profile and the settings (one per person) are never deleted, only written over by
// their id. What may be deleted is limited to snapshots, goals and drafts, and only in a
// vault that is empty (isVaultEmpty): those are leftovers of an import that failed.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Model } from '@/lib/app/use-model'
import {
  addGoal,
  addSnapshot,
  deleteAllDrafts,
  deleteDocumentOf,
  saveProfile,
  saveSettings,
} from '@/lib/model/repository'
import type { Profile } from '@/lib/model/types'
import type { ImportedData } from './import'

// Written first when there is no profile yet, to have its id: it has no establishment, so the
// vault stays empty (and the first launch shows) until the imported profile replaces it.
export const EMPTY_PROFILE: Profile = {
  schema: 1,
  establishments: [],
  accounts: [],
  lines: [],
  firstLaunch: { planned: [], finished: [], complete: false },
}

export class VaultNotEmptyError extends Error {
  constructor() {
    super('The vault is not empty: nothing was imported or deleted')
    this.name = 'VaultNotEmptyError'
  }
}

// Empty: no profile at all, or a profile with no bank whose first launch is recorded and not
// complete (the same test as monArgentView's first-launch); no document that cannot be read
// (it could be anything). A profile with no `firstLaunch` counts as complete, as Mon argent
// reads it: an older profile whose last bank was removed keeps its relevés.
export function isVaultEmpty(model: Model): boolean {
  const { profile, unreadable } = model
  const firstLaunch = profile?.value.firstLaunch
  const noProfile =
    profile === null
      ? unreadable.profile === 0
      : profile.value.establishments.length === 0 && firstLaunch !== undefined && firstLaunch.complete === false
  const nothingUnreadable =
    unreadable.profile === 0 &&
    unreadable.snapshots === 0 &&
    unreadable.goals === 0 &&
    unreadable.settings === 0 &&
    unreadable.draft === 0
  return noProfile && nothingUnreadable
}

// Deletes the snapshots, goals and drafts a failed import may have left, one after the
// other. Refused (nothing deleted) unless the vault is empty.
export async function clearLeftovers(client: SupabaseClient, model: Model): Promise<void> {
  if (!isVaultEmpty(model)) throw new VaultNotEmptyError()
  for (const snapshot of model.snapshots) await deleteDocumentOf(client, 'snapshot', snapshot.id)
  for (const goal of model.goals) await deleteDocumentOf(client, 'goals', goal.id)
  await deleteAllDrafts(client)
}

export async function saveImport(
  client: SupabaseClient,
  dataKey: CryptoKey,
  model: Model,
  data: ImportedData,
): Promise<void> {
  await clearLeftovers(client, model)

  const profileId = model.profile?.id ?? (await saveProfile(client, dataKey, EMPTY_PROFILE))

  // What this call wrote, to delete if it fails before the profile write. A snapshot is
  // listed before it is written: its answer may be lost once it is stored.
  const written: Array<{ kind: 'snapshot' | 'goals'; id: string }> = []
  try {
    await saveSettings(client, dataKey, data.settings, model.settings?.id)
    // One after the other: goals of the same day keep their order through created_at.
    for (const goal of data.goals) {
      written.push({ kind: 'goals', id: await addGoal(client, dataKey, goal) })
    }
    // Oldest first, under the ids the import drew, so a retry reuses them.
    for (const snapshot of data.snapshots) {
      written.push({ kind: 'snapshot', id: snapshot.id })
      await addSnapshot(client, dataKey, snapshot.value, snapshot.id)
    }
  } catch (error) {
    for (const document of written.reverse()) {
      try {
        await deleteDocumentOf(client, document.kind, document.id)
      } catch (cleanUpError) {
        console.error('Could not delete a document of the failed import', cleanUpError)
      }
    }
    throw error
  }

  await saveProfile(client, dataKey, data.profile, profileId)
}
