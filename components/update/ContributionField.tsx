'use client'

import { formatShortDayMonth } from '@/lib/format'
import type { Account, Cents, IsoDate } from '@/lib/model/types'
import { readContribution } from '@/lib/update/fields'
import { MoneyBox } from './MoneyBox'

// Money paid in since the last snapshot; written with a minus when taken out. Empty is unknown
// (null), a typed 0 is known: nothing paid in.
export function ContributionField({
  account,
  since,
  cents,
  onValue,
}: {
  account: Account
  since: IsoDate
  cents: Cents | null
  onValue: (cents: Cents | null) => void
}) {
  const from = formatShortDayMonth(since)
  // An abbreviated date (« 30 sept. ») already ends on its point: no second one.
  const stop = from.endsWith('.') ? '' : '.'
  const opening = account.type === 'employee-savings' ? `Depuis le ${from}, ton employeur compris.` : `Depuis le ${from}${stop}`
  const hint =
    `${opening} Rien versé\u00A0? Écris 0. Pas sûr\u00A0? Laisse vide\u00A0: on comptera tout comme des intérêts, et l’écran le dira. ` +
    'Tu en as retiré\u00A0? Écris-le avec un moins devant.'
  return (
    <MoneyBox
      label="Combien a été versé dessus&nbsp;?"
      hint={hint}
      value={cents}
      read={readContribution}
      onCommit={onValue}
      onClear={() => onValue(null)}
    />
  )
}
