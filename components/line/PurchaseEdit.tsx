'use client'

import { useState, type FormEvent } from 'react'
import { FormActions } from '@/components/setup/FormActions'
import { CHIP, TEXT_LINK } from '@/components/setup/styles'
import { useSubmit } from '@/components/setup/useSubmit'
import { TextField } from '@/components/ui/TextField'
import { formatRate } from '@/lib/format'
import { PURCHASE_RATE_MAX, PURCHASE_RATE_MIN } from '@/lib/model/documents'
import type { CurrencyCode, Line } from '@/lib/model/types'
import { parseDecimal } from '@/lib/parse'
import {
  PURCHASE_QUESTION,
  PURCHASE_RESET,
  PURCHASE_UNREADABLE,
  SAVE,
  purchaseField,
  purchaseHelp,
  purchaseOutOfBounds,
} from '@/lib/screens/line-words'

const capitalized = (words: string) => words.charAt(0).toUpperCase() + words.slice(1)

// The rate of a line's purchases (docs/superpowers/specs/2026-11-11-change-a-l-achat-design.md): in which
// money the broker gives the average price; in the line's currency, what 1 € was worth when it was bought.
// A figure typed can go back to the one Oseil computes from the snapshots (null), from under the currency.
export function PurchaseEdit({
  perEuro,
  source,
  label,
  currency,
  words,
  saveError,
  onSave,
  onCancel,
}: {
  perEuro: number | null
  source: 'computed' | 'typed' | 'euros'
  label: string // « Le dollar à l’achat »
  currency: CurrencyCode
  words: string // « dollars américains »
  saveError: string | null
  onSave: (purchase: Line['purchase'] | null) => Promise<boolean>
  onCancel: () => void
}) {
  const [inEuros, setInEuros] = useState(source === 'euros')
  const [value, setValue] = useState(perEuro === null ? '' : formatRate(perEuro))
  const [error, setError] = useState<string | undefined>()
  const { busy, run } = useSubmit()

  function submit(event: FormEvent) {
    event.preventDefault()
    if (inEuros) {
      void run(() => onSave({ inEuros: true }))
      return
    }
    const rate = parseDecimal(value)
    if (rate === null) return setError(PURCHASE_UNREADABLE)
    if (rate < PURCHASE_RATE_MIN || rate > PURCHASE_RATE_MAX) return setError(purchaseOutOfBounds(words))
    void run(() => onSave({ perEuro: rate }))
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-5">
      <h2 className="text-subtitle font-semibold text-ink">{label}</h2>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-body text-ink">{PURCHASE_QUESTION}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" aria-pressed={!inEuros} className={CHIP} onClick={() => setInEuros(false)}>
            {capitalized(words)}
          </button>
          <button type="button" aria-pressed={inEuros} className={CHIP} onClick={() => setInEuros(true)}>
            Euros
          </button>
        </div>
      </fieldset>
      {inEuros ? null : (
        <>
          <TextField
            label={purchaseField(words)}
            type="text"
            inputMode="decimal"
            value={value}
            error={error}
            hint={purchaseHelp(currency)}
            onChange={(event) => {
              setValue(event.target.value)
              setError(undefined)
            }}
            autoComplete="off"
          />
          {source !== 'computed' ? (
            <button type="button" className={`${TEXT_LINK} self-start`} disabled={busy} onClick={() => void run(() => onSave(null))}>
              {PURCHASE_RESET}
            </button>
          ) : null}
        </>
      )}
      <FormActions submitLabel={SAVE} busy={busy} saveError={saveError} onCancel={onCancel} />
    </form>
  )
}
