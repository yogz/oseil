'use client'

// The monthly update, tied to the database: loads the draft, saves it at every
// change, then writes the new profile and snapshot. Writes are chained (a second
// change waits for the id the first one got: the database holds one draft per
// person). A failure is returned and shown, never swallowed. A change whose write
// fails stays on screen, unsaved: the draft is written whole, so the next write
// carries it. Opening the update writes nothing: the draft row is created at the
// first change.
//
// Another device may carry on the same update (« reprendre le lendemain sur un autre
// appareil »). This tab never writes over its work: each draft write is accepted only
// while the row still carries the version this tab last read or wrote (its
// `updated_at`), and « Enregistrer » first checks that nothing was saved elsewhere.
// Otherwise the update is in `conflict`, and the way on is to read it again.
//
// Today's prices and rates are read once, when the update opens, and live on the session:
// the bank screens show them, the result counts them, and « Enregistrer » saves them. No
// screen passes them to the save, so none can forget them (decision 7, R18).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useModel, type Model, type ModelState } from '@/lib/app/use-model'
import { todayIso } from '@/lib/dates'
import { quotedSymbols, usablePrices, type LinePrices, type UpdateMarket } from '@/lib/market/live'
import { useMarket } from '@/lib/market/use-market'
import { RATE_MISSING_SAVE } from '@/lib/market/words'
import {
  addSnapshot,
  createDraft,
  deleteAllDrafts,
  deleteDraft,
  DocumentChangedError,
  InvalidDocumentError,
  listUpdateDocuments,
  loadProfile,
  profileVersion,
  saveDraft,
  saveProfile,
  type Loaded,
} from '@/lib/model/repository'
import type { IsoDate, Profile, Snapshot, UpdateDraft } from '@/lib/model/types'
import { launchComplete } from '@/lib/setup/first-launch'
import { INVALID, SAVE_FAILED, UNREADABLE } from '@/lib/setup/use-first-launch'
import { takenOnError, takenOnRange, buildUpdate } from './build'
import { isStale, startDraft, tidyDraft, withAddedEstablishments } from './draft'

// Shown with « Recommencer », which erases: not the sentence that says nothing was erased.
export const DRAFT_RESTART = 'Ta mise à jour en cours n’a pas pu être lue sur cet appareil.'
// Shown with « Recharger » (constructeur).
export const DRAFT_MOVED = 'Ta mise à jour a avancé sur un autre appareil.'

export type UpdateSession = {
  profile: Profile
  base: Loaded<Snapshot>
  draft: UpdateDraft
  // What the update read from the market when it opened: today's price of each line attached
  // to one, and today's rates. The bank screens, the result and the save all use these.
  market: UpdateMarket
  // The lines attached to a price whose price of the day could not be had: their box keeps the base one.
  failedPrices: string[]
  // Asks the rates again, for one that was missing, never the prices: the update is loading
  // until the rates answer.
  retryMarket: () => void
  saved: boolean // a draft row of this update exists
  // Applies f and writes the draft; true once written. A refused f changes nothing; a write
  // that fails keeps the change on screen, unsaved.
  change: (f: (draft: UpdateDraft) => UpdateDraft) => Promise<boolean>
  // Writes the draft on screen as it is, applying nothing: to try again after a failed write.
  resave: () => Promise<boolean>
  // Builds the snapshot with `market`, and writes nothing while a currency has no rate at all.
  save: (today: IsoDate) => Promise<boolean>
  abandon: () => Promise<boolean>
  settled: () => Promise<boolean> // once every pending write has finished: false while a change is unsaved
  saveError: string | null
}

export type UpdateState =
  | { status: 'loading' }
  | { status: 'failed'; retry: () => void }
  | { status: 'unavailable' }
  | { status: 'blocked'; message: string; retry: () => void }
  // The draft cannot be read and its id is lost: only erasing its rows lets a new one be written.
  | { status: 'unreadable'; message: string; restart: () => Promise<boolean> }
  // Another device wrote this update since this tab read it: nothing more is written from
  // what is on screen, and `reload` reads it all again.
  | { status: 'conflict'; message: string; reload: () => void }
  | { status: 'ready'; session: UpdateSession }

