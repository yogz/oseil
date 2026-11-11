'use client'

import { useId, useState, type FormEvent } from 'react'
import { TextField } from '@/components/ui/TextField'
import type { Cents } from '@/lib/model/types'
import { readAmount } from '@/lib/update/fields'
import { euroText, tidyEuros } from '@/lib/setup/step-changes'
import { FormActions } from './FormActions'
import { CHIP } from './styles'
import { useSubmit } from './useSubmit'

export type LoanValues = { name: string; amount: Cents; financedLineId: string | null }

// What is left to repay, and which home the loan finances (or something else).
// `askFinanced: false`: the choice is not offered (it could not be saved), and `initial` keeps it.
export function LoanForm({
  homes,
  initial,
  askFinanced = true,
  submitLabel,
  saveError,
  onSubmit,
  onCancel,
  onDelete,
}: {
  homes: { id: string; name: string }[]
  initial?: { name?: string; amount?: Cents; financedLineId?: string | null }
  askFinanced?: boolean
  submitLabel: string
  saveError: string | null
  onSubmit: (values: LoanValues) => Promise<boolean>
  onCancel: () => void
  onDelete?: () => Promise<boolean>
}) {
  const [name, setName] = useState(initial?.name ?? 'Crédit')
  const [amount, setAmount] = useState(initial?.amount !== undefined ? euroText(initial.amount) : '')
  // A new loan: the only home is what it finances, unless told otherwise; with several, the person chooses.
  // undefined is « not chosen yet », null is « Autre chose ».
  const [financed, setFinanced] = useState<string | null | undefined>(() => {
    if (initial?.financedLineId !== undefined) return initial.financedLineId
    if (homes.length === 0) return null
    return homes.length === 1 ? homes[0].id : undefined
  })
  const [errors, setErrors] = useState<{ name?: string; amount?: string; financed?: string }>({})
  const { busy, run } = useSubmit()
  const captionId = useId()
  const choose = (lineId: string | null) => {
    setFinanced(lineId)
    setErrors((now) => ({ ...now, financed: undefined }))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const found: typeof errors = {}
    const read = readAmount(amount, 'loan')
    const cents = 'cents' in read ? read.cents : null
    if (name.trim() === '') found.name = 'Donne-lui un nom.'
    if ('error' in read) found.amount = read.error
    // Never asked for a choice that is not offered.
    if (askFinanced && financed === undefined) found.financed = 'Choisis ce que finance ce crédit.'
    setErrors(found)
    if (Object.keys(found).length > 0 || cents === null) return
    void run(() => onSubmit({ name: name.trim(), amount: cents, financedLineId: financed ?? null }))
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
          setErrors((now) => ({ ...now, name: undefined }))
        }}
        autoComplete="off"
      />
      <TextField
        label="Combien reste-t-il à rembourser&nbsp;?"
        type="text"
        inputMode="decimal"
        value={amount}
        error={errors.amount}
        onChange={(event) => {
          setAmount(event.target.value)
          setErrors((now) => ({ ...now, amount: undefined }))
        }}
        onBlur={() => setAmount(tidyEuros)}
        autoComplete="off"
      />
      {askFinanced ? (
        <div className="flex flex-col gap-2">
          <p id={captionId} className="text-body font-medium text-ink">Ce crédit finance&nbsp;:</p>
          <ul role="group" aria-labelledby={captionId} className="flex flex-wrap gap-2">
            {homes.map((home) => (
              <li key={home.id}>
                <button type="button" aria-pressed={financed === home.id} className={CHIP} onClick={() => choose(home.id)}>
                  {home.name}
                </button>
              </li>
            ))}
            <li>
              <button type="button" aria-pressed={financed === null} className={CHIP} onClick={() => choose(null)}>
                Autre chose (voiture, études…)
              </button>
            </li>
          </ul>
          {errors.financed ? (
            <p role="alert" className="text-body font-medium leading-normal text-ink">
              {errors.financed}
            </p>
          ) : null}
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
