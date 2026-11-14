'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { listFaceIdKeys, removeFaceIdKey, type FaceIdKey } from '@/lib/auth/face-id'
import { PASSWORDS_DIFFER, PASSWORD_TOO_SHORT } from '@/lib/auth/messages'
import { todayIso } from '@/lib/dates'
import { formatDayMonth } from '@/lib/format'
import {
  ACCOUNT_FAILED,
  ACCOUNT_TITLE,
  CANCEL,
  DELETE_HREF,
  DELETE_LINK,
  EMAIL_LABEL,
  FACE_ID_HERE,
  FACE_ID_NONE,
  FACE_ID_REMOVE,
  FACE_ID_REMOVE_FAILED,
  FACE_ID_TITLE,
  FACE_ID_UNREADABLE,
  NOT_CURRENT_PASSWORD,
  PASSWORD_CHANGE,
  PASSWORD_DONE,
  PASSWORD_HALF_CHANGED,
  PASSWORD_NEW,
  PASSWORD_NEW_AGAIN,
  PASSWORD_OLD_EMPTY,
  PASSWORD_OLD,
  PASSWORD_SUBMIT,
  PRIVACY,
  PRIVACY_HREF,
  RECOVERY_CHANGED_MEANWHILE,
  RECOVERY_DONE,
  RECOVERY_PASSWORD,
  RECOVERY_REMAKE,
  RECOVERY_REMAKE_NOTE,
  RECOVERY_SUBMIT,
  faceIdAdded,
} from '@/lib/screens/settings-words'
import {
  PasswordHalfChangedError,
  PasswordTooShortError,
  WrongPasswordError,
  assertPasswordLength,
  changePassword,
  remakeRecoveryKey,
} from '@/lib/vault/store'
import { NOTE, ROW_LINK, SECTION, SECTION_TITLE, SENTENCE, SMALL_BUTTON } from './styles'
import { SETTINGS_ANCHORS } from '@/lib/screens/find-words'

type Props = {
  client: SupabaseClient
  /** The new key, shown once by the screen (it replaces the whole page until confirmed). */
  onRecoveryKey: (display: string) => void
  recoveryDone: boolean
}

// « Mon compte »: the address, the password, the recovery key, the Face ID keys. The password typed here
// goes to the vault's own functions and nowhere else.
export function AccountSection({ client, onRecoveryKey, recoveryDone }: Props) {
  const [email, setEmail] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    client.auth.getUser().then(
      (result) => {
        if (!cancelled) setEmail(result.data.user?.email ?? null)
      },
      () => {},
    )
    return () => {
      cancelled = true
    }
  }, [client])

  return (
    <section id={SETTINGS_ANCHORS.account} aria-label={ACCOUNT_TITLE} className={SECTION}>
      <h2 className={SECTION_TITLE}>{ACCOUNT_TITLE}</h2>
      <div className="flex flex-col">
        <span className="text-caption text-ink-muted">{EMAIL_LABEL}</span>
        <span className="min-h-11 [overflow-wrap:anywhere] pt-2 text-body text-ink">{email ?? ' '}</span>
      </div>
      <PasswordChange client={client} email={email} />
      <RecoveryRemake client={client} email={email} onRecoveryKey={onRecoveryKey} done={recoveryDone} />
      <FaceIdKeys client={client} />
      <Link href={PRIVACY_HREF} className={ROW_LINK}>
        {PRIVACY}
        <span aria-hidden="true" className="text-ink-muted">
          ›
        </span>
      </Link>
      {/* Another screen: nothing is deleted from the Réglages themselves. */}
      <Link href={DELETE_HREF} className={ROW_LINK}>
        {DELETE_LINK}
        <span aria-hidden="true" className="text-ink-muted">
          ›
        </span>
      </Link>
    </section>
  )
}

