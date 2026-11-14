// The words of « Total versé depuis l’ouverture » in the bank update (planche 10C,
// docs/superpowers/specs/2026-11-14-total-verse-design.md): its label, its hint, and once a total is
// typed and the previous one known, what the site deduces from it. No React here.

import { formatEuros, formatShortDayMonth } from '@/lib/format'
import type { AccountTypeId, Cents, IsoDate } from '@/lib/model/types'

export const PAID_TOTAL_LABEL = 'Total versé depuis l’ouverture'
const COPY = 'Recopie le chiffre de ta banque, souvent appelé « versements » ou « montant investi ».'
const EMPLOYER = 'Ton employeur compris.'
// Dividends paid in cash land on the account's cash line and would read as effort; two totals set them
// right (decided by Nicolas, 14 November 2026). Only accounts that hold shares.
const DIVIDENDS = 'Il rend aussi juste le partage de tes dividendes.'
const PAYS_DIVIDENDS: readonly AccountTypeId[] = ['pea', 'pea-pme', 'securities']
const TAKEN_OUT = 'Tu as retiré de l’argent ? Prends le total moins les retraits. Pas sous les yeux ? Laisse vide.'

export function paidTotalWords(input: {
  type: AccountTypeId
  previous: { total: Cents; on: IsoDate } | null
  typed: Cents | null
}): { label: string; hint: string; deduced: string | null } {
  const { type, previous, typed } = input
  const since = previous === null ? '' : formatShortDayMonth(previous.on)
  const hint = [
    previous === null ? null : `Au relevé du ${since} : ${formatEuros(previous.total)}.`,
    COPY,
    PAYS_DIVIDENDS.includes(type) ? DIVIDENDS : null,
    type === 'employee-savings' ? EMPLOYER : null,
    TAKEN_OUT,
  ]
    .filter((s) => s !== null)
    .join(' ')

  let deduced: string | null = null
  if (previous !== null && typed !== null) {
    const difference = typed - previous.total
    // Under a euro either way reads as nothing, never as « Soit 0 € ».
    if (Math.round(difference / 100) === 0) deduced = `Rien versé depuis le ${since}`
    else if (difference > 0) deduced = `Soit ${formatEuros(difference)} versés depuis le ${since}`
    else deduced = `Soit ${formatEuros(-difference)} retirés depuis le ${since}`
  }
  return { label: PAID_TOTAL_LABEL, hint, deduced }
}
