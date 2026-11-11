'use client'

import { useState, type FormEvent } from 'react'
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

// The figures of the latest snapshot's entry, corrected in the line's own currency.
// An empty average price stays unknown (null), never 0.
export function FiguresEdit({
  entry,
  currency,
  accountType,
  label,
  focusAverage = false,
  saveError,
  onSubmit,
  onCancel,
}: {
  entry: SnapshotEntry
  currency: CurrencyCode
  accountType: AccountTypeId // decides whether a negative amount, or zero, is allowed
  label: string // « Son montant » or « Ce qui reste à rembourser »
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
  const [errors, setErrors] = useState<{ amount?: string; units?: string; price?: string; average?: string }>({})
  const { busy, run } = useSubmit()
  const clear = (key: keyof typeof errors) => setErrors((now) => ({ ...now, [key]: undefined }))

  function submit(event: FormEvent) {
    event.preventDefault()
    if (entry.kind === 'amount') {
      const read = readAmount(amount, accountType)
      if ('error' in read) {
        setErrors({ amount: read.error })
        return
      }
      void run(() => onSubmit({ kind: 'amount', amount: read.cents }))
      return
    }
    const readUnits = readNumber(units)
    const readPrice = readNumber(price)
    const readAverage = average.trim() === '' ? null : readNumber(average)
    const found: typeof errors = {}
    if ('error' in readUnits) found.units = readUnits.error
    if ('error' in readPrice) found.price = readPrice.error
    if (readAverage !== null && 'error' in readAverage) found.average = readAverage.error
    setErrors(found)
    if (Object.keys(found).length > 0 || 'error' in readUnits || 'error' in readPrice) return
    void run(() =>
      onSubmit({
        kind: 'units',
        units: readUnits.value,
        unitPrice: readPrice.value,
        averagePrice: readAverage === null || 'error' in readAverage ? null : readAverage.value,
      }),
    )
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-5">
      {entry.kind === 'amount' ? (
        <TextField
          label={FIGURE_AMOUNT(label, currency)}
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
            label={FIGURE_UNITS}
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
            label={FIGURE_PRICE(currency)}
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
            label={FIGURE_AVERAGE(currency)}
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
      <FormActions submitLabel={SAVE} busy={busy} saveError={saveError} onCancel={onCancel} />
    </form>
  )
}