function PasswordChange({ client, email }: { client: SupabaseClient; email: string | null }) {
  const [open, setOpen] = useState(false)
  const [oldPassword, setOld] = useState('')
  const [newPassword, setNew] = useState('')
  const [again, setAgain] = useState('')
  const [errors, setErrors] = useState<{ old?: string; new?: string; again?: string }>({})
  const [said, setSaid] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  function cancel() {
    setOld('')
    setNew('')
    setAgain('')
    setErrors({})
    setOpen(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (email === null) return
    setDone(false)
    setSaid(null)
    const problems: typeof errors = {}
    if (oldPassword === '') problems.old = PASSWORD_OLD_EMPTY
    try {
      assertPasswordLength(newPassword)
    } catch {
      problems.new = PASSWORD_TOO_SHORT
    }
    if (!problems.new && newPassword !== again) problems.again = PASSWORDS_DIFFER
    setErrors(problems)
    if (problems.old || problems.new || problems.again) return

    setBusy(true)
    try {
      await changePassword(client, { email, oldPassword, newPassword })
      setOld('')
      setNew('')
      setAgain('')
      setDone(true)
      setOpen(false)
    } catch (error) {
      if (error instanceof WrongPasswordError || error instanceof PasswordTooShortError) {
        // An old password is never « too short »: it is simply not the current one.
        setErrors({ old: NOT_CURRENT_PASSWORD })
      } else if (error instanceof PasswordHalfChangedError) {
        setOld('')
        setAgain('')
        setSaid(PASSWORD_HALF_CHANGED)
      } else {
        console.error(error)
        setSaid(ACCOUNT_FAILED)
      }
    }
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-3">
      {!open ? (
        <button type="button" className={`${SMALL_BUTTON} self-start`} onClick={() => setOpen(true)}>
          {PASSWORD_CHANGE}
        </button>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <TextField label={PASSWORD_OLD} type="password" value={oldPassword} error={errors.old} autoComplete="current-password" onChange={(e) => setOld(e.target.value)} />
          <TextField label={PASSWORD_NEW} type="password" value={newPassword} error={errors.new} autoComplete="new-password" onChange={(e) => setNew(e.target.value)} />
          <TextField label={PASSWORD_NEW_AGAIN} type="password" value={again} error={errors.again} autoComplete="new-password" onChange={(e) => setAgain(e.target.value)} />
          <Button type="submit" disabled={busy || email === null}>
            {PASSWORD_SUBMIT}
          </Button>
          <button type="button" className={`${SMALL_BUTTON} self-start`} disabled={busy} onClick={cancel}>
            {CANCEL}
          </button>
        </form>
      )}
      {said ? (
        <p role="alert" className={SENTENCE}>
          {said}
        </p>
      ) : null}
      {done ? (
        <p role="status" className={SENTENCE}>
          {PASSWORD_DONE}
        </p>
      ) : null}
    </div>
  )
}

function RecoveryRemake({
  client,
  email,
  onRecoveryKey,
  done,
}: {
  client: SupabaseClient
  email: string | null
  onRecoveryKey: (display: string) => void
  done: boolean
}) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [said, setSaid] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function cancel() {
    setPassword('')
    setError(undefined)
    setOpen(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (email === null) return
    setSaid(null)
    if (password === '') return setError(PASSWORD_OLD_EMPTY)
    setError(undefined)
    setBusy(true)
    try {
      const display = await remakeRecoveryKey(client, { email, password })
      if (display === null) {
        setSaid(RECOVERY_CHANGED_MEANWHILE)
      } else {
        setPassword('')
        setOpen(false)
        onRecoveryKey(display)
      }
    } catch (failure) {
      if (failure instanceof WrongPasswordError || failure instanceof PasswordTooShortError) {
        setError(NOT_CURRENT_PASSWORD)
      } else {
        console.error(failure)
        setSaid(ACCOUNT_FAILED)
      }
    }
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-3">
      {!open ? (
        <button type="button" className={`${SMALL_BUTTON} self-start`} onClick={() => setOpen(true)}>
          {RECOVERY_REMAKE}
        </button>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <p className={NOTE}>{RECOVERY_REMAKE_NOTE}</p>
          <TextField label={RECOVERY_PASSWORD} type="password" value={password} error={error} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" disabled={busy || email === null}>
            {RECOVERY_SUBMIT}
          </Button>
          <button type="button" className={`${SMALL_BUTTON} self-start`} disabled={busy} onClick={cancel}>
            {CANCEL}
          </button>
        </form>
      )}
      {said ? (
        <p role="alert" className={SENTENCE}>
          {said}
        </p>
      ) : null}
      {done ? (
        <p role="status" className={SENTENCE}>
          {RECOVERY_DONE}
        </p>
      ) : null}
    </div>
  )
}

function FaceIdKeys({ client }: { client: SupabaseClient }) {
  const [keys, setKeys] = useState<FaceIdKey[] | 'unreadable' | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Bumped to read the list again.
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    listFaceIdKeys(client).then(
      (listed) => {
        if (!cancelled) setKeys(listed)
      },
      (error) => {
        console.error(error)
        if (!cancelled) setKeys('unreadable')
      },
    )
    return () => {
      cancelled = true
    }
  }, [client, attempt])

  async function remove(key: FaceIdKey) {
    setBusy(true)
    setSaid(null)
    try {
      await removeFaceIdKey(client, key.passkeyId)
    } catch (error) {
      console.error(error)
      setSaid(FACE_ID_REMOVE_FAILED)
    }
    // Whatever happened, the list shows what is left.
    setAttempt((count) => count + 1)
    setBusy(false)
  }

  const today = todayIso()
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-body font-medium text-ink">{FACE_ID_TITLE}</h3>
      {keys === 'unreadable' ? <p className={SENTENCE}>{FACE_ID_UNREADABLE}</p> : null}
      {Array.isArray(keys) && keys.length === 0 ? <p className={NOTE}>{FACE_ID_NONE}</p> : null}
      {Array.isArray(keys) && keys.length > 0 ? (
        <ul className="flex flex-col divide-y divide-hairline">
          {keys.map((key) => (
            <li key={key.passkeyId} className="flex min-h-11 items-center justify-between gap-3">
              <span className="text-body text-ink">
                {faceIdAdded(formatDayMonth(key.addedOn, today))}
                {key.onThisDevice ? <span className="text-ink-muted">{` · ${FACE_ID_HERE}`}</span> : null}
              </span>
              <button
                type="button"
                className={SMALL_BUTTON}
                disabled={busy}
                aria-label={`${FACE_ID_REMOVE}\u00A0: ${faceIdAdded(formatDayMonth(key.addedOn, today))}`}
                onClick={() => void remove(key)}
              >
                {FACE_ID_REMOVE}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {said ? (
        <p role="alert" className={SENTENCE}>
          {said}
        </p>
      ) : null}
    </div>
  )
}
