// The pure logic of the monthly update's draft: what the person typed, confirmed
// or reviewed since the snapshot the update starts from. A pre-filled box left
// untouched means « inchangé », so nothing unchanged is ever written here.
// Every function returns a new object and never touches the one it was given.
// No React, no database here.

import { NO_MARKET, type LinePrices } from '@/lib/market/live'
import { purchaseGaps } from '@/lib/model/purchase-gaps'
import { addBank, addHome } from '@/lib/settings/banks'
import { steps, withoutFinanced, type EntryInput } from '@/lib/setup/first-launch'
import type {
  Account,
  Establishment,
  IsoDate,
  Line,
  Profile,
  Snapshot,
  SnapshotEntry,
  StepStatus,
  UpdateDraft,
} from '@/lib/model/types'

export const DRAFT_UNREADABLE = 'Ta mise à jour en cours n’a pas pu être lue sur cet appareil. Rien n’a été effacé.'

export type UpdateLine = { line: Line; account: Account; added: boolean; closed: boolean }

export function startDraft(baseId: string): UpdateDraft {
  return {
    schema: 1,
    basedOn: baseId,
    values: [],
    confirmed: [],
    progress: {},
    contributions: {},
    paidTotals: {},
    added: { accounts: [], lines: [] },
    arrivals: {},
    closed: [],
    takenOn: null,
  }
}

// A draft written before the latest snapshot (another device, or a delete that failed) is ignored.
export function isStale(draft: UpdateDraft, latestSnapshotId: string): boolean {
  return draft.basedOn !== latestSnapshotId
}

// The profile as the update's screens see it: with the banks (or « Chez toi ») added during the
// update, after its own. Only `buildUpdate` writes them into the saved profile. The same object
// comes back for the same profile and the same additions, so a screen that watches the profile
// does not see it change at every render; and the profile itself while nothing is added.
const seen = new WeakMap<Establishment[], { profile: Profile; shown: Profile }>()
export function withAddedEstablishments(profile: Profile, draft: UpdateDraft): Profile {
  const added = draft.added.establishments
  if (!added || added.length === 0) return profile
  const kept = seen.get(added)
  if (kept && kept.profile === profile) return kept.shown
  const held = new Set(profile.establishments.map((e) => e.id))
  const fresh = added.filter((e) => !held.has(e.id))
  const shown = fresh.length === 0 ? profile : { ...profile, establishments: [...profile.establishments, ...fresh] }
  seen.set(added, { profile, shown })
  return shown
}

// A bank, or « Chez toi », added during the update: the same rules as in the settings (no bank
// twice, one « Chez toi » only, not « Épargne salariale »), checked against the profile and what
// the draft already added. Throws when refused.
export function addEstablishment(
  profile: Profile,
  draft: UpdateDraft,
  what: { name: string; catalogId?: string } | 'home',
  newId: () => string = () => crypto.randomUUID(),
): UpdateDraft {
  const shown = withAddedEstablishments(profile, draft)
  const next = what === 'home' ? addHome(shown, newId) : addBank(shown, what, newId)
  const added = next.establishments.at(-1) as Establishment
  return {
    ...draft,
    added: { ...draft.added, establishments: [...(draft.added.establishments ?? []), added] },
  }
}

// The establishment's accounts in profile order, then its added accounts; in each,
// its open lines, then the lines added to it. A line closed now stays, marked closed.
export function linesOf(profile: Profile, draft: UpdateDraft, establishmentId: string): UpdateLine[] {
  const closed = new Set(draft.closed)
  const accounts = [...profile.accounts, ...draft.added.accounts].filter((a) => a.establishmentId === establishmentId)
  return accounts.flatMap((account) => [
    ...profile.lines
      .filter((l) => l.accountId === account.id && l.closedOn === undefined)
      .map((line) => ({ line, account, added: false, closed: closed.has(line.id) })),
    ...draft.added.lines
      .filter((l) => l.accountId === account.id)
      .map((line) => ({ line, account, added: true, closed: false })),
  ])
}

