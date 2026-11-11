'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { SecuritySearch, type SecurityPick } from '@/components/market/SecuritySearch'
import { TEXT_LINK } from '@/components/setup/styles'
import { Button } from '@/components/ui/Button'
import { PageColumns } from '@/components/ui/PageColumns'
import { TabBar } from '@/components/ui/TabBar'
import { useMenuFromModel } from '@/components/ui/use-menu-from-model'
import { VaultWait } from '@/components/ui/VaultWait'
import { useModel, type ModelState } from '@/lib/app/use-model'
import { formatPrice, formatPriceShown } from '@/lib/format'
import { todayIso } from '@/lib/dates'
import { isCurrent, priceIn } from '@/lib/market/live'
import { useMarket } from '@/lib/market/use-market'
import { isStale } from '@/lib/update/draft'
import { attachSymbol, detachSymbol, titlesBack, titleRows, type TitleRow } from '@/lib/screens/titles'
import { saveTitleChange, type TitlesSave } from '@/lib/screens/titles-save'
import {
  CONFIRM,
  CONFIRM_NO_LAST,
  FIND,
  FOLLOWING,
  NO,
  NO_PRICE_FOR_NOW,
  NOTHING_TO_FOLLOW,
  SAVE_FAILED,
  STOP,
  TITLES,
  TITLES_INTRO,
  TYPED,
  UNREADABLE_PROFILE,
  UPDATE_RUNNING,
  VERY_DIFFERENT,
  veryDifferent,
  YES,
} from '@/lib/screens/words'
import type { CurrencyCode, Snapshot } from '@/lib/model/types'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const BACK = `inline-flex min-h-11 items-center self-start text-body text-ink-soft ${FOCUS}`
const TITLE = 'pt-2 text-title font-semibold leading-tight tracking-[-0.01em]'
const SENTENCE = 'text-body leading-relaxed text-ink'

type Ready = Extract<ModelState, { status: 'ready' }>

export default function TitlesPage() {
  const state = useModel()
  useMenuFromModel(state)
  // Back to the screen it was opened from (Mon argent, a category, a line's fiche), by its name.
  const back = titlesBack(useSearchParams().get('depuis'), state.status === 'ready' ? (state.model.profile?.value ?? null) : null)
  return (
    <>
      <PageColumns
        aside={
          <>
            <Link href={back.href} className={BACK}>
              ‹ {back.label}
            </Link>
            <h1 className={TITLE}>{TITLES}</h1>
          </>
        }
      >
      {state.status === 'loading' ? <VaultWait phase="open" /> : null}
      {state.status === 'ready' ? <ReadyBody state={state} /> : null}
      {state.status === 'failed' || state.status === 'unavailable' ? (
        <div className="mt-4 flex flex-col gap-4">
          <p role="alert" className={SENTENCE}>
            Tes chiffres n’ont pas pu être chargés.
          </p>
          <Button variant="secondary" onClick={state.retry}>
            Réessayer
          </Button>
        </div>
      ) : null}
      </PageColumns>
      <TabBar current="mon-argent" />
    </>
  )
}

function lastUnitPrice(latest: Snapshot | undefined, lineId: string): number | null {
  const entry = latest?.entries.find((e) => e.lineId === lineId)
  return entry?.kind === 'units' ? entry.unitPrice : null
}

type Picked = { lineId: string; pick: SecurityPick }

