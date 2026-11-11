'use client'

// Reads the five documents of the model once the vault is open, for a screen.
// A read that fails (network) is "failed" and offers to try again; a document
// that opens but cannot be read is counted in `unreadable`, so the screen says
// so instead of showing an empty answer.
//
// A screen that comes after another one draws at once the model the tab read
// last for the same person (lib/app/session-memory.ts), then reads it again in
// the background, with a key the vault has checked again; that reading
// replaces what is shown. If it fails, the remembered model stays on screen.

import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import { setAmountsHidden } from '@/lib/format'
import { loadModelDocuments, type Loaded } from '@/lib/model/repository'
import type { GoalAllocation, Profile, Settings, Snapshot, UpdateDraft } from '@/lib/model/types'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import { useVault } from '@/lib/vault/use-vault'
import { modelMark, rememberModel, rememberedModel, type RememberedModel } from './session-memory'

export type Model = {
  profile: Loaded<Profile> | null
  snapshots: Loaded<Snapshot>[]
  goals: Loaded<GoalAllocation>[]
  settings: Loaded<Settings> | null
  draft: Loaded<UpdateDraft> | null
  unreadable: { profile: number; snapshots: number; goals: number; settings: number; draft: number }
}

export type ModelState =
  | { status: 'loading' }
  | { status: 'unavailable'; retry: () => void }
  | { status: 'failed'; retry: () => void }
  | { status: 'ready'; model: Model; client: SupabaseClient; dataKey: CryptoKey; reload: () => void }

type Loading = RememberedModel | 'failed' | null

export function useModel(): ModelState {
  const vault = useVault()
  const userId = vault.status === 'ready' ? vault.userId : null
  // Read only with a key the vault has checked again, never one it only remembers.
  const dataKey = vault.status === 'ready' && !vault.recalled ? vault.dataKey : null
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loading>(() => (userId ? rememberedModel(userId) : null))

  useEffect(() => {
    if (!dataKey || !userId) return
    let cancelled = false
    const mark = modelMark()
    const client = createBrowserSupabase()
    loadModelDocuments(client, dataKey).then(
      ({ profile, snapshots, goals, settings, draft }) => {
        if (cancelled) return
        const read: RememberedModel = {
          userId,
          client,
          model: {
            profile: profile.profile,
            snapshots: snapshots.snapshots,
            goals: goals.goals,
            settings: settings.settings,
            draft: draft.draft,
            unreadable: {
              profile: profile.unreadable,
              snapshots: snapshots.unreadable,
              goals: goals.unreadable,
              settings: settings.unreadable,
              draft: draft.unreadable,
            },
          },
        }
        rememberModel(read, mark)
        setLoaded(read)
      },
      () => {
        if (cancelled) return
        // The remembered model stays on screen when the reading behind it fails.
        // Once the screen has asked again (after a write, or to retry), a failure
        // is said, as it is without a memory.
        setLoaded((shown) =>
          attempt === 0 && shown !== null && shown !== 'failed' && shown.userId === userId ? shown : 'failed',
        )
      },
    )
    return () => {
      cancelled = true
    }
  }, [dataKey, userId, attempt])

  // Re-reads in place: what is on screen stays until the new reading arrives.
  const reload = useCallback(() => setAttempt((count) => count + 1), [])
  const retry = useCallback(() => {
    setLoaded(null)
    setAttempt((count) => count + 1)
  }, [])

  if (vault.status === 'unavailable') return { status: 'unavailable', retry: vault.retry }
  if (vault.status === 'loading' || loaded === null) return { status: 'loading' }
  if (loaded === 'failed') return { status: 'failed', retry }
  // Never one person's model for another: a vault that answers for someone else waits for their own.
  if (loaded.userId !== vault.userId) return { status: 'loading' }
  // Before any screen formats an amount from this model. Settings that cannot be read hide
  // the amounts as a precaution: the choice may have been « masquer ».
  setAmountsHidden((loaded.model.settings?.value.hideAmounts ?? false) || loaded.model.unreadable.settings > 0)
  return { status: 'ready', model: loaded.model, client: loaded.client, dataKey: vault.dataKey, reload }
}
