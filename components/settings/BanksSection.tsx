'use client'

import { useEffect, useRef, useState } from 'react'
import { AddBank } from '@/components/settings/AddBank'
import { Button } from '@/components/ui/Button'
import type { ModelState } from '@/lib/app/use-model'
import { saveCorrection } from '@/lib/correct/save'
import type { Planned } from '@/lib/correct/types'
import type { Profile } from '@/lib/model/types'
import {
  BANKS_NONE,
  BANKS_ORDER_CHANGE,
  BANKS_ORDER_DONE,
  BANKS_ORDER_NOTE,
  BANKS_TITLE,
  BANK_ALREADY,
  BANK_DOWN,
  BANK_HOME_ALREADY,
  BANK_HOME_STILL_HOLDS,
  BANK_NOT_POSSIBLE,
  BANK_REMOVE,
  BANK_STILL_HOLDS,
  BANK_UP,
  bankAccounts,
} from '@/lib/screens/settings-words'
import { SAVE_FAILED, UNREADABLE_PROFILE, UPDATE_RUNNING } from '@/lib/screens/words'
import { addBank, addHome, bankRows, hasHome, homeRow, moveBank, removeBank, removeHome } from '@/lib/settings/banks'
import { ARROW_BUTTON, NOTE, SECTION, SECTION_TITLE, SENTENCE, SMALL_BUTTON } from './styles'
import { SETTINGS_ANCHORS } from '@/lib/screens/find-words'

type Ready = Extract<ModelState, { status: 'ready' }>
// `reloadOnRefusal`: a refusal means the screen is out of date (« Chez toi » is already there): it reloads.
type Change = { make: (profile: Profile) => Profile; refusal: string; reloadOnRefusal?: boolean }

