'use client'

import { useId, useState, type FormEvent } from 'react'
import { CategoryChoice } from '@/components/setup/CategoryChoice'
import { FormActions } from '@/components/setup/FormActions'
import { useSubmit } from '@/components/setup/useSubmit'
import type { CategoryId } from '@/lib/model/types'
import { CATEGORY_LABEL, SAVE } from '@/lib/screens/line-words'

// « Catégorie »: the five categories as pills, saved by « Enregistrer ».
export function CategoryEdit({
  category,
  saveError,
  onSave,
  onCancel,
}: {
  category: CategoryId
  saveError: string | null
  onSave: (category: CategoryId) => Promise<boolean>
  onCancel: () => void
}) {
  const [picked, setPicked] = useState<CategoryId>(category)
  const { busy, run } = useSubmit()
  const captionId = useId()

  function submit(event: FormEvent) {
    event.preventDefault()
    if (picked === category) return onCancel()
    void run(() => onSave(picked))
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p id={captionId} className="text-body font-medium text-ink">
          {CATEGORY_LABEL}
        </p>
        <CategoryChoice labelledBy={captionId} value={picked} onChoose={setPicked} />
      </div>
      <FormActions submitLabel={SAVE} busy={busy} saveError={saveError} onCancel={onCancel} />
    </form>
  )
}
