'use client'

// One establishment of the monthly update (planche 11, écran 2): every open line
// with its box already filled, the account totals to check against the bank,
// what was paid into a life insurance, and the ways on. A step moves on only
// once its change is saved; otherwise it stays, with the save error. Every box, total and
// value here reads the prices the update read when it opened (`session.market`, R18), and
// is written in its line's own currency, as the bank shows it.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLayoutEffect, useRef, useState } from 'react'
import { ADDS, MULTI, type Add } from '@/components/setup/account-kinds'
import { Alert } from '@/components/setup/Notices'
import { BACK, TEXT_LINK } from '@/components/setup/styles'
import { StepProgress } from '@/components/setup/StepProgress'
import { useSubmit } from '@/components/setup/useSubmit'
import { ArrivalList, Arriving } from '@/components/ui/Arrival'
import { Button } from '@/components/ui/Button'
import { todayIso } from '@/lib/dates'
import { formatMoney } from '@/lib/format'
import { failedPriceHint, todaysPriceHint } from '@/lib/market/words'
import type { Account, Establishment, Line, SnapshotEntry, UpdateDraft } from '@/lib/model/types'
import { steps, type EntryInput } from '@/lib/setup/first-launch'
import {
  asksPurchasePrice,
  confirmLine,
  currentEntry,
  touchedHere,
  linesOf,
  markStep,
  nothingChangedHere,
  restateValue,
  setValue,
  skipTheRest,
  verifiedWords,
  type UpdateLine,
} from '@/lib/update/draft'
import { closeLine, contributionAccounts, reopenLine, setContribution } from '@/lib/update/lines'
import { ownValue, shownTotal } from '@/lib/update/totals'
import { AddFlow, addedLabel } from './AddFlow'
import { AmountRow, type RowProps } from './AmountRow'
import { ContributionField } from './ContributionField'
import { HomeRow } from './HomeRow'
import { StepsBar } from './StepsBar'
import { UnitsRow } from './UnitsRow'
import { useUpdateScreen } from './UpdateProvider'

const RESULT = '/mise-a-jour/resultat'
const CHECK = 'C’est bien ce que montre ta banque\u00A0? Un écart vient presque toujours d’un achat ou d’une vente oublié.'
const ADD_BUTTON = 'flex min-h-11 w-full items-center justify-between gap-3 border-b border-hairline py-3 text-left text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const CHOICE = 'flex min-h-11 w-full items-center justify-between gap-3 py-3 text-left text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
// « Terminer ici »: when nothing is touched here, this bank is confirmed too (dated today), and the words say so.
const FINISH_TOUCHED = 'Terminer ici, les autres banques gardent leur date'
const FINISH_UNTOUCHED = 'Rien n’a changé ici, terminer : les autres banques gardent leur date'
const LEAVE_WITHOUT = 'Ta dernière saisie n’a pas été enregistrée. Touche Fermer encore pour quitter sans elle.'

// linesOf lists an establishment's lines account by account: one group per account.
function byAccount(rows: UpdateLine[]): Array<{ account: Account; rows: UpdateLine[] }> {
  const groups: Array<{ account: Account; rows: UpdateLine[] }> = []
  for (const row of rows) {
    const last = groups[groups.length - 1]
    if (last && last.account.id === row.account.id) last.rows.push(row)
    else groups.push({ account: row.account, rows: [row] })
  }
  return groups
}

