import Link from 'next/link'
import { useId, useState } from 'react'
import type { CategoryId } from '@/lib/model/types'
import type { Board } from '@/lib/screens/mon-argent'
import { CategorySquare } from './CategorySquare'
import { Figure } from './Figure'
import { GoalBar } from './GoalBar'
import { FILL, HOME_FILL } from './HundredSquares'

type Row = Board['categories'][number]

function isFocusVisible(element: Element): boolean {
  try {
    return element.matches(':focus-visible')
  } catch {
    return false
  }
}

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

// One category of « Mon argent »: the name leads to its detail, the figure
// flips between euros and percent, the bar (if goals exist) sits under both.
// The figure is a sibling of the link, never inside it: a button in a link
// cannot be told apart from the link by a thumb or a screen reader.
// A category that holds no line and no debt has no detail to open: its name is not a link.
//
// On a computer a row lights up under the mouse (or the keyboard), and `onHover` tells the grid,
// whose squares of that category light up too. A finger lights the squares while it rests on the
// row (`onPress`, planche 2), and the link still opens the detail when it lifts; a finger that
// scrolls away lights nothing more.
export function CategoryRow({
  row,
  scale,
  hovered = false,
  onHover,
  onPress,
  href = `/categorie/${row.category}`,
}: {
  row: Row
  scale: number | null
  hovered?: boolean
  onHover?: (category: CategoryId | null) => void
  onPress?: (category: CategoryId | null) => void
  // Where the name leads: the category's detail (the example has its own).
  href?: string
}) {
  const name = (
    <>
      <CategorySquare category={row.category} className="size-3" />
      <span className="truncate text-body text-ink">{row.name}</span>
    </>
  )
  return (
    <li
      className={`py-1 transition-colors duration-(--motion-short) ease-(--motion-enter) motion-reduce:transition-none lg:-mx-2 lg:rounded-control lg:px-2 ${hovered ? 'lg:bg-field' : ''}`}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') onHover?.(row.category)
      }}
      onPointerDown={(event) => {
        if (event.pointerType === 'touch' || event.pointerType === 'pen') onPress?.(row.category)
      }}
      onPointerUp={() => onPress?.(null)}
      onPointerCancel={() => onPress?.(null)}
      onPointerLeave={() => {
        onHover?.(null)
        onPress?.(null)
      }}
      onFocus={(event) => {
        // Only a keyboard's focus: a finger that taps a figure lights nothing.
        if (isFocusVisible(event.target)) onHover?.(row.category)
      }}
      onBlur={() => onHover?.(null)}
    >
      <div className="flex items-center gap-3">
        {row.linked ? (
          <Link href={href} className={`flex min-h-11 min-w-0 flex-1 items-center gap-3 ${FOCUS}`}>
            {name}
          </Link>
        ) : (
          <span className="flex min-h-11 min-w-0 flex-1 items-center gap-3">{name}</span>
        )}
        <span className="text-body text-ink">
          <Figure euros={row.euros} percent={row.percent} />
        </span>
        {row.linked ? (
          <Link
            href={href}
            aria-hidden="true"
            tabIndex={-1}
            className="flex min-h-11 w-5 items-center justify-end text-ink-muted"
          >
            ›
          </Link>
        ) : (
          <span aria-hidden="true" className="w-5" />
        )}
      </div>
      {row.goal && scale !== null ? (
        <div className="pb-1">
          <GoalBar category={row.category} actual={row.goal.actual} target={row.goal.target} scale={scale} />
          <p className="mt-1 text-caption text-ink-muted">
            {/* The available money aimed at in months says its months and its goal in its words (UI pass, 12 November 2026). */}
            {row.goal.words}
          </p>
        </div>
      ) : null}
      {row.note ? <p className="pb-1 text-caption text-ink-muted">{row.note}</p> : null}
      {row.pockets ? <Pockets pockets={row.pockets} scale={scale} /> : null}
    </li>
  )
}

// Immobilier's two pockets, closed at first (Nicolas, 11 November 2026): one line says where the
// rental stands against its goal, and a touch opens « Chez toi » and « En location » in place, a
// second one closes them. A button, since it acts here; the name and « › » still lead to the detail.
function Pockets({ pockets, scale }: { pockets: NonNullable<Row['pockets']>; scale: number | null }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const rental = pockets.find((p) => p.pocket === 'location')
  const summary = rental?.goal && scale !== null ? `En location\u00A0: ${rental.goal.words}` : 'Voir chez toi et en location'
  return (
    <div className="pb-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={`inline-flex min-h-11 items-center text-left text-caption text-ink-soft underline decoration-rule-strong underline-offset-4 ${FOCUS}`}
      >
        {open ? 'Masquer le détail' : summary}
      </button>
      <ul id={id} hidden={!open} className="flex flex-col gap-2 pb-1 pl-6">
        {pockets.map((pocket) => (
          <PocketItem key={pocket.pocket} pocket={pocket} scale={scale} />
        ))}
      </ul>
    </div>
  )
}

// A sub-row of Immobilier (« Chez toi », « En location »): discreet, a small square and muted words.
// The rental one carries its goal bar, like the rows above it.
function PocketItem({ pocket, scale }: { pocket: NonNullable<Row['pockets']>[number]; scale: number | null }) {
  return (
    <li data-pocket={pocket.pocket} className="flex flex-col text-caption text-ink-muted">
      <div className="flex items-center gap-2">
        {/* « Chez toi » in its own green, as its squares in the grid. */}
        <span
          aria-hidden="true"
          className={`size-square-s shrink-0 rounded-square ${pocket.pocket === 'chez-toi' ? HOME_FILL : FILL.property}`}
        />
        <span className="min-w-0 flex-1 truncate">{pocket.name}</span>
        <Figure euros={pocket.euros} percent={pocket.percent} />
        <span aria-hidden="true" className="w-5" />
      </div>
      {pocket.goal && scale !== null ? (
        <div className="mt-1">
          <GoalBar category="property" actual={pocket.goal.actual} target={pocket.goal.target} scale={scale} />
          <p className="mt-1">{pocket.goal.words}</p>
        </div>
      ) : null}
      {pocket.note ? <p className="mt-0.5">{pocket.note}</p> : null}
    </li>
  )
}
