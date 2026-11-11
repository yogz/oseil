'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Fragment, useState } from 'react'
import { FILL } from '@/components/money/HundredSquares'
import { Alert, Blocked, LoadFailed } from '@/components/setup/Notices'
import { BACK, CHIP, FOCUS, TEXT_LINK } from '@/components/setup/styles'
import { useSubmit } from '@/components/setup/useSubmit'
import { Button } from '@/components/ui/Button'
import { VaultWait } from '@/components/ui/VaultWait'
import { useModel } from '@/lib/app/use-model'
import { CUSHION_PRESETS, GOAL_COLOR, GOAL_LABELS, GOAL_PRESETS } from '@/lib/catalog'
import { todayIso } from '@/lib/dates'
import { formatEuros, formatWholePercent } from '@/lib/format'
import { goalInEffect } from '@/lib/model/goals'
import { addGoal } from '@/lib/model/repository'
import { computeSituation, holdsRental } from '@/lib/model/situation'
import type { Budget, GoalCategory } from '@/lib/model/types'
import { buildGrid, type Grid } from '@/lib/model/squares'
import { noGridSentence } from '@/lib/screens/mon-argent'
import {
  applyPreset,
  chezToiHomes,
  editorCategories,
  monthsFromShare,
  nothingToSplit,
  othersOf,
  outsideHome,
  remaining,
  startGoals,
  step,
  stepMonths,
  toAllocation,
  type GoalPreset,
  type GoalsDraft,
} from '@/lib/setup/goals-editor'
import { UNREADABLE } from '@/lib/setup/use-first-launch'

const SAVE_FAILED = 'Ça n’a pas été enregistré. Vérifie ta connexion et réessaie.'
const NO_HOME_GOAL = 'Chez toi n’a pas d’objectif : ses mensualités et ses réestimations ne fausseront plus ton écart.'
// Under the rental row (spec 2026-11-10, verbatim).
const RENTAL_NOTE = 'Un logement ne se vend pas par carré : cet objectif guide surtout où va ton argent neuf.'
// The one sentence at the bottom, whole.
const NOT_ADVICE = 'Ce sont des exemples, pas un conseil fait pour toi.'
// More than a year of expenses put aside: said, never refused.
const INFLATION_NOTE = 'Au-delà d’un an de côté, cet argent perd face à l’inflation.'
// « 4 mois », « 2,5 mois ».
const monthsLabel = (months: number) => `${String(months).replace('.', ',')} mois`
// The last screen of the first launch since the spending comes before it.
const NEXT = '/'
const SETTINGS = '/reglages'
const PRESETS = ['prudent', 'balanced', 'dynamic'] as const
const STEP_BUTTON = `inline-flex size-11 items-center justify-center rounded-full border border-rule-strong text-subtitle text-ink disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`

type Ready = Extract<ReturnType<typeof useModel>, { status: 'ready' }>

