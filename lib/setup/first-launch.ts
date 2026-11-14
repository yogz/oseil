// The pure logic of the first launch: which banks and outside things the person
// has, then, step by step, their accounts and lines. Every function returns a
// new object and never touches the one it was given. Ids come from
// crypto.randomUUID(), replaceable for tests. No React, no database here.

import { ACCOUNT_TYPES, CURRENCIES, OUTSIDE_BANKS } from '@/lib/catalog'
import { SYMBOL } from '@/lib/market/types'
import { MissingRateError } from '@/lib/model/situation'
import type {
  Account,
  AccountTypeId,
  CategoryId,
  CurrencyCode,
  Establishment,
  FirstLaunch,
  IsoDate,
  Line,
  Profile,
  Snapshot,
  SnapshotEntry,
} from '@/lib/model/types'

export type SetupDraft = { profile: Profile; snapshot: Snapshot }
type NewId = () => string
// Omit on a union collapses it; this one keeps each kind apart.
export type EntryInput = SnapshotEntry extends infer E ? (E extends unknown ? Omit<E, 'lineId' | 'seenOn'> : never) : never

const defaultId: NewId = () => crypto.randomUUID()
const EMPLOYEE_SAVINGS = 'employee-savings'
const HOME_CHOICES = ['my-home', 'other-home', 'gold', 'crypto']

export function emptySnapshot(today: IsoDate): Snapshot {
  return { schema: 1, takenOn: today, fx: {}, entries: [], contributions: {}, arrivals: {} }
}

export function chooseWhere(
  draft: SetupDraft | null,
  choice: { banks: Array<{ catalogId?: string; name: string }>; outside: string[] },
  today: IsoDate,
  newId: NewId = defaultId,
): SetupDraft {
  const unknown = choice.outside.find((id) => !OUTSIDE_BANKS.some((b) => b.id === id))
  if (unknown !== undefined) throw new Error(`Unknown outside choice: ${unknown}`)
  const before = draft?.profile.establishments ?? []
  const keep = (found: Establishment | undefined, make: () => Establishment) => found ?? make()

  const banks: Establishment[] = []
  const seen = new Set<string>()
  for (const bank of choice.banks) {
    const key = bank.catalogId !== undefined ? `id:${bank.catalogId}` : `name:${bank.name}`
    if (seen.has(key)) continue
    seen.add(key)
    const known = before.find((e) =>
      e.kind === 'institution' && e.catalogId !== EMPLOYEE_SAVINGS &&
      (bank.catalogId !== undefined ? e.catalogId === bank.catalogId : e.catalogId === undefined && e.name === bank.name),
    )
    banks.push(
      keep(known, () => ({
        id: newId(),
        name: bank.name,
        kind: 'institution',
        ...(bank.catalogId !== undefined ? { catalogId: bank.catalogId } : {}),
      })),
    )
  }

  const establishments = [...banks]
  if (choice.outside.includes(EMPLOYEE_SAVINGS)) {
    establishments.push(
      keep(before.find((e) => e.catalogId === EMPLOYEE_SAVINGS), () => ({
        id: newId(),
        name: 'Épargne salariale',
        kind: 'institution',
        catalogId: EMPLOYEE_SAVINGS,
      })),
    )
  }
  if (choice.outside.some((id) => HOME_CHOICES.includes(id))) {
    establishments.push(
      keep(before.find((e) => e.kind === 'home'), () => ({ id: newId(), name: 'Chez toi', kind: 'home' })),
    )
  }

  const kept = new Set(establishments.map((e) => e.id))
  // Unticking an outside item removes its accounts from « Chez toi », which may stay for another item.
  const unticked = (draft?.profile.firstLaunch?.planned ?? []).filter((id) => !choice.outside.includes(id))
  const stillChosenTypes = new Set(
    choice.outside.map((id) => OUTSIDE_BANKS.find((b) => b.id === id)!.accountType),
  )
  const removedTypes = new Set(
    unticked
      .map((id) => OUTSIDE_BANKS.find((b) => b.id === id)?.accountType)
      .filter((type) => type !== undefined && type !== 'employee-savings' && !stillChosenTypes.has(type)),
  )
  const homeIds = new Set(establishments.filter((e) => e.kind === 'home').map((e) => e.id))
  const accounts = (draft?.profile.accounts ?? []).filter(
    (a) => kept.has(a.establishmentId) && !(homeIds.has(a.establishmentId) && removedTypes.has(a.type)),
  )
  const accountIds = new Set(accounts.map((a) => a.id))
  const lines = (draft?.profile.lines ?? []).filter((l) => accountIds.has(l.accountId))
  const lineIds = new Set(lines.map((l) => l.id))
  // A loan may point at a property line that went away with its establishment.
  const cleanAccounts = accounts.map((a) =>
    a.financedLineId !== undefined && !lineIds.has(a.financedLineId) ? withoutFinanced(a) : a,
  )

  const snapshot = draft?.snapshot ?? emptySnapshot(today)
  // A new item for « Chez toi » (a gold bar not there before) means « Chez toi » is to be done again.
  const planned = draft?.profile.firstLaunch?.planned ?? []
  const homeGained = choice.outside.some((id) => HOME_CHOICES.includes(id) && !planned.includes(id))
  const firstLaunch: FirstLaunch = {
    planned: [...choice.outside],
    finished: (draft?.profile.firstLaunch?.finished ?? []).filter((id) => kept.has(id) && !(homeGained && homeIds.has(id))),
    // Written false only when the first launch begins; choosing again never undoes its end.
    complete: draft?.profile.firstLaunch?.complete ?? false,
  }
  return {
    profile: { schema: 1, establishments, accounts: cleanAccounts, lines, firstLaunch },
    snapshot: {
      ...snapshot,
      takenOn: today,
      entries: snapshot.entries.filter((e) => lineIds.has(e.lineId)),
      contributions: pick(snapshot.contributions, accountIds),
      ...(snapshot.paidTotals && { paidTotals: pick(snapshot.paidTotals, accountIds) }),
      arrivals: pick(snapshot.arrivals, lineIds),
    },
  }
}