// The draft on screen, whether a row of this update exists, and the row: its id (a stale
// one is written over) and its version, as this tab last read or wrote it. The draft may
// hold changes not written yet: see `unsaved`.
type Kept = { draft: UpdateDraft; saved: boolean; row?: { id: string; version: string } }

type Start = { profile: Loaded<Profile>; base: Loaded<Snapshot>; kept: Kept }

type Ready = Extract<ModelState, { status: 'ready' }>

function startingPoint(model: Model): Start | null {
  const base = model.snapshots[model.snapshots.length - 1]
  if (!model.profile || !launchComplete(model.profile.value) || !base) return null
  const row = model.draft
  const current = row !== null && !isStale(row.value, base.id)
  return {
    profile: model.profile,
    base,
    kept: {
      draft: current ? tidyDraft(model.profile.value, row.value) : startDraft(base.id),
      saved: current,
      ...(row !== null ? { row: { id: row.id, version: row.updatedAt } } : {}),
    },
  }
}

// A queued run re-checks that nothing became unreadable since it was queued.
const writable = (model: Model) => {
  const { unreadable } = model
  return unreadable.profile === 0 && unreadable.snapshots === 0
}

// How many versions of failed writes are kept for the next one to accept. The row holds the
// version of the last write that landed; for it to be dropped, that many writes in a row
// would have to fail without landing after it. The worst case is then a « conflict » that
// asks to reload, never a write over newer work.
const MAX_PENDING_VERSIONS = 20

// A version the row has never had from this tab: the clock's millisecond, never earlier
// than one after the last version this tab gave (two writes in the same millisecond, or a
// clock set back), and moved on by one while a known version already took it. Versions
// dropped from `known` are then never given again.
function freshVersion(known: string[], lastIssued: number): number {
  const taken = new Set(known.map((v) => Date.parse(v)))
  let at = Math.max(Date.now(), lastIssued + 1)
  while (taken.has(at)) at += 1
  return at
}

// The same document once stored: what JSON keeps of it, whatever the order of its keys.
function sameDocument(a: unknown, b: unknown): boolean {
  const sorted = (_key: string, value: unknown) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)))
      : value
  return JSON.stringify(a, sorted) === JSON.stringify(b, sorted)
}

// Whether the database holds anything this tab did not read or write itself: a snapshot
// saved elsewhere (the base is no longer the latest), or a draft row that is not this
// tab's own, or this tab's row gone (saved or abandoned elsewhere).
function movedElsewhere(
  found: Array<{ id: string; kind: string }>,
  model: Model,
  ownSnapshot: string | null,
  ownDraft: string | undefined,
): boolean {
  const seen = new Set(model.snapshots.map((s) => s.id))
  if (ownSnapshot !== null) seen.add(ownSnapshot)
  const drafts = found.filter((d) => d.kind === 'draft').map((d) => d.id)
  return (
    found.some((d) => d.kind === 'snapshot' && !seen.has(d.id)) ||
    drafts.some((id) => id !== ownDraft) ||
    (ownDraft !== undefined && !drafts.includes(ownDraft))
  )
}

