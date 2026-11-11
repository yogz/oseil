import type { ReactNode } from 'react'
import { FILL } from '@/components/money/HundredSquares'
import { CHIP } from '@/components/setup/styles'
import type { CategoryId } from '@/lib/model/types'

// A line's region: its name, its account's name when that differs, then its boxes.
export function RowFrame({
  name,
  accountName,
  children,
  footer,
  inAccount = false,
  category = null,
}: {
  name: string
  accountName: string
  children: ReactNode
  footer?: ReactNode
  // Under its account's own title (an account of several lines): the account is not said again.
  inAccount?: boolean
  // B8: the square of its category's colour beside its name, as in the lists; none for a loan.
  category?: CategoryId | null
}) {
  return (
    <section aria-label={name} className={`flex flex-col gap-3 ${inAccount ? 'py-4' : 'border-t border-hairline py-5'}`}>
      <div>
        <h3 className={`flex items-center gap-2 ${inAccount ? 'text-body' : 'text-subtitle'} font-semibold text-ink`}>
          {category ? <span aria-hidden="true" data-category={category} className={`size-3 shrink-0 rounded-square ${FILL[category]}`} /> : null}
          {name}
        </h3>
        {!inAccount && accountName !== name ? <p className="text-caption text-ink-muted">{accountName}</p> : null}
      </div>
      {children}
      {footer}
    </section>
  )
}

// « Inchangé » keeps the base value and drops what was typed. Once something different is typed
// it says what it will do: « Remettre 22 950 € » (a button says what it does, never the opposite).
export function UnchangedButton({
  confirmed,
  onConfirm,
  restore,
}: {
  confirmed: boolean
  onConfirm: () => void
  restore?: string | null
}) {
  return (
    <button
      type="button"
      aria-pressed={restore ? undefined : confirmed}
      className={`${CHIP} self-start`}
      onClick={onConfirm}
    >
      {restore ? `Remettre ${restore}` : 'Inchangé'}
    </button>
  )
}
