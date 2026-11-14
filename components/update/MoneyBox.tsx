'use client'

import { useState } from 'react'
import { TextField } from '@/components/ui/TextField'
import type { Cents } from '@/lib/model/types'
import { euroText, tidyEuros } from '@/lib/setup/step-changes'
import { useCommit } from './useCommit'

// A box of euros that keeps its typed text, and commits only what the person typed.
// `value` is what the line holds now; when it changes, the text starts again from it.
// `always`: a valid typed value is committed even when it equals `value` (the house's « Changer »).
// `onClear`: a box made empty is an answer of its own (« not known »), not an unreadable amount.
// `onReadable`: on each commit, whether what was typed can be read (an error shows under the box when
// not); a form then holds its save.
export function MoneyBox({
  label,
  hint,
  note,
  value,
  read,
  onCommit,
  lit = false,
  always = false,
  autoFocus = false,
  onClear,
  onReadable,
}: {
  label: string
  hint?: string
  note?: string | null
  value: Cents | null
  read: (text: string) => { cents: Cents } | { error: string }
  onCommit: (cents: Cents) => void
  lit?: boolean
  always?: boolean
  autoFocus?: boolean
  onClear?: () => void
  onReadable?: (readable: boolean) => void
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
    if (onClear && text.trim() === '') {
      setError(undefined)
      setTouched(false)
      onReadable?.(true)
      if (value !== null) onClear()
      return
    }
    const result = read(text)
    if ('error' in result) {
      setError(result.error)
      onReadable?.(false)
      return
    }
    onReadable?.(true)
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
        note={note}
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