// The box as it opens: the base snapshot's entry, at today's price for a line attached to
// its price (decision 7). The price is kept as given, its 4 decimals included: what the
// box shows is what enters the snapshot. Its date stays the base one.
export function prefilledEntry(base: Snapshot, lineId: string, prices: LinePrices = NO_MARKET.prices): SnapshotEntry | null {
  const entry = base.entries.find((e) => e.lineId === lineId)
  if (entry === undefined) return null
  if (entry.kind !== 'units' || !Object.hasOwn(prices, lineId)) return entry
  return { ...entry, unitPrice: prices[lineId] }
}

// What the box shows: the value typed, or else the box as it opens. `prices` is required:
// a box read without them would show the base price while the save takes today's.
export function currentEntry(base: Snapshot, draft: UpdateDraft, lineId: string, prices: LinePrices): SnapshotEntry | null {
  return draft.values.find((e) => e.lineId === lineId) ?? prefilledEntry(base, lineId, prices)
}

// « À compléter » in the bank update: a line that is a purchase gap of the base snapshot (the latest saved
// one), by the very rule of the gap (purchaseGaps). Its parts box then asks for that price.
export function asksPurchasePrice(profile: Profile, base: Snapshot, lineId: string): boolean {
  return purchaseGaps(profile, base).includes(lineId)
}

function sameEntry(a: EntryInput, b: SnapshotEntry): boolean {
  if (a.kind === 'amount') return b.kind === 'amount' && a.amount === b.amount
  return b.kind === 'units' && a.units === b.units && a.unitPrice === b.unitPrice && a.averagePrice === b.averagePrice
}

function refuseClosed(draft: UpdateDraft, lineId: string): void {
  if (draft.closed.includes(lineId)) throw new Error(`Line closed in this update: ${lineId}`)
}

// A value keeps the kind of the line: its base entry's, or the added line's.
function refuseOtherKind(draft: UpdateDraft, base: Snapshot, lineId: string, entry: EntryInput): void {
  const kind =
    base.entries.find((e) => e.lineId === lineId)?.kind ?? draft.added.lines.find((l) => l.id === lineId)?.kind
  if (kind !== undefined && kind !== entry.kind) {
    throw new Error(`A line of kind ${kind} cannot take a value of kind ${entry.kind}: ${lineId}`)
  }
}

function storeValue(draft: UpdateDraft, lineId: string, entry: EntryInput, today: IsoDate): UpdateDraft {
  const value = { ...entry, lineId, seenOn: today } as SnapshotEntry
  const values = draft.values.some((e) => e.lineId === lineId)
    ? draft.values.map((e) => (e.lineId === lineId ? value : e))
    : [...draft.values, value]
  return { ...draft, values, confirmed: draft.confirmed.filter((id) => id !== lineId) }
}

// The value the box opened with, typed again, is a confirmation: `values` and `confirmed`
// never share a line. With today's price in the box, the base price typed back over it is
// a value: the person read it at the bank. `prices` is required, as for currentEntry: read
// without them, today's price typed back would be a value instead of « inchangé ».
export function setValue(
  draft: UpdateDraft,
  base: Snapshot,
  lineId: string,
  entry: EntryInput,
  today: IsoDate,
  prices: LinePrices,
): UpdateDraft {
  refuseClosed(draft, lineId)
  refuseOtherKind(draft, base, lineId, entry)
  const before = prefilledEntry(base, lineId, prices)
  if (before && sameEntry(entry, before)) return confirmLine(draft, lineId)
  return storeValue(draft, lineId, entry, today)
}

// « Changer » on the house: the value is kept even when it equals the base one, so the
// estimate takes the new snapshot's date (decision 3). setValue would read it as
// « inchangé » and leave the old date; « C’est toujours ça » is confirmLine.
export function restateValue(draft: UpdateDraft, base: Snapshot, lineId: string, entry: EntryInput, today: IsoDate): UpdateDraft {
  refuseClosed(draft, lineId)
  refuseOtherKind(draft, base, lineId, entry)
  return storeValue(draft, lineId, entry, today)
}

