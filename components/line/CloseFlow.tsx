'use client'

import { useState, type FormEvent } from 'react'
import { FormActions } from '@/components/setup/FormActions'
import { useSubmit } from '@/components/setup/useSubmit'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { todayIso } from '@/lib/dates'
import { formatDayMonth } from '@/lib/format'
import { CONFIRM_REWRITE, IN_THE_FUTURE, KEEP, SAVE, SINCE, TOO_EARLY, YES_CLOSE } from '@/lib/screens/line-words'

// Close a line on a chosen day. When that day is on or before the last snapshot, the close rewrites
// snapshots and cannot be undone: it asks first. The bounds are checked here, before any save.
export function CloseFlow({
  label,
  bounds,
  rewrites,
  saveError,
  onClose,
  onCancel,
}: {
  label: string
  bounds: { earliest: string; latest: string }
  rewrites: (on: string) => number
  saveError: string | null
  onClose: (on: string) => Promise<boolean>
  onCancel: () => void
}) {
  const today = todayIso()
  const [on, setOn] = useState<string>(bounds.latest)
  const [error, setError] = useState<string | undefined>()
  const [asking, setAsking] = useState<number | null>(null)
  const { busy, run } = useSubmit()

  function submit(event: FormEvent) {
    event.preventDefault()
    if (on === '') {
      setError(TOO_EARLY)
      return
    }
    if (on > bounds.latest) {
      setError(IN_THE_FUTURE)
      return
    }
    if (on < bounds.earliest) {
      setError(TOO_EARLY)
      return
    }
    const n = rewrites(on)
    if (n > 0) {
      setAsking(n)
      return
    }
    void run(() => onClose(on))
  }

  if (asking !== null) {
    return (
      <div className="mt-4 flex flex-col gap-5">
        <p className="text-body leading-relaxed text-ink">{CONFIRM_REWRITE(formatDayMonth(on, today), asking)}</p>
        <div className="flex flex-col gap-3">
          <Button disabled={busy} onClick={() => void run(() => onClose(on))}>
            {YES_CLOSE}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            {KEEP}
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

  return (
    <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-5">
      <h2 className="text-body font-medium text-ink">{label}</h2>
      <TextField
        label={SINCE}
        type="date"
        value={on}
        min={bounds.earliest}
        max={bounds.latest}
        error={error}
        onChange={(event) => {
          setOn(event.target.value)
          setError(undefined)
        }}
      />
      <FormActions submitLabel={SAVE} busy={busy} saveError={saveError} onCancel={onCancel} />
    </form>
  )
}
