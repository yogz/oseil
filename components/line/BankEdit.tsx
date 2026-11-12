'use client'

import { useState, type FormEvent } from 'react'
import { FormActions } from '@/components/setup/FormActions'
import { CHIP } from '@/components/setup/styles'
import { useSubmit } from '@/components/setup/useSubmit'
import { Button } from '@/components/ui/Button'
import type { Establishment } from '@/lib/model/types'
import { BANK_LABEL, CANCEL, NO_OTHER_BANK, SAVE } from '@/lib/screens/line-words'

// « Sa banque »: where the whole account goes.
export function BankEdit({
  banks,
  saveError,
  onSave,
  onCancel,
}: {
  banks: Establishment[]
  saveError: string | null
  onSave: (establishmentId: string) => Promise<boolean>
  onCancel: () => void
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const { busy, run } = useSubmit()

  if (banks.length === 0) {
    return (
      <div className="mt-4 flex flex-col gap-5">
        <p className="text-body leading-relaxed text-ink">{NO_OTHER_BANK}</p>
        <Button variant="secondary" onClick={onCancel}>
          {CANCEL}
        </Button>
      </div>
    )
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (picked === null) return onCancel()
    void run(() => onSave(picked))
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-body font-medium text-ink">{BANK_LABEL}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {banks.map((bank) => (
            <button key={bank.id} type="button" aria-pressed={picked === bank.id} className={CHIP} onClick={() => setPicked(bank.id)}>
              {bank.name}
            </button>
          ))}
        </div>
      </fieldset>
      <FormActions submitLabel={SAVE} busy={busy} saveError={saveError} onCancel={onCancel} />
    </form>
  )
}
