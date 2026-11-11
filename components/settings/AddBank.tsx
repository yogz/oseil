'use client'

import { useState } from 'react'
import { CHIP, TEXT_LINK } from '@/components/setup/styles'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { searchBanks } from '@/lib/catalog'
import {
  BANK_ADD,
  BANK_ADD_HOME,
  BANK_ADD_HOME_NOTE,
  BANK_ADD_MINE,
  BANK_CLOSE,
  BANK_SEARCH,
  BANK_TYPED_ADD,
  BANK_TYPED_LABEL,
} from '@/lib/screens/settings-words'

type Bank = { name: string; catalogId?: string }

// The first launch's way of finding a bank (a search over the catalog, or the name typed in), for one bank at a time.
export function AddBank({
  open,
  setOpen,
  busy,
  onPick,
  onPickHome,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  busy: boolean
  onPick: (bank: Bank) => void
  // Given only while the profile has no « Chez toi »: the choice is then offered with the banks.
  onPickHome?: () => void
}) {
  if (!open) {
    // B9: « + Ajouter… » is a plain link, as everywhere.
    return (
      <button type="button" className={TEXT_LINK} onClick={() => setOpen(true)}>
        {BANK_ADD}
      </button>
    )
  }
  return <Finder busy={busy} onPick={onPick} onPickHome={onPickHome} close={() => setOpen(false)} />
}

// Mounted only while open, so a bank searched for earlier is not left in the field.
function Finder({
  busy,
  onPick,
  onPickHome,
  close,
}: {
  busy: boolean
  onPick: (bank: Bank) => void
  onPickHome?: () => void
  close: () => void
}) {
  const [query, setQuery] = useState('')
  const [typing, setTyping] = useState(false)
  const [typed, setTyped] = useState('')

  const found = searchBanks(query)
  return (
    <div className="flex flex-col gap-3">
      <TextField
        label={BANK_SEARCH}
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoComplete="off"
      />
      {found.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {found.map((bank) => (
            <li key={bank.id}>
              <button
                type="button"
                aria-pressed="false"
                className={CHIP}
                disabled={busy}
                onClick={() => onPick({ catalogId: bank.id, name: bank.name })}
              >
                {bank.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {typing ? (
        <div className="flex flex-col gap-3">
          <TextField
            label={BANK_TYPED_LABEL}
            type="text"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
          />
          <Button
            variant="secondary"
            disabled={busy || typed.trim() === ''}
            onClick={() => onPick({ name: typed.trim() })}
          >
            {BANK_TYPED_ADD}
          </Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setTyping(true)}>
          {BANK_ADD_MINE}
        </Button>
      )}
      {onPickHome ? (
        // A chip like the banks of the catalogue; its sentence beside it, so it never wraps inside a pill.
        <div className="flex flex-col items-start gap-1">
          <button type="button" aria-pressed="false" className={CHIP} disabled={busy} onClick={onPickHome}>
            {BANK_ADD_HOME}
          </button>
          <p className="text-caption text-ink-muted">{BANK_ADD_HOME_NOTE}</p>
        </div>
      ) : null}
      <button type="button" className={TEXT_LINK} onClick={close}>
        {BANK_CLOSE}
      </button>
    </div>
  )
}
