'use client'

import { useState } from 'react'
import { TEXT_LINK } from '@/components/setup/styles'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import type { AccountTypeId, CurrencyCode } from '@/lib/model/types'
import { fitsAccount, symbolsToTry } from '@/lib/market/crypto'
import { requestQuotes, requestRates, requestSearch } from '@/lib/market/client'
import { todayIso } from '@/lib/dates'
import { isCurrent, priceIn } from '@/lib/market/live'
import type { Quote, SecurityMatch } from '@/lib/market/types'
import {
  NOT_FOUND,
  NOTHING_FOUND,
  NOTHING_FOUND_CRYPTO,
  SEARCH_BUTTON,
  SEARCH_FAILED,
  SEARCH_LABEL,
  SEARCH_LABEL_CRYPTO,
  SEARCH_NOTHING_SENT,
} from '@/lib/market/words'

// `price` is in the asked currency; `quote` is the raw quote (its own currency), for a later currency change.
export type SecurityPick = { symbol: string; name: string; exchange: string; price: number | null; quote: Quote | null }

// Searches a share or a fund by name or ISIN. The box opens empty, or (« Le retrouver », a line
// that holds a share or a fund) with the line's name already in it, editable. Either way nothing
// goes to the site until « Chercher » is pressed, and what goes is exactly what is in the box.
// `price` is in `currency`. A crypto account shows the coins found, any other account the rest
// (crypto.ts): the sorting is done here, nothing more is sent.
export function SecuritySearch({
  accountType,
  currency,
  initialText = '',
  onPick,
  onClose,
}: {
  accountType: AccountTypeId
  currency: CurrencyCode
  initialText?: string
  onPick: (pick: SecurityPick) => void
  onClose: () => void
}) {
  const [text, setText] = useState(initialText)
  const [results, setResults] = useState<SecurityMatch[] | 'failed' | null>(null)
  const [busy, setBusy] = useState(false)
  const coins = accountType === 'crypto'

  async function search() {
    const query = text.trim()
    if (busy || query.length < 2) return
    setBusy(true)
    const found = await requestSearch(query)
    setResults(found ? found.filter((m) => fitsAccount(m, accountType)) : 'failed')
    setBusy(false)
  }

  async function pick(match: SecurityMatch) {
    if (busy) return
    setBusy(true)
    // A coin found in dollars asks for its pair in the line's currency first (crypto.ts).
    const symbols = symbolsToTry(match, currency)
    const quotes = await requestQuotes(symbols)
    const symbol = symbols.find((s) => quotes?.[s]) ?? match.symbol
    const quote = quotes?.[symbol] ?? null
    let price: number | null = null
    // A quote older than a week is no price for today (the rule of the update and of Mon argent).
    if (quote && isCurrent(quote, todayIso())) {
      const rates = quote.currency === currency ? null : await requestRates()
      price = priceIn(quote, currency, rates)
    }
    setBusy(false)
    onPick({ symbol, name: match.name, exchange: match.exchange, price, quote })
  }

  return (
    <div className="flex flex-col gap-3">
      <TextField
        label={coins ? SEARCH_LABEL_CRYPTO : SEARCH_LABEL}
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        // Inside a form: Enter searches, it does not submit the line.
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void search()
          }
        }}
        autoComplete="off"
      />
      <Button variant="secondary" disabled={busy} onClick={() => void search()}>
        {SEARCH_BUTTON}
      </Button>
      {initialText !== '' ? <p className="text-caption leading-normal text-ink-muted">{SEARCH_NOTHING_SENT}</p> : null}
      {results === 'failed' ? <p role="status" className="text-body leading-relaxed text-ink">{SEARCH_FAILED}</p> : null}
      {Array.isArray(results) && results.length === 0 ? (
        <p role="status" className="text-body leading-relaxed text-ink">{coins ? NOTHING_FOUND_CRYPTO : NOTHING_FOUND}</p>
      ) : null}
      {Array.isArray(results) && results.length > 0 ? (
        <>
        <p role="status" className="sr-only">{results.length === 1 ? '1 résultat' : `${results.length} résultats`}</p>
        <ul aria-label="Résultats de la recherche" className="flex flex-col">
          {results.map((match) => (
            <li key={match.symbol}>
              <button
                type="button"
                disabled={busy}
                className="flex min-h-11 w-full flex-col items-start justify-center border-b border-hairline py-2 text-left text-body text-ink"
                onClick={() => void pick(match)}
              >
                <span>{match.name}</span>
                <span className="text-caption text-ink-muted">{match.exchange === '' ? match.kind : `${match.exchange} · ${match.kind}`}</span>
              </button>
            </li>
          ))}
        </ul>
        </>
      ) : null}
      <button type="button" className={TEXT_LINK} onClick={onClose}>
        {NOT_FOUND}
      </button>
    </div>
  )
}
