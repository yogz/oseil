'use client'

import type { ModelState } from '@/lib/app/use-model'
import { todayIso } from '@/lib/dates'
import { monArgentView } from '@/lib/screens/mon-argent'
import { useTopMenuInfo } from './top-menu-info'

// The menu at the top (a computer) is the same on every screen: « Mettre à jour » when it is on
// offer. A screen that is not Mon argent tells it from the model, so the menu never changes with the
// page it sits over.
export function useMenuFromModel(state: ModelState) {
  const base = state.status === 'ready' ? monArgentView(state.model, todayIso()) : null
  useTopMenuInfo({ canUpdate: base?.kind === 'board' ? base.update.available : null })
}
