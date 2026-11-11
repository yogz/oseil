import { ACCOUNT_TYPES, CATEGORY_ORDER, CRYPTO_PLATFORMS, MULTI_LINE_TYPES, RANGED_GROUPS, isRanged } from '@/lib/catalog'
import { categoryOf } from '@/lib/model/situation'
import type { Account, AccountTypeId, CategoryId, Establishment, GroupId, Line, Profile, Residence } from '@/lib/model/types'
import { withoutFinanced } from '@/lib/setup/first-launch'

export type PlaceChoices = {
  moves: 'account' | 'line' | 'none'
  establishments: Establishment[] // moves 'account': where the whole account may go, its own excluded
  accounts: Array<{ account: Account; establishment: Establishment }> // moves 'line': other accounts that accept it
  category: boolean // the line's category can be chosen here
}

function findLine(profile: Profile, lineId: string): Line {
  const line = profile.lines.find((l) => l.id === lineId)
  if (!line) throw new Error(`Unknown line ${lineId}`)
  return line
}

function findAccount(profile: Profile, accountId: string): Account {
  const account = profile.accounts.find((a) => a.id === accountId)
  if (!account) throw new Error(`Unknown account ${accountId}`)
  return account
}

const linesIn = (profile: Profile, accountId: string) => profile.lines.filter((l) => l.accountId === accountId)

function mapAccount(profile: Profile, accountId: string, change: (a: Account) => Account): Profile {
  return { ...profile, accounts: profile.accounts.map((a) => (a.id === accountId ? change(a) : a)) }
}

function mapLine(profile: Profile, lineId: string, change: (l: Line) => Line): Profile {
  return { ...profile, lines: profile.lines.map((l) => (l.id === lineId ? change(l) : l)) }
}

// As the first launch does: the account of a type that holds one line (a livret, a loan, a house)
// carries that line's name and follows it; a PEA keeps its own name, even with a single fund.
export function renameLine(profile: Profile, lineId: string, name: string): Profile {
  const line = findLine(profile, lineId)
  const account = findAccount(profile, line.accountId)
  const trimmed = name.trim()
  if (trimmed === '') throw new Error('A name cannot be empty')
  const renamed = mapLine(profile, lineId, (l) => ({ ...l, name: trimmed }))
  return !MULTI_LINE_TYPES.includes(account.type) && linesIn(profile, account.id).length === 1
    ? mapAccount(renamed, account.id, (a) => ({ ...a, name: trimmed }))
    : renamed
}

export function setUnlockYear(profile: Profile, accountId: string, year: number | null): Profile {
  const account = findAccount(profile, accountId)
  if (account.type !== 'employee-savings') throw new Error('Only employee savings have an unlock year')
  if (year === null) {
    return mapAccount(profile, accountId, (a) => {
      const { unlockOn: _removed, ...rest } = a
      void _removed
      return rest
    })
  }
  if (!Number.isInteger(year) || year < 1900 || year > 2099) throw new Error(`Invalid year ${year}`)
  return mapAccount(profile, accountId, (a) => ({ ...a, unlockOn: `${year}-01-01` }))
}

// The type of a home. A main residence is written as no mark, as every home was before the types.
// Account.type never changes anywhere in the app, so a residence can only ever sit on a home
// (parseAccount refuses it elsewhere).
export function setResidence(profile: Profile, accountId: string, residence: Residence): Profile {
  const account = findAccount(profile, accountId)
  if (account.type !== 'home') throw new Error('Only a home has a residence type')
  if (residence !== 'main') return mapAccount(profile, accountId, (a) => ({ ...a, residence }))
  return mapAccount(profile, accountId, (a) => {
    const { residence: _removed, ...rest } = a
    void _removed
    return rest
  })
}

// A home, a PER and a loan are decided by their type; every other account is quick unless marked.
export const SLOW_BY_TYPE: readonly AccountTypeId[] = ['home', 'per', 'loan']

