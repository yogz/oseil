'use client'

import { useSubmit } from '@/components/setup/useSubmit'
import { Button } from '@/components/ui/Button'
import { CANCEL, CONFIRM_DELETE, KEEP, ONLY_LINE, YES_DELETE } from '@/lib/screens/line-words'

// Delete a line entered by mistake. It asks first; the only line of a snapshot is refused with
// a sentence and no button to confirm.
export function DeleteFlow({
  canDelete,
  saveError,
  onDelete,
  onCancel,
}: {
  canDelete: boolean
  saveError: string | null
  onDelete: () => Promise<boolean>
  onCancel: () => void
}) {
  const { busy, run } = useSubmit()
  return (
    <div className="mt-4 flex flex-col gap-5">
      <p className="text-body leading-relaxed text-ink">{canDelete ? CONFIRM_DELETE : ONLY_LINE}</p>
      <div className="flex flex-col gap-3">
        {canDelete ? (
          <Button disabled={busy} onClick={() => void run(onDelete)}>
            {YES_DELETE}
          </Button>
        ) : null}
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          {canDelete ? KEEP : CANCEL}
        </Button>
        {saveError ? (
          <p role="alert" className="text-body leading-relaxed text-ink">
            {saveError}
          </p>
        ) : null}
      </div>
    </div>
  )
}
