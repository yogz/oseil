// The life of a line during the update: an account or a line opened since,
// a line closed or sold, and the total paid into an account. The checks are the
// first launch's own (buildAccount, buildLine). Every function returns a new
// object and never touches the one it was given. No React, no database here.

import { ACCOUNT_TYPES, takesPaidTotal } from '@/lib/catalog'
import type { Account, Arrival, Cents, IsoDate, Profile, Residence, Snapshot, SnapshotEntry, UpdateDraft } from '@/lib/model/types'
import { buildAccount, buildLine, withoutFinanced, type AccountInput, type LineInput } from '@/lib/setup/first-launch'
import { linesOf } from './draft'

type NewId = () => string

// The arrival (« Ouvert depuis la dernière fois, ou tu l’avais déjà ? ») is asked once per added account.
export function addAccount(
  profile: Profile,
  draft: UpdateDraft,
  input: AccountInput & { arrival: Arrival; residence?: Residence },
  newId?: NewId,
): { draft: UpdateDraft; accountId: string } {
  const { arrival, residence, ...rest } = input
  if (residence !== undefined && rest.type !== 'home') throw new Error('Only a home has a residence type')
  // A loan may finance a line of the profile or one added in this update.
  const built = buildAccount(
    { establishments: profile.establishments, lines: [...profile.lines, ...draft.added.lines] },
    rest,
    newId,
  )
  // A home's type, as the fiche writes it (setResidence): a main residence is no mark at all.
  const account = residence !== undefined && residence !== 'main' ? { ...built, residence } : built
  return {
    draft: {
      ...draft,
      added: { ...draft.added, accounts: [...draft.added.accounts, account] },
      arrivals: { ...draft.arrivals, [account.id]: arrival },
    },
    accountId: account.id,
  }
}

// Adds a line, or rewrites one added in this update (`lineId`). A line of the profile
// is never rewritten here. A line added to an account of the profile carries its own
// arrival; a line of an added account takes the account's.
export function putAddedLine(
  profile: Profile,
  draft: UpdateDraft,
  input: LineInput & { arrival?: Arrival },
  today: IsoDate,
  newId?: NewId,
): { draft: UpdateDraft; lineId: string } {
  const { arrival, ...rest } = input
  const line = buildLine({ accounts: [...profile.accounts, ...draft.added.accounts], lines: draft.added.lines }, rest, newId)
  // Decision 8: a line keeps its currency once a snapshot holds it, so older snapshots read
  // the same. Every line a saved snapshot holds, the base one included, is in the profile
  // (none is ever removed from it); only a line added in this update may still change its
  // currency, even when a draft written elsewhere lists a line of the profile as added.
  const held = profile.lines.find((l) => l.id === line.id)
  if (held !== undefined && held.currency !== line.currency) {
    throw new Error(`A line already saved keeps its currency: ${line.id}`)
  }
  let arrivals = { ...draft.arrivals }
  if (profile.accounts.some((a) => a.id === line.accountId)) {
    const lineArrival = arrival ?? draft.arrivals[line.id]
    if (lineArrival === undefined) throw new Error(`A line added to an existing account needs its arrival: ${line.accountId}`)
    arrivals = { ...arrivals, [line.id]: lineArrival }
  } else if (arrival !== undefined) {
    throw new Error(`A line of an added account takes the account’s arrival: ${line.accountId}`)
  }

  const value = { ...input.entry, lineId: line.id, seenOn: today } as SnapshotEntry
  const values = draft.values.some((e) => e.lineId === line.id)
    ? draft.values.map((e) => (e.lineId === line.id ? value : e))
    : [...draft.values, value]
  const lines = draft.added.lines.some((l) => l.id === line.id)
    ? draft.added.lines.map((l) => (l.id === line.id ? line : l))
    : [...draft.added.lines, line]
  return { draft: { ...draft, values, added: { ...draft.added, lines }, arrivals }, lineId: line.id }
}

// A line added then removed in the same update disappears, with its value and its arrival.
export function removeAddedLine(draft: UpdateDraft, lineId: string): UpdateDraft {
  if (!draft.added.lines.some((l) => l.id === lineId)) return { ...draft }
  const { [lineId]: _arrival, ...arrivals } = draft.arrivals
  void _arrival
  return {
    ...draft,
    values: draft.values.filter((e) => e.lineId !== lineId),
    added: {
      accounts: draft.added.accounts.map((a) => (a.financedLineId === lineId ? withoutFinanced(a) : a)),
      lines: draft.added.lines.filter((l) => l.id !== lineId),
    },
    arrivals,
  }
}

// « Fermé ou tout vendu ». A line of the profile stays listed, marked closed, and keeps
// neither a typed value nor a confirmation; a line added in this update is removed.
export function closeLine(draft: UpdateDraft, lineId: string): UpdateDraft {
  if (draft.added.lines.some((l) => l.id === lineId)) return removeAddedLine(draft, lineId)
  return {
    ...draft,
    values: draft.values.filter((e) => e.lineId !== lineId),
    confirmed: draft.confirmed.filter((id) => id !== lineId),
    closed: draft.closed.includes(lineId) ? [...draft.closed] : [...draft.closed, lineId],
  }
}

export function reopenLine(draft: UpdateDraft, lineId: string): UpdateDraft {
  return { ...draft, closed: draft.closed.filter((id) => id !== lineId) }
}

// The accounts that ask « Total versé depuis l’ouverture » (docs/superpowers/specs/2026-11-14-total-verse-design.md),
// with an open line in this update: a life insurance, a PER or employee savings, the base's or added now; a
// cost-basis account (PEA, securities, gold, crypto) only with a line in amount, whose gain the total is needed
// for, or with a total in the base, which the split follows as soon as both sides have one.
export function paidTotalAccounts(profile: Profile, base: Snapshot, draft: UpdateDraft, establishmentId: string): Account[] {
  const open = linesOf(profile, draft, establishmentId).filter((r) => !r.closed)
  const accounts: Account[] = []
  for (const { account } of open) {
    if (accounts.some((a) => a.id === account.id) || !takesPaidTotal(account.type)) continue
    const asked =
      ACCOUNT_TYPES[account.type].change === 'contributions' ||
      open.some((r) => r.account.id === account.id && r.line.kind === 'amount') ||
      previousPaidTotal(base, account.id) !== null
    if (asked) accounts.push(account)
  }
  return accounts
}

// The total of the snapshot the update starts from, recalled under the box; null when none was typed.
export function previousPaidTotal(base: Snapshot, accountId: string): Cents | null {
  return base.paidTotals?.[accountId] ?? null
}

// Stored as typed, 0 included; null, the box left or made empty, is unknown and is not.
export function setPaidTotal(draft: UpdateDraft, accountId: string, cents: Cents | null): UpdateDraft {
  const { [accountId]: _previous, ...others } = draft.paidTotals ?? {}
  void _previous
  return { ...draft, paidTotals: cents === null ? others : { ...others, [accountId]: cents } }
}