// « Mes banques »: every change is one write of the profile through saveCorrection, which reads again just
// before, refuses during an update and refuses data it cannot read. An impossible change is refused with a word.
export function BanksSection({ state }: { state: Ready }) {
  const profile = state.model.profile?.value ?? null
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  // The arrows are not shown at rest (planche 2B, chosen by Nicolas on 12 November 2026): « Changer l’ordre »
  // shows them on every bank, « Terminé » hides them again. Moving a bank works as before.
  const [ordering, setOrdering] = useState(false)
  // Where the keyboard goes once the mode changes: the first arrow that can be used, or back to « Changer l’ordre ».
  const list = useRef<HTMLUListElement>(null)
  const changeOrder = useRef<HTMLButtonElement>(null)
  const modeFocus = useRef<'arrows' | 'change' | null>(null)
  useEffect(() => {
    const pending = modeFocus.current
    if (pending === null) return
    modeFocus.current = null
    if (pending === 'change') changeOrder.current?.focus()
    else list.current?.querySelector<HTMLButtonElement>('button[data-arrow]:not(:disabled)')?.focus()
  }, [ordering])
  // The arrows are disabled while a move is saved, and one of them for good once a bank reaches an
  // end: the keyboard would fall back to the top of the page. After a move, the focus goes back to
  // the arrow touched, or to the other one of the same bank when it can no longer be used. `after`:
  // the profile to wait to see replaced (the reload), or null to give the focus back at once.
  const arrows = useRef(new Map<string, HTMLButtonElement>())
  const refocus = useRef<{ id: string; dir: 'up' | 'down'; after: Profile | null } | null>(null)
  useEffect(() => {
    const pending = refocus.current
    if (pending === null || busy || (pending.after !== null && pending.after === profile)) return
    refocus.current = null
    const touched = arrows.current.get(`${pending.id}:${pending.dir}`)
    const other = arrows.current.get(`${pending.id}:${pending.dir === 'up' ? 'down' : 'up'}`)
    const target = touched && !touched.disabled ? touched : other && !other.disabled ? other : null
    target?.focus()
  }, [busy, profile])

  async function write(change: Change, moved?: { id: string; dir: 'up' | 'down' }): Promise<boolean> {
    setBusy(true)
    setSaid(null)
    let done = false
    try {
      const outcome = await saveCorrection(state.client, state.dataKey, (current): Planned => {
        try {
          return { writes: [{ kind: 'profile', value: change.make(current.profile.value) }] }
        } catch {
          return { refused: 'not-allowed' }
        }
      })
      if (outcome === 'saved') {
        done = true
        state.reload()
      } else {
        setSaid(
          outcome === 'update-running'
            ? UPDATE_RUNNING
            : outcome === 'unreadable'
              ? UNREADABLE_PROFILE
              : change.refusal,
        )
        if (outcome === 'not-allowed' && change.reloadOnRefusal) state.reload()
      }
    } catch (error) {
      console.error(error)
      setSaid(SAVE_FAILED)
    }
    if (moved) refocus.current = { ...moved, after: done ? profile : null }
    setBusy(false)
    return done
  }

  if (profile === null) {
    // No profile because nothing is entered yet is not an error: it says so. Only a profile that is
    // there but cannot be read is one.
    const unreadable = state.model.unreadable.profile > 0
    return (
      <section id={SETTINGS_ANCHORS.banks} aria-label={BANKS_TITLE} className={SECTION}>
        <h2 className={SECTION_TITLE}>{BANKS_TITLE}</h2>
        {unreadable ? (
          <p role="alert" className={SENTENCE}>
            {UNREADABLE_PROFILE}
          </p>
        ) : (
          <p className={SENTENCE}>{BANKS_NONE}</p>
        )}
      </section>
    )
  }

  const rows = bankRows(profile)
  const home = homeRow(profile)
  // With a single bank there is nothing to order: the mode ends by itself, and does not come back with a new bank.
  if (ordering && rows.length <= 1) setOrdering(false)
  const showArrows = ordering && rows.length > 1
  const arrow = (id: string, dir: 'up' | 'down') => (element: HTMLButtonElement | null) => {
    if (element) arrows.current.set(`${id}:${dir}`, element)
    else arrows.current.delete(`${id}:${dir}`)
  }
  return (
    <section id={SETTINGS_ANCHORS.banks} aria-label={BANKS_TITLE} className={SECTION}>
      <h2 className={SECTION_TITLE}>{BANKS_TITLE}</h2>
      {rows.length === 0 && home === null ? <p className={SENTENCE}>{BANKS_NONE}</p> : null}
      <ul ref={list} className="flex flex-col divide-y divide-hairline">
        {/* « Chez toi » comes first in the update, always: its place is fixed, so no arrows. */}
        {home ? (
          <li className="flex flex-col py-1">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-body text-ink">{home.name}</span>
                <span className="text-caption text-ink-muted">{bankAccounts(home.accounts)}</span>
              </span>
            </div>
            {/* While ordering, nothing but the arrows: no removal that would shift the rows (planche 2B). */}
            {home.removable && !showArrows ? (
              <button
                type="button"
                className={`${SMALL_BUTTON} self-start`}
                disabled={busy}
                aria-label={`${BANK_REMOVE} : ${home.name}`}
                onClick={() => void write({ make: (p) => removeHome(p), refusal: BANK_HOME_STILL_HOLDS })}
              >
                {BANK_REMOVE}
              </button>
            ) : null}
          </li>
        ) : null}
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col py-1">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-body text-ink">{row.name}</span>
                <span className="text-caption text-ink-muted">{bankAccounts(row.accounts)}</span>
              </span>
              {/* The arrows sit on the bank's own line; the first has no « up », the last no « down ». */}
              {showArrows ? (
                <span className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className={ARROW_BUTTON}
                    data-arrow
                    ref={arrow(row.id, 'up')}
                    disabled={busy || !row.canMoveUp}
                    aria-label={`${BANK_UP}\u00A0: ${row.name}`}
                    onClick={() =>
                      void write({ make: (p) => moveBank(p, row.id, 'up'), refusal: BANK_NOT_POSSIBLE }, { id: row.id, dir: 'up' })
                    }
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button
                    type="button"
                    className={ARROW_BUTTON}
                    data-arrow
                    ref={arrow(row.id, 'down')}
                    disabled={busy || !row.canMoveDown}
                    aria-label={`${BANK_DOWN}\u00A0: ${row.name}`}
                    onClick={() =>
                      void write({ make: (p) => moveBank(p, row.id, 'down'), refusal: BANK_NOT_POSSIBLE }, { id: row.id, dir: 'down' })
                    }
                  >
                    <span aria-hidden="true">↓</span>
                  </button>
                </span>
              ) : null}
            </div>
            {row.removable && !showArrows ? (
              <button
                type="button"
                className={`${SMALL_BUTTON} self-start`}
                disabled={busy}
                aria-label={`${BANK_REMOVE}\u00A0: ${row.name}`}
                onClick={() => void write({ make: (p) => removeBank(p, row.id), refusal: BANK_STILL_HOLDS })}
              >
                {BANK_REMOVE}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {/* The note on the left, the control on the right, on one line. */}
      {rows.length > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <p className={NOTE}>{BANKS_ORDER_NOTE}</p>
          {showArrows ? (
            <Button
              fit
              onClick={() => {
                modeFocus.current = 'change'
                setOrdering(false)
              }}
            >
              {BANKS_ORDER_DONE}
            </Button>
          ) : (
            <button
              type="button"
              ref={changeOrder}
              className={`${SMALL_BUTTON} shrink-0`}
              onClick={() => {
                modeFocus.current = 'arrows'
                setAdding(false)
                setOrdering(true)
              }}
            >
              {BANKS_ORDER_CHANGE}
            </button>
          )}
        </div>
      ) : null}
      {/* While the order changes, no bank is added. */}
      {showArrows ? null : (
        <AddBank
          open={adding}
          setOpen={setAdding}
          busy={busy}
          onPick={async (bank) => {
            const done = await write({ make: (p) => addBank(p, bank), refusal: BANK_ALREADY })
            if (done) setAdding(false)
          }}
          onPickHome={
            hasHome(profile)
              ? undefined
              : async () => {
                  const done = await write({ make: (p) => addHome(p), refusal: BANK_HOME_ALREADY, reloadOnRefusal: true })
                  if (done) setAdding(false)
                }
          }
        />
      )}
      {said ? (
        <p role="alert" className={SENTENCE}>
          {said}
        </p>
      ) : null}
    </section>
  )
}