export function withoutFinanced<T extends { financedLineId?: string }>(account: T): T {
  const { financedLineId: _removed, ...rest } = account
  void _removed
  return rest as T
}

function pick<V>(record: Record<string, V>, keys: Set<string>): Record<string, V> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => keys.has(key)))
}

// « Chez toi » first (the house a loan will point at), then banks in the order chosen, then « Épargne salariale ».
export function steps(profile: Profile): Establishment[] {
  const all = profile.establishments
  return [
    ...all.filter((e) => e.kind === 'home'),
    ...all.filter((e) => e.kind === 'institution' && e.catalogId !== EMPLOYEE_SAVINGS),
    ...all.filter((e) => e.catalogId === EMPLOYEE_SAVINGS),
  ]
}

export type AccountInput = {
  establishmentId: string
  type: AccountTypeId
  name: string
  unlockOn?: IsoDate
  financedLineId?: string
}
export type LineInput = {
  accountId: string
  lineId?: string
  name: string
  category?: CategoryId
  entry: EntryInput
  currency?: CurrencyCode // a new line: 'EUR' by default; a line rewritten: its own by default
  quoteSymbol?: string | null // undefined keeps it, null removes it
}

// The checks of a new account, shared by the first launch and the update.
// `known` holds what it may point at: its establishment, and the line a loan finances.
export function buildAccount(
  known: { establishments: Establishment[]; lines: Line[] },
  input: AccountInput,
  newId: NewId = defaultId,
): Account {
  if (!known.establishments.some((e) => e.id === input.establishmentId)) {
    throw new Error(`Unknown establishment: ${input.establishmentId}`)
  }
  if (input.financedLineId !== undefined && !known.lines.some((l) => l.id === input.financedLineId)) {
    throw new Error(`Unknown financed line: ${input.financedLineId}`)
  }
  return {
    id: newId(),
    establishmentId: input.establishmentId,
    type: input.type,
    name: input.name,
    ...(input.unlockOn !== undefined ? { unlockOn: input.unlockOn } : {}),
    ...(input.financedLineId !== undefined ? { financedLineId: input.financedLineId } : {}),
  }
}

