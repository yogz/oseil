'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CHIP } from '@/components/setup/styles'
import { useSubmit } from '@/components/setup/useSubmit'
import { CANCEL, SLOW_LABEL, SLOW_NO, SLOW_WHOLE_ACCOUNT, SLOW_YES } from '@/lib/screens/line-words'

// Whether this line can be got back within a few weeks: « Oui » or « Non » saves at once. Before
// either, « Pour tout le compte » (when the account has other open lines) writes it on the account.
export function SlowEdit({
  slow,
  wholeAccount,
  saveError,
  onSave,
  onCancel,
}: {
  slow: boolean
  wholeAccount: boolean
  saveError: string | null
  onSave: (slow: boolean, scope: 'line' | 'account') => Promise<boolean>
  onCancel: () => void
}) {
  const [whole, setWhole] = useState(false)
  const { busy, run } = useSubmit()
  const save = (next: boolean) => void run(() => onSave(next, whole ? 'account' : 'line'))

  return (
    <div className="mt-4 flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-body font-medium text-ink">{SLOW_LABEL}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" aria-pressed={!slow} disabled={busy} className={CHIP} onClick={() => save(false)}>
            {SLOW_YES}
          </button>
          <button type="button" aria-pressed={slow} disabled={busy} className={CHIP} onClick={() => save(true)}>
            {SLOW_NO}
          </button>
        </div>
      </fieldset>
      {wholeAccount ? (
        <div>
          <button type="button" aria-pressed={whole} disabled={busy} className={CHIP} onClick={() => setWhole(!whole)}>
            {SLOW_WHOLE_ACCOUNT}
          </button>
        </div>
      ) : null}
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
