'use client'

import type { ReactNode } from 'react'
import { formatMoney } from '@/lib/format'
import { inCurrency } from '@/lib/market/words'
import type { Account, Line, SnapshotEntry } from '@/lib/model/types'
import type { EntryInput } from '@/lib/setup/first-launch'
import { readAmount } from '@/lib/update/fields'
import { MoneyBox } from './MoneyBox'
import { categoryOf } from '@/lib/model/situation'
import { RowFrame, UnchangedButton } from './RowFrame'

export type RowProps = {
  line: Line
  account: Account
  entry: SnapshotEntry | null
  before: SnapshotEntry | null
  confirmed: boolean
  onValue: (entry: EntryInput) => void
  onConfirm: () => void
  // Under the boxes: « Fermé ou tout vendu ».
  footer?: ReactNode
  // The account has several lines: its name is said once above them, not under each.
  inAccount?: boolean
  // A line attached to its price: under « prix d’une part », whether the box holds today's
  // price or the last one, since today's could not be had. Worded with the line's currency
  // (todaysPriceHint, failedPriceHint): the row shows it in place of its own currency hint.
  priceHint?: string
  // A line in parts with no purchase price in the base snapshot (asksPurchasePrice): its link asks for it.
  asksPurchase?: boolean
}

// Under an empty box: a line with no value yet (no base entry, nothing typed), to be filled.
export const TO_FILL = 'montant à saisir'

// What is said under a box, in one hint: « montant à saisir · en dollars américains ».
export function hintOf(...parts: Array<string | null | undefined>): string | undefined {
  const said = parts.filter((p): p is string => typeof p === 'string' && p !== '')
  return said.length > 0 ? said.join(' · ') : undefined
}

// A balance, or what is still owed on a loan, in the line's own currency as its bank shows it.
export function AmountRow({ line, account, entry, before, confirmed, onValue, onConfirm, footer, inAccount }: RowProps) {
  const loan = account.type === 'loan'
  const value = entry?.kind === 'amount' ? entry.amount : null
  const old = before?.kind === 'amount' ? before.amount : null
  const differs = value !== null && old !== null && value !== old

  return (
    <RowFrame name={line.name} accountName={account.name} category={categoryOf(line, account)} footer={footer} inAccount={inAccount}>
      {loan ? (
        <>
          <p className="text-caption leading-normal text-ink-muted">
            Tu le trouves dans l’application de ta banque ou sur ton tableau d’amortissement.
          </p>
        </>
      ) : null}
      <MoneyBox
        label={loan ? 'Combien reste-t-il à rembourser\u00A0?' : 'Combien y a-t-il dessus\u00A0?'}
        hint={hintOf(value === null ? TO_FILL : null, inCurrency(line.currency))}
        value={value}
        read={(text) => readAmount(text, account.type)}
        onCommit={(cents) => onValue({ kind: 'amount', amount: cents })}
        lit={differs}
      />
      {differs ? <p className="text-caption text-ink-muted">avant&nbsp;: {formatMoney(old, line.currency)}</p> : null}
      {/* Nothing to confirm on a line with no base value: « Inchangé » would drop what was typed. */}
      {before !== null ? <UnchangedButton confirmed={confirmed} onConfirm={onConfirm} restore={differs ? formatMoney(old, line.currency) : null} /> : null}
    </RowFrame>
  )
}
