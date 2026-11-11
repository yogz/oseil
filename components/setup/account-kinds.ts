// What the first launch and the monthly update share about accounts that hold several lines.

import { MULTI_LINE_TYPES } from '@/lib/catalog'
import type { AccountTypeId, CategoryId } from '@/lib/model/types'

export type Kind = 'amount' | 'units'
export type Add = { label: string; kind: Kind; preset?: string; category?: CategoryId }

// Accounts that hold several lines, one per fund or share: the catalog's list, which the fiche of a line uses too.
export const MULTI = MULTI_LINE_TYPES

// Life insurance and PER are entered by their totals, euro fund and units of account,
// each as one amount; a fund held in parts can still be added line by line.
const UNITS_OF_ACCOUNT = { label: '+ Les unités de compte', kind: 'amount', preset: 'Unités de compte', category: 'markets' } as const

export const ADDS: Partial<Record<AccountTypeId, Add[]>> = {
  'life-insurance': [
    { label: '+ Le fonds euros', kind: 'amount', preset: 'Fonds euros' },
    UNITS_OF_ACCOUNT,
    { label: '+ Une action ou un fonds', kind: 'units' },
  ],
  per: [
    { label: '+ Le fonds euros', kind: 'amount', preset: 'Fonds euros' },
    UNITS_OF_ACCOUNT,
    { label: '+ Une action ou un fonds', kind: 'units' },
  ],
  pea: [
    { label: '+ Une action ou un fonds', kind: 'units' },
    { label: '+ Des espèces', kind: 'amount', preset: 'Espèces' },
  ],
  securities: [
    { label: '+ Une action ou un fonds', kind: 'units' },
    { label: '+ Des espèces', kind: 'amount', preset: 'Espèces' },
  ],
  'employee-savings': [
    { label: '+ Un fonds', kind: 'amount', preset: 'Fonds' },
    { label: '+ Un fonds en parts', kind: 'units' },
  ],
}
