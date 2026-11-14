'use client'

import { useState } from 'react'
import { SecuritySearch, type SecurityPick } from '@/components/market/SecuritySearch'
import { TEXT_LINK } from '@/components/setup/styles'
import { formatPrice } from '@/lib/format'
import type { AccountTypeId, CurrencyCode } from '@/lib/model/types'
import { CONFIRM, CONFIRM_NO_LAST, NO, NO_PRICE_FOR_NOW, VERY_DIFFERENT, veryDifferent, YES } from '@/lib/screens/words'

const SENTENCE = 'text-body leading-relaxed text-ink'

// What a title needs to be searched for and confirmed (a row of « Tes titres », or a line's sheet).
export type FindableTitle = {
  searchText: string
  accountType: AccountTypeId
  currency: CurrencyCode
  lastPrice: string | null // the price of the latest snapshot, written
  lastValue: number | null // the same, as a number, to warn when a pick is far from it
}

// « Le retrouver » (and « Changer de titre » on a sheet): the search, then « C’est bien lui ? ».
// « Ce n’est pas lui » closes it, and nothing is saved.
export function TitleFind({
  title,
  busy,
  saveError = null,
  onAttach,
  onClose,
}: {
  title: FindableTitle
  busy: boolean
  saveError?: string | null
  onAttach: (symbol: string) => void
  onClose: () => void
}) {
  const [picked, setPicked] = useState<SecurityPick | null>(null)
  if (picked === null) {
    return (
      <SecuritySearch
        accountType={title.accountType}
        currency={title.currency}
        initialText={title.searchText}
        onPick={setPicked}
        onClose={onClose}
      />
    )
  }
  const today = picked.price === null ? null : formatPrice(picked.price, title.currency)
  const last = title.lastPrice
  // Not blocking: the person may know better. It only says that the pick may be another listing.
  const apart = picked.price !== null && title.lastValue !== null && veryDifferent(picked.price, title.lastValue)
  return (
    <div className="flex flex-col gap-3">
      <div role="status" className="flex flex-col gap-3">
        <p className={SENTENCE}>{picked.exchange === '' ? picked.name : `${picked.name}, ${picked.exchange}`}</p>
        <p className={SENTENCE}>
          {today === null ? NO_PRICE_FOR_NOW : last === null ? CONFIRM_NO_LAST(today) : CONFIRM(today, last)}
        </p>
        {apart ? <p className={SENTENCE}>{VERY_DIFFERENT}</p> : null}
      </div>
      {saveError ? (
        <p role="alert" className={SENTENCE}>
          {saveError}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-x-5">
        <button type="button" className={TEXT_LINK} disabled={busy} onClick={() => onAttach(picked.symbol)}>
          {YES}
        </button>
        <button type="button" className={TEXT_LINK} disabled={busy} onClick={onClose}>
          {NO}
        </button>
      </div>
    </div>
  )
}
