'use client'

import { useState, type FormEvent } from 'react'
import { CHIP } from '@/components/setup/styles'
import { FormActions } from '@/components/setup/FormActions'
import { useSubmit } from '@/components/setup/useSubmit'
import { TextField } from '@/components/ui/TextField'
import { formatEurosShown, currencySymbol } from '@/lib/format'
import { parseDecimal } from '@/lib/parse'
import type { RecountPreview, RecountTarget } from '@/lib/correct/recount'
import type { CurrencyCode, Line } from '@/lib/model/types'
import {
  KIND_WORDS,
  NO_TODAY_RATE,
  RECOUNT,
  RECOUNT_CURRENCY,
  RECOUNT_KIND,
  RECOUNT_SAME,
  RECOUNT_UNITS,
  RECOUNT_UNITS_UNREADABLE,
  RECOUNT_WAITING,
  recountSentence,
  recountTodayRates,
} from '@/lib/screens/line-words'

// « Compté en »: in parts or as an amount, and in which currency. What the history becomes is said
// before « Recompter » (docs/superpowers/specs/2026-11-11-tout-corriger-depuis-la-fiche-design.md, § 6).
export function CountedEdit({
  line,
  kinds,
  currencies,
  preview,
  saveError,
  onRecount,
  onCancel,
}: {
  line: Line
  kinds: readonly Line['kind'][]
  currencies: readonly CurrencyCode[]
  // What a target would do; 'waiting' while today's rate is not known yet.
  preview: (target: RecountTarget) => RecountPreview | 'no-rate' | 'waiting' | null
  saveError: string | null
  onRecount: (target: RecountTarget) => Promise<boolean>
  onCancel: () => void
}) {
  const [kind, setKind] = useState(line.kind)
  const [currency, setCurrency] = useState(line.currency)
  const [unitsText, setUnitsText] = useState('')
  const [error, setError] = useState<string | undefined>()
  const { busy, run } = useSubmit()

  const asksUnits = kind === 'units' && line.kind === 'amount'
  const units = asksUnits ? parseDecimal(unitsText) : null
  const same = kind === line.kind && currency === line.currency
  const target: RecountTarget = { kind, currency, ...(asksUnits && units !== null && units > 0 ? { units } : {}) }
  const shown = same || (asksUnits && target.units === undefined) ? null : preview(target)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (same) return onCancel()
    if (asksUnits && target.units === undefined) return setError(RECOUNT_UNITS_UNREADABLE)
    if (shown === null || shown === 'waiting' || shown === 'no-rate') return
    void run(() => onRecount(target))
  }

  const sentence =
    shown === null || shown === 'no-rate' || shown === 'waiting'
      ? null
      : [
          recountSentence(
            shown.snapshots,
            shown.before === null ? null : formatEurosShown(shown.before),
            shown.after === null ? null : formatEurosShown(shown.after),
          ),
          shown.todayRates > 0 ? recountTodayRates(shown.todayRates, shown.snapshots) : null,
        ]
          .filter(Boolean)
          .join(' ')

  return (
    <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-5">
      {kinds.length > 1 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-body font-medium text-ink">{RECOUNT_KIND}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {kinds.map((k) => (
              // One change at a time: another kind brings the currency back to the line's own.
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                className={CHIP}
                onClick={() => {
                  setKind(k)
                  setCurrency(line.currency)
                }}
              >
                {`En ${KIND_WORDS[k]}`}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-body font-medium text-ink">{RECOUNT_CURRENCY}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {currencies.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={currency === c}
              className={CHIP}
              onClick={() => {
                setCurrency(c)
                setKind(line.kind)
              }}
            >
              {currencySymbol(c)}
            </button>
          ))}
        </div>
      </fieldset>
      {asksUnits ? (
        <TextField
          label={RECOUNT_UNITS}
          type="text"
          inputMode="decimal"
          value={unitsText}
          error={error}
          autoComplete="off"
          onChange={(event) => {
            setUnitsText(event.target.value)
            setError(undefined)
          }}
        />
      ) : null}
      <p aria-live="polite" className="text-body leading-relaxed text-ink-soft tabular-nums">
        {same ? RECOUNT_SAME : shown === 'waiting' ? RECOUNT_WAITING : shown === 'no-rate' ? NO_TODAY_RATE : sentence}
      </p>
      <FormActions submitLabel={RECOUNT} busy={busy || shown === 'waiting'} saveError={saveError} onCancel={onCancel} />
    </form>
  )
}