export default function ObjectifsPage() {
  const state = useModel()
  // Opened from the Réglages: the first launch is not moved on, the person goes back there.
  const fromSettings = useSearchParams().get('depuis') === 'reglages'
  const way = fromSettings ? { back: SETTINGS, next: SETTINGS } : { back: '/premier-lancement/depenses', next: NEXT }
  if (state.status === 'loading') return <VaultWait phase="open" />
  if (state.status !== 'ready') return <LoadFailed retry={state.retry} />
  const { model } = state
  if (model.unreadable.profile > 0 || model.unreadable.snapshots > 0) return <Blocked message={UNREADABLE} retry={state.reload} />
  const latest = model.snapshots[model.snapshots.length - 1]
  if (!model.profile || !latest) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-body leading-relaxed text-ink">Dis-nous d’abord où est ton argent.</p>
        <Link href="/premier-lancement/ou" className={TEXT_LINK}>
          Choisir où est mon argent
        </Link>
      </div>
    )
  }

  let grid: Grid
  let sentence: string | null = null
  let rental = false
  // The homes of Chez toi: « dans ton logement », or « dans tes logements » when every square is theirs.
  let homes = 0
  try {
    const situation = computeSituation(model.profile.value, latest.value)
    grid = buildGrid(situation)
    rental = holdsRental(situation)
    homes = chezToiHomes(model.profile.value, situation)
    if (grid.kind === 'none') sentence = noGridSentence(situation)
  } catch (error) {
    console.error(error)
    return <Alert>Tes chiffres ne s’additionnent pas encore&nbsp;: reviens à tes banques pour les vérifier.</Alert>
  }
  const start = grid.kind === 'grid' ? startGoals(grid) : null

  if (grid.kind !== 'grid' || !start) {
    return <NothingToSet sentence={sentence ?? nothingToSplit(homes)} way={way} />
  }
  // The goals in force today, when there are some: the page opens on them, so what was saved is seen again.
  const inForce = model.unreadable.goals > 0 ? null : goalInEffect(model.goals.map((g) => g.value), todayIso())
  // With a budget, the available money is aimed at in months (docs/superpowers/specs/2026-11-11-coussin-objectif-design.md).
  const budget = model.settings?.value.budget ?? null
  const usable = budget && budget.monthly > 0 ? budget : null
  // A goal in months with no budget to count them: never offered back in percents, where its available
  // share reads 0 and saving it would make that true. The screen starts from today and says why.
  const stranded = inForce?.cushionMonths !== undefined && !usable ? inForce.cushionMonths : null
  const saved = inForce && stranded === null ? { ...inForce.shares } : null
  return (
    <Editor
      outside={outsideHome(grid)}
      start={start}
      saved={saved}
      savedMonths={stranded === null ? (inForce?.cushionMonths ?? null) : null}
      stranded={stranded}
      budget={usable}
      spending={fromSettings ? '/premier-lancement/depenses?depuis=reglages' : '/premier-lancement/depenses'}
      shown={editorCategories(rental, saved)}
      state={state}
      way={way}
    />
  )
}

type Way = { back: string; next: string }

function Header({ later, back }: { later?: () => void; back: string }) {
  return (
    <>
      <div className="flex items-center justify-between">
        <Link href={back} className={BACK}>
          ‹ Retour
        </Link>
        {later ? (
          <button type="button" className={`${BACK} self-auto`} onClick={later}>
            Plus tard
          </button>
        ) : null}
      </div>
      <h1 className="pt-2 text-title font-semibold leading-tight tracking-[-0.01em]">Tes objectifs</h1>
    </>
  )
}

// Nothing outside the home: the screen says so, and there is nothing to skip.
function NothingToSet({ sentence, way }: { sentence: string; way: Way }) {
  const router = useRouter()
  return (
    <div className="flex flex-col">
      <Header back={way.back} />
      <p className="mt-4 text-body leading-relaxed text-ink-soft">{sentence}</p>
      <div className="mt-8">
        <Button onClick={() => router.push(way.next)}>Continuer</Button>
      </div>
    </div>
  )
}

// The draft as one bar: a segment per category as wide as its percent, what is left to place as an
// outline. `shown`: the editor's rows, the same shares in the same order.
function Stack({ draft, shown }: { draft: GoalsDraft; shown: GoalCategory[] }) {
  const left = remaining(draft)
  const label = [
    ...shown.map((c) => `${GOAL_LABELS[c]} ${formatWholePercent(draft[c])}`),
    ...(left > 0 ? [`${formatWholePercent(left)} à placer`] : []),
  ].join(', ')
  return (
    <div role="img" aria-label={`Tes objectifs : ${label}`} className="mt-5 flex h-1.5 overflow-hidden rounded-square">
      {shown.filter((c) => draft[c] > 0).map((c) => (
        <span key={c} data-part="share" className={`h-full ${FILL[GOAL_COLOR[c]]}`} style={{ width: `${draft[c]}%` }} />
      ))}
      {left > 0 ? (
        <span data-part="unplaced" className="h-full border border-rule-strong" style={{ width: `${left}%` }} />
      ) : null}
    </div>
  )
}

