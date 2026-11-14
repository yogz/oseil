'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { FormActions } from '@/components/setup/FormActions'
import { useSubmit } from '@/components/setup/useSubmit'
import { TextField } from '@/components/ui/TextField'
import type { Figures } from '@/lib/correct/types'
import type { AccountTypeId, CurrencyCode, SnapshotEntry } from '@/lib/model/types'
import {
  FIGURE_AMOUNT,
  FIGURE_AVERAGE,
  FIGURE_PRICE,
  FIGURE_UNITS,
  IS_CORRECTION,
  SAVE,
} from '@/lib/screens/line-words'
import { decimalText, euroText, priceText, tidyCount, tidyEuros, tidyPrice } from '@/lib/setup/step-changes'
import { readAmount, readNumber } from '@/lib/update/fields'

type Errors = { amount?: string; units?: string; price?: string; average?: string }
type Texts = { amount: string; units: string; price: string; average: string }

// The figures typed, read in the entry's kind. An empty average price stays unknown (null), never 0.
function readFigures(kind: SnapshotEntry['kind'], texts: Texts, accountType: AccountTypeId): { figures: Figures } | { errors: Errors } {
  if (kind === 'amount') {
    const read = readAmount(texts.amount, accountType)
    return 'error' in read ? { errors: { amount: read.error } } : { figures: { kind: 'amount', amount: read.cents } }
  }
  const readUnits = readNumber(texts.units)
  const readPrice = readNumber(texts.price)
  const readAverage = texts.average.trim() === '' ? null : readNumber(texts.average)
  const errors: Errors = {}
  if ('error' in readUnits) errors.units = readUnits.error
  if ('error' in readPrice) errors.price = readPrice.error
  if (readAverage !== null && 'error' in readAverage) errors.average = readAverage.error
  if ('error' in readUnits || 'error' in readPrice || (readAverage !== null && 'error' in readAverage)) return { errors }
  return {
    figures: {
      kind: 'units',
      units: readUnits.value,
      unitPrice: readPrice.value,
      averagePrice: readAverage === null ? null : readAverage.value,
    },
  }
}

// The figures of a snapshot's entry, corrected in the line's own currency: the latest snapshot's by
// default (the fiche), or a past relevé's, dated by the page that passes its title, its labels, its
// button and its notes (docs/superpowers/specs/2026-11-12-corriger-un-releve-design.md).
export function FiguresEdit({
  entry,
  currency,
  accountType,
  label,
  title,
  labels,
  submitLabel = SAVE,
  notes,
  focusAverage = false,
  saveError,
  onSubmit,
  onCancel,
}: {
  entry: SnapshotEntry
  currency: CurrencyCode
  accountType: AccountTypeId // decides whether a negative amount, or zero, is allowed
  label: string // « Son montant » or « Ce qui reste à rembourser »
  title?: string // « Son montant au 16 novembre 2025 »; none on the fiche, whose title is the line's name
  labels?: Texts // the whole field labels, « … ce jour-là »; the fiche's by default
  submitLabel?: string // « Corriger le 16 novembre 2025 »; « Enregistrer » by default
  // Said under « C’est une correction », of the figures as typed: null while they do not read.
  notes?: (figures: Figures | null) => ReactNode
  focusAverage?: boolean // opened from « prix d’achat manquant »: the average price takes the focus
  saveError: string | null
  onSubmit: (figures: Figures) => Promise<boolean>
  onCancel: () => void
}) {
  const [amount, setAmount] = useState(entry.kind === 'amount' ? euroText(entry.amount) : '')
  const [units, setUnits] = useState(entry.kind === 'units' ? decimalText(entry.units) : '')
  const [price, setPrice] = useState(entry.kind === 'units' ? priceText(entry.unitPrice) : '')
  const [average, setAverage] = useState(
    entry.kind === 'units' && entry.averagePrice !== null ? priceText(entry.averagePrice) : '',
  )
  const [errors, setErrors] = useState<Errors>({})
  const { busy, run } = useSubmit()
  const clear = (key: keyof Errors) => setErrors((now) => ({ ...now, [key]: undefined }))
  const typed = readFigures(entry.kind, { amount, units, price, average }, accountType)
  const shown: Texts = labels ?? {
    amount: FIGURE_AMOUNT(label, currency),
    units: FIGURE_UNITS,
    price: FIGURE_PRICE(currency),
    average: FIGURE_AVERAGE(currency),
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if ('errors' in typed) {
      setErrors(typed.errors)
      return
    }
    setErrors({})
    const { figures } = typed
    void run(() => onSubmit(figures))
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-5">
      {title ? <h1 className="pt-2 text-title font-semibold leading-tight tracking-[-0.01em]">{title}</h1> : null}
      {entry.kind === 'amount' ? (
        <TextField
          label={shown.amount}
          type="text"
          inputMode="decimal"
          value={amount}
          error={errors.amount}
          onChange={(event) => {
            setAmount(event.target.value)
            clear('amount')
          }}
          onBlur={() => setAmount(tidyEuros)}
          autoComplete="off"
        />
      ) : (
        <>
          <TextField
            label={shown.units}
            type="text"
            inputMode="decimal"
            value={units}
            error={errors.units}
            onChange={(event) => {
              setUnits(event.target.value)
              clear('units')
            }}
            onBlur={() => setUnits(tidyCount)}
            autoComplete="off"
          />
          <TextField
            label={shown.price}
            type="text"
            inputMode="decimal"
            value={price}
            error={errors.price}
            onChange={(event) => {
              setPrice(event.target.value)
              clear('price')
            }}
            onBlur={() => setPrice(tidyPrice)}
            autoComplete="off"
          />
          <TextField
            label={shown.average}
            type="text"
            inputMode="decimal"
            value={average}
            error={errors.average}
            onChange={(event) => {
              setAverage(event.target.value)
              clear('average')
            }}
            onBlur={() => setAverage(tidyPrice)}
            autoComplete="off"
            autoFocus={focusAverage}
          />
        </>
      )}
      <p className="text-body leading-relaxed text-ink-soft">{IS_CORRECTION}</p>
      {notes ? notes('figures' in typed ? typed.figures : null) : null}
      <FormActions submitLabel={submitLabel} busy={busy} saveError={saveError} onCancel={onCancel} />
    </form>
  )
}
