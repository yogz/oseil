'use client'

// The body of the « À compléter » block of Repères (planche 5B): its lead, three rows, the rest folded
// behind one button that opens them in place and then goes. The section frame is the page's own.

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { ReperesView } from '@/lib/screens/reperes'

type Block = NonNullable<Extract<ReperesView, { kind: 'ready' }>['toComplete']>

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

export function ToComplete({ block }: { block: Block }) {
  const [open, setOpen] = useState(false)
  const rows = open ? [...block.shown, ...block.more] : block.shown
  // The button goes once pressed: focus moves to the first row it revealed, not back to the page.
  const firstRevealed = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    if (open) firstRevealed.current?.focus()
  }, [open])
  return (
    <>
      <p className="text-body leading-relaxed text-ink-soft">{block.lead}</p>
      <ul className="flex flex-col">
        {rows.map((item, index) => (
          <li key={`${item.kind}-${item.category ?? ''}-${item.lineIds[0]}`} className="border-t border-hairline first:border-t-0">
            <Link
              href={item.href}
              ref={index === block.shown.length ? firstRevealed : undefined}
              className={`flex min-h-11 items-center justify-between gap-3 py-3 ${FOCUS}`}>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-body text-ink">{item.what}</span>
                <span className="text-caption text-ink-muted">{item.why}</span>
              </span>
              <span aria-hidden="true" className="text-ink-muted">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {!open && block.moreLabel ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`min-h-11 self-start text-caption text-ink-soft underline underline-offset-4 ${FOCUS}`}
        >
          {block.moreLabel}
        </button>
      ) : null}
    </>
  )
}
