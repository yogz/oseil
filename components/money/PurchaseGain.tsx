'use client'

// The gain since purchase of « Placements en bourse » (decided by Nicolas, 10 November 2026): once in
// the header, then one signed figure under each chapter's share. It follows the screen's € / % mode.
// « — » is unknown (no purchase price), never zero. VoiceOver is given words, never « + » or « − ».

import { GoalBar } from '@/components/money/GoalBar'
import { FILL, HOME_FILL } from '@/components/money/HundredSquares'
import { useDisplayMode } from '@/components/money/display-mode-context'
import type { CategoryId } from '@/lib/model/types'
import type { CategoryDetailView, DetailChapter, Tone } from '@/lib/screens/category-detail'

const TONES: Record<Tone, string> = { gain: 'text-gain', loss: 'text-loss', zero: 'text-ink-muted' }

export function PurchaseGain({ gain }: { gain: NonNullable<CategoryDetailView['purchaseGain']> }) {
  const { mode } = useDisplayMode()
  if (gain.kind === 'unknown') return <p className="mt-1 text-caption leading-relaxed text-ink-muted">{gain.text}</p>
  return (
    <p className="mt-1 text-caption leading-relaxed">
      <span aria-hidden="true">
        <span className={`tabular-nums ${TONES[gain.figure.tone[mode]]}`}>{gain.figure[mode]}</span>{' '}
        <span className="text-ink-muted">{gain.rest}</span>
      </span>
      <span className="sr-only">{gain.said[mode]}</span>
    </p>
  )
}

// Under a chapter's name and share: its squares and count on the left, its gain on the right. The
// row's button already says all of it to VoiceOver when the gain is told. A group of Immobilier
// adds what it is compared with, and the rental's goal bar.
export function ChapterFoot({ chapter, category }: { chapter: DetailChapter; category: CategoryId }) {
  if (chapter.aim === null && chapter.goal === null) return <ChapterCount chapter={chapter} category={category} last />
  // A group with nothing to count (« En location » kept for its goal share alone): its bar and its gap only.
  const counted = chapter.sub !== '' || chapter.squares > 0 || chapter.gain !== null
  return (
    <div className="flex flex-col pb-2">
      {counted ? <ChapterCount chapter={chapter} category={category} last={false} /> : null}
      {chapter.goal ? (
        <div className="mt-2">
          <GoalBar
            place="detail"
            category={category}
            actual={chapter.goal.actual}
            target={chapter.goal.target}
            // Its own scale, as the header's bar of a detail: one bar alone, compared with no other.
            scale={Math.max(chapter.goal.actual, chapter.goal.target)}
          />
        </div>
      ) : null}
      {chapter.aim ? <p className="mt-1 text-caption text-ink-muted">{chapter.aim}</p> : null}
    </div>
  )
}

// `last`: nothing follows it under the chapter's name, so it keeps the chapter's bottom space.
function ChapterCount({ chapter, category, last }: { chapter: DetailChapter; category: CategoryId; last: boolean }) {
  const { mode } = useDisplayMode()
  return (
    <div
      aria-hidden={chapter.said ? true : undefined}
      className={`flex items-start gap-3 text-caption text-ink-muted ${last ? 'pb-2' : ''}`}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        {chapter.squares > 0 ? (
          <span aria-hidden="true" className="flex flex-wrap gap-0.5">
            {Array.from({ length: chapter.squares }, (_, i) => (
              <span key={i} className={`size-square-s rounded-square ${chapter.home ? HOME_FILL : FILL[category]}`} />
            ))}
          </span>
        ) : null}
        <span>{chapter.sub}</span>
      </div>
      {chapter.gain === null ? null : (
        <span
          data-gain=""
          className={`shrink-0 text-right tabular-nums ${chapter.gain === 'unknown' ? 'text-ink-muted' : TONES[chapter.gain.tone[mode]]}`}
        >
          {chapter.gain === 'unknown' ? '—' : chapter.gain[mode]}
        </span>
      )}
    </div>
  )
}
