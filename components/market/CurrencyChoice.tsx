'use client'

import { useState } from 'react'
import { CHIP } from '@/components/setup/styles'
import { CURRENCIES } from '@/lib/catalog'
import type { CurrencyCode } from '@/lib/model/types'
import { eurPerUnit } from '@/lib/market/live'
import { useRates } from '@/lib/market/use-market'
import { CURRENCY_LINE, currencyWords, ONE_MOMENT, ONLY_EUROS } from '@/lib/market/words'

// « En euros · changer ». The rates are asked only when the person opens the choice.
// `locked`: the currency of a line a snapshot already holds, shown but not offered.
export function CurrencyChoice({
  value,
  locked = false,
  onChoose,
}: {
  value: CurrencyCode
  locked?: boolean
  onChoose: (currency: CurrencyCode, eurPerUnit: number) => void
}) {
  const [open, setOpen] = useState(false)
  const state = useRates(open)

  const line = (
    <p className="text-body text-ink-soft">
      {CURRENCY_LINE(currencyWords(value))}
      {locked ? null : (
        <>
          {' · '}
          <button
            type="button"
            aria-label="Changer de devise"
            className="min-h-11 text-ink underline decoration-rule-strong underline-offset-4"
            onClick={() => setOpen(true)}
          >
            changer
          </button>
        </>
      )}
    </p>
  )
  if (!open || locked) return line

  if (state.status !== 'ready') return <div className="flex flex-col gap-2">{line}<p className="text-body text-ink-soft">{ONE_MOMENT}</p></div>

  const rates = state.rates
  // The euro needs no rate; another currency is offered only with its rate.
  const offered = CURRENCIES.map((c) => ({ ...c, rate: eurPerUnit(rates, c.code) })).filter(
    (c): c is typeof c & { rate: number } => c.rate !== null,
  )
  return (
    <div className="flex flex-col gap-2">
      {line}
      <div role="group" aria-label="Devise" className="flex flex-wrap gap-2">
        {offered.map((c) => (
          <button
            key={c.code}
            type="button"
            aria-pressed={c.code === value}
            className={CHIP}
            onClick={() => {
              onChoose(c.code, c.rate)
              setOpen(false)
            }}
          >
            {c.words}
          </button>
        ))}
      </div>
      {rates === null ? <p className="text-body leading-relaxed text-ink-soft">{ONLY_EUROS}</p> : null}
    </div>
  )
}
