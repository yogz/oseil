'use client'

import { useState, type FormEvent } from 'react'
import { FormActions } from '@/components/setup/FormActions'
import { TEXT_LINK } from '@/components/setup/styles'
import { useSubmit } from '@/components/setup/useSubmit'
import { TextField } from '@/components/ui/TextField'
import { CLEAR_YEAR, SAVE, UNLOCK_FIELD, YEAR_UNREADABLE } from '@/lib/screens/line-words'

// The year employee savings become available: set, corrected or cleared (null).
export function UnlockYearEdit({
  year,
  saveError,
  onSave,
  onCancel,
}: {
  year: number | null
  saveError: string | null
  onSave: (year: number | null) => Promise<boolean>
  onCancel: () => void
}) {
  const [value, setValue] = useState(year === null ? '' : String(year))
  const [error, setError] = useState<string | undefined>()
  const { busy, run } = useSubmit()

  function submit(event: FormEvent) {
    event.preventDefault()
    const typed = value.trim()
    if (typed === '') {
      void run(() => onSave(null))
      return
    }
    if (!/^(19|20)\d{2}$/.test(typed)) {
      setError(YEAR_UNREADABLE)
      return
    }
    void run(() => onSave(Number(typed)))
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-5">
      <TextField
        label={UNLOCK_FIELD}
        type="text"
        inputMode="numeric"
        value={value}
        error={error}
        onChange={(event) => {
          setValue(event.target.value)
          setError(undefined)
        }}
        autoComplete="off"
      />
      {year !== null ? (
        <button type="button" className={TEXT_LINK} disabled={busy} onClick={() => void run(() => onSave(null))}>
          {CLEAR_YEAR}
        </button>
      ) : null}
      <FormActions submitLabel={SAVE} busy={busy} saveError={saveError} onCancel={onCancel} />
    </form>
  )
}
