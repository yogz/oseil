'use client'

import { useState, type FormEvent } from 'react'
import { TextField } from '@/components/ui/TextField'
import type { IsoDate } from '@/lib/model/types'
import { FormActions } from './FormActions'
import { useSubmit } from './useSubmit'

// The first half of a multi-line account (assurance-vie, PER, PEA, compte-titres, épargne salariale):
// its name, and for employee savings the year it becomes available. Its lines come next.
export function AccountNameForm({
  defaultName,
  askYear,
  saveError,
  onSubmit,
  onCancel,
}: {
  defaultName: string
  askYear: boolean
  saveError: string | null
  onSubmit: (values: { name: string; unlockOn?: IsoDate }) => Promise<boolean>
  onCancel: () => void
}) {
  const [name, setName] = useState(defaultName)
  const [year, setYear] = useState('')
  const [errors, setErrors] = useState<{ name?: string; year?: string }>({})
  const { busy, run } = useSubmit()

  function submit(event: FormEvent) {
    event.preventDefault()
    const found: typeof errors = {}
    const typedYear = year.trim()
    if (name.trim() === '') found.name = 'Donne-lui un nom.'
    if (askYear && typedYear !== '' && !/^(19|20)\d{2}$/.test(typedYear)) found.year = 'Cette année n’est pas lisible.'
    setErrors(found)
    if (Object.keys(found).length > 0) return
    void run(() =>
      onSubmit({ name: name.trim(), ...(askYear && typedYear !== '' ? { unlockOn: `${typedYear}-01-01` } : {}) }),
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
          setErrors((now) => ({ ...now, name: undefined }))
        }}
        autoComplete="off"
      />
      {askYear ? (
        <TextField
          label="Disponible en (année)"
          type="text"
          inputMode="numeric"
          value={year}
          error={errors.year}
          hint="Facultatif."
          onChange={(event) => {
            setYear(event.target.value)
            setErrors((now) => ({ ...now, year: undefined }))
          }}
          autoComplete="off"
        />
      ) : null}
      <FormActions submitLabel="Ajouter" busy={busy} saveError={saveError} onCancel={onCancel} />
    </form>
  )
}
