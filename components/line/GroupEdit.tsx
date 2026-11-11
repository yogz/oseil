'use client'

import { useId, useState, type FormEvent } from 'react'
import { FormActions } from '@/components/setup/FormActions'
import { useSubmit } from '@/components/setup/useSubmit'
import { GROUP_LABELS, RANGED_GROUPS, type RangedCategory } from '@/lib/catalog'
import type { GroupId } from '@/lib/model/types'
import { SAVE } from '@/lib/screens/line-words'

// The chapter of a line of a ranged category: one of that category's chapters, « Je ne sais pas » included.
export function GroupEdit({
  label,
  category,
  group,
  saveError,
  onSave,
  onCancel,
}: {
  label: string
  category: RangedCategory
  group: GroupId
  saveError: string | null
  onSave: (group: GroupId) => Promise<boolean>
  onCancel: () => void
}) {
  const [picked, setPicked] = useState<GroupId>(group)
  const { busy, run } = useSubmit()
  const id = useId()

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(() => onSave(picked))
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor={id} className="text-body font-medium text-ink">
          {label}
        </label>
        <select
          id={id}
          value={picked}
          onChange={(event) => setPicked(event.target.value as GroupId)}
          className="min-h-13 w-full rounded-control border border-hairline bg-field px-4 text-subtitle text-ink focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {RANGED_GROUPS[category].map((option) => (
            <option key={option} value={option}>
              {GROUP_LABELS[option]}
            </option>
          ))}
        </select>
      </div>
      <FormActions submitLabel={SAVE} busy={busy} saveError={saveError} onCancel={onCancel} />
    </form>
  )
}
