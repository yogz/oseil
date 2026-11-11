'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Blocked, LoadFailed } from '@/components/setup/Notices'
import { SignOutFrame } from '@/components/account/SignOutFrame'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { TEXT_LINK } from '@/components/setup/styles'
import { VaultWait, WaitCover } from '@/components/ui/VaultWait'
import { BANKS, OUTSIDE_BANKS, searchBanks } from '@/lib/catalog'
import { todayIso } from '@/lib/dates'
import type { Establishment } from '@/lib/model/types'
import { chooseWhere, launchComplete, type SetupDraft } from '@/lib/setup/first-launch'
import { UNREADABLE, useFirstLaunch } from '@/lib/setup/use-first-launch'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const BACK = `inline-flex min-h-11 items-center self-start text-body text-ink-soft ${FOCUS}`
const CHIP =
  `inline-flex min-h-11 items-center rounded-full border px-4 text-body ${FOCUS} ` +
  'aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:font-semibold aria-pressed:text-ground ' +
  'border-rule-strong text-ink'

type Bank = { catalogId?: string; name: string }

const sameBank = (a: Bank, b: Bank) =>
  a.catalogId !== undefined || b.catalogId !== undefined ? a.catalogId === b.catalogId : a.name === b.name

// What the draft already holds, so coming back shows the choices made.
function fromDraft(draft: SetupDraft | null): { banks: Bank[]; outside: string[] } {
  if (!draft) return { banks: [], outside: [] }
  const banks = draft.profile.establishments
    .filter((e: Establishment) => e.kind === 'institution' && e.catalogId !== 'employee-savings')
    .map((e) => ({ ...(e.catalogId !== undefined ? { catalogId: e.catalogId } : {}), name: e.name }))
  // A lot 3 draft may plan « loan », which is no longer offered: it would be refused on « Suivant ».
  const offered = new Set(OUTSIDE_BANKS.map((b) => b.id))
  return { banks, outside: (draft.profile.firstLaunch?.planned ?? []).filter((id) => offered.has(id)) }
}

// The Réglages cannot be reached from here and nothing may be saved yet: the way out is « Se déconnecter ».
export default function WherePage() {
  return (
    <SignOutFrame>
      <Where />
    </SignOutFrame>
  )
}

function Where() {
  const first = useFirstLaunch()
  const router = useRouter()
  // Past the first launch, the choice of banks is no longer the way to change them.
  const past = first.status === 'ready' && launchComplete(first.draft?.profile ?? null)
  useEffect(() => {
    if (past) router.replace('/')
  }, [past, router])
  // Lifted here so « Plus tard » cannot leave while « Suivant » is saving.
  const [saving, setSaving] = useState(false)
  const saved = first.status === 'ready' && (first.draft?.profile.establishments.length ?? 0) > 0

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between">
        <Link href="/premier-lancement" className={BACK}>
          ‹ Retour
        </Link>
        {/* Nothing saved yet: Mon argent would send the person straight back to the welcome. */}
        {saved ? (
          <button type="button" disabled={saving} className={`${BACK} self-auto disabled:opacity-50`} onClick={() => router.push('/')}>
            Plus tard
          </button>
        ) : null}
      </div>
      <h1 className="pt-2 text-title font-semibold leading-tight tracking-[-0.01em]">Où est ton argent&nbsp;?</h1>

      {first.status === 'blocked' ? (
        <div className="mt-4">
          <Blocked message={UNREADABLE} retry={first.retry} />
        </div>
      ) : null}

      {first.status === 'failed' ? (
        <div className="mt-4">
          <LoadFailed retry={first.retry} />
        </div>
      ) : null}

      {first.status === 'loading' ? <VaultWait phase="open" /> : null}
      {first.status === 'ready' && !past ? (
        <Chooser
          draft={first.draft}
          apply={first.apply}
          saveError={first.saveError}
          saving={saving}
          setSaving={setSaving}
        />
      ) : null}
    </div>
  )
}

