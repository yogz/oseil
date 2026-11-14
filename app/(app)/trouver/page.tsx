'use client'

// « Trouver » (docs/superpowers/specs/2026-11-14-trouver-design.md, planche 9F): a page of its own, so
// that the phone's back gesture and Échap return to the screen before. What is typed stays in this
// page's state: never in the address, never in storage, never sent. The prices are asked once, when the
// page opens, with the symbols Mon argent asks; typing changes nothing of what is asked.

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { FindResults } from '@/components/find/FindResults'
import { FOCUS } from '@/components/setup/styles'
import { Button } from '@/components/ui/Button'
import { VaultWait } from '@/components/ui/VaultWait'
import { cameFromInside } from '@/lib/app/find-entry'
import { useModel } from '@/lib/app/use-model'
import { todayIso } from '@/lib/dates'
import { quotedSymbols } from '@/lib/market/live'
import { useMarket } from '@/lib/market/use-market'
import { findView } from '@/lib/screens/find'
import { monArgentView } from '@/lib/screens/mon-argent'
import { FIND_CLOSE, FIND_LABEL, FIND_LOAD_FAILED, FIND_RETRY } from '@/lib/screens/find-words'

export default function FindPage() {
  const state = useModel()
  const router = useRouter()
  const id = useId()
  const [query, setQuery] = useState('')
  const today = todayIso()

  const model = state.status === 'ready' ? state.model : null
  const latest = model ? model.snapshots[model.snapshots.length - 1] : undefined
  // Like Mon argent, only a board has prices to ask for: none while the first launch is unfinished.
  const symbols =
    model?.profile && latest && monArgentView(model, today).kind === 'board' ? quotedSymbols(model.profile.value, latest.value) : []
  const market = useMarket(symbols, { rates: symbols.length > 0 })
  // Like Mon argent: the amounts wait for the prices (8 s at most), then are those of Mon argent.
  const waiting = model !== null && market.status === 'loading'
  const prices = market.status === 'ready' ? market.market : null
  const view = useMemo(() => (model && prices ? findView(model, prices, query, today) : null), [model, prices, query, today])

  // Back to the screen before, when it was a screen of Oseil (the magnifier, ⌘K). Opened from its
  // address, the screen before may be another site, or none: Mon argent.
  const close = useCallback(() => {
    if (cameFromInside()) router.back()
    else router.replace('/')
  }, [router])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // While a word is being composed, Échap gives up the composition, not the page.
      if (event.key !== 'Escape' || event.isComposing) return
      event.preventDefault()
      close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <div className="flex flex-col">
      <h1 className="sr-only">{FIND_LABEL}</h1>
      <div className="flex items-center gap-3 pt-2">
        <label htmlFor={id} className="sr-only">
          {FIND_LABEL}
        </label>
        {/* No form and no name: nothing the browser could send by itself, nor put in the address. */}
        <input
          id={id}
          type="search"
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder={FIND_LABEL}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={
            'min-h-13 min-w-0 flex-1 rounded-control border border-hairline bg-field px-4 text-subtitle text-ink ' +
            'placeholder:text-ink-soft focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
          }
        />
        <button type="button" onClick={close} className={`inline-flex min-h-11 shrink-0 items-center text-body text-ink-soft ${FOCUS}`}>
          {FIND_CLOSE}
        </button>
      </div>
      {/* One wait at one place: the vault opening, then the prices. */}
      {state.status === 'loading' || waiting ? <VaultWait phase={waiting ? 'prices' : 'open'} /> : null}
      {view ? <FindResults key={query} view={view} /> : null}
      {state.status === 'failed' || state.status === 'unavailable' ? (
        <div className="mt-6 flex flex-col gap-4">
          <p role="alert" className="text-body leading-relaxed text-ink">
            {FIND_LOAD_FAILED}
          </p>
          <Button variant="secondary" onClick={state.retry}>
            {FIND_RETRY}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
