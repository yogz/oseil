// « Ta grille : sans chez toi » (docs/superpowers/specs/2026-11-12-grille-sans-chez-toi-design.md): the one
// rule Mon argent, a category's detail and Évolution follow. Repères and the goals never do: they already
// leave Chez toi out. Unreadable settings count everything, as before the setting existed.
//
// Decided once, on the latest snapshot, then applied to every snapshot alike: a snapshot left whole among
// others without the home would make up a gain or a loss (review of 12 November 2026).
import type { Model } from '@/lib/app/use-model'
import { convertible } from '@/lib/market/live'
import { computeSituation, snapshotWithoutHome } from '@/lib/model/situation'
import type { Profile, Snapshot } from '@/lib/model/types'

// 'none' without anything Chez toi (nothing to leave out); 'only-home' when what would be left is nothing,
// or not positive (a loan bigger than the cash: « ce que tu dois dépasse ce que tu possèdes » would be false
// for someone who owns their home), so « Sans chez toi » is greyed and never applied; 'choose' otherwise.
// A snapshot that cannot be computed offers nothing.
export function homeChoice(model: Model): 'none' | 'only-home' | 'choose' {
  const latest = model.snapshots.at(-1)
  if (!model.profile || !latest) return 'none'
  const profile = model.profile.value
  const { snapshot } = convertible(profile, latest.value)
  const stripped = snapshotWithoutHome(profile, snapshot)
  if (stripped === snapshot) return 'none'
  try {
    const left = computeSituation(profile, stripped)
    return left.owned > 0 && left.net > 0 ? 'choose' : 'only-home'
  } catch {
    return 'none'
  }
}

export const leavesHome = (model: Model) =>
  model.unreadable.settings === 0 && model.settings?.value.withoutHome === true && homeChoice(model) === 'choose'

// The snapshots as the screens read them: without Chez toi when the setting applies, as they are otherwise.
export function homeFilter(model: Model, profile: Profile): (snapshot: Snapshot) => Snapshot {
  return leavesHome(model) ? (snapshot) => snapshotWithoutHome(profile, snapshot) : (snapshot) => snapshot
}
