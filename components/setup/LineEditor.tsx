'use client'

import type { AccountTypeId, CategoryId, CurrencyCode, Residence, SnapshotEntry } from '@/lib/model/types'
import type { EntryInput } from '@/lib/setup/first-launch'
import { AmountForm } from './AmountForm'
import { LoanForm } from './LoanForm'
import { UnitsForm } from './UnitsForm'

// `currency` and `eurPerUnit` are there only when the currency was chosen in the form (a rate is
// written for it, and only for it); `quoteSymbol` only when a price was attached. A loan has none.
// `residence` only when the form asked for a home's type (`askResidence`).
export type LineValues = {
  name: string
  category?: CategoryId
  entry: EntryInput
  financedLineId?: string | null
  currency?: CurrencyCode
  eurPerUnit?: number
  quoteSymbol?: string
  residence?: Residence
}

// What a submit hands to the line it writes: the currency and the symbol, when the form gave them.
export function lineFields({ currency, quoteSymbol }: LineValues) {
  return { ...(currency !== undefined ? { currency } : {}), ...(quoteSymbol !== undefined ? { quoteSymbol } : {}) }
}

// Picks the right form for an account type and a kind of line, and hands back one shape whatever the form.
export function LineEditor({
  type,
  kind,
  initial,
  preset,
  homes,
  submitLabel,
  saveError,
  onSubmit,
  onCancel,
  onDelete,
  onKindChange,
  askFinanced,
  currencyLocked,
  askResidence,
}: {
  type: AccountTypeId
  kind: 'amount' | 'units'
  initial?: {
    name: string
    entry?: SnapshotEntry
    category?: CategoryId
    financedLineId?: string | null
    currency?: CurrencyCode
    quoteSymbol?: string
    residence?: Residence
  }
  // A home whose type is asked, between these types (see AmountForm).
  askResidence?: readonly Residence[]
  // A line a snapshot already holds keeps its currency: « changer » is not offered.
  currencyLocked?: boolean
  // A loan only: false when what it finances cannot be changed here (see LoanForm).
  askFinanced?: boolean
  // A name proposed for a new line (« Fonds euros », « Espèces »).
  preset?: string
  homes: { id: string; name: string }[]
  submitLabel: string
  saveError: string | null
  onSubmit: (values: LineValues) => Promise<boolean>
  onCancel: () => void
  onDelete?: () => Promise<boolean>
  // Gold and crypto only: the person may give up the quantity and keep the amount.
  onKindChange?: (kind: 'amount' | 'units') => void
}) {
  const common = { submitLabel, saveError, onCancel, onDelete }
  const name = initial?.name ?? preset
  const entry = initial?.entry

  if (type === 'loan') {
    return (
      <LoanForm
        {...common}
        homes={homes}
        askFinanced={askFinanced}
        initial={{
          ...(name !== undefined ? { name } : {}),
          ...(entry?.kind === 'amount' ? { amount: entry.amount } : {}),
          // A loan reopened keeps its choice; a new one lets the form choose for it.
          ...(initial !== undefined ? { financedLineId: initial.financedLineId ?? null } : {}),
        }}
        onSubmit={(v) => onSubmit({ name: v.name, entry: { kind: 'amount', amount: v.amount }, financedLineId: v.financedLineId })}
      />
    )
  }

  if (kind === 'units') {
    return (
      <UnitsForm
        {...common}
        type={type}
        initial={{
          ...(name !== undefined ? { name } : {}),
          ...(entry?.kind === 'units'
            ? { units: entry.units, unitPrice: entry.unitPrice, averagePrice: entry.averagePrice }
            : {}),
          ...(initial?.category !== undefined ? { category: initial.category } : {}),
          ...(initial?.currency !== undefined ? { currency: initial.currency } : {}),
        }}
        currencyLocked={currencyLocked}
        onAmountOnly={onKindChange ? () => onKindChange('amount') : undefined}
        onSubmit={(v) =>
          onSubmit({
            name: v.name,
            category: v.category,
            entry: { kind: 'units', units: v.units, unitPrice: v.unitPrice, averagePrice: v.averagePrice },
            ...(v.currency !== undefined ? { currency: v.currency, eurPerUnit: v.eurPerUnit } : {}),
            ...(v.quoteSymbol !== undefined ? { quoteSymbol: v.quoteSymbol } : {}),
          })
        }
      />
    )
  }

  return (
    <AmountForm
      {...common}
      type={type}
      initial={{
        ...(name !== undefined ? { name } : {}),
        ...(entry?.kind === 'amount' ? { amount: entry.amount } : {}),
        ...(initial?.category !== undefined ? { category: initial.category } : {}),
        ...(initial?.currency !== undefined ? { currency: initial.currency } : {}),
        ...(initial?.residence !== undefined ? { residence: initial.residence } : {}),
      }}
      currencyLocked={currencyLocked}
      askResidence={askResidence}
      onSubmit={(v) =>
        onSubmit({
          name: v.name,
          entry: { kind: 'amount', amount: v.amount },
          ...(v.category !== undefined ? { category: v.category } : {}),
          ...(v.currency !== undefined ? { currency: v.currency, eurPerUnit: v.eurPerUnit } : {}),
          ...(v.residence !== undefined ? { residence: v.residence } : {}),
        })
      }
    />
  )
}
