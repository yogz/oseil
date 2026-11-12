import { FILL } from '@/components/money/HundredSquares'
import type { CategoryId } from '@/lib/model/types'

// The mark of the site, chosen by Nicolas on 9 November 2026 (piste 6 of the logo planche): two
// squares by two, three filled in the colours of the categories and the last one an outline in the
// white of the reference, a square still to fill. An image of no figure: no share is drawn here.
// Its colours since 12 November 2026 (option B1): the available money, the markets, the gold, in the
// order of the grid.
// The same drawing lives in scripts/icons/ for the browser tab and the iPhone home screen.
const FILLED: CategoryId[] = ['available', 'markets', 'gold']

const SIZES = {
  small: { grid: 'grid-cols-[repeat(2,0.5rem)] gap-0.5', outline: 'border', word: 'text-subtitle' },
  large: { grid: 'grid-cols-[repeat(2,1.375rem)] gap-0.5', outline: 'border-2', word: 'text-title' },
} as const

export function Brand({ size = 'small' }: { size?: keyof typeof SIZES }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span aria-hidden="true" data-brand-mark="" className={`grid ${SIZES[size].grid}`}>
        {FILLED.map((category) => (
          <span key={category} className={`aspect-square rounded-square ${FILL[category]}`} />
        ))}
        <span className={`aspect-square rounded-square border-ink ${SIZES[size].outline}`} />
      </span>
      <span className={`${SIZES[size].word} font-display font-semibold leading-none tracking-[-0.01em] text-ink`}>Oseil</span>
    </span>
  )
}