// « Inchangé »: drops a value typed on the line. An added line is verified by being added.
export function confirmLine(draft: UpdateDraft, lineId: string): UpdateDraft {
  refuseClosed(draft, lineId)
  if (draft.added.lines.some((l) => l.id === lineId)) return { ...draft }
  return {
    ...draft,
    values: draft.values.filter((e) => e.lineId !== lineId),
    confirmed: draft.confirmed.includes(lineId) ? [...draft.confirmed] : [...draft.confirmed, lineId],
  }
}

export function markStep(draft: UpdateDraft, establishmentId: string, status: StepStatus): UpdateDraft {
  return { ...draft, progress: { ...draft.progress, [establishmentId]: status } }
}

// « Terminer ici »: every other establishment of the update with no status yet is left as it was
// (skipped); the one given, marked by the caller, and the ones already done or skipped keep theirs.
export function skipTheRest(profile: Profile, draft: UpdateDraft, exceptId: string): UpdateDraft {
  const progress = { ...draft.progress }
  for (const e of steps(profile)) {
    if (e.id !== exceptId && progress[e.id] === undefined) progress[e.id] = 'skipped'
  }
  return { ...draft, progress }
}

function accountIdsHere(profile: Profile, draft: UpdateDraft, establishmentId: string): Set<string> {
  return new Set(
    [...profile.accounts, ...draft.added.accounts].filter((a) => a.establishmentId === establishmentId).map((a) => a.id),
  )
}

// A typed value, a total paid in, an added or a closed line (or a contribution, in a draft from before
// the totals). A confirmation is no change.
export function hasChangesHere(profile: Profile, draft: UpdateDraft, establishmentId: string): boolean {
  const typed = new Set(draft.values.map((e) => e.lineId))
  if (linesOf(profile, draft, establishmentId).some((r) => r.added || r.closed || typed.has(r.line.id))) return true
  const accounts = accountIdsHere(profile, draft, establishmentId)
  // A typed 0 is an answer too.
  return [...Object.keys(draft.contributions), ...Object.keys(draft.paidTotals ?? {})].some((accountId) => accounts.has(accountId))
}

// Something was done here: a value typed, a line added or closed, a sum paid in, or a line confirmed.
// Until then the bank's main exit says « Rien n’a changé ici »; after, « Suivant ».
export function touchedHere(profile: Profile, draft: UpdateDraft, establishmentId: string): boolean {
  return (
    hasChangesHere(profile, draft, establishmentId) ||
    linesOf(profile, draft, establishmentId).some((r) => draft.confirmed.includes(r.line.id))
  )
}

// « Rien n’a changé ici »: confirms every open line not typed, and finishes the step.
export function nothingChangedHere(profile: Profile, draft: UpdateDraft, establishmentId: string): UpdateDraft {
  const typed = new Set(draft.values.map((e) => e.lineId))
  const confirmed = new Set(draft.confirmed)
  const toConfirm = linesOf(profile, draft, establishmentId)
    .filter((r) => !r.added && !r.closed && !typed.has(r.line.id) && !confirmed.has(r.line.id))
    .map((r) => r.line.id)
  return markStep({ ...draft, confirmed: [...draft.confirmed, ...toConfirm] }, establishmentId, 'done')
}

// « 3 lignes sur 7 vérifiées »: confirmed, typed or added, out of the lines still open.
// A bank marked done has every line seen (decision 2); one skipped has not.
export function verifiedWords(profile: Profile, draft: UpdateDraft, establishmentId: string): string | null {
  const open = linesOf(profile, draft, establishmentId).filter((r) => !r.closed)
  if (open.length === 0) return null
  const seen = new Set([...draft.confirmed, ...draft.values.map((e) => e.lineId)])
  const verified =
    draft.progress[establishmentId] === 'done' ? open.length : open.filter((r) => r.added || seen.has(r.line.id)).length
  const plural = verified > 1
  return `${verified} ${plural ? 'lignes' : 'ligne'} sur ${open.length} ${plural ? 'vérifiées' : 'vérifiée'}`
}

