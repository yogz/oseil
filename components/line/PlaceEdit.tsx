'use client'

import { useState, type FormEvent } from 'react'
import { FormActions } from '@/components/setup/FormActions'
import { CHIP, TEXT_LINK } from '@/components/setup/styles'
import { TypePicker } from '@/components/setup/TypePicker'
import { useSubmit } from '@/components/setup/useSubmit'
import { TextField } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'
import { ACCOUNT_TYPES, MULTI_LINE_TYPES } from '@/lib/catalog'
import type { PlaceChoices } from '@/lib/correct/profile-changes'
import type { AccountTypeId, Establishment, Line } from '@/lib/model/types'
import {
  CANCEL,
  NAME_EMPTY,
  NEW_ACCOUNT,
  NEW_ACCOUNT_ALSO,
  NEW_ACCOUNT_NAME,
  NEW_ACCOUNT_TYPE,
  NO_OTHER_ACCOUNT,
  PLACE_LABEL,
  SAVE,
} from '@/lib/screens/line-words'

export type NewAccountValues = { type: AccountTypeId; name: string; lineIds: string[] }

// « Où il est rangé »: another account of its own (`onSubmit` with its id), or a new one, picked by its
// type, named, and taking along, if wanted, the lines of the same account and category (`onCreate`).
export function PlaceEdit({
  choices,
  establishment,
  newTypes,
  companions,
  saveError,
  onSubmit,
  onCreate,
  onCancel,
}: {
  choices: PlaceChoices
  establishment: Establishment
  newTypes: readonly AccountTypeId[]
  companions: Line[]
  saveError: string | null
  onSubmit: (accountId: string) => Promise<boolean>
  onCreate: (values: NewAccountValues) => Promise<boolean>
  onCancel: () => void
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const [creating, setCreating] = useState<'type' | AccountTypeId | null>(null)
  const { busy, run } = useSubmit()

  if (creating === 'type') {
    return (
      <div className="mt-4 flex flex-col gap-4">
        <p className="text-body font-medium text-ink">{NEW_ACCOUNT_TYPE}</p>
        <TypePicker establishment={establishment} planned={[]} allowed={newTypes} onPick={(type) => setCreating(type)} />
        <Button variant="secondary" onClick={() => setCreating(null)}>
          {CANCEL}
        </Button>
      </div>
    )
  }
  if (creating !== null) {
    return (
      <NewAccount
        type={creating}
        companions={companions}
        saveError={saveError}
        onSave={onCreate}
        onCancel={() => setCreating(null)}
      />
    )
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (picked === null) return onCancel()
    void run(() => onSubmit(picked!))
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-body font-medium text-ink">{PLACE_LABEL}</legend>
        {choices.accounts.length === 0 ? (
          <p className="mt-2 text-body leading-relaxed text-ink-soft">{NO_OTHER_ACCOUNT}</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {choices.accounts.map(({ account, establishment: bank }) => (
              <button
                key={account.id}
                type="button"
                aria-pressed={picked === account.id}
                className={CHIP}
                onClick={() => setPicked(account.id)}
              >
                {`${account.name} · ${bank.name}`}
              </button>
            ))}
          </div>
        )}
        {newTypes.length > 0 ? (
          <button type="button" className={TEXT_LINK} onClick={() => setCreating('type')}>
            {NEW_ACCOUNT}
          </button>
        ) : null}
      </fieldset>
      <FormActions submitLabel={SAVE} busy={busy} saveError={saveError} onCancel={onCancel} />
    </form>
  )
}

function NewAccount({
  type,
  companions,
  saveError,
  onSave,
  onCancel,
}: {
  type: AccountTypeId
  companions: Line[]
  saveError: string | null
  onSave: (values: NewAccountValues) => Promise<boolean>
  onCancel: () => void
}) {
  // A type of one line takes the line's name and nothing else along.
  const multi = MULTI_LINE_TYPES.includes(type)
  const [name, setName] = useState(ACCOUNT_TYPES[type].label)
  const [along, setAlong] = useState<string[]>(companions.map((l) => l.id))
  const [error, setError] = useState<string | undefined>()
  const { busy, run } = useSubmit()

  function submit(event: FormEvent) {
    event.preventDefault()
    if (multi && name.trim() === '') return setError(NAME_EMPTY)
    void run(() => onSave({ type, name: name.trim(), lineIds: multi ? along : [] }))
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-5">
      <p className="text-body font-medium text-ink">{ACCOUNT_TYPES[type].label}</p>
      {multi ? (
        <TextField
          label={NEW_ACCOUNT_NAME}
          type="text"
          value={name}
          error={error}
          autoComplete="off"
          onChange={(event) => {
            setName(event.target.value)
            setError(undefined)
          }}
        />
      ) : null}
      {multi && companions.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-body font-medium text-ink">{NEW_ACCOUNT_ALSO}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {companions.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={along.includes(l.id)}
                className={CHIP}
                onClick={() => setAlong(along.includes(l.id) ? along.filter((id) => id !== l.id) : [...along, l.id])}
              >
                {l.name}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      <FormActions submitLabel={SAVE} busy={busy} saveError={saveError} onCancel={onCancel} />
    </form>
  )
}
