'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { FILL } from '@/components/money/HundredSquares'
import { TEXT_LINK } from '@/components/setup/styles'
import { RESIDENCE_LABELS } from '@/lib/catalog'
import type { CategoryId } from '@/lib/model/types'
import type { LineSheetView, SheetRow } from '@/lib/screens/line-sheet'
import {
  ACCOUNT_SECTION,
  ACCOUNT_TYPE_LABEL,
  BANK_LABEL,
  CATEGORY_LABEL,
  COUNTED_LABEL,
  LINE_SECTION,
  RECOUNT_UNFINISHED,
  CLOSE_EXPLAIN,
  CORRECT_TITLE,
  DELETE_EXPLAIN,
  DELETE_LABEL,
  FINANCED_LABEL,
  FINISH,
  LOAN_PLACE_ACTION,
  LOAN_PLACE_EXPLAIN,
  LOCKED_UNREADABLE,
  LOCKED_UPDATE,
  NAME_LABEL,
  PLACE_LABEL,
  PRICE_AUTOMATIC,
  PRICE_LABEL,
  REOPEN,
  RESIDENCE_LABEL,
  SLOW_LABEL,
  TOO_EARLY,
  RESUME,
  UNFINISHED,
  CLOSED,
  UNLOCK_LABEL,
  UNLOCK_UNKNOWN,
} from '@/lib/screens/line-words'
import { titlesFromLine } from '@/lib/screens/titles'
import { TYPED } from '@/lib/screens/words'

export type Editing = SheetRow['kind'] | 'close' | 'delete' | 'recount-finish' | null

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
export const BACK = `inline-flex min-h-11 items-center self-start text-body text-ink-soft ${FOCUS}`
const ROW = 'flex min-h-13 w-full items-center justify-between gap-3 border-t border-hairline text-left'

function rowLabel(row: SheetRow): string {
  switch (row.kind) {
    case 'name':
      return NAME_LABEL
    case 'figures':
    case 'group':
      return row.label
    case 'place':
      return PLACE_LABEL
    case 'price':
      return PRICE_LABEL
    case 'financed':
      return FINANCED_LABEL
    case 'unlock':
      return UNLOCK_LABEL
    case 'slow':
      return SLOW_LABEL
    case 'residence':
      return RESIDENCE_LABEL
    case 'purchase':
      return row.label
    case 'category':
      return CATEGORY_LABEL
    case 'counted':
      return COUNTED_LABEL
    case 'accountType':
      return ACCOUNT_TYPE_LABEL
    case 'bank':
      return BANK_LABEL
  }
}

function rowValue(row: SheetRow): string {
  switch (row.kind) {
    case 'name':
    case 'figures':
    case 'group':
    case 'place':
    case 'financed':
      return row.value
    case 'price':
      return row.following ? PRICE_AUTOMATIC : TYPED
    case 'unlock':
      return row.year === null ? UNLOCK_UNKNOWN : String(row.year)
    case 'slow':
      return row.slow ? 'non' : 'oui'
    case 'residence':
      return RESIDENCE_LABELS[row.residence]
    case 'purchase':
    case 'category':
    case 'counted':
    case 'accountType':
    case 'bank':
      return row.value
  }
}

