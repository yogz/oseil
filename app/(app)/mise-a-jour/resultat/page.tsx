'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { SnapshotReplay } from '@/components/evolution/SnapshotSteps'
import { ChangeSplit } from '@/components/update/ChangeSplit'
import { useUpdateScreen } from '@/components/update/UpdateProvider'
import { WayOut } from '@/components/update/WayOut'
import { FOCUS, BACK, TEXT_LINK } from '@/components/setup/styles'
import { FILL } from '@/components/money/HundredSquares'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { VaultWait, WaitCover } from '@/components/ui/VaultWait'
import { updateEcho } from '@/lib/app/arrival'
import { todayIso } from '@/lib/dates'
import { setTakenOn } from '@/lib/update/draft'
import { takenOnError } from '@/lib/update/build'
import { resultView } from '@/lib/update/result'
import { resultSquareSentence } from '@/lib/screens/words'
import type { UpdateSession } from '@/lib/update/use-update'

// The result of the update, drawn from the draft: the only screen where figures come from
// one. Any state other than ready is said on the start screen, where this one sends back.
// It counts the prices and rates the update read when it opened, which the save uses too.
export default function ResultPage() {
  const router = useRouter()
  const { state } = useUpdateScreen()
  const away = state.status !== 'loading' && state.status !== 'ready'

  useEffect(() => {
    if (away) router.replace('/mise-a-jour')
  }, [away, router])

  if (state.status === 'loading') return <WayOut><VaultWait phase="open" /></WayOut>
  if (state.status !== 'ready') return null
  return <Result session={state.session} />
}

function Result({ session }: { session: UpdateSession }) {
  const router = useRouter()
  const { show } = useUpdateScreen()
  const today = todayIso()
  const view = useMemo(
    () => resultView(session.profile, session.base.value, session.draft, today, session.market),
    [session.profile, session.base.value, session.draft, today, session.market],
  )
  const [changing, setChanging] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [dateError, setDateError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Back on the left, « Fermer » on the right, as on every screen of the update.
  const back = (
    <div className="flex items-center justify-between">
      <button type="button" onClick={() => router.push('/mise-a-jour')} className={BACK}>
        ‹ Revenir corriger
      </button>
      <Link href="/" className={BACK}>
        Fermer
      </Link>
    </div>
  )

  // A rate missing: no figure, and no « Enregistrer » (the save refuses on its own too), but
  // « Réessayer », which asks the market again. A figure that cannot be computed has no retry:
  // no rate of today would mend it.
  if (view.kind === 'error' || view.kind === 'missing-rate') {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <p role="alert" className="text-body leading-relaxed text-ink">
          {view.kind === 'error' ? 'Un de tes chiffres n’a pas pu être calculé.' : view.sentence}
        </p>
        {view.kind === 'missing-rate' && (
          <Button variant="secondary" onClick={session.retryMarket}>
            Réessayer
          </Button>
        )}
      </div>
    )
  }

  function pickDate(value: string) {
    setPicked(value)
    const error = takenOnError(session.base.value, value, today)
    setDateError(error)
    if (error !== null) return
    // Saved or not, the field goes back to what the draft holds; a failure shows its error below.
    void session.change((draft) => setTakenOn(draft, value)).then(() => setPicked(null))
  }

  async function register() {
    setBusy(true)
    const ok = await session.save(today)
    if (ok) {
      // Mon argent shows where the update landed, once (lib/app/arrival.ts): in this tab's memory only.
      updateEcho.ask()
      router.replace('/')
      return
    }
    setBusy(false)
  }

  function goTo(establishmentId: string) {
    show(establishmentId)
    router.push('/mise-a-jour/banque')
  }

  const blocked = view.missing.length > 0
  return (
    // « Fermer » stays out of the cover: the update always has a way out, while it saves too.
    <div className="flex flex-col gap-5">
      {back}
      <WaitCover active={busy} phase="lock">
        <div className="flex flex-col gap-2">
          <p className="text-body text-ink-soft">C’est à jour. Ce qui est vraiment à toi&nbsp;:</p>
          <p className="text-hero font-semibold leading-none hero-figure tabular-nums text-ink">{view.net}</p>
          <p className="text-body text-ink-soft">{view.since}</p>
        </div>

        {/* C2: the grid of the snapshot before, then the new one, before the figures that explain it. */}
        {view.replay ? (
          <SnapshotReplay
            before={view.replay.before}
            after={view.replay.after}
            beforeHome={view.replay.beforeHome}
            afterHome={view.replay.afterHome}
            beforeDay={view.replay.beforeDay}
            afterDay={view.replay.afterDay}
          />
        ) : null}

        {view.square ? (
          <p className="text-body text-ink">
            {resultSquareSentence(view.square.value, view.square.then, view.square.day)}
          </p>
        ) : (
          view.noGridSentence && <p className="text-body leading-relaxed text-ink-soft">{view.noGridSentence}</p>
        )}

        <ChangeSplit split={view.split} />
        {view.rateNote && <p className="text-caption leading-relaxed text-ink-muted">{view.rateNote}</p>}

        <section className="flex flex-col gap-1" aria-labelledby="moved">
          <h2 id="moved" className="text-body font-semibold text-ink">
            Ce qui a changé
          </h2>
          <ul className="flex flex-col">
            {view.changes.map((c) => (
              <li key={c.category} className="flex items-center gap-3 border-b border-hairline py-3">
                <span aria-hidden="true" className={`size-3 shrink-0 rounded-square ${FILL[c.category]}`} />
                <span className="min-w-0 flex-1 truncate text-body text-ink">{c.name}</span>
                <span className="text-body tabular-nums text-ink">{c.amount}</span>
              </li>
            ))}
          </ul>
          {view.loans && <p className="py-2 text-body text-ink">{view.loans}</p>}
          {view.unchanged && <p className="text-caption leading-relaxed text-ink-muted">{view.unchanged}</p>}
        </section>

        {view.notReviewed && <p className="text-body leading-relaxed text-ink-soft">{view.notReviewed}</p>}
        {view.notes.map((note) => (
          <p key={note} className="text-caption leading-relaxed text-ink-muted">
            {note}
          </p>
        ))}

        {blocked && (
          <ul className="flex flex-col">
            {view.missing.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => goTo(m.establishmentId)}
                  className={`${TEXT_LINK} text-left`}
                >
                  Montant à saisir&nbsp;: {m.name} ({m.establishment})
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-body text-ink-soft">
            <span>{view.date.label}</span>
            <span aria-hidden="true">·</span>
            {!changing && (
              <button type="button" onClick={() => setChanging(true)} className={`${TEXT_LINK} ${FOCUS}`}>
                changer
              </button>
            )}
          </p>
          {changing && (
            <TextField
              label="Date du relevé"
              type="date"
              min={view.date.min}
              max={view.date.max}
              value={picked ?? view.date.value}
              onChange={(e) => pickDate(e.target.value)}
              error={dateError ?? undefined}
            />
          )}
        </div>

        <div className="flex flex-col gap-3">
          {blocked && (
            <p id="missing-amount" className="text-body leading-relaxed text-ink">
              Il manque un montant avant d’enregistrer.
            </p>
          )}
          <Button
            disabled={blocked || busy || dateError !== null}
            aria-describedby={blocked ? 'missing-amount' : undefined}
            onClick={register}
          >
            Enregistrer
          </Button>
          {session.saveError && (
            <p role="alert" className="text-body leading-relaxed text-ink">
              {session.saveError}
            </p>
          )}
        </div>
      </WaitCover>
    </div>
  )
}
