'use client'

import { formatShortDayMonth } from '@/lib/format'
import type { Account, Cents, IsoDate } from '@/lib/model/types'
import { readContribution } from '@/lib/update/fields'
import { MoneyBox } from './MoneyBox'

// Money paid in since the last snapshot; written with a minus when taken out.
export function ContributionField({
  account,
  since,
  cents,
  onValue,
}: {
  account: Account
  since: IsoDate
  cents: Cents
  onValue: (cents: Cents) => void
}) {
  const from = formatShortDayMonth(since)
  // An abbreviated date (« 30 sept. ») already ends on its point: no second one.
  const stop = from.endsWith('.') ? '' : '.'
  const opening = account.type === 'employee-savings' ? `Depuis le ${from}, ton employeur compris.` : `Depuis le ${from}${stop}`
  const hint =
    `${opening} Pas sûr\u00A0? Laisse 0\u00A0: on comptera tout comme des intérêts, et l’écran le dira. ` +
    'Tu en as retiré\u00A0? Écris-le avec un moins devant.'
  return (
    <MoneyBox label="Combien a été versé dessus&nbsp;?" hint={hint} value={cents} read={readContribution} onCommit={onValue} />
  )
}
