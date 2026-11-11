'use client'

// Adding during the monthly update: an account, or a line inside an account (planche 11).
// The views are kept in local state, like the first launch's AccountsStep. The question
// « Ouvert depuis la dernière fois, ou tu l’avais déjà ? » is asked once per added account,
// or once per line added to an account that already existed. Every change is saved before
// the flow goes on; otherwise the flow stays, with the save error, and trying again redoes
// the attempt from the draft before it, with what the form says now.

import { useRef, useState, type ReactNode } from 'react'
import { ADDS, MULTI, type Add, type Kind } from '@/components/setup/account-kinds'
import { AccountNameForm } from '@/components/setup/AccountNameForm'
import { LineEditor, lineFields } from '@/components/setup/LineEditor'
import { BACK, FOCUS } from '@/components/setup/styles'
import { TypePicker } from '@/components/setup/TypePicker'
import { Button } from '@/components/ui/Button'
import { ACCOUNT_TYPES, bankAt, RESIDENCES } from '@/lib/catalog'
import { todayIso } from '@/lib/dates'
import type { AccountTypeId, Arrival, Establishment, Profile, UpdateDraft } from '@/lib/model/types'
import { addAccount, putAddedLine, removeAddedLine } from '@/lib/update/lines'
import { ownValue } from '@/lib/update/totals'

export const ASK = 'Ouvert depuis la dernière fois, ou tu l’avais déjà\u00A0?'
export const OPENED = 'Ouvert depuis la dernière fois'
export const EXISTING = 'Je l’avais déjà'

const ROW = `flex min-h-11 w-full items-center justify-between gap-3 border-b border-hairline py-3 text-left text-body text-ink ${FOCUS}`

type View =
  | { name: 'pick' }
  | { name: 'ask'; type?: AccountTypeId; add?: Add; accountId?: string }
  | { name: 'new'; type: AccountTypeId; kind: Kind; arrival: Arrival }
  | { name: 'newMulti'; type: AccountTypeId; arrival: Arrival }
  | { name: 'lines'; accountId: string }
  | { name: 'line'; accountId: string; add?: Add; lineId?: string; arrival?: Arrival; from: 'lines' | 'start' }

export type AddFlowProps = {
  profile: Profile
  draft: UpdateDraft
  establishment: Establishment
  // An account to add a line to, or a line to rewrite (with `lineId`).
  accountId?: string
  lineId?: string
  // The kind of line asked for under an account (« + Une action ou un fonds »).
  add?: Add
  saveError: string | null
  change: (f: (draft: UpdateDraft) => UpdateDraft) => Promise<boolean>
  onDone: () => void
}

function Heading({ children, onBack }: { children: ReactNode; onBack: () => void }) {
  return (
    <>
      <button type="button" className={BACK} onClick={onBack}>
        ‹ Retour
      </button>
      <h1 className="pt-2 text-title font-semibold leading-tight tracking-[-0.01em]">{children}</h1>
    </>
  )
}

