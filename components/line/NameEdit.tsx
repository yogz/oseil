'use client'

import { useState, type FormEvent } from 'react'
import { FormActions } from '@/components/setup/FormActions'
import { useSubmit } from '@/components/setup/useSubmit'
import { TextField } from '@/components/ui/TextField'
import { NAME_EMPTY, NAME_LABEL, SAVE } from '@/lib/screens/line-words'

// Rename a line. For an account of one line the account follows (renameLine).
export function NameEdit({
  name,
  saveError,
  onSave,
  onCancel,
}: {
  name: string
  saveError: string | null
  onSave: (name: string) => Promise<boolean>
  onCancel: () => void
}) {
  const [value, setValue] = useState(name)
  const [error, setError] = useState<string | undefined>()
  const { busy, run } = useSubmit()

  function submit(event: FormEvent) {
    event.preventDefault()
    if (value.trim() === '') {
      setError(NAME_EMPTY)
      return
    }
    void run(() => onSave(value.trim()))
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-5">
      <TextField
        label={NAME_LABEL}
        type="text"
        value={value}
        error={error}
        onChange={(event) => {
          setValue(event.target.value)
          setError(undefined)
        }}
        autoComplete="off"
      />
      <FormActions submitLabel={SAVE} busy={busy} saveError={saveError} onCancel={onCancel} />
    </form>
  )
}
