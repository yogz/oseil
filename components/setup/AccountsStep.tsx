'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrivalList, Arriving } from '@/components/ui/Arrival'
import { Button } from '@/components/ui/Button'
import { ACCOUNT_TYPES, bankAt } from '@/lib/catalog'
import { todayIso } from '@/lib/dates'
import { formatEuros } from '@/lib/format'
import { NO_RATE } from '@/lib/market/words'
import type { AccountTypeId, CategoryId, Establishment } from '@/lib/model/types'
import { addAccount, finishStep, putLine, removeLine, reopenStep, withRate, type SetupDraft } from '@/lib/setup/first-launch'
import {
  accountTotal,
  addSingleLineAccount,
  editSingleLineAccount,
  lineValue,
  type LineAmount,
  removeAccount,
  removeLineKeepingAccount,
} from '@/lib/setup/step-changes'
import { AccountNameForm } from './AccountNameForm'
import { ADDS, MULTI, type Kind } from './account-kinds'
import { OTHER_RESIDENCES } from './AmountForm'
import { LineEditor, lineFields, type LineValues } from './LineEditor'
import { BACK, TEXT_LINK } from './styles'
import { outsideLabel, TypePicker } from './TypePicker'
import { StepProgress } from './StepProgress'
import { useSubmit } from './useSubmit'

type View =
  | { name: 'list' }
  | { name: 'pick' }
  | { name: 'new'; type: AccountTypeId; kind: Kind; otherHome?: true } // otherHome: « Un autre logement », its type asked
  | { name: 'newMulti'; type: AccountTypeId }
  | { name: 'edit'; accountId: string; kind: Kind }
  | { name: 'lines'; accountId: string }
  | { name: 'line'; accountId: string; kind: Kind; lineId?: string; preset?: string; category?: CategoryId }

const ROW = 'flex min-h-11 w-full items-center justify-between gap-3 border-b border-hairline py-3 text-left text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

const money = (value: LineAmount) =>
  value === null ? 'montant à saisir' : value === 'no-rate' ? NO_RATE : formatEuros(value)

// The rate of a currency chosen in the form, written before the line that needs it. A form that
// chose nothing carries no rate, so a rate shared with other lines is never overwritten.
const rated = (d: SetupDraft, values: LineValues): SetupDraft =>
  values.currency !== undefined && values.eurPerUnit !== undefined ? withRate(d, values.currency, values.eurPerUnit) : d

// Above the choices of « Chez toi », once something is added.
const ADD_MORE = 'Autre chose\u00A0?'

type Apply = (change: (draft: SetupDraft | null) => SetupDraft) => Promise<boolean>

function title(establishment: Establishment): string {
  if (establishment.kind === 'home') return 'Qu’as-tu hors des banques\u00A0?'
  if (establishment.catalogId === 'employee-savings') return 'Qu’as-tu en épargne salariale\u00A0?'
  return `Qu’as-tu ${bankAt(establishment)}\u00A0?`
}

