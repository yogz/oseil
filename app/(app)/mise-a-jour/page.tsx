'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AddBank } from '@/components/settings/AddBank'
import { Blocked, LoadFailed } from '@/components/setup/Notices'
import { BACK, FOCUS, TEXT_LINK } from '@/components/setup/styles'
import { Button } from '@/components/ui/Button'
import { StepsBar } from '@/components/update/StepsBar'
import { useUpdateScreen } from '@/components/update/UpdateProvider'
import { WayOut } from '@/components/update/WayOut'
import { VaultWait } from '@/components/ui/VaultWait'
import { BANK_ALREADY, BANK_HOME_ALREADY } from '@/lib/screens/settings-words'
import { hasHome } from '@/lib/settings/banks'
import { addEstablishment } from '@/lib/update/draft'
import { startView } from '@/lib/update/start'
import { SAVE_FAILED } from '@/lib/setup/use-first-launch'
import type { UpdateDraft } from '@/lib/model/types'
import type { UpdateSession } from '@/lib/update/use-update'

const STATE = { todo: 'à faire', current: 'en cours', done: 'fait', skipped: 'pas cette fois' } as const
const RESULT = '/mise-a-jour/resultat'
const MAIN_LINK =
  `inline-flex min-h-13 w-full items-center justify-center rounded-full bg-ink px-6 text-body font-semibold text-ground ${FOCUS}`

export default function StartPage() {
  const { state } = useUpdateScreen()
  if (state.status === 'blocked') return <WayOut><Blocked message={state.message} retry={state.retry} /></WayOut>
  if (state.status === 'failed') return <WayOut><LoadFailed retry={state.retry} /></WayOut>
  if (state.status === 'unreadable') return <WayOut><Restart message={state.message} restart={state.restart} /></WayOut>
  if (state.status === 'conflict') {
    return <WayOut><Blocked message={state.message} retry={state.reload} label="Recharger" /></WayOut>
  }
  if (state.status === 'loading') return <WayOut><VaultWait phase="open" /></WayOut>
  if (state.status !== 'ready') return null
  return <Start session={state.session} />
}

function Start({ session }: { session: UpdateSession }) {
  const router = useRouter()
  const { show } = useUpdateScreen()
  const { rows, done, next } = startView(session.profile, session.draft)
  const started = rows.some((r) => r.status !== 'todo')

  function open(id: string) {
    show(id)
    router.push('/mise-a-jour/banque')
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Nothing to go back to here, so « Fermer » is on the right, where it is on every screen of the update. */}
      <div className="flex items-center justify-between text-body text-ink-soft">
        <span>
          {done} sur {rows.length}
        </span>
        <Link href="/" className={BACK}>
          Fermer
        </Link>
      </div>
      <h1 className="text-title font-semibold leading-tight tracking-[-0.01em]">Mettre à jour tes chiffres</h1>
      <p className="text-body leading-relaxed text-ink-soft">
        Ouvre tes applications bancaires une par une. Pour chaque banque, tu recopies ce qui a changé. Ça prend
        une dizaine de minutes.
      </p>
      <StepsBar statuses={rows.map((r) => r.status)} />
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li key={row.id} className="border-b border-hairline">
            <button
              type="button"
              onClick={() => open(row.id)}
              className={`flex min-h-11 w-full flex-col gap-1 py-3 text-left ${FOCUS}`}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-body font-semibold text-ink">{row.name}</span>
                <span className="text-caption text-ink-soft">{STATE[row.status]}</span>
              </span>
              <span className="text-caption text-ink-muted">{row.detail}</span>
            </button>
          </li>
        ))}
      </ul>
      <AddEstablishment session={session} onAdded={open} />
      {next ? (
        <Button onClick={() => open(next.id)}>
          {session.saved && started ? `Reprendre avec ${next.name}` : `Commencer par ${next.name}`}
        </Button>
      ) : (
        <Link href={RESULT} className={MAIN_LINK}>
          Voir le résultat
        </Link>
      )}
      {next && rows.some((r) => r.status === 'done') && (
        <Link href={RESULT} className={`${TEXT_LINK} self-center`}>
          Voir le résultat maintenant
        </Link>
      )}
      <p className="text-center text-caption text-ink-muted">Tu peux t’arrêter quand tu veux, rien n’est perdu.</p>
      {session.saved && <Abandon abandon={session.abandon} />}
    </div>
  )
}

