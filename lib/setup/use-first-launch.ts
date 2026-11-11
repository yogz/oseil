'use client'

// Saves the first launch at every step, so nothing is lost if the person leaves.
// `apply` computes the new draft, saves the profile then the snapshot, and only
// then shows the result. Saves are chained: a second change waits for the first
// to learn the documents' ids (the database holds one profile per person, a
// second insert would be refused). A failure is returned and shown, never
// swallowed, and the last saved draft stays.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useModel, type Model } from '@/lib/app/use-model'
import { todayIso } from '@/lib/dates'
import { InvalidDocumentError, saveProfile, saveSnapshot } from '@/lib/model/repository'
import { clearLeftovers, isVaultEmpty } from '@/lib/transfer/save-import'
import { emptySnapshot, reconcile, type SetupDraft } from './first-launch'

export const SAVE_FAILED = 'Ça n’a pas été enregistré. Vérifie ta connexion et réessaie.'
export const INVALID = 'Cette étape n’a pas pu être enregistrée\u00A0: une donnée n’est pas valable.'
export const UNREADABLE = 'Une partie de tes chiffres n’a pas pu être lue\u00A0: rien ne sera enregistré tant que ce n’est pas réglé.'

// `leftovers`: the vault is empty (isVaultEmpty), so whatever relevés, goals or drafts it holds
// were left by an import cut short; they are deleted before the first write of this launch.
// Two tabs at once (a manual launch here, an import there) are not guarded: each clears only
// the leftovers it read. Rare enough to leave unguarded; this note says it is known.
type Saved = { draft: SetupDraft | null; profileId?: string; snapshotId?: string; leftovers?: boolean }

type Common = {
  draft: SetupDraft | null
  apply: (change: (draft: SetupDraft | null) => SetupDraft) => Promise<boolean>
  saveError: string | null
}

// `retry` exists only where it helps: in `ready`, a reload would not re-sync the saved draft.
export type FirstLaunch =
  | (Common & { status: 'loading' | 'ready' })
  | (Common & { status: 'blocked' | 'failed'; retry: () => void })

function startingPoint(model: Model): Saved {
  // An empty vault starts from nothing but its profile (none, or the placeholder of an import):
  // a leftover relevé is never the base of a manual first launch.
  if (isVaultEmpty(model)) {
    if (!model.profile) return { draft: null, leftovers: true }
    return {
      draft: reconcile({ profile: model.profile.value, snapshot: emptySnapshot(todayIso()) }),
      profileId: model.profile.id,
      leftovers: true,
    }
  }
  if (!model.profile) return { draft: null }
  const latest = model.snapshots[model.snapshots.length - 1]
  return {
    draft: reconcile({
      profile: model.profile.value,
      snapshot: latest ? latest.value : emptySnapshot(todayIso()),
    }),
    profileId: model.profile.id,
    snapshotId: latest?.id,
  }
}

export function useFirstLaunch(): FirstLaunch {
  const state = useModel()
  const ready = state.status === 'ready' ? state : null
  const model = ready?.model
  const start = useMemo(() => (model ? startingPoint(model) : null), [model])

  // What has really been saved so far; null until the person's first change.
  const [shown, setShown] = useState<SetupDraft | null | undefined>(undefined)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saved = useRef<Saved | null>(null)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const cleared = useRef(false)
  const latest = useRef({ ready, start })
  useEffect(() => {
    latest.current = { ready, start }
  })

  const apply = useCallback((change: (draft: SetupDraft | null) => SetupDraft): Promise<boolean> => {
    const run = async (): Promise<boolean> => {
      const { ready: model, start: initial } = latest.current
      if (!model || !initial) return false
      const { unreadable } = model.model
      if (unreadable.snapshots > 0 || unreadable.profile > 0) return false

      const before = saved.current ?? initial
      let next: SetupDraft
      try {
        next = reconcile(change(before.draft))
      } catch (error) {
        console.error(error)
        setSaveError(INVALID)
        return false
      }
      let profileId = before.profileId
      let snapshotId = before.snapshotId
      try {
        // Once per launch, before its first write: a failed clean-up writes nothing and is tried again.
        if (initial.leftovers && !cleared.current) {
          await clearLeftovers(model.client, model.model)
          cleared.current = true
        }
        profileId = await saveProfile(model.client, model.dataKey, next.profile, profileId)
        saved.current = { ...before, profileId }
        snapshotId = await saveSnapshot(model.client, model.dataKey, next.snapshot, snapshotId)
      } catch (error) {
        if (error instanceof InvalidDocumentError) console.error(error)
        setSaveError(error instanceof InvalidDocumentError ? INVALID : SAVE_FAILED)
        return false
      }
      saved.current = { draft: next, profileId, snapshotId }
      setShown(next)
      setSaveError(null)
      return true
    }
    const result = queue.current.then(run, run)
    queue.current = result
    return result
  }, [])

  if (state.status === 'loading') return { status: 'loading', draft: null, apply, saveError }
  if (state.status === 'failed' || state.status === 'unavailable') {
    return { status: 'failed', retry: state.retry, draft: null, apply, saveError }
  }
  if (!ready || !start) return { status: 'failed', retry: () => {}, draft: null, apply, saveError }
  const { unreadable } = ready.model
  const blocked = unreadable.snapshots > 0 || unreadable.profile > 0
  const draft = shown === undefined ? start.draft : shown
  if (blocked) return { status: 'blocked', retry: ready.reload, draft, apply, saveError }
  return { status: 'ready', draft, apply, saveError }
}
