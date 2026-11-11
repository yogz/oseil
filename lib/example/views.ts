// What the example's three pages show: the real screens' pure views over the invented person, at
// its own date, without prices (it follows none).
//
// « Masquer les montants » belongs to a real account and never applies here: a tab that showed a
// real Mon argent with hidden amounts before has left that flag set (lib/format.ts), so each view
// clears it first. A real screen sets it again from its own settings before formatting anything
// (lib/app/use-model.ts).
//
// Every sentence of a view is turned to the third person (./third-person.ts): the example speaks of
// its person, not to the visitor.

import { setAmountsHidden } from '@/lib/format'
import type { CategoryId } from '@/lib/model/types'
import { categoryDetailView, type CategoryDetailView } from '@/lib/screens/category-detail'
import { evolutionView, type EvolutionView } from '@/lib/screens/evolution'
import { monArgentView, type Board } from '@/lib/screens/mon-argent'
import { EXAMPLE_TODAY, examplePerson } from './person'
import { thirdPersonDeep } from './third-person'

export function exampleBoard(): Board {
  setAmountsHidden(false)
  const view = monArgentView(examplePerson(), EXAMPLE_TODAY)
  // The person is written once for all and tested: anything else is a bug in it.
  if (view.kind !== 'board') throw new Error(`the example person gives no board (${view.kind})`)
  return thirdPersonDeep(view)
}

export function exampleDetail(category: CategoryId): CategoryDetailView | null {
  setAmountsHidden(false)
  return thirdPersonDeep(categoryDetailView(examplePerson(), category, EXAMPLE_TODAY))
}

export function exampleEvolution(): EvolutionView {
  setAmountsHidden(false)
  return thirdPersonDeep(evolutionView(examplePerson(), EXAMPLE_TODAY))
}