export function useUpdate(): UpdateState {
  const state = useModel()
  const ready = state.status === 'ready' ? state : null
  const model = ready?.model
  const start = useMemo(() => (model ? startingPoint(model) : null), [model])
  // Today's prices, taken once from the first answer of the market (decision 7): every screen
  // and the save use these. Only a new reading of the model (« Recharger ») takes them again.
  const [taken, setTaken] = useState<{ from: Start; prices: LinePrices; failed: string[] } | null>(null)
  const held = taken !== null && taken.from === start ? taken : null
  // Rates always: a line added during the update may be in another currency. Once the prices
  // are taken, only the rates are asked: « Réessayer » never asks the prices again, even once
  // the tab no longer holds them.
  const symbols = useMemo(
    () => (start && held === null ? quotedSymbols(start.profile.value, start.base.value) : []),
    [start, held],
  )
  const marketState = useMarket(symbols, { rates: true })
  const read = marketState.status === 'ready' ? marketState.market : null
  if (start && read && held === null) {
    const { prices, failed } = usablePrices(start.profile.value, start.base.value, read, todayIso())
    // Whatever the reason, the box keeps the base price and says to copy the bank's.
    setTaken({ from: start, prices, failed: failed.map((f) => f.lineId) })
  }
  // The prices taken, with the rates as last read.
  const market = useMemo<UpdateMarket | null>(
    () => (held !== null && read !== null ? { prices: held.prices, rates: read.rates } : null),
    [held, read],
  )

  const [shown, setShown] = useState<Kept | undefined>(undefined)
  const [saveError, setSaveError] = useState<string | null>(null)
  // The reading in which another device's work was found. It holds until a new reading comes.
  const [movedIn, setMovedIn] = useState<Model | null>(null)
  const moved = useRef<Model | null>(null)
  const kept = useRef<Kept | null>(null)
  const finished = useRef(false)
  // Drawn once and kept across retries: an insert whose answer was lost then meets its own row.
  const snapshotId = useRef<string | null>(null)
  // The profile row's version once this tab's own profile write has landed, as the database
  // stamped it: a snapshot that failed after it is then retried, never taken for a conflict.
  const ownProfileVersion = useRef<string | null>(null)
  const draftId = useRef<string | null>(null)
  // The versions the draft writes that failed since the last one that worked may have left
  // (a lost answer can hide a write that landed): the next write accepts them all. Each
  // write gives the row a fresh version, never one of these: a device that read what a lost
  // answer left is then never accepted over newer work.
  const pendingVersions = useRef<string[]>([])
  // The millisecond of the last version this tab gave: the next one always comes after it.
  const lastIssued = useRef(0)
  // The draft on screen holds a change the last write did not save. Only a write that
  // works clears it (and the error); while it holds, settled() is false.
  const unsaved = useRef(false)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const latest = useRef({ ready, start, market })
  useEffect(() => {
    latest.current = { ready, start, market }
  })

  const enqueue = useCallback(<T,>(run: () => Promise<T>): Promise<T> => {
    const result = queue.current.then(run, run)
    queue.current = result
    return result
  }, [])

  // What a queued run may write from: a reading that is complete, and still this tab's.
  const usable = useCallback(() => {
    const { ready: current, start: initial } = latest.current
    if (!current || !initial || !writable(current.model) || moved.current === current.model) return null
    return { current, initial }
  }, [])

  const remember = useCallback((next: Kept) => {
    kept.current = next
    setShown(next)
  }, [])

  const fail = useCallback((error: unknown) => {
    const invalid = error instanceof InvalidDocumentError
    if (invalid) console.error(error)
    setSaveError(invalid ? INVALID : SAVE_FAILED)
  }, [])

  const conflict = useCallback((model: Model) => {
    moved.current = model
    setMovedIn(model)
  }, [])

  // Writes the draft on screen, whole: it carries every change not saved yet. A draft the
  // repository refuses is never kept: the screen goes back to `refused`, the one before.
  // Over a row, only while the row is still at the version this tab knows.
  const write = useCallback(
    async (current: Ready, now: Kept, refused: Kept): Promise<boolean> => {
      const known = [...(now.row !== undefined ? [now.row.version] : []), ...pendingVersions.current]
      lastIssued.current = freshVersion(known, lastIssued.current)
      const version = new Date(lastIssued.current).toISOString()
      // Its own version too: never an empty list, and nothing else can hold a fresh one.
      const versions = [...known, version]
      try {
        const id =
          now.row !== undefined
            ? await saveDraft(current.client, current.dataKey, now.draft, { id: now.row.id, versions, version })
            : await createDraft(current.client, current.dataKey, now.draft, (draftId.current ??= crypto.randomUUID()), {
                versions,
                version,
              })
        draftId.current = null
        pendingVersions.current = []
        remember({ draft: now.draft, saved: true, row: { id, version } })
      } catch (error) {
        if (error instanceof DocumentChangedError) {
          conflict(current.model)
          return false
        }
        if (error instanceof InvalidDocumentError) remember(refused)
        else {
          unsaved.current = true
          pendingVersions.current = [...pendingVersions.current, version].slice(-MAX_PENDING_VERSIONS)
        }
        fail(error)
        return false
      }
      unsaved.current = false
      setSaveError(null)
      return true
    },
    [remember, fail, conflict],
  )

  const change = useCallback(
    (f: (draft: UpdateDraft) => UpdateDraft): Promise<boolean> =>
      enqueue(async () => {
        const open = usable()
        if (!open || finished.current) return false
        const before = kept.current ?? open.initial.kept
        let next: UpdateDraft
        try {
          next = f(before.draft)
        } catch (error) {
          console.error(error)
          setSaveError(INVALID)
          return false
        }
        // On screen at once, written or not: what was typed is never shown without being kept.
        const now = { ...before, draft: next }
        remember(now)
        return write(open.current, now, before)
      }),
    [enqueue, usable, remember, write],
  )

  // Never applies anything: applying a change twice would, for one, add an account twice.
  const resave = useCallback(
    (): Promise<boolean> =>
      enqueue(async () => {
        const open = usable()
        if (!open || finished.current) return false
        if (!unsaved.current) return true
        const now = kept.current ?? open.initial.kept
        return write(open.current, now, now)
      }),
    [enqueue, usable, write],
  )

  const save = useCallback(
    (today: IsoDate): Promise<boolean> =>
      enqueue(async () => {
        const open = usable()
        if (!open) return false
        const { current, initial } = open
        if (finished.current) return true
        // The market the screens show, read here rather than given by a caller. None while
        // it is asked again: nothing is written from prices no screen has shown.
        const onScreen = latest.current.market
        if (onScreen === null) return false
        const first = kept.current ?? initial.kept
        // The day the result screen shows: today, or the base's own day when a clock behind sees it ahead.
        const takenOn = first.draft.takenOn ?? takenOnRange(initial.base.value, today).max
        const dateError = takenOnError(initial.base.value, takenOn, today)
        if (dateError !== null) {
          setSaveError(dateError)
          return false
        }
        // The draft once more, under its guard: refused if another device wrote it since.
        if ((first.row !== undefined || unsaved.current) && !(await write(current, first, first))) return false
        const before = kept.current ?? initial.kept
        try {
          // And nothing saved elsewhere: never a profile built from an older one.
          const found = await listUpdateDocuments(current.client)
          if (movedElsewhere(found, current.model, snapshotId.current, before.row?.id)) {
            conflict(current.model)
            return false
          }
          const built = buildUpdate(initial.profile.value, initial.base.value, before.draft, takenOn, onScreen)
          // The profile written below is built from the one read when the update opened: a profile
          // saved since (a title attached in another tab) would be lost under it. The row may also
          // hold this tab's own write, from an « Enregistrer » that stopped after it.
          const row = await profileVersion(current.client)
          if (row === null || row.id !== initial.profile.id) {
            conflict(current.model)
            return false
          }
          if (row.updatedAt !== initial.profile.updatedAt && row.updatedAt !== ownProfileVersion.current) {
            // A version this tab does not know. Its own write whose answer was lost holds the very
            // profile this save builds; anything else is another device's.
            const { profile } = await loadProfile(current.client, current.dataKey)
            if (profile === null || profile.id !== initial.profile.id || !sameDocument(profile.value, built.profile)) {
              conflict(current.model)
              return false
            }
          }
          // A currency with no rate at all: the snapshot could not be read back. Nothing is
          // written, and the update stays as it is (decision 11).
          if (built.rates.missing.length > 0) {
            setSaveError(RATE_MISSING_SAVE)
            return false
          }
          // The profile first: a snapshot naming lines the profile lacks would break Mon argent.
          await saveProfile(current.client, current.dataKey, built.profile, initial.profile.id)
          // The version the database stamped, read back: PostgREST writes a date its own way, so
          // this tab's clock is never compared with it.
          ownProfileVersion.current = (await profileVersion(current.client))?.updatedAt ?? null
          await addSnapshot(current.client, current.dataKey, built.snapshot, (snapshotId.current ??= crypto.randomUUID()))
        } catch (error) {
          fail(error)
          return false
        }
        finished.current = true
        snapshotId.current = null
        unsaved.current = false
        setSaveError(null)
        // A first insert whose answer was lost may have left a row under the drawn id.
        const rowId = before.row?.id ?? draftId.current ?? undefined
        if (rowId !== undefined) {
          try {
            await deleteDraft(current.client, rowId)
          } catch (error) {
            // The snapshot is saved; the stale rule hides this row.
            console.error(error)
          }
        }
        return true
      }),
    [enqueue, usable, write, fail, conflict],
  )

  const abandon = useCallback(
    (): Promise<boolean> =>
      enqueue(async () => {
        const open = usable()
        if (!open) return false
        const before = kept.current ?? open.initial.kept
        const rowId = before.row?.id ?? draftId.current ?? undefined
        if (rowId !== undefined) {
          try {
            await deleteDraft(open.current.client, rowId)
          } catch (error) {
            fail(error)
            return false
          }
        }
        draftId.current = null
        snapshotId.current = null
        pendingVersions.current = []
        unsaved.current = false
        remember({ draft: startDraft(open.initial.base.id), saved: false })
        setSaveError(null)
        return true
      }),
    [enqueue, usable, remember, fail],
  )

  const settled = useCallback(async () => {
    await queue.current.then(
      () => undefined,
      () => undefined,
    )
    return !unsaved.current
  }, [])

  // Everything this tab held of the update is dropped: the next reading starts it again.
  const forget = useCallback(() => {
    kept.current = null
    draftId.current = null
    snapshotId.current = null
    ownProfileVersion.current = null
    pendingVersions.current = []
    unsaved.current = false
    setShown(undefined)
    setSaveError(null)
  }, [])

  const reload = ready?.reload
  const restart = useCallback(
    (): Promise<boolean> =>
      enqueue(async () => {
        const { ready: current } = latest.current
        if (!current) return false
        try {
          await deleteAllDrafts(current.client)
        } catch (error) {
          fail(error)
          return false
        }
        forget()
        reload?.()
        return true
      }),
    [enqueue, fail, forget, reload],
  )

  // « Recharger »: what is on screen stays until the new reading arrives, which ends the conflict.
  const reread = useCallback(() => {
    forget()
    reload?.()
  }, [forget, reload])

  if (state.status === 'loading') return { status: 'loading' }
  if (state.status === 'failed' || state.status === 'unavailable') return { status: 'failed', retry: state.retry }
  if (!ready || !model) return { status: 'failed', retry: () => {} }
  const { unreadable } = model
  if (unreadable.profile > 0 || unreadable.snapshots > 0) {
    return { status: 'blocked', message: UNREADABLE, retry: ready.reload }
  }
  if (!start) return { status: 'unavailable' }
  if (model.draft === null && unreadable.draft > 0) {
    return { status: 'unreadable', message: DRAFT_RESTART, restart }
  }
  if (movedIn === model) return { status: 'conflict', message: DRAFT_MOVED, reload: reread }
  // Up to 8 seconds (useMarket), then whatever came: a missing price or rate is said, it never blocks here.
  if (marketState.status !== 'ready' || market === null || held === null) return { status: 'loading' }
  const view = shown ?? start.kept
  return {
    status: 'ready',
    session: {
      // With the banks added during the update: the screens find them like the others.
      profile: withAddedEstablishments(start.profile.value, view.draft),
      base: start.base,
      draft: view.draft,
      market,
      failedPrices: held.failed,
      retryMarket: marketState.retry,
      saved: view.saved,
      change,
      resave,
      save,
      abandon,
      settled,
      saveError,
    },
  }
}
