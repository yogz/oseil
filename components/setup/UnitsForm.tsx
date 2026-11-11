'use client'

import { useId, useState, type FormEvent } from 'react'
import { CurrencyChoice } from '@/components/market/CurrencyChoice'
import { SecuritySearch } from '@/components/market/SecuritySearch'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { ACCOUNT_TYPES, CATEGORIES, canFollowPrice } from '@/lib/catalog'
import { formatMoney } from '@/lib/format'
import { priceIn } from '@/lib/market/live'
import type { Quote } from '@/lib/market/types'
import { useRates } from '@/lib/market/use-market'
import { CURRENCY_CHANGED, FOLLOW_PRICE, FOLLOWED, NO_PRICE_YET } from '@/lib/market/words'
import type { AccountTypeId, CategoryId, CurrencyCode } from '@/lib/model/types'
import { UNREADABLE_NUMBER } from '@/lib/update/fields'
import { parseDecimal } from '@/lib/parse'
import { decimalText, priceText, tidyCount, tidyPrice, unitsValue } from '@/lib/setup/step-changes'
import { CategoryChoice } from './CategoryChoice'
import { FormActions } from './FormActions'
import { TEXT_LINK } from './styles'
import { useSubmit } from './useSubmit'

export type UnitsValues = {
  name: string
  units: number
  unitPrice: number
  averagePrice: number | null
  category: CategoryId
  // Only when chosen or picked in this form (currency and rate together), so a line left as it is rewrites nothing.
  currency?: CurrencyCode
  eurPerUnit?: number
  quoteSymbol?: string
}

type Initial = { name?: string; units?: number; unitPrice?: number; averagePrice?: number | null; category?: CategoryId; currency?: CurrencyCode }

