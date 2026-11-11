'use client'

import { useId, useState, type FormEvent } from 'react'
import { CategoryChoice } from '@/components/setup/CategoryChoice'
import { FormActions } from '@/components/setup/FormActions'
import { Button } from '@/components/ui/Button'
import { CHIP } from '@/components/setup/styles'
import { useSubmit } from '@/components/setup/useSubmit'
import type { PlaceChoices } from '@/lib/correct/profile-changes'
import type { CategoryId } from '@/lib/model/types'
import { CANCEL, CATEGORY_CAPTION, NO_OTHER_ACCOUNT, NO_OTHER_BANK, PLACE_LABEL, SAVE } from '@/lib/screens/line-words'

// `to`: the establishment (a whole account moves) or the account (a line moves) picked, null when none.
// `category`: only when it differs from the line's current one.
export type PlaceValues = { to: string | null; category: CategoryId | null }

export function PlaceEdit({
  choices,
  current,
  saveError,
  onSubmit,
  onCancel,
}: {
  choices: PlaceChoices
  current: CategoryId | undefined
  saveError: string | null
  onSubmit: (values: PlaceValues) => Promise<boolean>
  onCancel: () => void
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const [category, setCategory] = useState<CategoryId | undefined>(current)
  const { busy, run } = useSubmit()
  const captionId = useId()

  const options =
    choices.moves === 'account'
      ? choices.establishments.map((e) => ({ id: e.id, label: e.name }))
      : choices.accounts.map((c) => ({ id: c.account.id, label: `${c.account.name} · ${c.establishment.name}` }))

  // Nowhere else to go: said, and the category, when it can be chosen here, is still offered.
  const nowhere = options.length === 0 ? (choices.moves === 'line' ? NO_OTHER_ACCOUNT : NO_OTHER_BANK) : null

  if (nowhere !== null && !choices.category) {
    return (
      <div className="mt-4 flex flex-col gap-5">
        <p className="text-body leading-relaxed text-ink">{nowhere}</p>
        <Button variant="secondary" onClick={onCancel}>
          {CANCEL}
        </Button>
      </div>
    )
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(() => onSubmit({ to: picked, category: category !== undefined && category !== current ? category : null }))
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-5">
      {nowhere !== null ? (
        <p className="text-body leading-relaxed text-ink">{nowhere}</p>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-body font-medium text-ink">{PLACE_LABEL}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={picked === option.id}
                className={CHIP}
                onClick={() => setPicked(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {choices.category ? (
        <div className="flex flex-col gap-2">
          <p id={captionId} className="text-body font-medium text-ink">
            {CATEGORY_CAPTION}
          </p>
          <CategoryChoice labelledBy={captionId} value={category} onChoose={setCategory} />
        </div>
      ) : null}
      <FormActions submitLabel={SAVE} busy={busy} saveError={saveError} onCancel={onCancel} />
    </form>
  )
}
