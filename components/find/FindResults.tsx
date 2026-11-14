'use client'

// What « Trouver » answers (planche 9F): the answer on top, the groups of rows, « Ce que tu peux faire »,
// then the footer sentence. It draws `findView` and computes nothing.

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { FILL } from '@/components/money/HundredSquares'
import { FOCUS, SMALL_LINK } from '@/components/setup/styles'
import type { FindAnswer, FindGroup, FindRow, FindView } from '@/lib/screens/find'
import { ACTIONS_TITLE } from '@/lib/screens/find-words'

const GROUP = 'mt-6 flex flex-col gap-1 border-t border-hairline pt-4'
const GROUP_TITLE = 'text-subtitle font-semibold'
const SENTENCE = 'mt-6 text-body leading-relaxed text-ink-soft'

export function FindResults({ view }: { view: FindView }) {
  if (view.kind === 'empty') return <p className={SENTENCE}>{view.hint}</p>
  if (view.kind === 'none') return <p className={SENTENCE}>{view.sentence}</p>
  return (
    <div className="flex flex-col">
      {view.answer ? <Answer answer={view.answer} /> : null}
      {view.groups.map((group) => (
        <Group key={group.title} group={group} />
      ))}
      {view.actions.length > 0 ? (
        <section aria-label={ACTIONS_TITLE} className={GROUP}>
          <h2 className={GROUP_TITLE}>{ACTIONS_TITLE}</h2>
          <ul className="flex flex-col divide-y divide-hairline">
            {view.actions.map((row) => (
              <li key={`${row.href} ${row.title}`}>
                <Row row={row} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="mt-8 text-caption leading-relaxed text-ink-muted">{view.footer}</p>
    </div>
  )
}

function Answer({ answer }: { answer: FindAnswer }) {
  return (
    <section aria-label={answer.title} className="mt-6 flex flex-col gap-1">
      <h2 className="text-subtitle font-semibold text-ink">{answer.title}</h2>
      <p className="text-hero font-semibold leading-tight hero-figure tabular-nums text-ink">{answer.amount}</p>
      {answer.detail ? <p className="text-caption leading-relaxed text-ink-soft tabular-nums">{answer.detail}</p> : null}
    </section>
  )
}

// The rows beyond the first five come in place; the focus goes to the first of them, so a keyboard or
// VoiceOver goes on reading where the list grew.
function Group({ group }: { group: FindGroup }) {
  const [open, setOpen] = useState(false)
  const firstRevealed = useRef<HTMLAnchorElement>(null)
  const opened = useRef(false)
  useEffect(() => {
    if (open && !opened.current) {
      opened.current = true
      firstRevealed.current?.focus()
    }
  }, [open])
  const rows = open ? [...group.rows, ...group.more] : group.rows
  return (
    <section aria-label={group.title} className={GROUP}>
      <h2 className={GROUP_TITLE}>{group.title}</h2>
      <ul className="flex flex-col divide-y divide-hairline">
        {rows.map((row, i) => (
          <li key={`${row.href} ${row.title}`}>
            <Row row={row} linkRef={i === group.rows.length ? firstRevealed : undefined} />
          </li>
        ))}
      </ul>
      {!open && group.moreLabel && group.more.length > 0 ? (
        <button type="button" className={SMALL_LINK} onClick={() => setOpen(true)}>
          {group.moreLabel}
        </button>
      ) : null}
    </section>
  )
}

function Row({ row, linkRef }: { row: FindRow; linkRef?: React.Ref<HTMLAnchorElement> }) {
  return (
    <Link ref={linkRef} href={row.href} className={`flex min-h-11 items-center gap-3 py-2.5 text-body ${FOCUS}`}>
      {row.category ? (
        <span aria-hidden="true" data-category={row.category} className={`size-square-s shrink-0 rounded-square ${FILL[row.category]}`} />
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <Title title={row.title} hit={row.hit} />
        {row.where ? <span className="text-caption text-ink-muted">{row.where}</span> : null}
      </span>
      {row.amount ? <span className="shrink-0 tabular-nums text-ink">{row.amount}</span> : null}
      <span aria-hidden="true" className="shrink-0 text-ink-muted">
        ›
      </span>
    </Link>
  )
}

// The letters found in bold, in the colour of the text; the rest softened. Found by another word: the
// whole title in the colour of the text.
function Title({ title, hit }: { title: string; hit: [number, number] | null }) {
  if (!hit) return <span className="text-ink">{title}</span>
  const [start, end] = hit
  return (
    <span className="text-ink-soft">
      {title.slice(0, start)}
      <span data-hit="" className="font-semibold text-ink">
        {title.slice(start, end)}
      </span>
      {title.slice(end)}
    </span>
  )
}
