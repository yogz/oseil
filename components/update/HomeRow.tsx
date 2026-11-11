'use client'

import { useState } from 'react'
import { CHIP } from '@/components/setup/styles'
import { todayIso } from '@/lib/dates'
import { formatDayMonth, formatMoney } from '@/lib/format'
import { inCurrency } from '@/lib/market/words'
import { readAmount } from '@/lib/update/fields'
import { MoneyBox } from './MoneyBox'
import { categoryOf } from '@/lib/model/situation'
import { RowFrame } from './RowFrame'
import { hintOf, TO_FILL, type RowProps } from './AmountRow'

// A home is re-estimated about once a year: « C’est toujours ça » keeps the old estimate and its date,
// « Changer » records a new one (the parent restates it, even when it equals the old one).
// A home with no base value has no estimate to keep: no chips (« C’est toujours ça » would drop
// what was typed), and its box is there at once, and stays once filled.
export function HomeRow({ line, account, entry, before, confirmed, onValue, onConfirm, footer, inAccount }: RowProps) {
  const value = entry?.kind === 'amount' ? entry.amount : null
  const based = before !== null
  const [changing, setChanging] = useState(false)

  return (
    <RowFrame name={line.name} accountName={account.name} category={categoryOf(line, account)} footer={footer} inAccount={inAccount}>
      {/* Re-estimated about once a year: the year is said when it is not this one. */}
      {entry ? <p className="text-body text-ink">Dernière estimation le {formatDayMonth(entry.seenOn, todayIso())}</p> : null}
      {value !== null ? (
        <p className="text-caption leading-normal text-ink-muted">
          {`Estimée à ${formatMoney(value, line.currency)}. Elle n’a pas besoin d’être réestimée à chaque fois\u00A0: une fois par an suffit.`}
        </p>
      ) : null}
      {based ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={confirmed} className={CHIP} onClick={onConfirm}>
            C’est toujours ça
          </button>
          <button type="button" className={CHIP} onClick={() => setChanging(true)}>
            Changer
          </button>
        </div>
      ) : null}
      {changing || !based ? (
        <MoneyBox
          label="Combien vaut-il, à peu près&nbsp;?"
          hint={hintOf(value === null ? TO_FILL : null, inCurrency(line.currency))}
          value={value}
          read={(text) => readAmount(text, account.type)}
          onCommit={(cents) => onValue({ kind: 'amount', amount: cents })}
          always
          autoFocus={changing}
        />
      ) : null}
    </RowFrame>
  )
}