function Chooser({
  draft,
  apply,
  saveError,
  saving,
  setSaving,
}: {
  saving: boolean
  setSaving: (saving: boolean) => void
  draft: SetupDraft | null
  apply: (change: (draft: SetupDraft | null) => SetupDraft) => Promise<boolean>
  saveError: string | null
}) {
  const router = useRouter()
  const [initial] = useState(() => fromDraft(draft))
  const [banks, setBanks] = useState<Bank[]>(initial.banks)
  const [outside, setOutside] = useState<string[]>(initial.outside)
  const [query, setQuery] = useState('')
  // Under the chips: nothing, the search (« Ta banque n’y est pas ? »), or the form to type one in.
  const [mode, setMode] = useState<'none' | 'search' | 'add'>('none')
  const [typed, setTyped] = useState('')
  const [typedError, setTypedError] = useState<string | undefined>()

  const isChosen = (bank: Bank) => banks.some((b) => sameBank(b, bank))
  const toggleBank = (bank: Bank) =>
    setBanks((now) => (now.some((b) => sameBank(b, bank)) ? now.filter((b) => !sameBank(b, bank)) : [...now, bank]))
  const toggleOutside = (id: string) =>
    setOutside((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]))

  // The banks the chips already show are not offered a second time.
  const found = searchBanks(query).filter(
    (b) => !isChosen({ catalogId: b.id, name: b.name }) && !BANKS.some((k) => k.id === b.id),
  )
  // Chosen banks the twelve chips do not show: found by the search or typed in.
  const extras = banks.filter((b) => b.catalogId === undefined || !BANKS.some((k) => k.id === b.catalogId))

  function addTyped() {
    const name = typed.trim()
    if (name === '') return
    const duplicate =
      banks.some((b) => b.name.toLowerCase() === name.toLowerCase()) ||
      BANKS.some((b) => b.name.toLowerCase() === name.toLowerCase())
    if (duplicate) {
      setTypedError('Cette banque est déjà dans la liste.')
      return
    }
    setBanks((now) => [...now, { name }])
    setTyped('')
    setTypedError(undefined)
    setMode('none')
  }

  async function next() {
    setSaving(true)
    const ok = await apply((d) => chooseWhere(d, { banks, outside }, todayIso()))
    // Saved: the wait stays until the next step, so the picker never flashes back in between.
    if (ok) router.push('/premier-lancement/etape')
    else setSaving(false)
  }

  return (
    <WaitCover active={saving} phase="lock">
        <p className="mt-2 text-body leading-relaxed text-ink-soft">
          Touche tes banques. Tu pourras en ajouter d’autres plus tard.
        </p>

        <ul className="mt-5 flex flex-wrap gap-2">
          {BANKS.map((bank) => (
            <li key={bank.id}>
              <button
                type="button"
                aria-pressed={isChosen({ catalogId: bank.id, name: bank.name })}
                className={CHIP}
                onClick={() => toggleBank({ catalogId: bank.id, name: bank.name })}
              >
                {bank.name}
              </button>
            </li>
          ))}
          {extras.map((bank) => (
            <li key={bank.catalogId ?? `name:${bank.name}`}>
              <button type="button" aria-pressed="true" className={CHIP} onClick={() => toggleBank(bank)}>
                {bank.name}
              </button>
            </li>
          ))}
        </ul>

        {mode === 'add' ? (
          <div className="mt-4 flex flex-col gap-3">
            <TextField
              label="Le nom de ta banque"
              type="text"
              value={typed}
              error={typedError}
              onChange={(event) => {
                setTyped(event.target.value)
                setTypedError(undefined)
              }}
              autoComplete="off"
            />
            <Button variant="secondary" onClick={addTyped}>
              Ajouter
            </Button>
          </div>
        ) : mode === 'search' ? (
          <div className="mt-4 flex flex-col">
            <TextField
              label="Chercher une autre banque…"
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
              autoFocus
            />
            {found.length > 0 ? (
              <ul className="mt-2 flex flex-col divide-y divide-hairline">
                {found.map((bank) => (
                  <li key={bank.id}>
                    <button
                      type="button"
                      aria-pressed="false"
                      className={`flex min-h-11 w-full items-center py-3 text-left text-body text-ink ${FOCUS}`}
                      onClick={() => toggleBank({ catalogId: bank.id, name: bank.name })}
                    >
                      {bank.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <button type="button" className={`${TEXT_LINK} mt-2`} onClick={() => setMode('add')}>
              + Ajouter la mienne
            </button>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-x-5">
            <button type="button" className={TEXT_LINK} onClick={() => setMode('search')}>
              Ta banque n’y est pas ?
            </button>
            <button type="button" className={TEXT_LINK} onClick={() => setMode('add')}>
              + Ajouter la mienne
            </button>
          </div>
        )}

        <h2 className="mt-6 text-body font-medium text-ink">En dehors des banques</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {OUTSIDE_BANKS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={outside.includes(item.id)}
                className={CHIP}
                onClick={() => toggleOutside(item.id)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-caption leading-normal text-ink-muted">
          Ton crédit se saisit avec sa banque. L’or et la crypto achetés sur une plateforme (Coinbase, Binance…) se
          saisissent avec elle, comme une banque.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Button disabled={banks.length + outside.length === 0 || saving} onClick={next}>
            Suivant
          </Button>
          {saveError ? (
            <p role="alert" className="text-body leading-relaxed text-ink">
              {saveError}
            </p>
          ) : null}
        </div>
    </WaitCover>
  )
}
