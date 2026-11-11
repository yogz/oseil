// The « Ranger par zone / par type » screen: one proposed chapter per open line of the category.
// Pure view, built in the browser from the decrypted profile.

import { CATEGORIES, GROUP_LABELS, RANGED_GROUPS, type RangedCategory } from '@/lib/catalog'
import { categoryOf } from '@/lib/model/situation'
import type { GroupId, Profile } from '@/lib/model/types'
import { REASON_WORDS, suggestGroup, UNGUESSED } from '@/lib/screens/suggest-group'
import { whereWords } from '@/lib/screens/words'

export type RangingRow = { lineId: string; name: string; chosen: GroupId; reason: string | null; where: string }
export type RangingView = {
  title: string
  intro: string
  back: { href: string; label: string }
  rows: RangingRow[]
  options: Array<{ id: GroupId; label: string }>
}

const INTRO =
  'Une proposition pour chaque ligne. Change-la d’un toucher si elle ne te va pas ; rien n’est rangé avant « Valider ».'

export function rangingView(profile: Profile, category: RangedCategory): RangingView {
  const accounts = new Map(profile.accounts.map((a) => [a.id, a]))
  const rows: RangingRow[] = []
  for (const line of profile.lines) {
    const account = accounts.get(line.accountId)
    if (!account || line.closedOn !== undefined || categoryOf(line, account) !== category) continue
    const establishment = profile.establishments.find((e) => e.id === account.establishmentId)
    if (!establishment) continue
    const where = whereWords(line, account, establishment)
    // A stored group is kept as it is, « Je ne sais pas » included: a refused proposal does not come back.
    // One that belongs to another category (the line was moved) counts as absent.
    if (line.group !== undefined && (RANGED_GROUPS[category] as readonly GroupId[]).includes(line.group)) {
      rows.push({ lineId: line.id, name: line.name, chosen: line.group, reason: null, where })
      continue
    }
    const proposal = suggestGroup(line, account, category)
    rows.push(
      proposal
        ? { lineId: line.id, name: line.name, chosen: proposal.group, reason: REASON_WORDS[proposal.reason], where }
        : { lineId: line.id, name: line.name, chosen: 'unknown', reason: UNGUESSED, where },
    )
  }
  return {
    title: category === 'markets' ? 'Ranger par zone' : 'Ranger par type',
    intro: INTRO,
    back: { href: `/categorie/${category}`, label: `‹ ${CATEGORIES[category].label}` },
    rows,
    options: RANGED_GROUPS[category].map((id) => ({ id, label: GROUP_LABELS[id] })),
  }
}
