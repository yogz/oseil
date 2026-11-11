'use client'

import { useState } from 'react'
import { TextField } from '@/components/ui/TextField'
import type { Cents } from '@/lib/model/types'
import { euroText, tidyEuros } from '@/lib/setup/step-changes'
import { useCommit } from './useCommit'

// A box of euros that keeps its typed text, and commits only what the person typed.
// `value` is what the line holds now; when it changes, the text starts again from it.
// `always`: a valid typed value is committed even when it equals `value` (the house's « Changer »).
export function MoneyBox({
  label,
  hint,
  value,
  read,
  onCommit,
  lit = false,
  always = false,
  autoFocus = false,
}: {
  label: string
  hint?: string
  value: Cents | null
  read: (text: string) => { cents: Cents } | { error: string }
  onCommit: (cents: Cents) => void
  lit?: boolean
  always?: boolean
  autoFocus?: boolean
}) {
  const initial = value === null ? '' : euroText(value)
  const [seen, setSeen] = useState(value)
  const [text, setText] = useState(initial)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | undefined>()
  if (seen !== value) {
    setSeen(value)
    setText(initial)
    setTouched(false)
    setError(undefined)
  }

  const commit = () => {
    // Never commit a box nobody typed in.
    if (!touched) return
    const result = read(text)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setError(undefined)
    setTouched(false)
    // « 23500 » becomes « 23 500 », next to the « avant : 22 950 € » it is read against.
    setText(tidyEuros(text))
    if (always || result.cents !== value) onCommit(result.cents)
  }
  const handlers = useCommit(commit)

  return (
    <div className={lit && !error ? '[&_input]:border-ink' : undefined}>
      <TextField
        label={label}
        hint={hint}
        type="text"
        inputMode="decimal"
        value={text}
        error={error}
        autoComplete="off"
        autoFocus={autoFocus}
        onChange={(event) => {
          setText(event.target.value)
          setTouched(true)
          setError(undefined)
        }}
        {...handlers}
      />
    </div>
  )
}
