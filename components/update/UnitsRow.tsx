'use client'

import { useState } from 'react'
import { TEXT_LINK } from '@/components/setup/styles'
import { TextField } from '@/components/ui/TextField'
import { formatMoney, formatPrice, formatUnits } from '@/lib/format'
import { inCurrency } from '@/lib/market/words'
import { parseDecimal } from '@/lib/parse'
import { readNumber } from '@/lib/update/fields'
import { decimalText, priceText as priceBoxText, tidyCount, tidyPrice, unitsValue } from '@/lib/setup/step-changes'
import { hintOf, TO_FILL, type RowProps } from './AmountRow'
import { categoryOf } from '@/lib/model/situation'
import { PURCHASE_ASK } from '@/lib/screens/to-complete-words'
import { RowFrame, UnchangedButton } from './RowFrame'
import { useCommit } from './useCommit'

type Texts = { units: string; price: string; average: string }
type Errors = Partial<Record<keyof Texts, string>>

function textsOf(entry: RowProps['entry']): Texts {
  if (entry?.kind !== 'units') return { units: '', price: '', average: '' }
  return {
    units: decimalText(entry.units),
    price: priceBoxText(entry.unitPrice),
    average: entry.averagePrice === null ? '' : priceBoxText(entry.averagePrice),
  }
}