// One bank (or « Chez toi », or employee savings): its accounts, and the forms to add or correct them.
export function AccountsStep({
  draft,
  apply,
  saveError,
  establishment,
  step,
  previousId,
}: {
  draft: SetupDraft
  apply: Apply
  saveError: string | null
  establishment: Establishment
  // Where this step stands: its place from 0, and how many there are.
  step: { index: number; total: number }
  // The step before this one, reopened by « ‹ Retour »; none on the first step.
  previousId?: string
}) {
  const router = useRouter()
  const [view, setView] = useState<View>({ name: 'list' })
  const finishing = useSubmit()
  const deleting = useSubmit()
  const reopening = useSubmit()

  const { profile } = draft
  const accounts = profile.accounts.filter((a) => a.establishmentId === establishment.id)
  const homes = profile.lines.filter((l) => profile.accounts.find((a) => a.id === l.accountId)?.type === 'home')
    .map((l) => ({ id: l.id, name: l.name }))
  const isBank = establishment.kind === 'institution' && establishment.catalogId !== 'employee-savings'

  const change = (f: (draft: SetupDraft) => SetupDraft) =>
    apply((current) => {
      if (!current) throw new Error('No draft to change')
      return f(current)
    })
  const back = (to: View) => () => setView(to)
  const leave = async (done: Promise<boolean>, to: View) => {
    const ok = await done
    if (ok) setView(to)
    return ok
  }

  const accountOf = (id: string) => profile.accounts.find((a) => a.id === id)
  const linesOf = (id: string) => profile.lines.filter((l) => l.accountId === id)

  function header(heading: string, previous: View | null) {
    return (
      <>
        <div className="flex items-center justify-between">
          {previous === null && previousId !== undefined ? (
            <button
              type="button"
              className={BACK}
              disabled={reopening.busy}
              onClick={() => void reopening.run(() => change((d) => reopenStep(d, previousId)))}
            >
              ‹ Retour
            </button>
          ) : previous === null ? (
            <Link href="/premier-lancement/ou" className={BACK}>
              ‹ Retour
            </Link>
          ) : (
            <button type="button" className={BACK} onClick={back(previous)}>
              ‹ Retour
            </button>
          )}
          <div className="flex items-center gap-4">
            <StepProgress index={step.index} total={step.total} />
            {previous === null ? (
              <button type="button" className={`${BACK} self-auto`} onClick={() => router.push('/')}>
                Plus tard
              </button>
            ) : null}
          </div>
        </div>
        <h1 className="pt-2 text-title font-semibold leading-tight tracking-[-0.01em]">{heading}</h1>
      </>
    )
  }

  // The kinds of account offered: on their own screen for a bank, on the step itself for
  // « Chez toi » (a home is not « un compte »: hidden behind that link, it was not found).
  const typePicker = (
    <TypePicker
      establishment={establishment}
      planned={profile.firstLaunch?.planned ?? []}
      splitHome
      onPick={(type, otherHome) =>
        setView(
          MULTI.includes(type)
            ? { name: 'newMulti', type }
            : {
                name: 'new',
                type,
                kind: type === 'gold' || type === 'crypto' ? 'units' : 'amount',
                ...(otherHome ? { otherHome } : {}),
              },
        )
      }
    />
  )
  const inline = establishment.kind === 'home'
  const choices: View = inline ? { name: 'list' } : { name: 'pick' }

  if (view.name === 'pick') {
    return (
      <div className="flex flex-col">
        {header(title(establishment), { name: 'list' })}
        <h2 className="mt-2 text-body text-ink-soft">Quel type de compte&nbsp;?</h2>
        {typePicker}
      </div>
    )
  }

  if (view.name === 'newMulti') {
    const { type } = view
    return (
      <div className="flex flex-col">
        {header(ACCOUNT_TYPES[type].label, choices)}
        <AccountNameForm
          defaultName={ACCOUNT_TYPES[type].label}
          askYear={type === 'employee-savings'}
          saveError={saveError}
          onCancel={back({ name: 'list' })}
          onSubmit={async ({ name, unlockOn }) => {
            let accountId = ''
            const ok = await change((d) => {
              const added = addAccount(d, { establishmentId: establishment.id, type, name, ...(unlockOn !== undefined ? { unlockOn } : {}) })
              accountId = added.accountId
              return added.draft
            })
            if (ok) setView({ name: 'lines', accountId })
            return ok
          }}
        />
      </div>
    )
  }

  if (view.name === 'new') {
    const { type, kind } = view
    return (
      <div className="flex flex-col">
        {header(view.otherHome ? outsideLabel('other-home') : ACCOUNT_TYPES[type].label, choices)}
        <LineEditor
          key={kind}
          type={type}
          kind={kind}
          homes={homes}
          askResidence={view.otherHome === true ? OTHER_RESIDENCES : undefined}
          submitLabel="Ajouter"
          saveError={saveError}
          onCancel={back({ name: 'list' })}
          onKindChange={type === 'gold' || type === 'crypto' ? (next) => setView({ ...view, kind: next }) : undefined}
          onSubmit={(values) => {
            const { name, category, entry, financedLineId, residence } = values
            return leave(
              change((d) =>
                addSingleLineAccount(
                  rated(d, values),
                  {
                    establishmentId: establishment.id,
                    type,
                    name,
                    entry,
                    ...(category !== undefined ? { category } : {}),
                    ...(financedLineId ? { financedLineId } : {}),
                    ...(residence !== undefined ? { residence } : {}),
                    ...lineFields(values),
                  },
                  todayIso(),
                ),
              ),
              { name: 'list' },
            )
          }}
        />
      </div>
    )
  }

  if (view.name === 'edit') {
    const account = accountOf(view.accountId)
    const line = account ? linesOf(account.id)[0] : undefined
    if (!account || !line) return null
    const entry = draft.snapshot.entries.find((e) => e.lineId === line.id)
    const { type } = account
    // A home added as « Un autre logement » keeps its question; « Mon logement » never had one.
    const otherResidence = type === 'home' && account.residence !== undefined && account.residence !== 'main' ? account.residence : undefined
    return (
      <div className="flex flex-col">
        {header(account.name, { name: 'list' })}
        <LineEditor
          key={view.kind}
          type={type}
          kind={view.kind}
          initial={{
            name: account.name,
            ...(entry && entry.kind === view.kind ? { entry } : {}),
            ...(line.category !== undefined ? { category: line.category } : {}),
            financedLineId: account.financedLineId ?? null,
            currency: line.currency,
            ...(line.quoteSymbol !== undefined ? { quoteSymbol: line.quoteSymbol } : {}),
            ...(otherResidence !== undefined ? { residence: otherResidence } : {}),
          }}
          homes={homes}
          askResidence={otherResidence !== undefined ? OTHER_RESIDENCES : undefined}
          submitLabel="Enregistrer"
          saveError={saveError}
          onCancel={back({ name: 'list' })}
          onKindChange={type === 'gold' || type === 'crypto' ? (next) => setView({ ...view, kind: next }) : undefined}
          onSubmit={(values) => {
            const { name, category, entry: next, financedLineId, residence } = values
            return leave(
              change((d) =>
                editSingleLineAccount(
                  rated(d, values),
                  {
                    accountId: account.id,
                    name,
                    entry: next,
                    ...(category !== undefined ? { category } : {}),
                    ...(type === 'loan' ? { financedLineId: financedLineId ?? null } : {}),
                    ...(residence !== undefined ? { residence } : {}),
                    ...lineFields(values),
                  },
                  todayIso(),
                ),
              ),
              { name: 'list' },
            )
          }}
          onDelete={() => leave(change((d) => removeLine(d, line.id)), { name: 'list' })}
        />
      </div>
    )
  }

  if (view.name === 'lines') {
    const account = accountOf(view.accountId)
    if (!account) return null
    const lines = linesOf(account.id)
    return (
      <div className="flex flex-col">
        {header(account.name, { name: 'list' })}
        <ArrivalList list={`setup-lines:${account.id}`} ids={lines.map((l) => l.id)}>
        <ul className="mt-4 flex flex-col">
          {lines.map((line) => (
            <Arriving key={line.id} id={line.id}>
              <button
                type="button"
                className={ROW}
                onClick={() => setView({ name: 'line', accountId: account.id, kind: line.kind, lineId: line.id })}
              >
                {`${line.name} · ${money(lineValue(draft, line.id))}`}
                <span aria-hidden="true" className="text-ink-muted">›</span>
              </button>
            </Arriving>
          ))}
        </ul>
        </ArrivalList>
        {/* B9: adding is a plain link; the pills are kept for the way on (« Terminé »). */}
        <ul className="mt-4 flex flex-col">
          {(ADDS[account.type] ?? []).map((add) => (
            <li key={add.label}>
              <button
                type="button"
                className={TEXT_LINK}
                onClick={() =>
                  setView({
                    name: 'line',
                    accountId: account.id,
                    kind: add.kind,
                    ...(add.preset ? { preset: add.preset } : {}),
                    ...(add.category ? { category: add.category } : {}),
                  })
                }
              >
                {add.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-col gap-3">
          <Button onClick={back({ name: 'list' })}>Terminé</Button>
          {lines.length === 0 ? (
            <Button
              variant="secondary"
              disabled={deleting.busy}
              onClick={() => void deleting.run(() => leave(change((d) => removeAccount(d, account.id)), { name: 'list' }))}
            >
              Supprimer ce compte
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  if (view.name === 'line') {
    const account = accountOf(view.accountId)
    if (!account) return null
    const line = view.lineId ? profile.lines.find((l) => l.id === view.lineId) : undefined
    const entry = line ? draft.snapshot.entries.find((e) => e.lineId === line.id) : undefined
    const lines: View = { name: 'lines', accountId: account.id }
    return (
      <div className="flex flex-col">
        {header(line ? line.name : 'Nouvelle ligne', lines)}
        <LineEditor
          type={account.type}
          kind={view.kind}
          initial={
            line
              ? {
                  name: line.name,
                  ...(entry ? { entry } : {}),
                  ...(line.category !== undefined ? { category: line.category } : {}),
                  currency: line.currency,
                  ...(line.quoteSymbol !== undefined ? { quoteSymbol: line.quoteSymbol } : {}),
                }
              : undefined
          }
          preset={view.preset}
          homes={homes}
          submitLabel={line ? 'Enregistrer' : 'Ajouter'}
          saveError={saveError}
          onCancel={back(lines)}
          onSubmit={(values) => {
            const { name, category: chosen, entry: next } = values
            // A form that does not ask for the category keeps the one the line was made with.
            const category = chosen ?? line?.category ?? view.category
            return leave(
              change(
                (d) =>
                  putLine(
                    rated(d, values),
                    {
                      accountId: account.id,
                      ...(line ? { lineId: line.id } : {}),
                      name,
                      entry: next,
                      ...(category !== undefined ? { category } : {}),
                      ...lineFields(values),
                    },
                    todayIso(),
                  ).draft,
              ),
              lines,
            )
          }}
          onDelete={
            line
              ? () => {
                  return leave(change((d) => removeLineKeepingAccount(d, line.id)), lines)
                }
              : undefined
          }
        />
      </div>
    )
  }

  // The list of this step's accounts.
  return (
    <div className="flex flex-col">
      {header(title(establishment), null)}
      {isBank ? (
        <p className="mt-2 text-body leading-relaxed text-ink-soft">
          Ouvre ton application {establishment.name} et ajoute ce que tu y vois, ligne par ligne.
        </p>
      ) : null}

      <ArrivalList list={`setup-accounts:${establishment.id}`} ids={accounts.map((a) => a.id)}>
      {accounts.length > 0 ? (
        <ul className="mt-4 flex flex-col">
          {accounts.map((account) => {
            const lines = linesOf(account.id)
            const count = lines.length
            const total = money(accountTotal(draft, account.id))
            const noun =
              account.type === 'pea' || account.type === 'securities'
                ? count === 1 ? 'action et fonds' : 'actions et fonds'
                : count === 1 ? 'ligne' : 'lignes'
            const detail = MULTI.includes(account.type) && count > 0 ? ` · ${count} ${noun}` : ''
            return (
              <Arriving key={account.id} id={account.id}>
                <button
                  type="button"
                  className={ROW}
                  onClick={() =>
                    setView(
                      MULTI.includes(account.type)
                        ? { name: 'lines', accountId: account.id }
                        : { name: 'edit', accountId: account.id, kind: lines[0]?.kind ?? 'amount' },
                    )
                  }
                >
                  {`${account.name}${detail} · ${total}`}
                  <span aria-hidden="true" className="text-ink-muted">›</span>
                </button>
                {account.type === 'loan' ? (
                  <p className="text-caption text-ink-muted">
                    {(() => {
                      const financed = draft.profile.lines.find((l) => l.id === account.financedLineId)
                      return financed ? `finance ${financed.name}` : 'ne finance aucun logement'
                    })()}
                  </p>
                ) : null}
              </Arriving>
            )
          })}
        </ul>
      ) : null}
      </ArrivalList>

      {inline ? (
        <>
          {accounts.length > 0 ? <h2 className="mt-6 text-body text-ink-soft">{ADD_MORE}</h2> : null}
          {typePicker}
        </>
      ) : null}

      <div className="mt-6 flex flex-col gap-3">
        {inline ? null : (
          <button type="button" className={TEXT_LINK} onClick={() => setView({ name: 'pick' })}>
            + Ajouter un compte
          </button>
        )}
        <Button
          disabled={finishing.busy}
          onClick={() => void finishing.run(() => change((d) => finishStep(d, establishment.id)))}
        >
          {establishment.kind === 'home' ? 'J’ai tout ajouté' : `J’ai fini avec ${establishment.name}`}
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