// The fiche of a line: what it is, then what can be corrected. `form`, when there is one, takes the
// place of the corrections, so only one thing is corrected at a time.
export function LineSheet({
  view,
  form,
  notice = null,
  onEdit,
}: {
  view: LineSheetView
  form: ReactNode
  // What a one-tap action (reopen, finish) could not do.
  notice?: string | null
  onEdit: (editing: Editing) => void
}) {
  const locked = view.locked !== null
  return (
    <div className="flex flex-col">
      <Link href={view.back.href} className={BACK}>
        ‹ {view.back.label}
      </Link>
      {/* B8: the square of its category beside its name, as in the lists; a loan has none. */}
      <h1 className="flex items-center gap-2.5 pt-2 text-title font-semibold leading-tight tracking-[-0.01em]">
        {view.category ? (
          <span aria-hidden="true" data-category={view.category} className={`size-3 shrink-0 rounded-square ${FILL[view.category]}`} />
        ) : null}
        {view.name}
      </h1>
      <p className="text-caption text-ink-muted">{view.where}</p>
      {/* A loan is a debt, never in red. */}
      <p className="mt-2 text-hero font-semibold leading-tight hero-figure text-ink">
        {view.amount ?? null}
      </p>
      {/* What a loan still owes on it, as the category detail says it: a debt, never in red. */}
      {view.debt ? <p className="text-body leading-relaxed text-ink-soft">{view.debt}</p> : null}
      {view.amountNote ? <p className="text-body leading-relaxed text-ink-soft">{view.amountNote}</p> : null}
      <p className="mt-1 text-caption leading-relaxed text-ink-soft">{view.detail}</p>

      {view.locked === 'update-running' ? (
        <div role="status" className="mt-4 flex flex-col gap-1 rounded-control bg-field px-4 py-3">
          <p className="text-body leading-relaxed text-ink">{LOCKED_UPDATE}</p>
          <Link href="/mise-a-jour" className={TEXT_LINK}>
            {RESUME}
          </Link>
        </div>
      ) : null}
      {view.locked === 'unreadable' ? (
        <p role="status" className="mt-4 rounded-control bg-field px-4 py-3 text-body leading-relaxed text-ink">
          {LOCKED_UNREADABLE}
        </p>
      ) : null}

      {view.state.kind === 'closed' ? (
        <div className="mt-4 flex flex-col gap-1">
          <p className="text-body leading-relaxed text-ink">{CLOSED(view.state.on)}</p>
          {!locked ? (
            <button type="button" className={TEXT_LINK} onClick={() => onEdit('close')}>
              {REOPEN}
            </button>
          ) : null}
          {notice ? (
            <p role="alert" className="text-body leading-relaxed text-ink">
              {notice}
            </p>
          ) : null}
        </div>
      ) : null}
      {view.state.kind === 'closing-unfinished' ? (
        <div className="mt-4 flex flex-col gap-1">
          <p className="text-body leading-relaxed text-ink">{UNFINISHED(view.state.on)}</p>
          {!locked ? (
            <button type="button" className={TEXT_LINK} onClick={() => onEdit('close')}>
              {FINISH}
            </button>
          ) : null}
          {notice ? (
            <p role="alert" className="text-body leading-relaxed text-ink">
              {notice}
            </p>
          ) : null}
        </div>
      ) : null}

      {view.state.kind === 'recount-unfinished' ? (
        <div className="mt-4 flex flex-col gap-1">
          <p className="text-body leading-relaxed text-ink">{RECOUNT_UNFINISHED}</p>
          {!locked ? (
            <button type="button" className={TEXT_LINK} onClick={() => onEdit('recount-finish')}>
              {FINISH}
            </button>
          ) : null}
          {notice ? (
            <p role="alert" className="text-body leading-relaxed text-ink">
              {notice}
            </p>
          ) : null}
        </div>
      ) : null}

      {view.state.kind === 'open' ? (
        form ?? (
          <>
            {view.loanAtHome && !locked ? (
              <div className="mt-4 flex flex-col gap-1 rounded-control bg-field px-4 py-3">
                <p className="text-body leading-relaxed text-ink-soft">{LOAN_PLACE_EXPLAIN}</p>
                <button type="button" className={TEXT_LINK} onClick={() => onEdit('bank')}>
                  {LOAN_PLACE_ACTION}
                </button>
              </div>
            ) : null}

            <h2 className="mt-6 text-caption font-normal text-ink-muted">{CORRECT_TITLE}</h2>
            {/* Two parts: what belongs to this line, then what belongs to its whole account. */}
            <h3 className="mt-3 text-body font-medium text-ink">{LINE_SECTION}</h3>
            <div className="mt-1 flex flex-col border-b border-hairline">
              {view.rows.map((row) => (
                <Row key={row.kind} row={row} lineId={view.lineId} locked={locked} onEdit={onEdit} />
              ))}
            </div>
            {view.accountTitle !== null ? (
              <>
                <h3 className="mt-6 flex flex-wrap items-baseline gap-x-2 text-body font-medium text-ink">
                  {ACCOUNT_SECTION}
                  <span className="text-caption font-normal text-ink-muted">{view.accountTitle}</span>
                </h3>
                <div className="mt-1 flex flex-col border-b border-hairline">
                  {view.accountRows.map((row) => (
                    <Row key={row.kind} row={row} lineId={view.lineId} locked={locked} onEdit={onEdit} />
                  ))}
                </div>
              </>
            ) : null}

            {!locked ? (
              <div className="mt-6 flex flex-col">
                {view.close.possible ? (
                  <>
                    <button type="button" className={TEXT_LINK} onClick={() => onEdit('close')}>
                      {view.close.label}
                    </button>
                    <p className="mb-4 text-caption leading-snug text-ink-muted">{CLOSE_EXPLAIN}</p>
                  </>
                ) : (
                  <p className="mb-4 text-body leading-relaxed text-ink-soft">{TOO_EARLY}</p>
                )}
                {/* Always offered: a line that is the only one of a snapshot is refused with a sentence. */}
                <button type="button" className={TEXT_LINK} onClick={() => onEdit('delete')}>
                  {DELETE_LABEL}
                </button>
                <p className="text-caption leading-snug text-ink-muted">{DELETE_EXPLAIN}</p>
              </div>
            ) : null}
          </>
        )
      ) : null}
    </div>
  )
}

function Row({
  row,
  lineId,
  locked,
  onEdit,
}: {
  row: SheetRow
  lineId: string
  locked: boolean
  onEdit: (editing: Editing) => void
}) {
  // The rate of purchases says under its name where it comes from: Oseil, the person, or euros.
  const label =
    row.kind === 'purchase' ? (
      <span className="flex flex-col py-2">
        <span className="text-body text-ink">{rowLabel(row)}</span>
        <span className="text-caption text-ink-muted">{row.note}</span>
      </span>
    ) : (
      <span className="text-body text-ink">{rowLabel(row)}</span>
    )
  const value = (
    <span className={`min-w-0 truncate text-right text-body text-ink-muted ${row.kind === 'purchase' ? 'tabular-nums' : ''}`}>
      {row.kind === 'category' ? <CategorySquare category={row.category} /> : null}
      {rowValue(row)}
      {locked ? null : <span aria-hidden="true"> ›</span>}
    </span>
  )
  if (locked) {
    return (
      <div className={ROW}>
        {label}
        {value}
      </div>
    )
  }
  if (row.kind === 'price') {
    return (
      <Link href={titlesFromLine(lineId)} className={`${ROW} ${FOCUS}`}>
        {label}
        {value}
      </Link>
    )
  }
  return (
    <button type="button" className={`${ROW} ${FOCUS}`} onClick={() => onEdit(row.kind)}>
      {label}
      {value}
    </button>
  )
}

// The square of a category before its name, as in the lists.
function CategorySquare({ category }: { category: CategoryId }) {
  return (
    <span
      aria-hidden="true"
      data-category={category}
      className={`mr-2 inline-block size-square-s rounded-square align-middle ${FILL[category]}`}
    />
  )
}