export function setSlow(profile: Profile, accountId: string, slow: boolean): Profile {
  const account = findAccount(profile, accountId)
  if (SLOW_BY_TYPE.includes(account.type)) {
    throw new Error('This account is quick or slow by its type')
  }
  if (slow) return mapAccount(profile, accountId, (a) => ({ ...a, slow: true }))
  return mapAccount(profile, accountId, (a) => {
    const { slow: _removed, ...rest } = a
    void _removed
    return rest
  })
}

export function setFinanced(profile: Profile, loanAccountId: string, homeLineId: string | null): Profile {
  const loan = findAccount(profile, loanAccountId)
  if (loan.type !== 'loan') throw new Error('Only a loan finances a property')
  if (homeLineId === null) return mapAccount(profile, loanAccountId, withoutFinanced)
  const home = findLine(profile, homeLineId)
  const homeAccount = findAccount(profile, home.accountId)
  if (homeAccount.type !== 'home' || home.closedOn !== undefined) throw new Error('A loan finances an open home line')
  return mapAccount(profile, loanAccountId, (a) => ({ ...a, financedLineId: homeLineId }))
}

// A bank that can lend: not the employee savings, not a crypto platform.
const lends = (e: Establishment) =>
  e.catalogId !== 'employee-savings' && (e.catalogId === undefined || !CRYPTO_PLATFORMS.includes(e.catalogId))

// Whether an establishment may hold an account of this type: a home only at « Chez toi »,
// which holds nothing else but gold and crypto; a loan only at a bank that lends.
export function canHold(establishment: Establishment, type: AccountTypeId): boolean {
  if (type === 'home') return establishment.kind === 'home'
  if (establishment.kind === 'home') return type === 'gold' || type === 'crypto'
  return type !== 'loan' || lends(establishment)
}

// Where a whole account may go, by its type. A home never moves.
function establishmentsFor(profile: Profile, type: AccountTypeId): Establishment[] {
  if (type === 'home') return []
  const homes = profile.establishments.filter((e) => e.kind === 'home')
  const banks = profile.establishments.filter((e) => e.kind === 'institution')
  return [...homes, ...banks].filter((e) => canHold(e, type))
}

export function placeChoices(profile: Profile, lineId: string): PlaceChoices {
  const line = findLine(profile, lineId)
  const account = findAccount(profile, line.accountId)
  const category = line.kind === 'units' || account.type === 'other'
  if (account.type === 'home') return { moves: 'none', establishments: [], accounts: [], category }
  // A loan always moves whole, whatever its line count.
  if (account.type === 'loan' || linesIn(profile, account.id).length === 1) {
    const establishments = establishmentsFor(profile, account.type).filter((e) => e.id !== account.establishmentId)
    return { moves: 'account', establishments, accounts: [], category }
  }
  const accounts = profile.accounts
    .filter((a) => a.id !== account.id && a.type !== 'loan' && a.type !== 'home' && ACCOUNT_TYPES[a.type].lineKinds.includes(line.kind))
    .flatMap((a) => {
      const establishment = profile.establishments.find((e) => e.id === a.establishmentId)
      return establishment ? [{ account: a, establishment }] : []
    })
  return { moves: 'line', establishments: [], accounts, category }
}

export function moveAccount(profile: Profile, accountId: string, establishmentId: string): Profile {
  findAccount(profile, accountId)
  const lines = linesIn(profile, accountId)
  if (lines.length === 0) throw new Error(`Account ${accountId} holds no line`)
  const choices = placeChoices(profile, lines[0].id)
  if (choices.moves !== 'account' || !choices.establishments.some((e) => e.id === establishmentId)) {
    throw new Error(`Account ${accountId} cannot go to ${establishmentId}`)
  }
  return mapAccount(profile, accountId, (a) => ({ ...a, establishmentId }))
}

