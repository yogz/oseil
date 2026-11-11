import type { CategoryId } from '@/lib/model/types'
import { FILL } from './HundredSquares'

// The square of a category's colour, in its row of Mon argent and before the title of its detail
// (planche 1, option C, Nicolas, 10 November 2026). It used to travel from the row to the title when
// the screen changed; Nicolas asked for it to stay still (10 November 2026, on his phone): only the
// screen fades.
export function CategorySquare({ category, className }: { category: CategoryId; className: string }) {
  return <span aria-hidden="true" className={`shrink-0 rounded-square ${FILL[category]} ${className}`} />
}
