'use client'

import { useState, type FormEvent } from 'react'
import { FormActions } from '@/components/setup/FormActions'
import { CHIP } from '@/components/setup/styles'
import { useSubmit } from '@/components/setup/useSubmit'
import { RESIDENCE_LABELS, RESIDENCES } from '@/lib/catalog'
import type { Residence } from '@/lib/model/types'
import { RESIDENCE_HISTORY, RESIDENCE_LABEL, SAVE } from '@/lib/screens/line-words'

// The type of a home: main, secondary or rental. It describes the home, so it holds for every snapshot.
export function ResidenceEdit({
  residence,
  saveError,
  onSave,
  onCancel,
}: {
  residence: Residence
  saveError: string | null
  onSave: (residence: Residence) => Promise<boolean>
  onCancel: () => void
}) {
  const [picked, setPicked] = useState(residence)
  const { busy, run } = useSubmit()

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(() => onSave(picked))
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-body font-medium text-ink">{RESIDENCE_LABEL}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {RESIDENCES.map((id) => (
            <button key={id} type="button" aria-pressed={picked === id} className={CHIP} onClick={() => setPicked(id)}>
              {RESIDENCE_LABELS[id]}
            </button>
          ))}
        </div>
        <p className="text-caption leading-snug text-ink-muted">{RESIDENCE_HISTORY}</p>
      </fieldset>
      <FormActions submitLabel={SAVE} busy={busy} saveError={saveError} onCancel={onCancel} />
    </form>
  )
}
