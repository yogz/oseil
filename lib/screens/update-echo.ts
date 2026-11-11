// The echo of the bank just updated (Nicolas, 10 November 2026): back on Mon argent right after an
// update in which only some banks were seen (« Terminer ici », « Passer pour cette fois »), the lines
// seen now light once, to show where the update landed. A full update lights nothing. Pure: no React.

import type { Profile, Snapshot } from '@/lib/model/types'

// The lines of `snapshot` seen on its own date, when at least one other line kept an older date;
// otherwise none. A house keeps its estimate date even in a bank done (lib/update/build.ts): its
// older date never counts as a bank left aside.
export function echoLines(profile: Profile, snapshot: Snapshot): string[] {
  const homes = new Set(profile.accounts.filter((a) => a.type === 'home').map((a) => a.id))
  const accountOf = new Map(profile.lines.map((l) => [l.id, l.accountId]))
  const seen = snapshot.entries.filter((e) => e.seenOn === snapshot.takenOn).map((e) => e.lineId)
  const leftAside = snapshot.entries.some((e) => e.seenOn !== snapshot.takenOn && !homes.has(accountOf.get(e.lineId) ?? ''))
  return leftAside ? seen : []
}
