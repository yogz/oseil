'use client'

import { useState, type FormEvent } from 'react'
import { FormActions } from '@/components/setup/FormActions'
import { CHIP } from '@/components/setup/styles'
import { useSubmit } from '@/components/setup/useSubmit'
import { FINANCED_LABEL, NO_HOME_CHOICE, SAVE } from '@/lib/screens/line-words'

// The home a loan finances: one of the open home lines, or none.
export function FinancedEdit({
  homes,
  current,
  saveError,
  onSave,
  onCancel,
}: {
  homes: { id: string; name: string }[]
  current: string | null
  saveError: string | null
  onSave: (homeLineId: string | null) => Promise<boolean>
  onCancel: () => void
}) {
  const [picked, setPicked] = useState<string | null>(current)
  const { busy, run } = useSubmit()

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(() => onSave(picked))
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-body font-medium text-ink">{FINANCED_LABEL}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {homes.map((home) => (
            <button
              key={home.id}
              type="button"
              aria-pressed={picked === home.id}
              className={CHIP}
              onClick={() => setPicked(home.id)}
            >
              {home.name}
            </button>
          ))}
          <button type="button" aria-pressed={picked === null} className={CHIP} onClick={() => setPicked(null)}>
            {NO_HOME_CHOICE}
          </button>
        </div>
      </fieldset>
      <FormActions submitLabel={SAVE} busy={busy} saveError={saveError} onCancel={onCancel} />
    </form>
  )
}
