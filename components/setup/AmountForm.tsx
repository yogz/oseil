'use client'

import { useId, useState, type FormEvent } from 'react'
import { CurrencyChoice } from '@/components/market/CurrencyChoice'
import { TextField } from '@/components/ui/TextField'
import { ACCOUNT_TYPES, RESIDENCE_LABELS, RESIDENCE_NAMES } from '@/lib/catalog'
import type { AccountTypeId, CategoryId, Cents, CurrencyCode, Residence } from '@/lib/model/types'
import { readAmount } from '@/lib/update/fields'
import { euroText, tidyEuros } from '@/lib/setup/step-changes'
import { CategoryChoice } from './CategoryChoice'
import { FormActions } from './FormActions'
import { CHIP } from './styles'
import { useSubmit } from './useSubmit'

// The types of a home that is not the one the person lives in: asked of the first launch's
// « Un autre logement ». The monthly update, which has no « Mon logement », asks between all three.
export const OTHER_RESIDENCES: readonly Residence[] = ['secondary', 'rental']

// `currency` and `eurPerUnit` are there only when the currency was chosen in this form; `residence`
// only when the form asked for it.
export type AmountValues = {
  name: string
  amount: Cents
  category?: CategoryId
  currency?: CurrencyCode
  eurPerUnit?: number
  residence?: Residence
}

// A name and an amount: a savings account, a home, the euro fund of a life insurance, cash in a PEA…
export function AmountForm({
  type,
  initial,
  submitLabel,
  saveError,
  onSubmit,
  onCancel,
  onDelete,
  currencyLocked = false,
  askResidence,
}: {
  type: AccountTypeId
  initial?: { name?: string; amount?: Cents; category?: CategoryId; currency?: CurrencyCode; residence?: Residence }
  // A home whose type is asked, between these, nothing chosen in advance: OTHER_RESIDENCES for the
  // first launch's « Un autre logement », RESIDENCES for a home added in the monthly update.
  askResidence?: readonly Residence[]
  // A line a snapshot already holds keeps its currency.
  currencyLocked?: boolean
  submitLabel: string
  saveError: string | null
  onSubmit: (values: AmountValues) => Promise<boolean>
  onCancel: () => void
  onDelete?: () => Promise<boolean>
}) {
  const needsCategory = type === 'other'
  const asksResidence = askResidence !== undefined && askResidence.length > 0
  // A new home whose type is asked takes the name of the type chosen (RESIDENCE_NAMES), until a
  // name is typed in: in the first launch, « Logement » is already the name of « Mon logement ».
  const namedByType = asksResidence && initial?.name === undefined
  const [nameTyped, setNameTyped] = useState(false)
  const [name, setName] = useState(initial?.name ?? (needsCategory || namedByType ? '' : ACCOUNT_TYPES[type].label))
  const [amount, setAmount] = useState(initial?.amount !== undefined ? euroText(initial.amount) : '')
  const [category, setCategory] = useState<CategoryId | undefined>(initial?.category)
  const [chosen, setChosen] = useState<{ currency: CurrencyCode; eurPerUnit: number } | null>(null)
  const [residence, setResidence] = useState<Residence | undefined>(initial?.residence)
  const [errors, setErrors] = useState<{ name?: string; amount?: string; category?: string; residence?: string }>({})
  const { busy, run } = useSubmit()
  const captionId = useId()
  const residenceId = useId()

  function submit(event: FormEvent) {
    event.preventDefault()
    const found: typeof errors = {}
    const read = readAmount(amount, type)
    const cents = 'cents' in read ? read.cents : null
    if (name.trim() === '') found.name = 'Donne-lui un nom.'
    if ('error' in read) found.amount = read.error
    if (needsCategory && category === undefined) found.category = 'Choisis une catégorie.'
    if (asksResidence && residence === undefined) found.residence = 'Choisis un type.'
    setErrors(found)
    if (Object.keys(found).length > 0 || cents === null) return
    void run(() =>
      onSubmit({
        name: name.trim(),
        amount: cents,
        ...(needsCategory ? { category } : {}),
        ...(chosen ?? {}),
        ...(asksResidence ? { residence } : {}),
      }),
    )
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-5">
      <TextField
        label="Son nom"
        type="text"
        value={name}
        error={errors.name}
        onChange={(event) => {
          setName(event.target.value)
          setNameTyped(true)
          setErrors((now) => ({ ...now, name: undefined }))
        }}
        autoComplete="off"
      />
      <TextField
        label={type === 'home' ? 'Combien vaut-il, à peu près\u00A0?' : 'Combien y a-t-il dessus\u00A0?'}
        type="text"
        inputMode={type === 'current' ? 'text' : 'decimal'}
        value={amount}
        error={errors.amount}
        onChange={(event) => {
          setAmount(event.target.value)
          setErrors((now) => ({ ...now, amount: undefined }))
        }}
        onBlur={() => setAmount(tidyEuros)}
        autoComplete="off"
      />
      <CurrencyChoice
        value={chosen?.currency ?? initial?.currency ?? 'EUR'}
        locked={currencyLocked}
        onChoose={(currency, eurPerUnit) => setChosen({ currency, eurPerUnit })}
      />
      {asksResidence ? (
        <div className="flex flex-col gap-2">
          <p id={residenceId} className="text-body font-medium text-ink">Quel type de logement&nbsp;?</p>
          <ul role="group" aria-labelledby={residenceId} className="flex flex-wrap gap-2">
            {askResidence.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  aria-pressed={residence === id}
                  className={CHIP}
                  onClick={() => {
                    setResidence(id)
                    if (namedByType && !nameTyped) setName(RESIDENCE_NAMES[id])
                    setErrors((now) => ({ ...now, residence: undefined, ...(namedByType && !nameTyped ? { name: undefined } : {}) }))
                  }}
                >
                  {RESIDENCE_LABELS[id]}
                </button>
              </li>
            ))}
          </ul>
          {errors.residence ? (
            <p role="alert" className="text-body font-medium leading-normal text-ink">
              {errors.residence}
            </p>
          ) : null}
        </div>
      ) : null}
      {needsCategory ? (
        <div className="flex flex-col gap-2">
          <p id={captionId} className="text-body font-medium text-ink">Dans quelle catégorie le ranger&nbsp;?</p>
          <CategoryChoice
            value={category}
            labelledBy={captionId}
            error={errors.category}
            onChoose={(chosen) => {
              setCategory(chosen)
              setErrors((now) => ({ ...now, category: undefined }))
            }}
          />
        </div>
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
