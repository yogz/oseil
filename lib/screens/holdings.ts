// One holding held on several lines: the rule Repères and « Trouver » share. Pure: no React, no database.

import { entryValue } from '@/lib/model/situation'
import type { Cents, Profile, Snapshot } from '@/lib/model/types'

// A holding: its name (the one of its biggest line), the accounts it is held on, its total and its lines.
export type Holding = { name: string; top: Cents; accounts: Set<string>; total: Cents; lineIds: string[] }

const plainName = (name: string) => name.toLowerCase().replace(/\s+/g, '')

// Only the lines in parts, loans left out. One holding = one quote symbol; a line without symbol joins a
// symbol group of the same plain name (no case, no spaces), else it is grouped by plain name alone.
// In the order the holdings are first met: the symbol groups, then the others.
export function sameHoldings(profile: Profile, snapshot: Snapshot): Holding[] {
  const lines = new Map(profile.lines.map((l) => [l.id, l]))
  const accounts = new Map(profile.accounts.map((a) => [a.id, a]))
  const groups: Holding[] = []
  const bySymbol = new Map<string, Holding>()
  const byName = new Map<string, Holding>()
  const units = snapshot.entries.flatMap((entry) => {
    const l = lines.get(entry.lineId)
    if (!l || l.kind !== 'units' || accounts.get(l.accountId)?.type === 'loan') return []
    return [{ l, value: entryValue(entry, l, snapshot.fx) }]
  })
  const addTo = (group: Holding, l: (typeof units)[number]['l'], value: Cents) => {
    group.accounts.add(l.accountId)
    group.total += value
    group.lineIds.push(l.id)
    if (value > group.top) {
      group.top = value
      group.name = l.name
    }
  }
  const newGroup = (): Holding => {
    const group: Holding = { name: '', top: -Infinity, accounts: new Set<string>(), total: 0, lineIds: [] }
    groups.push(group)
    return group
  }
  for (const { l, value } of units.filter((u) => u.l.quoteSymbol)) {
    let group = bySymbol.get(l.quoteSymbol!)
    if (!group) {
      group = newGroup()
      bySymbol.set(l.quoteSymbol!, group)
    }
    if (!byName.has(plainName(l.name))) byName.set(plainName(l.name), group)
    addTo(group, l, value)
  }
  for (const { l, value } of units.filter((u) => !u.l.quoteSymbol)) {
    const key = plainName(l.name)
    let group = byName.get(key)
    if (!group) {
      group = newGroup()
      byName.set(key, group)
    }
    addTo(group, l, value)
  }
  return groups
}
