'use client'

import Link from 'next/link'
import { HundredSquares } from '@/components/money/HundredSquares'
import { CATEGORY_ORDER } from '@/lib/catalog'

// The same split as the welcome of the first launch: it is nobody's money, and it says no amount.
const EXAMPLE_SPLIT = [20, 20, 25, 5, 30]
const EXAMPLE = CATEGORY_ORDER.map((category, i) => ({ category, count: EXAMPLE_SPLIT[i] }))

// The grid arrives once, then stays. Touching it opens the example. Its size is set by the page
// around it (app/(public)/accueil/page.tsx), in CSS only: as wide as it may be in its box.
export function LandingGrid() {
  return (
    <Link
      href="/exemple"
      aria-label="Ouvrir l’exemple"
      className="mx-auto block w-[min(100cqw,100cqh)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:w-full"
    >
      <HundredSquares squares={EXAMPLE} animate label="Une grille de cent carrés, en exemple" />
    </Link>
  )
}