function Editor({
  outside,
  start,
  saved,
  savedMonths,
  budget,
  spending,
  stranded,
  shown: rows,
  state,
  way,
}: {
  outside: number
  start: GoalsDraft
  saved: GoalsDraft | null
  savedMonths: number | null
  budget: Budget | null
  spending: string
  stranded: number | null
  shown: GoalCategory[]
  state: Ready
  way: Way
}) {
  const router = useRouter()
  // In months, the available money has its own row above; the others share what it leaves.
  const shown = budget ? rows.filter((c) => c !== 'available') : rows
  const inMonths = (shares: GoalsDraft) => (budget ? monthsFromShare(shares.available, outside, budget) : 0)
  const savedDraft = saved && budget && savedMonths === null ? othersOf(saved) : saved
  const startDraft = budget ? othersOf(start) : start
  const [draft, setDraft] = useState(savedDraft ?? startDraft)
  const [months, setMonths] = useState(savedMonths ?? inMonths(saved ?? start))
  // Where the shares come from (the goals saved, today's split, an example), until a « − » or
  // a « + » makes them the person's own.
  const [chosen, setChosen] = useState<GoalPreset | 'saved' | null>(saved ? 'saved' : 'current')
  const [error, setError] = useState<string | null>(null)
  // Why Chez toi has no goal: behind « hors chez toi », one touch away.
  const [homeNote, setHomeNote] = useState(false)
  const { busy, run } = useSubmit()
  const left = remaining(draft)

  function save() {
    void run(async () => {
      try {
        await addGoal(state.client, state.dataKey, toAllocation(draft, todayIso(), budget ? months : undefined))
      } catch (failure) {
        console.error(failure)
        setError(SAVE_FAILED)
        return false
      }
      router.push(way.next)
      return true
    })
  }

  return (
    <div className="flex flex-col">
      <Header back={way.back} later={() => router.push(way.next)} />
      <p className="mt-2 text-body leading-relaxed text-ink-soft">
        Comment veux-tu répartir ton argent{' '}
        <button
          type="button"
          aria-expanded={homeNote}
          onClick={() => setHomeNote((open) => !open)}
          className={`relative inline font-semibold text-ink underline decoration-dotted underline-offset-4 after:absolute after:-inset-y-3.5 after:inset-x-0 ${FOCUS}`}
        >
          hors chez toi
        </button>{' '}
        ({formatEuros(outside)} aujourd’hui)&nbsp;?
      </p>
      {homeNote ? (
        <p className="mt-3 border-l border-rule-strong pl-3 text-caption leading-normal text-ink-muted">{NO_HOME_GOAL}</p>
      ) : null}

      <ul className="mt-4 flex flex-wrap gap-2">
        {saved ? (
          <li>
            <button
              type="button"
              aria-pressed={chosen === 'saved'}
              className={CHIP}
              onClick={() => {
                setDraft({ ...savedDraft! })
                if (budget) setMonths(savedMonths ?? inMonths(saved))
                setChosen('saved')
              }}
            >
              Mes objectifs
            </button>
          </li>
        ) : null}
        <li>
          <button
            type="button"
            aria-pressed={chosen === 'current'}
            className={CHIP}
            onClick={() => {
              setDraft(budget ? othersOf(start) : applyPreset('current', start))
              if (budget) setMonths(inMonths(start))
              setChosen('current')
            }}
          >
            Ma répartition actuelle
          </button>
        </li>
        {PRESETS.map((preset) => (
          <li key={preset}>
            <button
              type="button"
              aria-pressed={chosen === preset}
              className={CHIP}
              onClick={() => {
                if (budget) {
                  setDraft({ ...CUSHION_PRESETS[preset].shares })
                  setMonths(CUSHION_PRESETS[preset].months)
                } else setDraft(applyPreset(preset, start))
                setChosen(preset)
              }}
            >
              {GOAL_PRESETS[preset].label}
            </button>
          </li>
        ))}
      </ul>

      {budget ? (
        <div className="mt-5 flex min-h-14 items-center gap-3 border-b border-hairline py-1">
          <span aria-hidden="true" className={`size-3.5 shrink-0 rounded-square ${FILL.available}`} />
          <p data-testid="cushion" className="flex-1 text-body text-ink">
            {`${GOAL_LABELS.available} : garder ${monthsLabel(months)} de ${budget.basis === 'salary' ? 'revenus' : 'dépenses'}, soit ${formatEuros(months * budget.monthly)}`}
          </p>
          <button
            type="button"
            aria-label="Moins de mois"
            className={STEP_BUTTON}
            disabled={months === stepMonths(months, -1)}
            onClick={() => {
              setMonths(stepMonths(months, -1))
              setChosen(null)
            }}
          >
            −
          </button>
          <button
            type="button"
            aria-label="Plus de mois"
            className={STEP_BUTTON}
            disabled={months === stepMonths(months, 1)}
            onClick={() => {
              setMonths(stepMonths(months, 1))
              setChosen(null)
            }}
          >
            +
          </button>
        </div>
      ) : (
        <>
          {stranded !== null ? (
            <p className="mt-4 text-body leading-relaxed text-ink">
              {`Ton objectif vise ${monthsLabel(stranded)} de côté pour ton argent disponible : renseigne tes dépenses pour le garder.`}
            </p>
          ) : null}
        <Link href={spending} className={`${TEXT_LINK} mt-4`}>
          Renseigner tes dépenses pour viser ton argent disponible en mois
        </Link>
        </>
      )}
      {budget && months > 12 ? <p className="mt-2 text-caption leading-normal text-ink-muted">{INFLATION_NOTE}</p> : null}
      {budget ? <p className="mt-4 text-caption text-ink-muted">Le reste se répartit ainsi&nbsp;:</p> : null}

      <Stack draft={draft} shown={shown} />

      <ul className="mt-4 flex flex-col">
        {shown.map((category) => {
          const label = GOAL_LABELS[category]
          return (
            <Fragment key={category}>
              <li className="flex min-h-14 items-center gap-3 border-b border-hairline py-1">
                <span aria-hidden="true" className={`size-3.5 shrink-0 rounded-square ${FILL[GOAL_COLOR[category]]}`} />
                <span className="flex flex-1 flex-col text-body text-ink">
                  {label}
                  <small className="text-caption text-ink-muted">{`aujourd’hui ${formatWholePercent(startDraft[category])}`}</small>
                </span>
                <button
                  type="button"
                  aria-label={`Moins de ${label}`}
                  className={STEP_BUTTON}
                  disabled={draft[category] === 0}
                  onClick={() => {
                    setDraft(step(draft, category, -1))
                    setChosen(null)
                  }}
                >
                  −
                </button>
                <span data-testid="value" className="w-12 whitespace-nowrap text-center text-subtitle font-semibold text-ink">
                  {formatWholePercent(draft[category])}
                </span>
                <button
                  type="button"
                  aria-label={`Plus de ${label}`}
                  className={STEP_BUTTON}
                  disabled={left === 0}
                  onClick={() => {
                    setDraft(step(draft, category, 1))
                    setChosen(null)
                  }}
                >
                  +
                </button>
              </li>
              {/* The rental only: a home is not sold by the square. */}
              {category === 'rental' ? <li className="py-2 text-caption leading-normal text-ink-muted">{RENTAL_NOTE}</li> : null}
            </Fragment>
          )
        })}
      </ul>

      <p className="mt-4 text-body text-ink" role="status">
        {left === 0 ? `${formatWholePercent(100)} répartis` : `Il reste ${formatWholePercent(left)} à placer`}
      </p>
      <p className="mt-2 text-caption leading-relaxed text-ink-muted">{NOT_ADVICE}</p>

      <div className="mt-6 flex flex-col gap-3">
        <Button disabled={left !== 0 || busy} onClick={save}>
          Enregistrer
        </Button>
        {error ? <Alert>{error}</Alert> : null}
      </div>
    </div>
  )
}
