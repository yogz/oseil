// Validation of what comes out of a sealed document. A document that opens can
// still hold the wrong shape (older code, a bug, tampering with the client):
// each parser returns the value, typed, or null. Pure: no Supabase, no React.

import { ACCOUNT_TYPES, CATEGORY_ORDER, CUSHION_MONTHS, GOAL_CATEGORIES, GROUP_LABELS, LEGACY_OUTSIDE_IDS, OUTSIDE_BANKS, RESIDENCE_LABELS } from '@/lib/catalog'
import type {
  Account,
  AccountTypeId,
  Arrival,
  Budget,
  CategoryId,
  Establishment,
  FirstLaunch,
  GoalAllocation,
  GoalShares,
  GroupId,
  Line,
  Profile,
  Residence,
  Settings,
  Snapshot,
  SnapshotEntry,
  StepStatus,
  UpdateDraft,
} from './types'

export const DEFAULT_SETTINGS: Settings = {
  schema: 1,
  budget: null,
  display: 'euros',
  hideAmounts: false,
}

type Obj = Record<string, unknown>

const isObject = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const isText = (value: unknown): value is string => typeof value === 'string'
// A real calendar date: 2026-02-30 is refused (round-trip through Date.UTC).
const isDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value
}
const isCurrency = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Z]{3}$/.test(value)
const isCents = (value: unknown): value is number => Number.isSafeInteger(value)
const isNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
const isPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
const isOptional = (value: unknown, check: (v: unknown) => boolean) =>
  value === undefined || check(value)

const isAccountType = (value: unknown): value is AccountTypeId =>
  typeof value === 'string' && Object.hasOwn(ACCOUNT_TYPES, value)
const isCategory = (value: unknown): value is CategoryId =>
  typeof value === 'string' && (CATEGORY_ORDER as readonly string[]).includes(value)

const isGroup = (value: unknown): value is GroupId =>
  typeof value === 'string' && Object.hasOwn(GROUP_LABELS, value)

// Null as soon as one item is invalid.
function parseList<T>(value: unknown, parseItem: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null
  const items: T[] = []
  for (const raw of value) {
    const item = parseItem(raw)
    if (item === null) return null
    items.push(item)
  }
  return items
}

function parseEstablishment(raw: unknown): Establishment | null {
  if (!isObject(raw)) return null
  if (!isId(raw.id) || !isText(raw.name)) return null
  if (raw.kind !== 'institution' && raw.kind !== 'home') return null
  if (!isOptional(raw.catalogId, isId)) return null
  return { ...raw } as Establishment
}

const isResidence = (value: unknown): value is Residence => typeof value === 'string' && Object.hasOwn(RESIDENCE_LABELS, value)

function parseAccount(raw: unknown): Account | null {
  if (!isObject(raw)) return null
  if (!isId(raw.id) || !isId(raw.establishmentId) || !isText(raw.name)) return null
  if (!isAccountType(raw.type)) return null
  if (!isOptional(raw.unlockOn, isDate) || !isOptional(raw.financedLineId, isId)) return null
  if (raw.slow !== undefined && raw.slow !== true) return null // only ever true; absent is quick
  if (raw.unlockUnknown !== undefined && raw.unlockUnknown !== true) return null // only ever true
  if (raw.noHome !== undefined && raw.noHome !== true) return null // only ever true
  // Only a home has a residence type; any other account carrying one is the wrong shape.
  if (raw.residence !== undefined && (raw.type !== 'home' || !isResidence(raw.residence))) return null
  return { ...raw } as Account
}

// The rate of a line's purchases, typed (« 1 € = x » between 0,01 and 1 000), or its average price in euros;
// only on a line in another currency (docs/superpowers/specs/2026-11-11-change-a-l-achat-design.md).
export const PURCHASE_RATE_MIN = 0.01
export const PURCHASE_RATE_MAX = 1000
function isPurchase(value: unknown, currency: unknown): boolean {
  if (currency === 'EUR' || !isObject(value)) return false
  if (value.inEuros === true) return Object.keys(value).length === 1
  return (
    Object.keys(value).length === 1 &&
    typeof value.perEuro === 'number' &&
    Number.isFinite(value.perEuro) &&
    value.perEuro >= PURCHASE_RATE_MIN &&
    value.perEuro <= PURCHASE_RATE_MAX
  )
}

function parseLine(raw: unknown): Line | null {
  if (!isObject(raw)) return null
  if (!isId(raw.id) || !isId(raw.accountId) || !isText(raw.name)) return null
  if (raw.kind !== 'amount' && raw.kind !== 'units') return null
  if (!isCurrency(raw.currency)) return null
  if (!isOptional(raw.category, isCategory)) return null
  if (!isOptional(raw.group, isGroup)) return null
  if (!isOptional(raw.quoteSymbol, isId) || !isOptional(raw.closedOn, isDate)) return null
  if (raw.purchase !== undefined && !isPurchase(raw.purchase, raw.currency)) return null
  if (raw.slow !== undefined && typeof raw.slow !== 'boolean') return null // its own answer; absent: its account's
  if (raw.purchaseUnknown !== undefined && raw.purchaseUnknown !== true) return null // only ever true
  if (raw.unquoted !== undefined && raw.unquoted !== true) return null // only ever true
  return { ...raw } as Line
}

