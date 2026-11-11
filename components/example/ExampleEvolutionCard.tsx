import Link from 'next/link'
import type { EvolutionPoint } from '@/lib/screens/evolution'

// Piste B (Nicolas, 10 November 2026), in the example only: right under the grid, a card that opens
// the evolution, with a small curve of the person's snapshots, so a visitor sees at once that Oseil
// follows a year. The real Mon argent keeps its row at the bottom. The curve takes the look of the
// real chart (components/evolution/EvolutionChart.tsx): the line in ink-soft, its cap in white.

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const WIDTH = 64
const HEIGHT = 30
const PAD = 3

export function ExampleEvolutionCard({ href, points, gain }: { href: string; points: EvolutionPoint[]; gain: string }) {
  const nets = points.map((p) => p.net)
  const low = Math.min(...nets)
  const span = Math.max(...nets) - low || 1
  const at = points.map((p, i) => ({
    x: PAD + (i * (WIDTH - 2 * PAD)) / Math.max(points.length - 1, 1),
    y: HEIGHT - PAD - ((p.net - low) / span) * (HEIGHT - 2 * PAD),
  }))
  return (
    <Link href={href} className={`mt-4 flex min-h-11 items-center gap-3 rounded-control border border-rule-strong px-3.5 py-3 ${FOCUS}`}>
      <svg aria-hidden="true" width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="shrink-0">
        <polyline points={at.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" className="stroke-ink-soft" strokeWidth={1.6} />
        {at.map((p, i) =>
          i === at.length - 1 ? (
            <circle key={i} cx={p.x} cy={p.y} r={2.6} className="fill-ink" />
          ) : (
            <circle key={i} cx={p.x} cy={p.y} r={2} className="fill-ground stroke-ink-soft" strokeWidth={1.2} />
          ),
        )}
      </svg>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body text-ink">Son évolution sur un an</span>
        <span className="text-caption tabular-nums text-ink-soft">
          {gain} · {points.length}&nbsp;relevés
        </span>
      </span>
      <span aria-hidden="true" className="w-5 shrink-0 text-right text-ink-muted">
        ›
      </span>
    </Link>
  )
}
