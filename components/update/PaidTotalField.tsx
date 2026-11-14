'use client'

import type { Account, Cents, IsoDate } from '@/lib/model/types'
import { readPaidTotal } from '@/lib/update/fields'
import { paidTotalWords } from '@/lib/update/paid-total-words'
import { MoneyBox } from './MoneyBox'

// « Total versé depuis l’ouverture » (planche 10C): opens empty in the update, never pre-filled. Once
// typed, and when the previous total is known, the sentence of what it means sits between the box and
// its hint. Empty is unknown (null): the site keeps guessing, without a word. On a past relevé
// (planche 10D), it opens on that relevé's own total. `onReadable`: whether what was typed can be read.
export function PaidTotalField({
  account,
  previous,
  cents,
  onValue,
  onReadable,
}: {
  account: Account
  previous: { total: Cents; on: IsoDate } | null
  cents: Cents | null
  onValue: (cents: Cents | null) => void
  onReadable?: (readable: boolean) => void
}) {
  const words = paidTotalWords({ type: account.type, previous, typed: cents })
  return (
    <MoneyBox
      label={words.label}
      hint={words.hint}
      note={words.deduced}
      value={cents}
      read={readPaidTotal}
      onCommit={onValue}
      onClear={() => onValue(null)}
      onReadable={onReadable}
    />
  )
}