const hasUniqueIds = (items: { id: string }[]) => new Set(items.map((i) => i.id)).size === items.length

export function parseProfile(value: unknown): Profile | null {
  if (!isObject(value) || value.schema !== 1) return null
  const establishments = parseList(value.establishments, parseEstablishment)
  const accounts = parseList(value.accounts, parseAccount)
  const lines = parseList(value.lines, parseLine)
  if (!establishments || !accounts || !lines) return null
  if (!hasUniqueIds(establishments) || !hasUniqueIds(accounts) || !hasUniqueIds(lines)) return null

  const establishmentIds = new Set(establishments.map((e) => e.id))
  const accountIds = new Set(accounts.map((a) => a.id))
  const lineIds = new Set(lines.map((l) => l.id))
  if (!accounts.every((a) => establishmentIds.has(a.establishmentId))) return null
  if (!accounts.every((a) => a.financedLineId === undefined || lineIds.has(a.financedLineId))) return null
  if (!lines.every((l) => accountIds.has(l.accountId))) return null

  // A line must be of a kind its account type allows, and (except a loan's)
  // must end up in a category: its own, or the type's default.
  const accountById = new Map(accounts.map((a) => [a.id, a]))
  for (const line of lines) {
    const info = ACCOUNT_TYPES[accountById.get(line.accountId)!.type]
    if (!info.lineKinds.includes(line.kind)) return null
    if (accountById.get(line.accountId)!.type !== 'loan' && !line.category && !info.defaultCategory[line.kind]) {
      return null
    }
  }

  if (value.firstLaunch === undefined) return { schema: 1, establishments, accounts, lines }
  const firstLaunch = parseFirstLaunch(value.firstLaunch, establishmentIds)
  if (!firstLaunch) return null
  return { schema: 1, establishments, accounts, lines, firstLaunch }
}

function parseFirstLaunch(raw: unknown, establishmentIds: Set<string>): FirstLaunch | null {
  if (!isObject(raw) || typeof raw.complete !== 'boolean') return null
  const { planned, finished } = raw
  if (!Array.isArray(planned) || !Array.isArray(finished)) return null
  // A profile saved by lot 3 may still plan « loan ».
  const outsideIds = new Set([...OUTSIDE_BANKS.map((b) => b.id), ...LEGACY_OUTSIDE_IDS])
  if (!planned.every((id) => typeof id === 'string' && outsideIds.has(id))) return null
  if (!finished.every((id) => typeof id === 'string' && establishmentIds.has(id))) return null
  return { planned: [...planned], finished: [...finished], complete: raw.complete }
}

function parseEntry(raw: unknown): SnapshotEntry | null {
  if (!isObject(raw) || !isId(raw.lineId) || !isDate(raw.seenOn)) return null
  if (raw.kind === 'amount') {
    if (!isCents(raw.amount)) return null
    return { lineId: raw.lineId, kind: 'amount', amount: raw.amount as number, seenOn: raw.seenOn }
  }
  if (raw.kind === 'units') {
    if (!isNonNegative(raw.units) || !isNonNegative(raw.unitPrice)) return null
    if (raw.averagePrice !== null && !isNonNegative(raw.averagePrice)) return null
    return {
      lineId: raw.lineId,
      kind: 'units',
      units: raw.units,
      unitPrice: raw.unitPrice,
      averagePrice: raw.averagePrice as number | null,
      seenOn: raw.seenOn,
    }
  }
  return null
}

function parseArrivals(raw: unknown): Record<string, Arrival> | null {
  if (!isObject(raw)) return null
  const arrivals: Record<string, Arrival> = {}
  for (const [id, arrival] of Object.entries(raw)) {
    if (arrival !== 'opened' && arrival !== 'existing') return null
    arrivals[id] = arrival
  }
  return arrivals
}

function parseContributions(raw: unknown): Record<string, number> | null {
  if (!isObject(raw)) return null
  const contributions: Record<string, number> = {}
  for (const [accountId, cents] of Object.entries(raw)) {
    if (!isCents(cents)) return null
    contributions[accountId] = cents as number
  }
  return contributions
}

// The totals paid in, per account: absent, or a map of non-negative cents.
function parsePaidTotals(raw: unknown): Record<string, number> | null {
  if (!isObject(raw)) return null
  const totals: Record<string, number> = {}
  for (const [accountId, cents] of Object.entries(raw)) {
    if (!isCents(cents) || cents < 0) return null
    totals[accountId] = cents
  }
  return totals
}

