import Link from 'next/link'
import type { Glance } from '@/lib/screens/glance'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

type Card = NonNullable<Glance['cushion']>

// One column of the glance: no box (B5, rules not cards), its title on one line, the screen it opens
// at the end, where it never squeezes the title onto two lines (A2).
function GlanceCard({ card, name }: { card: Card; name: string }) {
  return (
    <Link href={card.href} className={`flex min-w-0 flex-col py-1 ${FOCUS}`}>
      <span className="truncate whitespace-nowrap text-caption text-ink-muted">{card.title}</span>
      {card.big ? <span className="mt-1.5 block text-title font-semibold text-ink">{card.big}</span> : null}
      <span className="mt-1 block text-caption leading-relaxed text-ink-soft">{card.sentence}</span>
      <span className="mt-2 text-caption text-ink-muted">{name} ›</span>
    </Link>
  )
}

// The two glance columns under the categories, on a computer: the cushion (to Repères) and the
// progress since the first snapshot (to Évolution), separated by a hairline. One with nothing to
// say is not drawn.
export function GlanceCards({ glance }: { glance: Glance }) {
  if (!glance.cushion && !glance.progress) return null
  return (
    <div className="mt-6 grid grid-cols-2 border-t border-hairline pt-4 [&>*+*]:border-l [&>*+*]:border-hairline [&>*+*]:pl-5 [&>*:first-child]:pr-5">
      {glance.cushion ? <GlanceCard card={glance.cushion} name="Repères" /> : null}
      {glance.progress ? <GlanceCard card={glance.progress} name="Évolution" /> : null}
    </div>
  )
}
