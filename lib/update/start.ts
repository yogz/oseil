// What the departure screen of the update shows: one row per establishment (the
// steps of the first launch, empty ones included), where each stands, and the
// next one to do. Pure: no React, no database.

import type { Profile, StepStatus, UpdateDraft } from '@/lib/model/types'
import { steps } from '@/lib/setup/first-launch'
import { linesOf, touchedHere } from './draft'

// `current`: begun (a value typed, a line confirmed or added) and not yet marked done or skipped.
export type StartRow = { id: string; name: string; status: 'todo' | 'current' | StepStatus; detail: string }

// A line closed in this update is not counted: it is leaving.
function detailOf(profile: Profile, draft: UpdateDraft, establishmentId: string): string {
  const open = linesOf(profile, draft, establishmentId).filter((l) => !l.closed)
  if (open.length === 0) return 'aucun compte'
  // Only how many: the names of the lines are read once, in the bank itself.
  return `${open.length} ${open.length === 1 ? 'ligne' : 'lignes'}`
}

export function startView(
  profile: Profile,
  draft: UpdateDraft,
): { rows: StartRow[]; done: number; next: { id: string; name: string } | null } {
  const begun = (id: string) => touchedHere(profile, draft, id)
  const rows: StartRow[] = steps(profile).map((e) => ({
    id: e.id,
    name: e.name,
    status: draft.progress[e.id] ?? (begun(e.id) ? 'current' : 'todo'),
    detail: detailOf(profile, draft, e.id),
  }))
  const next = rows.find((r) => r.status === 'todo' || r.status === 'current')
  return {
    rows,
    done: rows.filter((r) => r.status === 'done').length,
    next: next ? { id: next.id, name: next.name } : null,
  }
}