export function setTakenOn(draft: UpdateDraft, takenOn: IsoDate): UpdateDraft {
  return { ...draft, takenOn }
}

function pick<V>(record: Record<string, V>, keys: Set<string>): Record<string, V> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => keys.has(key)))
}

// Drops what the draft says about lines, accounts or establishments the profile no
// longer has: the draft cannot be checked against the profile when it is read, and
// the profile may have changed since it was written. Also restores the draft's own
// rules: a typed value wins over a confirmation, and a closed line keeps neither.
export function tidyDraft(profile: Profile, draft: UpdateDraft): UpdateDraft {
  // An establishment added here, and not yet in the profile (saved, then the snapshot was not):
  // it stays, and what points at it too.
  const inProfileEstablishments = new Set(profile.establishments.map((e) => e.id))
  const addedEstablishments = (draft.added.establishments ?? []).filter((e) => !inProfileEstablishments.has(e.id))
  const establishments = new Set([...inProfileEstablishments, ...addedEstablishments.map((e) => e.id)])
  const inProfile = new Set([...profile.accounts, ...profile.lines].map((x) => x.id))
  // The profile was saved but not the snapshot: an addition already in the profile is
  // not added again. Its value, contribution and arrival stay, under the same id.
  const addedAccounts = draft.added.accounts.filter((a) => !inProfile.has(a.id) && establishments.has(a.establishmentId))
  const accounts = new Set([...profile.accounts, ...addedAccounts].map((a) => a.id))
  // A line added then closed in the same update disappears (decision 4).
  const closedNow = new Set(draft.closed)
  const addedLines = draft.added.lines.filter(
    (l) => !inProfile.has(l.id) && accounts.has(l.accountId) && !closedNow.has(l.id),
  )
  const openBase = profile.lines.filter((l) => l.closedOn === undefined)
  const openBaseIds = new Set(openBase.map((l) => l.id))
  const lineKinds = new Map([...openBase, ...addedLines].map((l) => [l.id, l.kind]))
  // A loan may still finance a line closed earlier: that line stays in the profile.
  const financeable = new Set([...profile.lines, ...addedLines].map((l) => l.id))

  const closed = [...new Set(draft.closed)].filter((id) => openBaseIds.has(id))
  const closedIds = new Set(closed)
  // An entry of another kind than its line cannot be merged into it.
  const values = draft.values.filter((e) => lineKinds.get(e.lineId) === e.kind && !closedIds.has(e.lineId))
  const typed = new Set(values.map((e) => e.lineId))
  const confirmed = [...new Set(draft.confirmed)].filter((id) => openBaseIds.has(id) && !typed.has(id) && !closedIds.has(id))

  return {
    ...draft,
    values,
    confirmed,
    progress: pick(draft.progress, establishments),
    contributions: pick(draft.contributions, accounts),
    ...(draft.paidTotals && { paidTotals: pick(draft.paidTotals, accounts) }),
    added: {
      accounts: addedAccounts.map((a) =>
        a.financedLineId !== undefined && !financeable.has(a.financedLineId) ? withoutFinanced(a) : a,
      ),
      lines: addedLines,
      ...(addedEstablishments.length > 0 ? { establishments: addedEstablishments } : {}),
    },
    // Kept by what the profile holds, not by what `added` held: once an addition has
    // left `added`, a second tidy must keep its arrival too.
    arrivals: pick(draft.arrivals, new Set([...inProfile, ...addedAccounts.map((a) => a.id), ...addedLines.map((l) => l.id)])),
    closed,
  }
}