// Parts or quantity, average price (optional) and price today: a share, a fund, gold, crypto.
export function UnitsForm({
  type,
  initial,
  submitLabel,
  saveError,
  onSubmit,
  onCancel,
  onDelete,
  onAmountOnly,
  currencyLocked = false,
}: {
  type: AccountTypeId
  initial?: Initial
  submitLabel: string
  saveError: string | null
  onSubmit: (values: UnitsValues) => Promise<boolean>
  onCancel: () => void
  onDelete?: () => Promise<boolean>
  // Gold and crypto: the person may only know the amount.
  onAmountOnly?: () => void
  // A line a snapshot already holds keeps its currency.
  currencyLocked?: boolean
}) {
  const bullion = type === 'gold' || type === 'crypto'
  const fallback = ACCOUNT_TYPES[type].defaultCategory.units
  const [name, setName] = useState(initial?.name ?? (bullion ? ACCOUNT_TYPES[type].label : ''))
  const [units, setUnits] = useState(initial?.units !== undefined ? decimalText(initial.units) : '')
  const [average, setAverage] = useState(
    initial?.averagePrice !== undefined && initial.averagePrice !== null ? priceText(initial.averagePrice) : '',
  )
  const [price, setPrice] = useState(initial?.unitPrice !== undefined ? priceText(initial.unitPrice) : '')
  const [category, setCategory] = useState<CategoryId | undefined>(initial?.category ?? fallback)
  const [choosing, setChoosing] = useState(category === undefined)
  const [errors, setErrors] = useState<{ name?: string; units?: string; average?: string; price?: string; category?: string }>({})
  const [chosen, setChosen] = useState<{ currency: CurrencyCode; eurPerUnit: number } | null>(null)
  const [searching, setSearching] = useState(false)
  const [followed, setFollowed] = useState<{ symbol: string; name: string; exchange: string; priced: boolean } | null>(null)
  // The quote a pick brought (in its own currency) and the text it put in the price box: a currency
  // change recomputes that text, so the box never holds a number in the old currency.
  const [picked, setPicked] = useState<{ quote: Quote; filled: string } | null>(null)
  const [repriceNeeded, setRepriceNeeded] = useState(false)
  const ratesState = useRates(picked !== null)
  const currency = chosen?.currency ?? initial?.currency ?? 'EUR'
  const defaultName = bullion ? ACCOUNT_TYPES[type].label : ''
  const { busy, run } = useSubmit()
  const captionId = useId()

  const clear = (key: keyof typeof errors) => setErrors((now) => ({ ...now, [key]: undefined }))
  const readUnits = parseDecimal(units)
  const readPrice = parseDecimal(price)
  const readAverage = average.trim() === '' ? null : parseDecimal(average)

  // The same rounding as the model, shown only when both numbers read.
  let summary: { value: string; gain: number | null } | null = null
  if (readUnits !== null && readPrice !== null) {
    const value = unitsValue(readUnits, readPrice)
    summary = {
      value: formatMoney(value, currency),
      gain: readAverage !== null ? value - unitsValue(readUnits, readAverage) : null,
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    // The search hides the name box: it closes first, so an error never lands on a box nobody sees.
    setSearching(false)
    const found: typeof errors = {}
    if (name.trim() === '') found.name = 'Donne-lui un nom.'
    if (readUnits === null) found.units = UNREADABLE_NUMBER
    if (average.trim() !== '' && readAverage === null) found.average = UNREADABLE_NUMBER
    if (readPrice === null) found.price = UNREADABLE_NUMBER
    if (category === undefined) found.category = 'Choisis une catégorie.'
    setErrors(found)
    if (Object.keys(found).length > 0 || readUnits === null || readPrice === null || category === undefined) return
    void run(() =>
      onSubmit({
        name: name.trim(),
        units: readUnits,
        unitPrice: readPrice,
        averagePrice: readAverage,
        category,
        ...(chosen ?? {}),
        ...(followed ? { quoteSymbol: followed.symbol } : {}),
      }),
    )
  }

  const word = bullion
    ? {
        units: 'Quelle quantité en as-tu\u00A0?',
        average: 'À quel prix l’as-tu achetée, en moyenne\u00A0?',
        price: 'Combien vaut une unité aujourd’hui\u00A0?',
      }
    : {
        units: 'Combien de parts as-tu\u00A0?',
        average: 'À quel prix les as-tu achetées, en moyenne\u00A0?',
        price: 'Combien vaut une part aujourd’hui\u00A0?',
      }

  return (
    <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-5">
      {/* One piece of information, one box: while the search is open the name is what is searched for,
          and it comes back, filled and still editable, once a title is picked. What was typed in it opens
          the search, editable, and nothing leaves before « Chercher ». */}
      {searching ? null : (
        <TextField
          label="Son nom"
          type="text"
          value={name}
          error={errors.name}
          onChange={(event) => {
            setName(event.target.value)
            clear('name')
          }}
          autoComplete="off"
        />
      )}
      {canFollowPrice(type) ? (
        searching ? (
          <SecuritySearch
            accountType={type}
            currency={currency}
            initialText={name === defaultName ? '' : name.trim()}
            onClose={() => setSearching(false)}
            onPick={(pick) => {
              setSearching(false)
              if (name.trim() === '' || name === defaultName) {
                setName(pick.name)
                clear('name')
              }
              if (pick.price !== null) {
                setPrice(priceText(pick.price))
                clear('price')
              }
              // A euro line has no rate to write; any other currency keeps the line's own.
              if (chosen === null && currency === 'EUR') setChosen({ currency: 'EUR', eurPerUnit: 1 })
              setPicked(pick.quote ? { quote: pick.quote, filled: pick.price !== null ? priceText(pick.price) : price } : null)
              setRepriceNeeded(false)
              setFollowed({ symbol: pick.symbol, name: pick.name, exchange: pick.exchange, priced: pick.price !== null })
            }}
          />
        ) : (
          <Button variant="secondary" onClick={() => setSearching(true)}>
            {FOLLOW_PRICE}
          </Button>
        )
      ) : null}
      {repriceNeeded ? <p role="status" className="text-body leading-relaxed text-ink">{CURRENCY_CHANGED}</p> : null}
      {followed ? (
        <div className="flex flex-col gap-1">
          <p className="text-body leading-relaxed text-ink-soft">{FOLLOWED(followed.name, followed.exchange)}</p>
          {followed.priced ? null : <p className="text-body leading-relaxed text-ink">{NO_PRICE_YET}</p>}
        </div>
      ) : null}
      <TextField
        label={word.units}
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
        label={word.average}
        type="text"
        inputMode="decimal"
        value={average}
        error={errors.average}
        hint="Ta banque l’affiche souvent sous « prix de revient » ou « PRU ». Tu ne le sais pas&nbsp;? Laisse vide, on affichera la valeur sans le gain."
        onChange={(event) => {
          setAverage(event.target.value)
          clear('average')
        }}
        onBlur={() => setAverage(tidyPrice)}
        autoComplete="off"
      />
      <TextField
        label={word.price}
        type="text"
        inputMode="decimal"
        value={price}
        error={errors.price}
        onChange={(event) => {
          setPrice(event.target.value)
          setRepriceNeeded(false)
          clear('price')
        }}
        onBlur={() => setPrice(tidyPrice)}
        autoComplete="off"
      />

      <CurrencyChoice
        value={currency}
        locked={currencyLocked}
        onChoose={(next, eurPerUnit) => {
          setChosen({ currency: next, eurPerUnit })
          // Only the number the pick wrote is ours to convert; one the person typed stays theirs.
          if (picked === null || price !== picked.filled) return
          const rates = ratesState.status === 'ready' ? ratesState.rates : null
          const converted = priceIn(picked.quote, next, rates)
          const text = converted === null ? '' : priceText(converted)
          setPrice(text)
          setPicked({ ...picked, filled: text })
          setRepriceNeeded(converted === null)
        }}
      />

      {summary ? (
        <p data-testid="units-summary" className="text-body leading-relaxed text-ink">
          Vaut aujourd’hui {summary.value}
          {summary.gain !== null && summary.gain > 0 ? (
            <>
              , <span className="text-gain">a gagné {formatMoney(summary.gain, currency)}</span> depuis l’achat.
            </>
          ) : summary.gain !== null && summary.gain < 0 ? (
            <>
              , <span className="text-loss">a perdu {formatMoney(-summary.gain, currency)}</span> depuis l’achat.
            </>
          ) : (
            '.'
          )}
        </p>
      ) : null}

      {choosing ? (
        <div className="flex flex-col gap-2">
        <p id={captionId} className="text-body font-medium text-ink">Dans quelle catégorie le ranger&nbsp;?</p>
        <CategoryChoice
          labelledBy={captionId}
          value={category}
          error={errors.category}
          onChoose={(chosen) => {
            setCategory(chosen)
            setChoosing(false)
            clear('category')
          }}
        />
        </div>
      ) : (
        <p className="text-body text-ink-soft">
          Rangé dans {category ? CATEGORIES[category].label : ''} ·{' '}
          <button
            type="button"
            aria-label="Changer de catégorie"
            className="min-h-11 text-ink underline decoration-rule-strong underline-offset-4"
            onClick={() => setChoosing(true)}
          >
            changer
          </button>
        </p>
      )}

      {onAmountOnly ? (
        <button type="button" className={TEXT_LINK} onClick={onAmountOnly}>
          Je ne connais que le montant
        </button>
      ) : null}

      <FormActions
        submitLabel={submitLabel}
        busy={busy}
        saveError={saveError}
        onCancel={onCancel}
        onDelete={onDelete ? () => void run(onDelete) : undefined}
      />
    </form>
  )
}
