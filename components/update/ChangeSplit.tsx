import type { ResultView } from '@/lib/update/result'

type Split = Extract<ResultView, { kind: 'result' }>['split']

// White is the colour of a reference (the goal's line), never of a figure (B4): the effort is a
// filled grey, the markets an empty outline, the house its own colour. Each row carries its piece.
const FILL = {
  effort: 'bg-ink-muted',
  markets: 'border border-ink-muted',
  property: 'bg-cat-property',
  existing: 'border border-hairline',
} as const

// How the change splits between your effort, the markets and the house re-estimated.
// The bar exists only when no part is negative; the rows always do. Red is for a row
// that lost money, never for the effort. The bar is a share bar: as thin as the others (B3).
export function ChangeSplit({ split }: { split: Split }) {
  return (
    <div className="flex flex-col gap-4">
      {split.bar && (
        <div className="flex h-1.5 w-full gap-0.5" aria-hidden="true">
          {split.bar.map((p) => (
            <div
              key={p.part}
              data-testid="split-part"
              className={`h-full rounded-square ${FILL[p.part]}`}
              style={{ width: `${p.share * 100}%` }}
            />
          ))}
        </div>
      )}
      <ul className="flex flex-col">
        {split.rows.map((r) => (
          <li key={r.part} className="flex items-start justify-between gap-4 border-b border-hairline py-3">
            <span className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-2 text-body font-semibold text-ink">
                {split.bar && r.part !== 'existing' ? (
                  <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-square ${FILL[r.part]}`} />
                ) : null}
                {r.label}
              </span>
              <span className="text-caption leading-snug text-ink-muted">{r.detail}</span>
            </span>
            <span className={`shrink-0 text-body tabular-nums ${r.loss ? 'text-loss' : 'text-ink'}`}>
              {r.amount}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
