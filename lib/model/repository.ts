// Reads and writes the model as sealed documents. The only file of lib/model/
// that talks to the vault; the parsers it uses stay pure in documents.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { forgetModel } from '@/lib/app/session-memory'
import {
  deleteDocument,
  deleteDrafts,
  insertDocument,
  listDocumentIds,
  loadDocuments,
  readDocumentVersion,
  saveDocument,
  saveDocumentIfUnchanged,
  signedInUserId,
  type DocumentKind,
} from '@/lib/vault/store'
import {
  parseGoalAllocation,
  parseProfile,
  parseSettings,
  parseSnapshot,
  parseUpdateDraft,
} from './documents'
import type { GoalAllocation, Profile, Settings, Snapshot, UpdateDraft } from './types'

// Another device wrote the document since this one read it (see saveDraft, createDraft).
export { DocumentChangedError } from '@/lib/vault/store'

// Thrown before sealing: a value the loaders would refuse must never be stored
// (for the profile and settings, it could not be replaced afterwards).
export class InvalidDocumentError extends Error {
  constructor(readonly kind: DocumentKind) {
    super(`The ${kind} document is not valid and was not saved`)
    this.name = 'InvalidDocumentError'
  }
}

function checked<T>(kind: DocumentKind, parse: (value: unknown) => T | null, value: T): T {
  if (parse(value) === null) throw new InvalidDocumentError(kind)
  return value
}

export type Loaded<T> = { id: string; value: T; updatedAt: string; createdAt?: string }

// Every write forgets the model the tab remembers between screens
// (lib/app/session-memory.ts), as it begins and again as it ends, whatever its
// outcome: the next screen reads afresh, never what this write replaced, and a
// reading made while it was under way is not kept either.
async function writing<T>(write: () => Promise<T>): Promise<T> {
  forgetModel()
  try {
    return await write()
  } finally {
    forgetModel()
  }
}

// A document that opens but is not the expected shape counts as unreadable,
// exactly like one that does not open.
async function loadAll<T>(
  client: SupabaseClient,
  dataKey: CryptoKey,
  kind: DocumentKind,
  parse: (value: unknown) => T | null,
  userId?: string,
): Promise<{ items: Loaded<T>[]; unreadable: number }> {
  const { documents, unreadable } = await loadDocuments<unknown>(client, dataKey, kind, userId)
  const items: Loaded<T>[] = []
  let malformed = 0
  for (const document of documents) {
    const value = parse(document.value)
    if (value === null) malformed += 1
    else items.push({ id: document.id, value, updatedAt: document.updatedAt, createdAt: document.createdAt })
  }
  return { items, unreadable: unreadable.length + malformed }
}

// Profile and settings: the database holds at most one of each per person.
// When nothing is readable but `unreadable > 0`, the result is `null` and that
// does NOT mean "no profile yet": the caller must not create one (the database
// would refuse a second, 23505) and should say the data cannot be read.
export async function loadProfile(client: SupabaseClient, dataKey: CryptoKey, userId?: string) {
  const { items, unreadable } = await loadAll(client, dataKey, 'profile', parseProfile, userId)
  return { profile: items[0] ?? null, unreadable }
}

export async function saveProfile(client: SupabaseClient, dataKey: CryptoKey, profile: Profile, id?: string) {
  return writing(() => saveDocument(client, dataKey, { kind: 'profile', id, value: checked('profile', parseProfile, profile) }))
}

// Oldest first; snapshots taken the same day keep their storage order.
export async function loadSnapshots(client: SupabaseClient, dataKey: CryptoKey, userId?: string) {
  const { items, unreadable } = await loadAll(client, dataKey, 'snapshot', parseSnapshot, userId)
  const snapshots = [...items].sort((a, b) =>
    a.value.takenOn < b.value.takenOn ? -1 : a.value.takenOn > b.value.takenOn ? 1 : 0,
  )
  return { snapshots, unreadable }
}

export async function saveSnapshot(client: SupabaseClient, dataKey: CryptoKey, snapshot: Snapshot, id?: string) {
  return writing(() => saveDocument(client, dataKey, { kind: 'snapshot', id, value: checked('snapshot', parseSnapshot, snapshot) }))
}

export async function loadGoals(client: SupabaseClient, dataKey: CryptoKey, userId?: string) {
  const { items, unreadable } = await loadAll(client, dataKey, 'goals', parseGoalAllocation, userId)
  return { goals: items, unreadable }
}

