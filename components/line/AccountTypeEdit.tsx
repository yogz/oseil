'use client'

import { TypePicker } from '@/components/setup/TypePicker'
import { Button } from '@/components/ui/Button'
import { useSubmit } from '@/components/setup/useSubmit'
import type { AccountTypeId, Establishment } from '@/lib/model/types'
import { ACCOUNT_TYPE_LABEL, CANCEL } from '@/lib/screens/line-words'

// « Type du compte »: the types that take all its lines, as in the list of a new account; a touch saves.
export function AccountTypeEdit({
  establishment,
  allowed,
  saveError,
  onSave,
  onCancel,
}: {
  establishment: Establishment
  allowed: readonly AccountTypeId[]
  saveError: string | null
  onSave: (type: AccountTypeId) => Promise<boolean>
  onCancel: () => void
}) {
  const { busy, run } = useSubmit()
  return (
    <div className="mt-4 flex flex-col gap-4">
      <p className="text-body font-medium text-ink">{ACCOUNT_TYPE_LABEL}</p>
      <fieldset disabled={busy}>
        <TypePicker establishment={establishment} planned={[]} allowed={allowed} onPick={(type) => void run(() => onSave(type))} />
      </fieldset>
      {saveError ? (
        <p role="alert" className="text-body leading-relaxed text-ink">
          {saveError}
        </p>
      ) : null}
      <Button variant="secondary" disabled={busy} onClick={onCancel}>
        {CANCEL}
      </Button>
    </div>
  )
}