// The checks of a line, shared by the first launch and the update. `known.accounts`
// are the ones it may belong to; `known.lines` the ones `lineId` may rewrite.
export function buildLine(
  known: { accounts: Account[]; lines: Line[] },
  input: LineInput,
  newId: NewId = defaultId,
): Line {
  const account = known.accounts.find((a) => a.id === input.accountId)
  if (!account) throw new Error(`Unknown account: ${input.accountId}`)
  const info = ACCOUNT_TYPES[account.type]
  if (!info.lineKinds.includes(input.entry.kind)) {
    throw new Error(`A ${info.label} cannot hold a line of kind ${input.entry.kind}`)
  }
  if (account.type !== 'loan' && input.category === undefined && !info.defaultCategory[input.entry.kind]) {
    throw new Error('This line needs a category')
  }

  const existing = input.lineId === undefined ? undefined : known.lines.find((l) => l.id === input.lineId)
  if (input.lineId !== undefined && !existing) throw new Error(`Unknown line: ${input.lineId}`)

  if (input.currency !== undefined && !CURRENCIES.some((c) => c.code === input.currency)) {
    throw new Error(`Unknown currency: ${input.currency}`)
  }
  const currency = input.currency ?? existing?.currency ?? 'EUR'
  // A loan is told in euros, as the bank sends it.
  if (account.type === 'loan' && currency !== 'EUR') throw new Error('A loan stays in euros')
  if (typeof input.quoteSymbol === 'string' && !SYMBOL.test(input.quoteSymbol)) {
    throw new Error('Malformed quote symbol')
  }
  const quoteSymbol = input.quoteSymbol === undefined ? existing?.quoteSymbol : (input.quoteSymbol ?? undefined)

  return {
    id: input.lineId ?? newId(),
    accountId: input.accountId,
    name: input.name,
    kind: input.entry.kind,
    currency,
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(quoteSymbol !== undefined ? { quoteSymbol } : {}),
    ...(existing?.closedOn !== undefined ? { closedOn: existing.closedOn } : {}),
    ...(existing?.group !== undefined ? { group: existing.group } : {}),
  }
}

export function addAccount(
  draft: SetupDraft,
  input: AccountInput,
  newId: NewId = defaultId,
): { draft: SetupDraft; accountId: string } {
  const account = buildAccount(draft.profile, input, newId)
  return {
    draft: { ...draft, profile: { ...draft.profile, accounts: [...draft.profile.accounts, account] } },
    accountId: account.id,
  }
}

// Writes the rate of a currency into the snapshot. Called only when the currency was
// chosen in the form: a line left as it is never overwrites a shared rate.
export function withRate(draft: SetupDraft, currency: CurrencyCode, eurPerUnit: number): SetupDraft {
  if (currency === 'EUR') return draft
  if (!Number.isFinite(eurPerUnit) || eurPerUnit <= 0) throw new Error(`Invalid rate for ${currency}`)
  return { ...draft, snapshot: { ...draft.snapshot, fx: { ...draft.snapshot.fx, [currency]: eurPerUnit } } }
}

export function putLine(
  draft: SetupDraft,
  input: LineInput,
  today: IsoDate,
  newId: NewId = defaultId,
): { draft: SetupDraft; lineId: string } {
  const line = buildLine(draft.profile, input, newId)
  if (line.currency !== 'EUR' && draft.snapshot.fx[line.currency] === undefined) {
    throw new MissingRateError(line.currency)
  }
  const lineId = line.id
  const existing = draft.profile.lines.some((l) => l.id === lineId)
  const entry = { ...input.entry, lineId, seenOn: today } as SnapshotEntry
  const lines = existing ? draft.profile.lines.map((l) => (l.id === lineId ? line : l)) : [...draft.profile.lines, line]
  const entries = draft.snapshot.entries.some((e) => e.lineId === lineId)
    ? draft.snapshot.entries.map((e) => (e.lineId === lineId ? entry : e))
    : [...draft.snapshot.entries, entry]
  return {
    draft: { profile: { ...draft.profile, lines }, snapshot: { ...draft.snapshot, takenOn: today, entries } },
    lineId,
  }
}