// A bank (Coinbase, a new bank…) or « Chez toi » added during the update, with the search of the
// settings, which refuse it while an update runs. It lives in the draft until the save, like an
// added account, and opens at once: what brought the person here is what goes in it.
function AddEstablishment({ session, onAdded }: { session: UpdateSession; onAdded: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)

  async function add(what: Parameters<typeof addEstablishment>[2], refusal: string) {
    setSaid(null)
    const id = crypto.randomUUID()
    const make = (draft: UpdateDraft) => addEstablishment(session.profile, draft, what, () => id)
    // Refused before anything is written: the bank is already in the list.
    try {
      make(session.draft)
    } catch {
      setSaid(refusal)
      return
    }
    setBusy(true)
    const saved = await session.change(make)
    setBusy(false)
    if (!saved) {
      setSaid(SAVE_FAILED)
      return
    }
    setOpen(false)
    onAdded(id)
  }

  return (
    <div className="flex flex-col gap-2">
      <AddBank
        open={open}
        setOpen={(next) => {
          setSaid(null)
          setOpen(next)
        }}
        busy={busy}
        onPick={(bank) => void add(bank, BANK_ALREADY)}
        onPickHome={hasHome(session.profile) ? undefined : () => void add('home', BANK_HOME_ALREADY)}
      />
      {said && (
        <p role="alert" className="text-body leading-relaxed text-ink">
          {said}
        </p>
      )}
    </div>
  )
}

// Erasing the draft asks first; the saved figures never change.
function Abandon({ abandon }: { abandon: () => Promise<boolean> }) {
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function confirm() {
    setBusy(true)
    setFailed(false)
    const ok = await abandon()
    if (ok) {
      router.replace('/')
      return
    }
    setBusy(false)
    setFailed(true)
  }

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={`${TEXT_LINK} self-center text-ink-soft`}>
        Abandonner cette mise à jour
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body leading-relaxed text-ink">
        Ce que tu as saisi pour cette mise à jour sera effacé. Tes chiffres enregistrés ne changent pas.
      </p>
      {failed && (
        <p role="alert" className="text-body leading-relaxed text-ink">
          {SAVE_FAILED}
        </p>
      )}
      <Button disabled={busy} onClick={confirm}>
        Abandonner
      </Button>
      <Button variant="secondary" disabled={busy} onClick={() => setAsking(false)}>
        Garder
      </Button>
    </div>
  )
}

// The draft cannot be read and its id is lost: erasing it is the only way on, so it asks first.
function Restart({ message, restart }: { message: string; restart: () => Promise<boolean> }) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function confirm() {
    setBusy(true)
    setFailed(false)
    const ok = await restart()
    if (!ok) {
      setBusy(false)
      setFailed(true)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p role="alert" className="text-body leading-relaxed text-ink">
        {message}
      </p>
      {asking && (
        <p className="text-body leading-relaxed text-ink">
          Ta mise à jour en cours sera effacée. Tes chiffres enregistrés ne changent pas.
        </p>
      )}
      {failed && (
        <p role="alert" className="text-body leading-relaxed text-ink">
          {SAVE_FAILED}
        </p>
      )}
      {asking ? (
        <>
          <Button disabled={busy} onClick={confirm}>
            Effacer et recommencer
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => setAsking(false)}>
            Annuler
          </Button>
        </>
      ) : (
        <Button variant="secondary" onClick={() => setAsking(true)}>
          Recommencer
        </Button>
      )}
    </div>
  )
}
