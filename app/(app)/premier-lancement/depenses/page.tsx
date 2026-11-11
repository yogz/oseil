'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Alert, Blocked, LoadFailed } from '@/components/setup/Notices'
import { BACK, CHIP } from '@/components/setup/styles'
import { useSubmit } from '@/components/setup/useSubmit'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { VaultWait } from '@/components/ui/VaultWait'
import { useModel } from '@/lib/app/use-model'
import { formatEuros } from '@/lib/format'
import { DEFAULT_SETTINGS } from '@/lib/model/documents'
import { saveSettings } from '@/lib/model/repository'
import type { Loaded } from '@/lib/model/repository'
import type { Budget, Settings } from '@/lib/model/types'
import { parseEuros } from '@/lib/parse'
import { euroText, tidyEuros } from '@/lib/setup/step-changes'

const SAVE_FAILED = 'Ça n’a pas été enregistré. Vérifie ta connexion et réessaie.'
const SETTINGS_UNREADABLE = 'Tes réglages n’ont pas pu être lus\u00A0: ce choix ne peut pas être enregistré pour l’instant.'
const AMOUNTS = [150_000, 200_000, 250_000, 300_000, 350_000]
const LINK_BUTTON =
  'inline-flex min-h-11 items-center self-start text-body text-ink underline decoration-rule-strong underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

export default function DepensesPage() {
  const state = useModel()
  const router = useRouter()
  // Opened from the Réglages: back and « Plus tard » lead there, not to the goals or to Mon argent.
  const fromSettings = useSearchParams().get('depuis') === 'reglages'
  if (state.status === 'loading') return <VaultWait phase="open" />
  if (state.status !== 'ready') return <LoadFailed retry={state.retry} />
  const { model } = state

  const later = () => router.push(fromSettings ? '/reglages' : '/')

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between">
        <Link href={fromSettings ? '/reglages' : '/premier-lancement/objectifs'} className={BACK}>
          ‹ Retour
        </Link>
        <button type="button" className={`${BACK} self-auto`} onClick={later}>
          {fromSettings ? 'Annuler' : 'Plus tard'}
        </button>
      </div>
      <h1 className="pt-2 text-title font-semibold leading-tight tracking-[-0.01em]">
        Combien dépenses-tu par mois, à peu près&nbsp;?
      </h1>
      <p className="mt-2 text-body leading-relaxed text-ink-soft">
        Pour savoir combien de mois ton argent disponible te couvrirait si tes revenus s’arrêtaient.
      </p>
      {model.unreadable.settings > 0 ? (
        <div className="mt-6">
          <Blocked message={SETTINGS_UNREADABLE} retry={state.reload} />
        </div>
      ) : (
        <Form
          settings={model.settings}
          // From the settings, the form starts from the budget saved there.
          start={fromSettings ? (model.settings?.value.budget ?? null) : null}
          save={(settings, id) => saveSettings(state.client, state.dataKey, settings, id)}
          done={later}
        />
      )}
    </div>
  )
}

function Form({
  settings,
  start,
  save,
  done,
}: {
  settings: Loaded<Settings> | null
  start: Budget | null
  save: (settings: Settings, id?: string) => Promise<unknown>
  done: () => void
}) {
  const [basis, setBasis] = useState<Budget['basis']>(start?.basis ?? 'expenses')
  const [text, setText] = useState(start ? euroText(start.monthly) : '')
  const [error, setError] = useState<string | undefined>()
  const [saveError, setSaveError] = useState<string | null>(null)
  const { busy, run } = useSubmit()
  const expenses = basis === 'expenses'

  function switchTo(next: Budget['basis']) {
    setBasis(next)
    setText('')
    setError(undefined)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const monthly = parseEuros(text)
    if (monthly === null) return setError('Ce montant n’est pas lisible.')
    if (monthly <= 0) return setError('Ce montant doit être supérieur à zéro.')
    setError(undefined)
    void run(async () => {
      try {
        await save({ ...(settings?.value ?? DEFAULT_SETTINGS), budget: { basis, monthly } }, settings?.id)
      } catch (failure) {
        console.error(failure)
        setSaveError(SAVE_FAILED)
        return false
      }
      done()
      return true
    })
  }

  return (
    <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-4">
      <TextField
        label={expenses ? 'Tes dépenses par mois' : 'Tes revenus nets par mois'}
        type="text"
        inputMode="decimal"
        value={text}
        error={error}
        hint={
          expenses
            ? 'Un ordre d’idée suffit. Loyer ou crédit, courses, factures, transports.'
            : 'Il est sur ta fiche de paie. Si tu dépenses moins que tu gagnes, le calcul sera un peu prudent, ce qui est mieux que l’inverse.'
        }
        onChange={(event) => {
          setText(event.target.value)
          setError(undefined)
        }}
        onBlur={() => setText(tidyEuros)}
        autoComplete="off"
      />
      {expenses ? (
        <ul className="flex flex-wrap gap-2">
          {AMOUNTS.map((cents) => (
            <li key={cents}>
              <button
                type="button"
                className={CHIP}
                onClick={() => {
                  setText(euroText(cents))
                  setError(undefined)
                }}
              >
                {formatEuros(cents)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <button type="button" className={LINK_BUTTON} onClick={() => switchTo(expenses ? 'salary' : 'expenses')}>
        {expenses ? 'Je ne connais pas mes dépenses' : 'Je connais mes dépenses'}
      </button>
      <div className="mt-2 flex flex-col gap-3">
        <Button type="submit" disabled={busy}>
          Terminer
        </Button>
        {saveError ? <Alert>{saveError}</Alert> : null}
      </div>
    </form>
  )
}