// During the first launch a line is really deleted: no older snapshot cites it.
export function removeLine(draft: SetupDraft, lineId: string): SetupDraft {
  const line = draft.profile.lines.find((l) => l.id === lineId)
  if (!line) return draft
  const lines = draft.profile.lines.filter((l) => l.id !== lineId)
  const accountEmpty = !lines.some((l) => l.accountId === line.accountId)
  const accounts = accountEmpty ? draft.profile.accounts.filter((a) => a.id !== line.accountId) : draft.profile.accounts
  const { [lineId]: _arrival, ...arrivals } = draft.snapshot.arrivals
  void _arrival
  const without = <V>(record: Record<string, V>) =>
    accountEmpty ? Object.fromEntries(Object.entries(record).filter(([id]) => id !== line.accountId)) : record
  const { paidTotals } = draft.snapshot
  return {
    profile: { ...draft.profile, accounts: accounts.map((a) => (a.financedLineId === lineId ? withoutFinanced(a) : a)), lines },
    snapshot: {
      ...draft.snapshot,
      entries: draft.snapshot.entries.filter((e) => e.lineId !== lineId),
      contributions: without(draft.snapshot.contributions),
      ...(paidTotals && { paidTotals: without(paidTotals) }),
      arrivals,
    },
  }
}

function withFirstLaunch(draft: SetupDraft, change: (current: FirstLaunch) => FirstLaunch): SetupDraft {
  const current = draft.profile.firstLaunch ?? { planned: [], finished: [], complete: false }
  return { ...draft, profile: { ...draft.profile, firstLaunch: change(current) } }
}

export function finishStep(draft: SetupDraft, establishmentId: string): SetupDraft {
  if (!draft.profile.establishments.some((e) => e.id === establishmentId)) {
    throw new Error(`Unknown establishment: ${establishmentId}`)
  }
  return withFirstLaunch(draft, (fl) =>
    fl.finished.includes(establishmentId) ? fl : { ...fl, finished: [...fl.finished, establishmentId] },
  )
}

// A finished step opened again: it becomes the current one, its content untouched.
export function reopenStep(draft: SetupDraft, establishmentId: string): SetupDraft {
  if (!draft.profile.establishments.some((e) => e.id === establishmentId)) {
    throw new Error(`Unknown establishment: ${establishmentId}`)
  }
  return withFirstLaunch(draft, (fl) => ({ ...fl, finished: fl.finished.filter((id) => id !== establishmentId) }))
}

// Past the first launch: it was completed, or the profile predates it (as Mon argent reads it).
export function launchComplete(profile: Profile | null): boolean {
  return profile !== null && (profile.firstLaunch === undefined || profile.firstLaunch.complete)
}

export function completeFirstLaunch(draft: SetupDraft): SetupDraft {
  return withFirstLaunch(draft, (fl) => ({ ...fl, complete: true }))
}

// Drops what the snapshot says about lines or accounts the profile no longer has.
// Profile and snapshot are saved one after the other; if the second save fails,
// the pair left behind must still be readable, so resuming always tidies it.
export function reconcile(draft: SetupDraft): SetupDraft {
  const lineIds = new Set(draft.profile.lines.map((l) => l.id))
  const lineKinds = new Map(draft.profile.lines.map((l) => [l.id, l.kind]))
  const accountIds = new Set(draft.profile.accounts.map((a) => a.id))
  const { snapshot } = draft
  return {
    profile: draft.profile,
    snapshot: {
      ...snapshot,
      // An entry of another kind than its line comes from a half-saved kind change.
      entries: snapshot.entries.filter((e) => lineKinds.get(e.lineId) === e.kind),
      contributions: pick(snapshot.contributions, accountIds),
      ...(snapshot.paidTotals && { paidTotals: pick(snapshot.paidTotals, accountIds) }),
      arrivals: pick(snapshot.arrivals, lineIds),
    },
  }
}
