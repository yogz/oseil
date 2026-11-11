'use client'

import { useState, type FormEvent } from 'react'
import { FormActions } from '@/components/setup/FormActions'
import { CHIP } from '@/components/setup/styles'
import { useSubmit } from '@/components/setup/useSubmit'
import { SAVE, SLOW_LABEL, SLOW_NO, SLOW_YES } from '@/lib/screens/line-words'

// Whether the account can be got back within a few weeks: « Oui » (the default) or « Non ».
export function SlowEdit({
  slow,
  saveError,
  onSave,
  onCancel,
}: {
  slow: boolean
  saveError: string | null
  onSave: (slow: boolean) => Promise<boolean>
  onCancel: () => void
}) {
  const [picked, setPicked] = useState(slow)
  const { busy, run } = useSubmit()

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(() => onSave(picked))
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-body font-medium text-ink">{SLOW_LABEL}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" aria-pressed={!picked} className={CHIP} onClick={() => setPicked(false)}>
            {SLOW_YES}
          </button>
          <button type="button" aria-pressed={picked} className={CHIP} onClick={() => setPicked(true)}>
            {SLOW_NO}
          </button>
        </div>
      </fieldset>
      <FormActions submitLabel={SAVE} busy={busy} saveError={saveError} onCancel={onCancel} />
    </form>
  )
}