// Always inserts: an allocation is never overwritten, a new one starts on its date.
export async function addGoal(client: SupabaseClient, dataKey: CryptoKey, goal: GoalAllocation) {
  return writing(() => saveDocument(client, dataKey, { kind: 'goals', value: checked('goals', parseGoalAllocation, goal) }))
}

// Same caveat as loadProfile: `settings: null` with `unreadable > 0` is not "no settings yet".
export async function loadSettings(client: SupabaseClient, dataKey: CryptoKey, userId?: string) {
  const { items, unreadable } = await loadAll(client, dataKey, 'settings', parseSettings, userId)
  return { settings: items[0] ?? null, unreadable }
}

export async function saveSettings(client: SupabaseClient, dataKey: CryptoKey, settings: Settings, id?: string) {
  return writing(() => saveDocument(client, dataKey, { kind: 'settings', id, value: checked('settings', parseSettings, settings) }))
}

// The update in progress: the database holds at most one draft per person.
// Same caveat as loadProfile: `draft: null` with `unreadable > 0` is not "no
// draft"; the caller must not write a second one (23505).
export async function loadDraft(client: SupabaseClient, dataKey: CryptoKey, userId?: string) {
  const { items, unreadable } = await loadAll(client, dataKey, 'draft', parseUpdateDraft, userId)
  return { draft: items[0] ?? null, unreadable }
}

// Every kind a screen needs, with one question to the server about who is signed in
// (five, one per kind, made the opening of Mon argent wait on a phone).
export async function loadModelDocuments(client: SupabaseClient, dataKey: CryptoKey) {
  const userId = await signedInUserId(client)
  const [profile, snapshots, goals, settings, draft] = await Promise.all([
    loadProfile(client, dataKey, userId),
    loadSnapshots(client, dataKey, userId),
    loadGoals(client, dataKey, userId),
    loadSettings(client, dataKey, userId),
    loadDraft(client, dataKey, userId),
  ])
  return { profile, snapshots, goals, settings, draft }
}

// Written only over the version this tab last read or wrote (or the one a lost answer may
// have left): another device's newer draft is never overwritten, DocumentChangedError instead.
export async function saveDraft(
  client: SupabaseClient,
  dataKey: CryptoKey,
  draft: UpdateDraft,
  guard: { id: string; versions: string[]; version: string },
) {
  return writing(() =>
    saveDocumentIfUnchanged(client, dataKey, { kind: 'draft', ...guard, value: checked('draft', parseUpdateDraft, draft) }),
  )
}

export async function deleteDraft(client: SupabaseClient, id: string) {
  return writing(() => deleteDocument(client, 'draft', id))
}

// Erases the person's draft rows without their id, for a draft that cannot be read.
export async function deleteAllDrafts(client: SupabaseClient) {
  return writing(() => deleteDrafts(client))
}

// Removes one snapshot or goal allocation (what a failed import may leave behind). The
// profile and the settings, one per person, are written over, never deleted: refused here
// at run time too, whatever the caller's types say.
export async function deleteDocumentOf(client: SupabaseClient, kind: 'snapshot' | 'goals', id: string) {
  if (kind !== 'snapshot' && kind !== 'goals') throw new Error(`A ${String(kind)} document is never deleted here`)
  return writing(() => deleteDocument(client, kind, id))
}

// Inserts under an id drawn by the caller and kept across retries: a lost answer
// then cannot leave a second row behind (see insertDocument).
export async function addSnapshot(client: SupabaseClient, dataKey: CryptoKey, snapshot: Snapshot, id: string) {
  return writing(() => insertDocument(client, dataKey, { kind: 'snapshot', id, value: checked('snapshot', parseSnapshot, snapshot) }))
}

// Created with its version: a retry after a lost answer meets its own row (left under one
// of `versions`), and a draft another device started in the meantime (one per person) is
// DocumentChangedError.
export async function createDraft(
  client: SupabaseClient,
  dataKey: CryptoKey,
  draft: UpdateDraft,
  id: string,
  guard: { versions: string[]; version: string },
) {
  return writing(() =>
    insertDocument(client, dataKey, { kind: 'draft', id, ...guard, value: checked('draft', parseUpdateDraft, draft) }),
  )
}

// What « Enregistrer » checks first: the ids of the snapshots and of the draft, no content.
// The profile row as the database holds it now, to refuse a write over a profile changed since.
export function profileVersion(client: SupabaseClient) {
  return readDocumentVersion(client, 'profile')
}

export async function listUpdateDocuments(client: SupabaseClient) {
  return listDocumentIds(client, ['snapshot', 'draft'])
}