function ReadyBody({ state }: { state: Ready }) {
  const { model, client, dataKey, reload } = state
  const profile = model.profile?.value ?? null
  const latest: Snapshot | undefined = model.snapshots[model.snapshots.length - 1]?.value
  const rows = profile ? titleRows(profile, latest) : []
  const symbols = rows.flatMap((row) => (row.symbol ? [row.symbol] : []))
  const market = useMarket(symbols, { rates: symbols.length > 0 })

  const [searching, setSearching] = useState<string | null>(null)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)

  if (profile === null) {
    return (
      <p role="alert" className={`mt-4 ${SENTENCE}`}>
        {UNREADABLE_PROFILE}
      </p>
    )
  }
  // An update in progress writes the profile at « Enregistrer »: nothing is attached meanwhile.
  const updateRunning =
    model.unreadable.draft > 0 ||
    (model.draft !== null && (latest === undefined || !isStale(model.draft.value, model.snapshots[model.snapshots.length - 1].id)))

  async function write(change: Parameters<typeof saveTitleChange>[2]) {
    setBusy(true)
    setSaid(null)
    let outcome: TitlesSave | 'failed'
    try {
      outcome = await saveTitleChange(client, dataKey, change)
    } catch {
      outcome = 'failed'
    }
    setBusy(false)
    if (outcome === 'saved') {
      setSearching(null)
      setPicked(null)
      reload()
    } else {
      setSaid(outcome === 'update-running' ? UPDATE_RUNNING : outcome === 'unreadable' ? UNREADABLE_PROFILE : SAVE_FAILED)
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-3">
      <p className="text-body leading-relaxed text-ink-soft">{TITLES_INTRO}</p>
      {updateRunning ? (
        <p role="status" className={SENTENCE}>
          {UPDATE_RUNNING}
        </p>
      ) : null}
      {said ? (
        <p role="alert" className={SENTENCE}>
          {said}
        </p>
      ) : null}
      {rows.length === 0 ? <p className={SENTENCE}>{NOTHING_TO_FOLLOW}</p> : null}
      <ul aria-label={TITLES} className="flex flex-col divide-y divide-hairline">
        {rows.map((row) => {
          const currency = profile.lines.find((l) => l.id === row.lineId)!.currency
          return (
            <li key={row.lineId} className="flex flex-col gap-2 py-3">
              <div>
                <p className="text-body text-ink">{row.name}</p>
                <p className="text-caption text-ink-muted">{row.where}</p>
              </div>
              <Following row={row} currency={currency} market={market} />
              {picked?.lineId === row.lineId ? (
                <Confirm
                  row={row}
                  pick={picked.pick}
                  lastValue={lastUnitPrice(latest, row.lineId)}
                  currency={currency}
                  busy={busy}
                  onYes={() => void write((p) => attachSymbol(p, row.lineId, picked.pick.symbol))}
                  onNo={() => {
                    setPicked(null)
                    setSaid(null)
                  }}
                />
              ) : searching === row.lineId ? (
                <SecuritySearch
                  accountType={row.accountType}
                  currency={currency}
                  initialText={row.searchText}
                  onPick={(pick) => {
                    setSearching(null)
                    setPicked({ lineId: row.lineId, pick })
                  }}
                  onClose={() => setSearching(null)}
                />
              ) : (
                <div className="flex flex-wrap gap-x-5">
                  <button
                    type="button"
                    className={TEXT_LINK}
                    disabled={updateRunning || busy}
                    aria-label={`${FIND}\u00A0: ${row.name}`}
                    onClick={() => {
                      setSaid(null)
                      setSearching(row.lineId)
                    }}
                  >
                    {FIND}
                  </button>
                  {row.symbol ? (
                    <button
                      type="button"
                      className={TEXT_LINK}
                      disabled={updateRunning || busy}
                      aria-label={`${STOP}\u00A0: ${row.name}`}
                      onClick={() => void write((p) => detachSymbol(p, row.lineId))}
                    >
                      {STOP}
                    </button>
                  ) : null}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// What the line follows now: its symbol and today's price, or the way the price is typed.
function Following({
  row,
  currency,
  market,
}: {
  row: TitleRow
  currency: CurrencyCode
  market: ReturnType<typeof useMarket>
}) {
  if (!row.symbol) return <p className="text-caption text-ink-soft">{TYPED}</p>
  let price: string | null = null
  if (market.status === 'ready') {
    const quote = market.market.quotes[row.symbol]
    const value = quote && isCurrent(quote, todayIso()) ? priceIn(quote, currency, market.market.rates) : null
    price = value === null ? null : formatPriceShown(value, currency)
  }
  return (
    <p className="text-caption text-ink-soft">
      {`${FOLLOWING} · ${row.symbol}`}
      {market.status === 'loading' ? ' · …' : price ? ` · ${price}` : ` · ${NO_PRICE_FOR_NOW}`}
    </p>
  )
}

function Confirm({
  row,
  pick,
  lastValue,
  currency,
  busy,
  onYes,
  onNo,
}: {
  row: TitleRow
  pick: SecurityPick
  lastValue: number | null
  currency: CurrencyCode
  busy: boolean
  onYes: () => void
  onNo: () => void
}) {
  const today = pick.price === null ? null : formatPrice(pick.price, currency)
  const last = row.lastPrice
  // Not blocking: the person may know better. It only says that the pick may be another listing.
  const apart = pick.price !== null && lastValue !== null && veryDifferent(pick.price, lastValue)
  return (
    <div className="flex flex-col gap-3">
      <div role="status" className="flex flex-col gap-3">
        <p className={SENTENCE}>
          {pick.exchange === '' ? pick.name : `${pick.name}, ${pick.exchange}`}
        </p>
        <p className={SENTENCE}>
          {today === null ? NO_PRICE_FOR_NOW : last === null ? CONFIRM_NO_LAST(today) : CONFIRM(today, last)}
        </p>
        {apart ? <p className={SENTENCE}>{VERY_DIFFERENT}</p> : null}
      </div>
      <div className="flex flex-wrap gap-x-5">
        <button type="button" className={TEXT_LINK} disabled={busy} onClick={onYes}>
          {YES}
        </button>
        <button type="button" className={TEXT_LINK} disabled={busy} onClick={onNo}>
          {NO}
        </button>
      </div>
    </div>
  )
}