// Shares or quantity (planche 14, « le mélange »): by default only today's price of one part,
// since the parts and the average price rarely change; a link opens the two others, pre-filled.
// A line with no value yet opens all three, empty, to be filled. Its prices and its value are
// in the line's own currency, as its bank shows them. A line attached to its price opens at
// today's price (decision 7): the box is then lit, and recalls the last one.
export function UnitsRow({ line, account, entry, before, confirmed, onValue, onConfirm, footer, priceHint, inAccount, asksPurchase }: RowProps) {
  const bullion = account.type === 'gold' || account.type === 'crypto'
  const unitWord = bullion ? 'unités' : 'parts'
  // Every box asks its question (A9), in the words of the form that created the line.
  const words = bullion
    ? { price: 'Combien vaut une unité aujourd’hui\u00A0?', units: 'Quelle quantité en as-tu\u00A0?', average: 'À quel prix l’as-tu achetée, en moyenne\u00A0?' }
    : { price: 'Combien vaut une part aujourd’hui\u00A0?', units: 'Combien de parts as-tu\u00A0?', average: 'À quel prix les as-tu achetées, en moyenne\u00A0?' }
  const currency = inCurrency(line.currency)
  const priceText = (value: number) => formatPrice(value, line.currency)
  const empty = entry?.kind !== 'units'
  const key = JSON.stringify(entry)
  const [seen, setSeen] = useState(key)
  const [texts, setTexts] = useState(() => textsOf(entry))
  const [touched, setTouched] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [open, setOpen] = useState(empty)
  if (seen !== key) {
    setSeen(key)
    setTexts(textsOf(entry))
    setTouched(false)
    setErrors({})
  }

  const commit = () => {
    if (!touched) return
    // Being filled for the first time: the box not reached yet is not refused.
    if (empty && (texts.units.trim() === '' || texts.price.trim() === '')) return
    const units = readNumber(texts.units)
    const price = readNumber(texts.price)
    const average = texts.average.trim() === '' ? { value: null } : readNumber(texts.average)
    const found: Errors = {}
    if ('error' in units) found.units = units.error
    if ('error' in price) found.price = price.error
    if ('error' in average) found.average = average.error
    setErrors(found)
    if ('error' in units || 'error' in price || 'error' in average) return
    setTouched(false)
    // The boxes put back in the French way: « 692,3 » reads « 692,30 ».
    setTexts((now) => ({ units: tidyCount(now.units), price: tidyPrice(now.price), average: tidyPrice(now.average) }))
    const same =
      entry?.kind === 'units' &&
      entry.units === units.value &&
      entry.unitPrice === price.value &&
      entry.averagePrice === average.value
    if (!same) onValue({ kind: 'units', units: units.value, unitPrice: price.value, averagePrice: average.value })
  }
  const handlers = useCommit(commit)

  // A box is lit when it no longer holds the base value.
  const litOf = (name: keyof Texts) => {
    const was = before?.kind === 'units' ? textsOf(before)[name] : null
    // « 250 » typed over « 250,00 » is the same price: nothing to recall.
    const sameNumber = was !== null && parseDecimal(texts[name]) !== null && parseDecimal(texts[name]) === parseDecimal(was)
    return was !== null && texts[name] !== was && !sameNumber && !errors[name]
  }

  function field(name: keyof Texts, label: string, hint?: string) {
    return (
      <div className={litOf(name) ? '[&_input]:border-ink' : undefined}>
        <TextField
          label={label}
          hint={hint}
          type="text"
          inputMode="decimal"
          value={texts[name]}
          error={errors[name]}
          autoComplete="off"
          onChange={(event) => {
            setTexts((now) => ({ ...now, [name]: event.target.value }))
            setTouched(true)
            setErrors((now) => ({ ...now, [name]: undefined }))
          }}
          {...handlers}
        />
      </div>
    )
  }

  // The line « 3 800 parts = 22 382 € », from what is typed when it reads, else from the entry.
  const typedUnits = readNumber(texts.units)
  const typedPrice = readNumber(texts.price)
  const summary =
    'value' in typedUnits && 'value' in typedPrice
      ? { units: typedUnits.value, price: typedPrice.value }
      : entry?.kind === 'units'
        ? { units: entry.units, price: entry.unitPrice }
        : null

  const was =
    before?.kind === 'units'
      ? `Avant\u00A0: ${formatUnits(before.units)} ${unitWord} à ${
          before.averagePrice === null ? 'prix moyen inconnu' : priceText(before.averagePrice)
        }.`
      : null

  // Something different is held now: the button says what it puts back.
  const typedOver =
    before?.kind === 'units' &&
    entry?.kind === 'units' &&
    (entry.units !== before.units || entry.unitPrice !== before.unitPrice || entry.averagePrice !== before.averagePrice)
  const restoreLabel =
    before?.kind === 'units' ? `${formatUnits(before.units)} ${unitWord} à ${priceText(before.unitPrice)}` : ''

  return (
    <RowFrame name={line.name} accountName={account.name} category={categoryOf(line, account)} footer={footer} inAccount={inAccount}>
      {/* A price hint says the currency itself, the sentence first: never a capital after « · ». */}
      {field('price', words.price, priceHint ?? hintOf(currency))}
      {/* Typing over the price recalls « avant » (spec §5.2), as an amount does, the other boxes open or not. */}
      {before?.kind === 'units' && litOf('price') ? (
        <p className="text-caption text-ink-muted">avant&nbsp;: {priceText(before.unitPrice)}</p>
      ) : null}
      {summary ? (
        <p className="text-body text-ink">
          {`${formatUnits(summary.units)} ${unitWord} = ${formatMoney(unitsValue(summary.units, summary.price), line.currency)}`}
        </p>
      ) : empty ? (
        <p className="text-caption text-ink-muted">{TO_FILL}</p>
      ) : null}
      {open ? (
        <>
          {field('units', words.units)}
          {field('average', words.average, hintOf(currency))}
          <p className="text-caption leading-normal text-ink-muted">
            {`Recopie ce que montre ta banque.${was ? ` ${was}` : ''}`}
          </p>
        </>
      ) : (
        <button type="button" className={TEXT_LINK} onClick={() => setOpen(true)}>
          {/* « À compléter »: the purchase price missing from the base snapshot is asked for here. */}
          {asksPurchase ? PURCHASE_ASK : 'Les parts ou le prix moyen ont changé ?'}
        </button>
      )}
      {/* Nothing to confirm on a line with no base value: « Inchangé » would drop what was typed. */}
      {before !== null ? <UnchangedButton confirmed={confirmed} onConfirm={onConfirm} restore={typedOver ? restoreLabel : null} /> : null}
    </RowFrame>
  )
}