export function BankStep({
  establishment,
  step,
  previousId,
  next,
}: {
  establishment: Establishment
  // Where this step stands: its place from 0, and how many there are.
  step: { index: number; total: number }
  // The establishment before this one, shown by « ‹ Retour »; none on the first one.
  previousId: string | null
  // The one after; none on the last one, which goes on to the result.
  next: Establishment | null
}) {
  const router = useRouter()
  const { state, show } = useUpdateScreen()
  const moving = useSubmit()
  const closing = useSubmit()
  const heading = useRef<HTMLHeadingElement>(null)
  const saveError = state.status === 'ready' ? state.session.saveError : null
  // « Fermer » found the last save failed and said so: the next tap leaves without it,
  // so a lost connection never traps anyone. Forgotten once a later save works.
  const [stranded, setStranded] = useState(false)
  const [seenError, setSeenError] = useState(saveError)
  // The adding flow on screen, if any: an account (none given), a line under an account, or an added line to rewrite.
  const [adding, setAdding] = useState<{ accountId?: string; add?: Add; lineId?: string } | null>(null)
  // « Une ligne fermée ou vendue ? »: choosing the line, then the line it is asking to confirm.
  const [choosing, setChoosing] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(null)
  if (seenError !== saveError) {
    setSeenError(saveError)
    if (saveError === null) setStranded(false)
  }

  // Another establishment on screen: its top, and the focus on its name, not on a button that is gone.
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
    heading.current?.focus({ preventScroll: true })
  }, [])

  if (state.status !== 'ready') return null
  const { profile, base, draft, market, failedPrices, change, settled } = state.session
  if (adding !== null) {
    return (
      <AddFlow
        profile={profile}
        draft={draft}
        establishment={establishment}
        saveError={saveError}
        change={change}
        onDone={() => setAdding(null)}
        {...adding}
      />
    )
  }
  const here = establishment.id
  const isBank = establishment.kind === 'institution' && establishment.catalogId !== 'employee-savings'
  const groups = byAccount(linesOf(profile, draft, here))
  // The lines of the base still followed: the ones that can be closed (an added line is deleted, not closed).
  const openLines = groups.flatMap(({ rows }) => rows.filter((r) => !r.added && !r.closed))
  const paidIn = new Set(contributionAccounts(profile, base.value, here).map((a) => a.id))
  const verified = verifiedWords(profile, draft, here)
  const busy = moving.busy || closing.busy
  // An open line with no value at all (no base entry, nothing typed): nothing is known of it,
  // so « Rien n’a changé ici » cannot be said. A value to type, or « Passer pour cette fois ».
  const unknown = groups.some(({ rows }) =>
    rows.some((r) => !r.added && !r.closed && currentEntry(base.value, draft, r.line.id, market.prices) === null),
  )

  // The main exit's rule: nothing touched here and every line known.
  const untouched = !touchedHere(profile, draft, here) && !unknown

  // Saved first, then on to the next establishment, or to the result after the last one.
  const moveOn = (f: (draft: UpdateDraft) => UpdateDraft, toResult = false) =>
    void moving.run(async () => {
      if (!(await change(f))) return false
      if (next && !toResult) show(next.id)
      else router.push(RESULT)
      return true
    })

  // The box just left has committed its value before this runs: it is waited for too.
  const close = () => {
    if (stranded) {
      router.push('/')
      return
    }
    void closing.run(async () => {
      if (await settled()) {
        router.push('/')
        return true
      }
      setStranded(true)
      return false
    })
  }

  // Under « prix d’une part »: today's price in the box, or the last one, today's being out of
  // reach. That sentence goes only once a price is typed: « Inchangé » keeps the base price, so a
  // line confirmed (even at a price of the day that a later reading could not get) still says it.
  function priceHintOf(line: Line, entry: SnapshotEntry | null): string | undefined {
    const today = Object.hasOwn(market.prices, line.id) ? market.prices[line.id] : undefined
    if (entry?.kind === 'units' && today !== undefined && entry.unitPrice === today) return todaysPriceHint(line.currency)
    const typed = draft.values.some((e) => e.lineId === line.id)
    return failedPrices.includes(line.id) && !typed ? failedPriceHint(line.currency) : undefined
  }

  function row(line: Line, account: Account, inAccount: boolean) {
    const home = account.type === 'home'
    const entry = currentEntry(base.value, draft, line.id, market.prices)
    const props: RowProps = {
      line,
      account,
      entry,
      before: base.value.entries.find((e) => e.lineId === line.id) ?? null,
      confirmed: draft.confirmed.includes(line.id),
      priceHint: priceHintOf(line, entry),
      asksPurchase: asksPurchasePrice(profile, base.value, line.id),
      // Today's price typed back is a confirmation; the base price typed over it is a value.
      // The house's « Changer » records its value even when it is the same, so its estimate is dated anew.
      onValue: (typed: EntryInput) =>
        void change((d) =>
          home
            ? restateValue(d, base.value, line.id, typed, todayIso())
            : setValue(d, base.value, line.id, typed, todayIso(), market.prices),
        ),
      onConfirm: () => void change((d) => confirmLine(d, line.id)),
      inAccount,
    }
    if (home) return <HomeRow key={line.id} {...props} />
    if (line.kind === 'units') return <UnitsRow key={line.id} {...props} />
    return <AmountRow key={line.id} {...props} />
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between">
        {previousId !== null ? (
          <button type="button" className={BACK} disabled={busy} onClick={() => show(previousId)}>
            ‹ Retour
          </button>
        ) : (
          <Link href="/mise-a-jour" className={BACK}>
            ‹ Retour
          </Link>
        )}
        <div className="flex items-center gap-4">
          <StepProgress index={step.index} total={step.total} />
          <button type="button" className={`${BACK} self-auto`} disabled={busy} onClick={close}>
            Fermer
          </button>
        </div>
      </div>
      {/* Next to « Fermer », which it is about. */}
      {stranded ? <Alert>{LEAVE_WITHOUT}</Alert> : null}
      {/* Near the top, where it is seen whatever box was just left; it stays until a write works. */}
      {saveError !== null ? <Alert>{saveError}</Alert> : null}
      <h1
        ref={heading}
        tabIndex={-1}
        className="pt-2 text-title font-semibold leading-tight tracking-[-0.01em] focus:outline-none"
      >
        {establishment.name}
      </h1>
      <div className="mt-4">
        <StepsBar statuses={steps(profile).map((e) => draft.progress[e.id] ?? 'todo')} />
      </div>
      {isBank ? (
        <p className="mt-4 text-body leading-relaxed text-ink-soft">
          Recopie la valeur que t’affiche ton application {establishment.name}.
        </p>
      ) : null}
      {verified !== null ? <p className="mt-2 text-caption text-ink-muted">{verified}</p> : null}

      <ArrivalList list={`update-added:${establishment.id}`} ids={groups.flatMap((g) => g.rows.filter((r) => r.added).map((r) => r.line.id))}>
      <div className="mt-4 flex flex-col">
        {groups.map(({ account, rows }) => {
          const open = rows.filter((r) => !r.closed)
          // In the account's one currency, as its bank shows it; none for an account in several.
          const total = open.length >= 2 ? shownTotal(open, base.value, draft, market.prices) : null
          // An account of several lines: its name once, as a title, and its lines under it.
          const several = open.filter((r) => !r.added).length >= 2
          const lines = open.filter((r) => !r.added).map((r) => row(r.line, account, several))
          return (
            <div key={account.id} className="flex flex-col">
              {several ? (
                <div className="border-t border-hairline pt-5">
                  <h2 className="text-subtitle font-semibold text-ink">{account.name}</h2>
                  <div className="mt-1 flex flex-col border-l border-rule-strong pl-3">{lines}</div>
                </div>
              ) : (
                lines
              )}
              {rows
                .filter((r) => r.closed)
                .map((r) => (
                  <div key={r.line.id} className="flex items-center justify-between gap-3 border-t border-hairline py-3">
                    <p className="text-body text-ink-soft">{`${r.line.name} · fermé`}</p>
                    <button
                      type="button"
                      className={`${TEXT_LINK} self-auto`}
                      onClick={() => void change((d) => reopenLine(d, r.line.id))}
                    >
                      Annuler
                    </button>
                  </div>
                ))}
              {rows
                .filter((r) => r.added)
                .map((r) => {
                  const entry = currentEntry(base.value, draft, r.line.id, market.prices)
                  const value = entry !== null ? ownValue(entry, r.line) : null
                  return (
                    <Arriving key={r.line.id} id={r.line.id} as="div">
                      <button
                        type="button"
                        className={`${ADD_BUTTON} border-t`}
                        onClick={() => setAdding({ lineId: r.line.id })}
                      >
                        {addedLabel(r.line.name, value)}
                        <span aria-hidden="true" className="text-ink-muted">›</span>
                      </button>
                    </Arriving>
                  )
                })}
              {MULTI.includes(account.type) ? (
                // B9: adding is a plain link; the outline pill is kept for the one choice of a block.
                <div className="flex flex-col border-t border-hairline py-2">
                  {(ADDS[account.type] ?? []).map((add) => (
                    <button key={add.label} type="button" className={TEXT_LINK} onClick={() => setAdding({ accountId: account.id, add })}>
                      {add.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {total !== null ? (
                <div className="flex flex-col gap-1 border-t border-hairline py-4">
                  <p className="text-body font-semibold text-ink">{`Total du compte\u00A0: ${formatMoney(total.minor, total.currency)}`}</p>
                  <p className="text-caption leading-normal text-ink-muted">{CHECK}</p>
                </div>
              ) : null}
              {paidIn.has(account.id) ? (
                <div className="border-t border-hairline py-5">
                  <ContributionField
                    account={account}
                    since={base.value.takenOn}
                    cents={draft.contributions[account.id] ?? null}
                    onValue={(cents) => void change((d) => setContribution(d, account.id, cents))}
                  />
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      </ArrivalList>

      <div className="mt-2 border-t border-hairline pt-2">
        <button type="button" className={`${TEXT_LINK} disabled:opacity-40`} disabled={busy} onClick={() => setAdding({})}>
          + Ajouter un compte
        </button>
      </div>

      {/* One quiet link for the rare closed or sold line, in place of one under each line. */}
      {closingId !== null ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-hairline pt-4">
          <p className="text-body font-medium text-ink">{`Fermer «\u00A0${openLines.find((r) => r.line.id === closingId)?.line.name ?? ''}\u00A0»`}</p>
          <p className="text-body text-ink-soft">Cette ligne ne sera plus suivie dans les prochaines mises à jour.</p>
          <Button
            variant="secondary"
            onClick={() => {
              const id = closingId
              setClosingId(null)
              void change((d) => closeLine(d, id))
            }}
          >
            Oui, la fermer
          </Button>
          <Button variant="secondary" onClick={() => setClosingId(null)}>
            Garder la ligne
          </Button>
        </div>
      ) : choosing ? (
        <div className="mt-4 flex flex-col border-t border-hairline pt-4">
          <h2 className="text-subtitle font-semibold text-ink">Quelle ligne est fermée ou vendue ?</h2>
          <ul className="mt-1 flex flex-col divide-y divide-hairline">
            {openLines.map((r) => (
              <li key={r.line.id}>
                <button
                  type="button"
                  className={CHOICE}
                  onClick={() => {
                    setChoosing(false)
                    setClosingId(r.line.id)
                  }}
                >
                  {r.line.name}
                  <span aria-hidden="true" className="text-ink-muted">›</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className={`${TEXT_LINK} text-ink-soft`} onClick={() => setChoosing(false)}>
            Annuler
          </button>
        </div>
      ) : openLines.length > 0 ? (
        <button type="button" className={`${TEXT_LINK} mt-2 text-ink-soft`} onClick={() => setChoosing(true)}>
          Une ligne fermée ou vendue ?
        </button>
      ) : null}

      <div className="mt-6 flex flex-col gap-3">
        {/* One main exit: until something is touched here it says what it does, « Rien n’a changé ici ». */}
        {untouched ? (
          <Button disabled={busy} onClick={() => moveOn((d) => nothingChangedHere(profile, d, here))}>
            Rien n’a changé ici
          </Button>
        ) : (
          <Button disabled={busy} onClick={() => moveOn((d) => markStep(d, here, 'done'))}>
            {next ? `Suivant\u00A0: ${next.name}` : 'Voir le résultat'}
          </Button>
        )}
        <button
          type="button"
          className={`${TEXT_LINK} self-center text-ink-soft`}
          disabled={busy}
          onClick={() => moveOn((d) => markStep(d, here, 'skipped'))}
        >
          Passer pour cette fois
        </button>
        {/* Only where the main exit is available (no line without a value) and another bank follows. */}
        {next && !unknown ? (
          <button
            type="button"
            className={`${TEXT_LINK} self-center text-center text-ink-soft`}
            disabled={busy}
            onClick={() =>
              moveOn(
                (d) =>
                  skipTheRest(profile, untouched ? nothingChangedHere(profile, d, here) : markStep(d, here, 'done'), here),
                true,
              )
            }
          >
            {untouched ? FINISH_UNTOUCHED : FINISH_TOUCHED}
          </button>
        ) : null}
        {/* Said again by the actions it is about, without a second announcement. */}
        {saveError !== null ? <p className="text-body leading-relaxed text-ink">{saveError}</p> : null}
      </div>
    </div>
  )
}