export function parseSnapshot(value: unknown): Snapshot | null {
  if (!isObject(value) || value.schema !== 1 || !isDate(value.takenOn)) return null
  if (!isObject(value.fx) || !isObject(value.contributions) || !isObject(value.arrivals)) return null

  const fx: Record<string, number> = {}
  for (const [currency, rate] of Object.entries(value.fx)) {
    if (!isCurrency(currency) || !isPositive(rate)) return null
    fx[currency] = rate
  }
  const contributions = parseContributions(value.contributions)
  if (!contributions) return null
  const paidTotals = value.paidTotals === undefined ? undefined : parsePaidTotals(value.paidTotals)
  if (paidTotals === null) return null
  const arrivals = parseArrivals(value.arrivals)
  if (!arrivals) return null

  const entries = parseList(value.entries, parseEntry)
  if (!entries) return null
  // One entry per line: the calculations rely on it.
  if (new Set(entries.map((e) => e.lineId)).size !== entries.length) return null

  return { schema: 1, takenOn: value.takenOn, fx, entries, contributions, ...(paidTotals && { paidTotals }), arrivals }
}

function parseIdList(raw: unknown): string[] | null {
  return parseList(raw, (item) => (isId(item) ? item : null))
}

export function parseUpdateDraft(value: unknown): UpdateDraft | null {
  if (!isObject(value) || value.schema !== 1 || !isId(value.basedOn)) return null
  if (value.takenOn !== null && !isDate(value.takenOn)) return null
  if (!isObject(value.progress) || !isObject(value.added)) return null

  const values = parseList(value.values, parseEntry)
  const confirmed = parseIdList(value.confirmed)
  const closed = parseIdList(value.closed)
  const contributions = parseContributions(value.contributions)
  // Absent in a draft written before the totals paid in.
  const paidTotals = value.paidTotals === undefined ? undefined : parsePaidTotals(value.paidTotals)
  if (paidTotals === null) return null
  const arrivals = parseArrivals(value.arrivals)
  const accounts = parseList(value.added.accounts, parseAccount)
  const lines = parseList(value.added.lines, parseLine)
  // Absent in a draft that added no establishment, or written before they could be added.
  const establishments = value.added.establishments === undefined ? [] : parseList(value.added.establishments, parseEstablishment)
  if (!values || !confirmed || !closed || !contributions || !arrivals || !accounts || !lines || !establishments) return null
  // One value per line, as in a snapshot.
  if (new Set(values.map((e) => e.lineId)).size !== values.length) return null
  if (!hasUniqueIds(accounts) || !hasUniqueIds(lines) || !hasUniqueIds(establishments)) return null

  const progress: Record<string, StepStatus> = {}
  for (const [establishmentId, status] of Object.entries(value.progress)) {
    if (status !== 'done' && status !== 'skipped') return null
    progress[establishmentId] = status
  }

  return {
    schema: 1,
    basedOn: value.basedOn,
    values,
    confirmed,
    progress,
    contributions,
    ...(paidTotals && { paidTotals }),
    added: { accounts, lines, ...(establishments.length > 0 ? { establishments } : {}) },
    arrivals,
    closed,
    takenOn: value.takenOn as string | null,
  }
}

export function parseGoalAllocation(value: unknown): GoalAllocation | null {
  if (!isObject(value) || value.schema !== 1 || !isDate(value.validFrom)) return null
  if (!isObject(value.shares)) return null
  const shares = {} as GoalShares
  let total = 0
  for (const category of GOAL_CATEGORIES) {
    // A goal saved before the rental share had four keys: it reads as a rental of 0, never as unreadable.
    const share = category === 'rental' && value.shares.rental === undefined ? 0 : value.shares[category]
    if (!isNonNegative(share)) return null
    shares[category] = share
    total += share
  }
  // Compared in hundredths: 33.33 + 33.33 + 33.33 must pass despite float error.
  if (Math.abs(Math.round(total * 100) - 10000) > 1) return null
  if (value.cushionMonths === undefined) return { schema: 1, validFrom: value.validFrom, shares }
  // A goal in months has no share of available money: the other four make its 100.
  if (typeof value.cushionMonths !== 'number' || !CUSHION_MONTHS.includes(value.cushionMonths) || shares.available !== 0) {
    return null
  }
  return { schema: 1, validFrom: value.validFrom, shares, cushionMonths: value.cushionMonths }
}

function parseBudget(raw: unknown): Budget | null {
  if (!isObject(raw)) return null
  if (raw.basis !== 'expenses' && raw.basis !== 'salary') return null
  if (!isCents(raw.monthly) || (raw.monthly as number) <= 0) return null
  return { basis: raw.basis, monthly: raw.monthly as number }
}

export function parseSettings(value: unknown): Settings | null {
  if (!isObject(value) || value.schema !== 1) return null
  if (value.display !== 'euros' && value.display !== 'percent') return null
  if (typeof value.hideAmounts !== 'boolean') return null
  let budget: Budget | null = null
  if (value.budget !== null) {
    budget = parseBudget(value.budget)
    if (budget === null) return null
  }
  if (value.withoutHome !== undefined && value.withoutHome !== true) return null
  return {
    schema: 1,
    budget,
    display: value.display,
    hideAmounts: value.hideAmounts,
    ...(value.withoutHome === true ? { withoutHome: true as const } : {}),
  }
}