export function moveLine(profile: Profile, lineId: string, accountId: string): Profile {
  const choices = placeChoices(profile, lineId)
  if (choices.moves !== 'line' || !choices.accounts.some((c) => c.account.id === accountId)) {
    throw new Error(`Line ${lineId} cannot go to ${accountId}`)
  }
  return mapLine(profile, lineId, (l) => ({ ...l, accountId }))
}

export function setCategory(profile: Profile, lineId: string, category: CategoryId): Profile {
  if (!CATEGORY_ORDER.includes(category)) throw new Error(`Unknown category ${category}`)
  if (!placeChoices(profile, lineId).category) throw new Error('This line has no category to choose')
  // A new category means a new set of chapters: the old one no longer applies. The same category
  // keeps it: the fiche's form can send the current one back.
  const line = findLine(profile, lineId)
  const same = categoryOf(line, findAccount(profile, line.accountId)) === category
  return mapLine(profile, lineId, (l) => {
    if (same) return { ...l, category }
    const { group: _removed, ...rest } = l
    void _removed
    return { ...rest, category }
  })
}

// Writes the chapters chosen on the « Ranger par zone » screen. A choice that no longer fits
// (unknown or closed line, a chapter outside its category's list) is ignored, never an error.
export function setGroups(profile: Profile, choices: ReadonlyArray<{ lineId: string; group: GroupId }>): Profile {
  const accounts = new Map(profile.accounts.map((a) => [a.id, a]))
  const chosen = new Map<string, GroupId>()
  for (const { lineId, group } of choices) {
    const line = profile.lines.find((l) => l.id === lineId)
    const account = line && accounts.get(line.accountId)
    if (!line || !account || line.closedOn !== undefined) continue
    const category = categoryOf(line, account)
    if (category === null || !isRanged(category)) continue
    if ((RANGED_GROUPS[category] as readonly GroupId[]).includes(group)) chosen.set(lineId, group)
  }
  return { ...profile, lines: profile.lines.map((l) => (chosen.has(l.id) ? { ...l, group: chosen.get(l.id) } : l)) }
}

// « Où il est rangé »: `to` is where it goes (an establishment when the whole account moves, an
// account when the line does), null to stay; `category`, the one chosen, null to keep it. A move
// never changes the category silently: a line that took its account's default keeps the category
// it had, now written down, unless another one is chosen, and only where it can be chosen.
export function fileLine(profile: Profile, lineId: string, to: string | null, category: CategoryId | null): Profile {
  const next = fileLineKeepingChapter(profile, lineId, to, category)
  const before = findLine(profile, lineId)
  const after = findLine(next, lineId)
  if (after.group === undefined) return next
  // A chapter belongs to a category: when the line's effective category changes, it goes.
  const was = categoryOf(before, findAccount(profile, before.accountId))
  const now = categoryOf(after, findAccount(next, after.accountId))
  if (was === now) return next
  return mapLine(next, lineId, (l) => {
    const rest = { ...l }
    delete rest.group
    return rest
  })
}

function fileLineKeepingChapter(profile: Profile, lineId: string, to: string | null, category: CategoryId | null): Profile {
  const line = findLine(profile, lineId)
  let next = profile
  if (to !== null) {
    next = placeChoices(profile, lineId).moves === 'line' ? moveLine(profile, lineId, to) : moveAccount(profile, line.accountId, to)
  }
  if (category !== null) return setCategory(next, lineId, category)
  const before = categoryOf(line, findAccount(profile, line.accountId))
  const moved = findLine(next, lineId)
  // Where the category cannot be chosen, nothing is written: the new account type's default
  // applies, and an explicit category that could never be changed again is dropped.
  if (!placeChoices(next, lineId).category) {
    if (moved.category === undefined) return next
    return mapLine(next, lineId, (l) => {
      const rest = { ...l }
      delete rest.category
      return rest
    })
  }
  if (line.category !== undefined || before === null || categoryOf(moved, findAccount(next, moved.accountId)) === before) return next
  return mapLine(next, lineId, (l) => ({ ...l, category: before }))
}