export function AddFlow({
  profile,
  draft,
  establishment,
  accountId,
  lineId,
  add,
  saveError,
  change,
  onDone,
}: AddFlowProps) {
  const addedAccountIds = new Set(draft.added.accounts.map((a) => a.id))
  const accounts = [...profile.accounts, ...draft.added.accounts]
  const lines = [...profile.lines, ...draft.added.lines]
  const accountOf = (id: string) => accounts.find((a) => a.id === id)

  const [view, setView] = useState<View>(() => {
    if (lineId !== undefined) {
      const line = draft.added.lines.find((l) => l.id === lineId)
      if (line) return { name: 'line', accountId: line.accountId, lineId, from: 'start' }
    }
    if (accountId !== undefined) {
      // A line of an added account takes the account’s arrival: nothing to ask again.
      if (addedAccountIds.has(accountId)) {
        return add ? { name: 'line', accountId, add, from: 'start' } : { name: 'lines', accountId }
      }
      return { name: 'ask', accountId, ...(add ? { add } : {}) }
    }
    return { name: 'pick' }
  })

  const homes = lines
    .filter((l) => accountOf(l.accountId)?.type === 'home')
    .map((l) => ({ id: l.id, name: l.name }))
  const today = todayIso()

  // Since this flow's last write that worked: the draft its attempts started from, and the
  // drafts they made. A draft on screen that is one of these still holds an attempt that was
  // not saved, so the next attempt is made again from `from`. It then takes the place of the
  // failed one, with what the form says now (or another add), and never adds twice.
  const attempts = useRef<{ from: UpdateDraft; made: UpdateDraft[] } | null>(null)
  const apply = async (f: (draft: UpdateDraft) => UpdateDraft): Promise<boolean> => {
    let tried = attempts.current
    const ok = await change((d) => {
      const pending = tried !== null && tried.made.includes(d) ? tried : null
      const from = pending?.from ?? d
      const made = f(from)
      tried = { from, made: [...(pending?.made ?? []), made] }
      return made
    })
    attempts.current = ok ? null : tried
    return ok
  }

  const saved = async (done: Promise<boolean>, to: () => void) => {
    const ok = await done
    if (ok) to()
    return ok
  }

  function question(next: (arrival: Arrival) => void) {
    return (
      <div className="mt-4 flex flex-col gap-4">
        <h2 className="text-subtitle font-semibold text-ink">{ASK}</h2>
        <div className="flex flex-col gap-3">
          <Button onClick={() => next('opened')}>{OPENED}</Button>
          <Button variant="secondary" onClick={() => next('existing')}>
            {EXISTING}
          </Button>
        </div>
      </div>
    )
  }

  if (view.name === 'pick') {
    return (
      <div className="flex flex-col">
        <Heading onBack={onDone}>{`Qu’as-tu ${bankAt(establishment)}\u00A0?`}</Heading>
        <h2 className="mt-2 text-body text-ink-soft">Quel type de compte&nbsp;?</h2>
        <TypePicker
          establishment={establishment}
          planned={profile.firstLaunch?.planned ?? []}
          onPick={(type) => setView({ name: 'ask', type })}
        />
      </div>
    )
  }

  if (view.name === 'ask') {
    const { type, accountId: toAccount, add: toAdd } = view
    const back = type !== undefined ? () => setView({ name: 'pick' }) : onDone
    const heading = type !== undefined ? ACCOUNT_TYPES[type].label : (accountOf(toAccount ?? '')?.name ?? '')
    return (
      <div className="flex flex-col">
        <Heading onBack={back}>{heading}</Heading>
        {question((arrival) => {
          if (type !== undefined) {
            setView(
              MULTI.includes(type)
                ? { name: 'newMulti', type, arrival }
                : { name: 'new', type, kind: type === 'gold' || type === 'crypto' ? 'units' : 'amount', arrival },
            )
          } else if (toAccount !== undefined) {
            setView({ name: 'line', accountId: toAccount, ...(toAdd ? { add: toAdd } : {}), arrival, from: 'start' })
          }
        })}
      </div>
    )
  }

  if (view.name === 'newMulti') {
    const { type, arrival } = view
    return (
      <div className="flex flex-col">
        <Heading onBack={() => setView({ name: 'ask', type })}>{ACCOUNT_TYPES[type].label}</Heading>
        <AccountNameForm
          defaultName={ACCOUNT_TYPES[type].label}
          askYear={type === 'employee-savings'}
          saveError={saveError}
          onCancel={onDone}
          onSubmit={async ({ name, unlockOn }) => {
            let created = ''
            const ok = await apply((d) => {
              const result = addAccount(profile, d, {
                establishmentId: establishment.id,
                type,
                name,
                arrival,
                ...(unlockOn !== undefined ? { unlockOn } : {}),
              })
              created = result.accountId
              return result.draft
            })
            if (ok) setView({ name: 'lines', accountId: created })
            return ok
          }}
        />
      </div>
    )
  }

  if (view.name === 'new') {
    const { type, kind, arrival } = view
    return (
      <div className="flex flex-col">
        <Heading onBack={() => setView({ name: 'ask', type })}>{ACCOUNT_TYPES[type].label}</Heading>
        <LineEditor
          key={kind}
          type={type}
          kind={kind}
          homes={homes}
          // A home bought since is added here: its type is asked, between all three, since the
          // update has no « Mon logement » of its own (the first launch's two lists are one here).
          askResidence={type === 'home' ? RESIDENCES : undefined}
          submitLabel="Ajouter"
          saveError={saveError}
          onCancel={onDone}
          onKindChange={type === 'gold' || type === 'crypto' ? (next) => setView({ ...view, kind: next }) : undefined}
          onSubmit={(values) => {
            const { name, category, entry, financedLineId, residence } = values
            return saved(
              apply((d) => {
                const account = addAccount(profile, d, {
                  establishmentId: establishment.id,
                  type,
                  name,
                  arrival,
                  ...(financedLineId ? { financedLineId } : {}),
                  ...(residence !== undefined ? { residence } : {}),
                })
                return putAddedLine(
                  profile,
                  account.draft,
                  { accountId: account.accountId, name, entry, ...(category !== undefined ? { category } : {}), ...lineFields(values) },
                  today,
                ).draft
              }),
              onDone,
            )
          }}
        />
      </div>
    )
  }

  if (view.name === 'lines') {
    const account = accountOf(view.accountId)
    if (!account) return null
    const own = draft.added.lines.filter((l) => l.accountId === account.id)
    return (
      <div className="flex flex-col">
        <Heading onBack={onDone}>{account.name}</Heading>
        <ul className="mt-4 flex flex-col">
          {own.map((line) => {
            // In the line's own currency, as its bank shows it: no rate needed.
            const entry = draft.values.find((e) => e.lineId === line.id)
            const value = entry ? ownValue(entry, line) : null
            return (
              <li key={line.id}>
                <button
                  type="button"
                  className={ROW}
                  onClick={() => setView({ name: 'line', accountId: account.id, lineId: line.id, from: 'lines' })}
                >
                  {value !== null ? `${line.name} · ${value}` : line.name}
                  <span aria-hidden="true" className="text-ink-muted">›</span>
                </button>
              </li>
            )
          })}
        </ul>
        <ul className="mt-4 flex flex-col gap-3">
          {(ADDS[account.type] ?? []).map((a) => (
            <li key={a.label}>
              <Button variant="secondary" onClick={() => setView({ name: 'line', accountId: account.id, add: a, from: 'lines' })}>
                {a.label}
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <Button disabled={own.length === 0} onClick={onDone}>
            Terminé
          </Button>
        </div>
      </div>
    )
  }

  // One line: new (with the arrival asked before, for an account that already existed), or rewritten.
  const account = accountOf(view.accountId)
  if (!account) return null
  const line = view.lineId ? draft.added.lines.find((l) => l.id === view.lineId) : undefined
  const entry = line ? draft.values.find((e) => e.lineId === line.id) : undefined
  const back = view.from === 'lines' ? () => setView({ name: 'lines', accountId: account.id }) : onDone
  const kind = line?.kind ?? view.add?.kind ?? 'amount'
  const { arrival } = view
  return (
    <div className="flex flex-col">
      <Heading onBack={back}>{line ? line.name : 'Nouvelle ligne'}</Heading>
      <LineEditor
        type={account.type}
        kind={kind}
        initial={
          line
            ? {
                name: line.name,
                ...(entry ? { entry } : {}),
                ...(line.category !== undefined ? { category: line.category } : {}),
                financedLineId: account.financedLineId ?? null,
                currency: line.currency,
                ...(line.quoteSymbol !== undefined ? { quoteSymbol: line.quoteSymbol } : {}),
              }
            : undefined
        }
        // Decision 8: a line a snapshot already holds keeps its currency.
        currencyLocked={line !== undefined && profile.lines.some((l) => l.id === line.id)}
        // What an added loan finances is set when it is added: the draft has no way to change
        // it, so rewriting the loan never offers a choice it would then drop.
        askFinanced={line === undefined}
        preset={view.add?.preset}
        homes={homes}
        submitLabel={line ? 'Enregistrer' : 'Ajouter'}
        saveError={saveError}
        onCancel={back}
        onSubmit={(values) => {
          const { name, category: chosen, entry: next } = values
          // A form that does not ask for the category keeps the one the line was made with.
          const category = chosen ?? line?.category ?? view.add?.category
          return saved(
            apply(
              (d) =>
                putAddedLine(
                  profile,
                  d,
                  {
                    accountId: account.id,
                    ...(line ? { lineId: line.id } : {}),
                    name,
                    entry: next,
                    ...(category !== undefined ? { category } : {}),
                    ...(arrival !== undefined ? { arrival } : {}),
                    ...lineFields(values),
                  },
                  today,
                ).draft,
            ),
            back,
          )
        }}
        onDelete={line ? () => saved(apply((d) => removeAddedLine(d, line.id)), back) : undefined}
      />
    </div>
  )
}

// What an added line reads in the bank screen. `value` is already written (ownValue).
export function addedLabel(name: string, value: string | null): string {
  return value === null ? `${name} · nouveau` : `${name} · ${value} · nouveau`
}
