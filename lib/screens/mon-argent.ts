// What « Mon argent » shows, as words and figures. Pure: no React, no database.

import { chapterOf, MOSTLY_CRYPTO, mostlyCrypto } from '@/lib/screens/chapters'
import { homeFilter } from '@/lib/screens/home-in-grid'
import { recountUnfinished } from '@/lib/correct/recount'
import type { Model } from '@/lib/app/use-model'
import { CATEGORIES, CATEGORY_ORDER, GOAL_COLOR } from '@/lib/catalog'
import { formatDayMonth, formatEurosShown, formatMonthYear, formatPercent1, formatWholePercent, HIDDEN_AMOUNT } from '@/lib/format'
import { gapWords, goalInEffect, goalsJourney, goalTargets, hasSteeredSquares, heldSquares, misplacedSquares, reachableTargets, splitsProperty } from '@/lib/model/goals'
import {
  computeSituation,
  entryMinorUnits,
  EntryKindError,
  MissingRateError,
  pocketOf,
  UncategorisedLineError,
  UnknownLineError,
  type PocketId,
  type Situation,
} from '@/lib/model/situation'
import { buildGrid, pocketSquares, shareLabel, type Grid } from '@/lib/model/squares'
import { cushion } from '@/lib/model/cushion'
import type { Account, Budget, CategoryId, Cents, GoalAllocation, GoalCategory, IsoDate, Profile, Snapshot } from '@/lib/model/types'
import { debtsOf } from '@/lib/screens/debts'
import { behindEstablishments, olderDatesLabel } from '@/lib/screens/seen'
import { couldFollow } from '@/lib/screens/titles'
import { RENTAL_ABOVE, RENTAL_BELOW, CUSHION_BEYOND_ALL, cushionRowWords, goalHeadline, GOALS_NEED_BUDGET, GOALS_NEED_BUDGET_LINK, LESS_THAN_A_SQUARE, NO_GOAL, ownedSentence, POCKET_ROW_NAMES, pricesDateLabel } from '@/lib/screens/words'
import { reconcile, steps } from '@/lib/setup/first-launch'
import { DRAFT_UNREADABLE, isStale } from '@/lib/update/draft'
import { convertible, usablePrices, withPrices, type PriceFailure } from '@/lib/market/live'
import type { Market } from '@/lib/market/types'
import { failedPricesSentence, failedRatesSentence, NO_RATE, nothingCountedSentence, unconvertedSentence } from '@/lib/market/words'
import { accountTotal } from '@/lib/setup/step-changes'

export type Board = {
  // « 400 000 € en comptant chez toi »: the whole, said under a total that leaves Chez toi out; null otherwise.
  homeAside: string | null
  dateLabel: string
  net: string | null // null: every amount was left out for want of a rate, which is not a zero
  ownedSentence: string | null
  squareValue: string | null
  // C3: what a square was worth at the first snapshot, and what is yours since then (null: the same).
  progress: { squareThen: string; firstLabel: string; change: { euros: string; percent: string | null } | null } | null
  grid: Grid
  // `simulation` (planche 3): the grid as it is and as it would be at the goals, square by square,
  // for « Montre-moi mes objectifs »; null when every square is already in its place.
  goals: {
    headline: string
    detail: string | null
    scale: number
    // Where to give what the goals still need (a budget, for a goal in months).
    link?: { href: string; label: string }
    // The rental's gap to its goal, in words: it is never moved by the simulation (Nicolas, 12 November 2026).
    rentalNote?: string
    // « Montre-moi mes objectifs », option F: where the squares leave from (`sources`), the grid at
    // the goals in blocks (`blocks`), the places they come to (`arrivals`), and what goes where.
    simulation: {
      real: CategoryId[]
      blocks: CategoryId[]
      sources: number[]
      arrivals: number[]
      misplaced: number
      moves: Array<{ from: CategoryId; to: CategoryId; euros: string; percent: string; fromWords: string; toWords: string }>
    } | null
  } | null
  categories: Array<{
    category: CategoryId
    name: string
    euros: string
    percent: string
    goal: RowGoal | null
    note: string | null
    linked: boolean // false: it holds no line and no debt, so there is no detail to open
    // Immobilier only, and only with a rental (or a rental goal still to reach): its two pockets,
    // « Chez toi » with no goal, « En location » with its own. Absent for everyone else.
    pockets?: PocketRow[]
  }>
  excluded: Array<{ category: CategoryId; sentence: string }>
  noGridSentence: string | null
  // The categories that hold a line or a debt and that `categories` does not link: without a
  // square, their detail still opens, so that each of their lines can be corrected.
  withoutSquares: Array<{ category: CategoryId; name: string }>
  warnings: string[]
  // Every line of the last snapshot that no rate converts, each to its fiche: the lines its warning
  // names. No category opens on a total that is unknown, so this is their way in.
  leftOut: Array<{ lineId: string; name: string }>
  // available: the profile and the snapshots are readable (an unreadable draft does not matter: the
  // update screen offers to start again). pending: a draft based on the latest snapshot.
  update: { available: boolean; pending: boolean }
  titlesHint: boolean // nothing follows its price yet, and something could
}

type GridOnly = Extract<Grid, { kind: 'grid' }>
// « : » after a no-break space, as French typography wants it.
const COLON = ' :'

// `cushion`: the available money aimed at in months (its words then judged in months, not squares).
export type RowGoal = {
  actual: number
  target: number
  words: string
  cushion?: { months: number; euros: string; basis: Budget['basis'] }
}
// A sub-row of Immobilier: a pocket under its loans keeps its own (negative) figure and 0 %, never
// taken off the other pocket; its sentence is in `excluded`.
export type PocketRow = {
  pocket: PocketId
  name: string
  euros: string
  percent: string
  goal: RowGoal | null
  note: string | null
}

// What a first launch not yet finished holds, step by step and account by account: no grid, no
// total, nothing that would read as an answer while banks are still missing.
// Every step is listed, in the order of the steps, including those with no account yet.
export type EnteredStatus = 'done' | 'current' | 'todo'
export type Entered = Array<{
  id: string
  establishment: string
  status: EnteredStatus
  accounts: Array<{ name: string; amount: string }>
}>

export type MonArgentView =
  | { kind: 'first-launch' }
  | { kind: 'unreadable-profile' }
  | { kind: 'resume'; remaining: number; onlyBanks: boolean; entered: Entered }
  | { kind: 'reveal-pending' }
  // `unfinished`: a recount cut short, whose fiche finishes it (« Terminer »).
  | { kind: 'error'; reason: 'inconsistent' | 'unreadable'; unfinished?: { href: string; name: string } }
  | ({ kind: 'board' } & Board)

const NO_GRID_NEGATIVE =
  'Pour l’instant, ce que tu dois dépasse ce que tu possèdes\u00A0: la grille apparaîtra quand ce sera l’inverse.'
const NO_GRID_EQUAL =
  'Pour l’instant, ce que tu dois est égal à ce que tu possèdes\u00A0: la grille apparaîtra dès que ce qui est à toi sera positif.'
const NO_GRID_EMPTY = 'Pour l’instant, aucun montant n’est saisi\u00A0: la grille apparaîtra avec ton premier montant.'
const NOTHING_TO_COMPARE =
  'Tes objectifs portent sur ce qui n’est pas chez toi\u00A0: rien à comparer pour l’instant.'
export const POSITIVE_ONLY = 'La grille montre ce qui est positif.'
const NO_HOME_GOAL = 'pas d’objectif pour chez toi'

class ComputeFailure extends Error {
  constructor(public reason: 'inconsistent') {
    super(reason)
  }
}

// The errors of the model become a reason; anything else is a real bug and goes up.
function situationOf(profile: Profile, snapshot: Snapshot): Situation {
  try {
    return computeSituation(profile, snapshot)
  } catch (error) {
    if (
      error instanceof UnknownLineError ||
      error instanceof UncategorisedLineError ||
      error instanceof EntryKindError
    ) {
      throw new ComputeFailure('inconsistent')
    }
    throw error
  }
}

// Said from the figures, not from the grid's reason: owing money with nothing owned is not « nothing entered ».
export function noGridSentence(situation: Situation): string {
  if (situation.net < 0) return NO_GRID_NEGATIVE
  if (situation.net === 0 && situation.owed > 0) return NO_GRID_EQUAL
  return NO_GRID_EMPTY
}

// The categories that hold a line or a debt: those whose detail opens, squares or not.
// `situation` is computeSituation's for this same snapshot.
function heldCategories(profile: Profile, snapshot: Snapshot, situation: Situation): Set<CategoryId> {
  return new Set([
    ...situation.categories.filter((c) => c.lines.length > 0).map((c) => c.category),
    ...debtsOf(profile, snapshot).map((d) => d.category),
  ])
}

// Why a category has no square: its total is not positive. For Immobilier, `situation` says which
// pockets hold lines: both under their loans are said together, a rental alone by its own sentence.
export function excludedSentence(category: CategoryId, situation: Situation): string {
  if (category === 'property') {
    const pockets = situation.categories.find((c) => c.pockets)?.pockets
    const rentals = pockets?.location.lines.length ?? 0
    if (rentals > 0 && (pockets?.['chez-toi'].lines.length ?? 0) > 0) {
      return `Chez toi comme en location, ton immobilier vaut moins que ce qu’il reste à rembourser : pas de carré pour l’instant.`
    }
    if (rentals > 0) return pocketSentence('location', rentals)
    return 'Ton immobilier vaut moins que ce qu’il reste à rembourser\u00A0: il n’a pas de carré pour l’instant.'
  }
  if (category === 'available') {
    return 'Tes crédits dépassent ton argent disponible\u00A0: il n’a pas de carré pour l’instant.'
  }
  return `Le total « ${CATEGORIES[category].label} » est négatif\u00A0: pas de carré pour l’instant.`
}

// Why one pocket of Immobilier has no square while the other keeps its own. `lines`: how many it holds.
export function pocketSentence(pocket: PocketId, lines: number): string {
  const what =
    pocket === 'location'
      ? lines > 1
        ? 'Tes logements en location valent'
        : 'Ton logement en location vaut'
      : lines > 1
        ? 'Chez toi, tes logements valent'
        : 'Chez toi, ton logement vaut'
  return `${what} moins que ce qu’il reste à rembourser${COLON} pas de carré pour l’instant.`
}

// Every sentence of what has no square, a category or a pocket of Immobilier.
export function excludedSentences(situation: Situation, grid: GridOnly): Array<{ category: CategoryId; sentence: string }> {
  const pockets = situation.categories.find((c) => c.pockets)?.pockets
  return [
    ...grid.excluded.map((category) => ({ category, sentence: excludedSentence(category, situation) })),
    ...grid.excludedPockets.map((pocket) => ({
      category: 'property' as const,
      sentence: pocketSentence(pocket, pockets?.[pocket].lines.length ?? 0),
    })),
  ]
}

// The homes every loan still owed in the snapshot finances, by pocket (a loan repaid, at 0, finances
// nothing any more); null when a loan finances anything else.
function homesFinanced(profile: Profile, snapshot: Snapshot): { chezToi: number; rental: number } | null {
  const owed = snapshot.entries.filter((e) => entryMinorUnits(e) > 0)
  const inSnapshot = new Set(owed.map((e) => profile.lines.find((l) => l.id === e.lineId)?.accountId))
  const homes = new Set<Account>()
  for (const loan of profile.accounts.filter((a) => a.type === 'loan' && inSnapshot.has(a.id))) {
    const financed = profile.lines.find((l) => l.id === loan.financedLineId)
    const home = financed && profile.accounts.find((a) => a.id === financed.accountId)
    if (home?.type !== 'home') return null
    homes.add(home)
  }
  const rental = [...homes].filter((h) => pocketOf(h) === 'location').length
  return { chezToi: homes.size - rental, rental }
}

// The sub-rows of Immobilier: only with a rental, or with a rental goal still to reach (the goals
// then still add up on screen). « Chez toi » when it holds a line, « En location » always then.
// `targets`: the goals in squares, null when there is nothing to compare. `entry`: Immobilier in the
// grid; absent when it has no square (or holds nothing), each pocket is then at its net value, 0 %.
function pocketRows(
  entry: GridOnly['categories'][number] | undefined,
  situation: Situation,
  targets: Record<GoalCategory, number> | null,
): PocketRow[] | undefined {
  const held = situation.categories.find((c) => c.pockets)?.pockets
  if (!held) return undefined
  if (!splitsProperty(situation, targets)) return undefined
  const rows: PocketRow[] = []
  for (const pocket of ['chez-toi', 'location'] as const) {
    if (pocket === 'chez-toi' && held[pocket].lines.length === 0) continue
    const { value, squares } = entry?.pockets?.[pocket] ?? { value: held[pocket].value, squares: 0 }
    rows.push({
      pocket,
      name: POCKET_ROW_NAMES[pocket],
      euros: formatEurosShown(value),
      // A pocket under its loans has no square: 0 %, and its sentence says why.
      percent: value > 0 ? shareLabel(squares) : formatWholePercent(0),
      goal:
        pocket === 'location' && targets
          ? { actual: squares, target: targets.rental, words: gapWords(squares, targets.rental, value > 0) }
          : null,
      note: pocket === 'chez-toi' && targets ? NO_GOAL : null,
    })
  }
  return rows
}

// `saved`: how many snapshots are saved. « Depuis » needs two of them; it is not guessed from
// the snapshots given: today's prices make the latest one a copy, and a copy is never `first`.
function progressOf(
  model: Model,
  profile: Profile,
  first: Snapshot,
  net: number,
  today: IsoDate,
  saved: number,
): Board['progress'] {
  if (saved < 2) return null
  let firstGrid: Grid
  let firstNet: number
  try {
    const firstSituation = situationOf(profile, homeFilter(model, profile)(first))
    firstGrid = buildGrid(firstSituation)
    firstNet = firstSituation.net
  } catch (error) {
    // An old snapshot that no longer fits, or that has a line no rate converts, is skipped.
    if (error instanceof ComputeFailure || error instanceof MissingRateError) return null
    throw error
  }
  if (firstGrid.kind !== 'grid') return null
  // C3 (decided by Nicolas on 9 November 2026): what a square was worth is said beside what it is
  // worth, and the progress is what is yours, from the figure shown just above; the difference of
  // a square (« 46 € de plus ») read as what was gained. One decimal for the percent, as in Évolution.
  const gain = net - firstNet
  const change =
    Math.round(gain / 100) === 0
      ? null
      : {
          euros: gain > 0 ? `+${formatEurosShown(gain)}` : formatEurosShown(gain),
          percent: firstNet > 0 ? `${gain > 0 ? '+' : ''}${formatPercent1((gain / firstNet) * 100)}` : null,
        }
  return {
    squareThen: formatEurosShown(Math.round(firstGrid.squareValue)),
    // As in Évolution: the year only when it is not this one, held to its month (« octobre 2025 »).
    firstLabel: (first.takenOn.slice(0, 4) === today.slice(0, 4)
      ? formatMonthYear(first.takenOn).replace(/\s\d{4}$/, '')
      : formatMonthYear(first.takenOn)
    ).replace(' ', '\u00A0'),
    change,
  }
}

function buildBoard(
  model: Model,
  profile: Profile,
  snapshots: Snapshot[],
  today: IsoDate,
  market: Market | null,
): Board {
  const latest = snapshots[snapshots.length - 1]
  const first = snapshots[0]
  // The last saved snapshot, its quoted lines at today's prices; the rates stay its own.
  // A line no rate converts is left out and said, never an error.
  const { prices, failed } = market ? usablePrices(profile, latest, market, today) : { prices: {}, failed: [] }
  const { snapshot: shown, names: unconverted } = convertible(profile, withPrices(latest, prices))
  // A price taken by a line that was then left out does not make « Cours du jour ».
  const tookPrice = shown.entries.some((e) => Object.hasOwn(prices, e.lineId))
  const nothingCounted = shown.entries.length === 0 && latest.entries.length > 0
  const whole = situationOf(profile, shown)
  const withoutHome = homeFilter(model, profile)(shown)
  const situation = withoutHome === shown ? whole : situationOf(profile, withoutHome)
  const homeAside = withoutHome === shown ? null : `${formatEurosShown(whole.net)} en comptant chez toi`
  const grid = buildGrid(situation)
  // The whole situation: Immobilier, left out of the grid, stays reachable under « Voir ses lignes » (review, 12 November 2026).
  const held = heldCategories(profile, shown, whole)
  const warnings: string[] = []

  if (model.unreadable.snapshots > 0 || model.unreadable.profile > 0) {
    warnings.push('Une partie de tes chiffres n’a pas pu être lue. Rien n’a été effacé.')
  }

  if (model.unreadable.draft > 0) warnings.push(DRAFT_UNREADABLE)
  const latestId = model.snapshots[model.snapshots.length - 1].id
  const update = {
    available: model.unreadable.profile === 0 && model.unreadable.snapshots === 0,
    pending: model.draft !== null && !isStale(model.draft.value, latestId),
  }
  const older = olderDatesLabel(behindEstablishments(profile, latest, snapshots[snapshots.length - 2]), today)

  const follow = couldFollow(profile, latest)
  // The entries `convertible` left out, the same lines as `unconverted`, in the same order.
  const kept = new Set(shown.entries.map((e) => e.lineId))
  const leftOut = latest.entries
    .filter((e) => !kept.has(e.lineId))
    .map((e) => ({ lineId: e.lineId, name: profile.lines.find((l) => l.id === e.lineId)!.name }))
  const base = {
    homeAside,
    update,
    leftOut,
    titlesHint: follow.following === 0 && follow.possible > 0,
    dateLabel: `${
      tookPrice && latest.takenOn < today
        ? pricesDateLabel(formatDayMonth(latest.takenOn, today))
        : `Chiffres du ${formatDayMonth(latest.takenOn, today)}`
    }${older ? ` · ${older}` : ''}`,
    net: nothingCounted ? null : formatEurosShown(situation.net),
    // The loans of the snapshot as shown: without Chez toi, those of the home are no longer said (review, 12 November 2026).
    ownedSentence: ownedSentence(situation.owned, situation.owed, homesFinanced(profile, withoutHome === shown ? latest : homeFilter(model, profile)(latest))),
    grid,
  }

  if (model.unreadable.goals > 0) warnings.push('Tes objectifs n’ont pas pu être lus.')
  const namesOf = (reason: PriceFailure['reason']) =>
    failed.filter((f) => f.reason === reason).map((f) => profile.lines.find((l) => l.id === f.lineId)!.name)
  // Said after the other warnings, on every path out of this function.
  const closing = (): string[] => {
    const told = [
      nothingCounted ? null : unconvertedSentence(unconverted),
      failedPricesSentence(namesOf('price'), formatDayMonth(latest.takenOn, today)),
      // A price that came but that no rate converts is not told as a price that failed.
      failedRatesSentence(namesOf('rate')),
    ]
    return [...warnings, ...told.filter((sentence): sentence is string => sentence !== null)]
  }

  // Every category that holds something and is not already a link, in the order of the categories.
  const withoutSquares = (linked: Board['categories']): Board['withoutSquares'] =>
    CATEGORY_ORDER.filter((category) => held.has(category) && !linked.some((c) => c.category === category && c.linked)).map(
      (category) => ({ category, name: CATEGORIES[category].label }),
    )

  if (grid.kind === 'none') {
    return {
      ...base,
      squareValue: null,
      progress: null,
      goals: null,
      categories: [],
      excluded: [],
      noGridSentence: nothingCounted ? nothingCountedSentence(unconverted) : noGridSentence(situation),
      withoutSquares: withoutSquares([]),
      warnings: closing(),
    }
  }

  const allocation =
    model.unreadable.goals > 0 ? null : goalInEffect(model.goals.map((g) => g.value), today)
  // With no square outside Chez toi there is nothing to compare: no goal rows, and it is said.
  // The rental squares are compared like the others.
  const comparable = hasSteeredSquares(grid)
  if (allocation && !comparable) warnings.push(NOTHING_TO_COMPARE)
  const budget = model.settings?.value.budget ?? null
  const targets = allocation && comparable ? goalTargets(allocation, grid, budget) : null
  const cushionGoal = allocation ? cushionGoalOf(allocation, budget) : null

  // Every category in the grid, and every goal category with a target even when it
  // holds nothing (or less than nothing): its bar shows how far it is from its goal.
  const categories: Board['categories'] = []
  for (const category of CATEGORY_ORDER) {
    const entry = grid.categories.find((c) => c.category === category)
    const target = targets && category !== 'property' ? targets[category] : null
    // `held`: false when the category holds nothing (0 €, or less), which its words say plainly.
    const goal = (actual: number, held = true): Board['categories'][number]['goal'] => {
      if (target === null) return null
      if (category === 'available' && cushionGoal) {
        const value = entry?.value ?? situation.categories.find((c) => c.category === 'available')?.value ?? 0
        return { actual, target, ...cushionGoal(value) }
      }
      return { actual, target, words: gapWords(actual, target, held) }
    }

    // Immobilier with no square (under its loans, or nothing held) and a rental share to reach: the
    // row stays, at 0, with its « En location » sub-row, so that every target of the headline is on a
    // row. Why it has no square is said under the rows (`excluded`).
    if (!entry && category === 'property' && targets && targets.rental > 0) {
      categories.push({
        category,
        name: CATEGORIES[category].label,
        euros: formatEurosShown(0),
        percent: formatWholePercent(0),
        goal: null,
        note: null,
        linked: held.has(category),
        pockets: pocketRows(undefined, situation, targets),
      })
      continue
    }

    if (!entry) {
      if (target === null || target <= 0) continue
      // Not in the grid: no square, but a detail to open as soon as it holds a line or a debt.
      const value = situation.categories.find((c) => c.category === category)?.value ?? 0
      categories.push({
        category,
        name: CATEGORIES[category].label,
        euros: formatEurosShown(value),
        percent: formatWholePercent(0),
        goal: goal(0, value > 0),
        note: null,
        linked: held.has(category),
      })
      continue
    }

    let note: string | null = null
    let pockets: PocketRow[] | undefined
    // « Or et crypto » mostly crypto: said on its row (12 November 2026).
    if (category === 'gold') {
      const lines = entry.lines.map((held) => {
        const line = profile.lines.find((l) => l.id === held.lineId)!
        return { value: held.value, chapter: chapterOf(line, profile.accounts.find((a) => a.id === line.accountId)!, 'gold') }
      })
      if (mostlyCrypto(lines, entry.squares)) note = MOSTLY_CRYPTO
    }
    if (category === 'property') {
      pockets = pocketRows(entry, situation, targets)
      // The house's own estimate: another line filed under Immobilier (an « Autre compte »
      // seen in a bank) is dated with its bank, not here.
      const homes = new Set(profile.accounts.filter((a) => a.type === 'home').map((a) => a.id))
      const homeLines = new Set(profile.lines.filter((l) => homes.has(l.accountId)).map((l) => l.id))
      const lineIds = new Set(entry.lines.map((l) => l.lineId).filter((id) => homeLines.has(id)))
      const dates = latest.entries.filter((e) => lineIds.has(e.lineId)).map((e) => e.seenOn)
      const newest = dates.sort()[dates.length - 1]
      // Split in two, « pas d’objectif » is said on the Chez toi sub-row.
      const parts = [...(newest ? [`estimée le ${formatDayMonth(newest, today)}`] : []), ...(targets && !pockets ? [NO_HOME_GOAL] : [])]
      note = parts.length > 0 ? parts.join(' · ') : null
    }
    categories.push({
      category,
      name: CATEGORIES[category].label,
      // For Immobilier, what its squares show: the sum of its positive pockets.
      euros: formatEurosShown(entry.value),
      percent: shareLabel(entry.squares),
      // Held, but less than half a square (Nicolas, 10 November 2026): no square, and its words say
      // so, never « presque » nor « pile à ton objectif » on 1 €.
      goal:
        entry.squares === 0 && entry.value > 0 && target !== null
          ? { actual: 0, target, words: LESS_THAN_A_SQUARE }
          : goal(entry.squares),
      note,
      linked: true,
      ...(pockets ? { pockets } : {}),
    })
  }

  let goals: Board['goals'] = null
  // A goal in months and no budget: no gap can be said, and that is said instead.
  if (allocation && comparable && !targets) {
    goals = { headline: GOALS_NEED_BUDGET, detail: null, scale: 0, simulation: null, link: GOALS_NEED_BUDGET_LINK }
  }
  if (targets) {
    // One scale for every bar of the screen, the rental sub-row's included: the bars are compared with each other.
    const bars = categories.flatMap((c) => [c.goal, ...(c.pockets ?? []).map((p) => p.goal)])
    const scale = bars.reduce((m, g) => (g ? Math.max(m, g.actual, g.target) : m), 0)
    // « Hors chez toi »: only when Chez toi takes squares (a rental alone is steered like the rest).
    const withHome = pocketSquares(grid, 'chez-toi') > 0
    // The headline counts every square off its goal; the simulation moves only what can move: a rental
    // keeps its squares, and its gap is said in words.
    const misplaced = misplacedSquares(grid, targets)
    const reachable = reachableTargets(grid, targets, allocation?.cushionMonths !== undefined)
    const movable = misplacedSquares(grid, reachable)
    const rentalGap = heldSquares(grid, 'rental') - targets.rental
    // A cushion aimed at beyond everything steered takes every square: said, so that the others at 0 are understood.
    const steered = 100 - pocketSquares(grid, 'chez-toi')
    const beyondAll =
      allocation?.cushionMonths !== undefined && budget !== null && budget.monthly > 0 &&
      (allocation.cushionMonths * budget.monthly) / grid.squareValue >= steered
    goals = {
      ...goalHeadline(misplaced, withHome),
      ...(beyondAll ? { detail: CUSHION_BEYOND_ALL } : {}),
      scale,
      simulation: movable > 0 ? simulationOf(grid, reachable, movable) : null,
      ...(rentalGap !== 0 ? { rentalNote: rentalNoteOf(rentalGap, grid.squareValue) } : {}),
    }
  }

  const excluded = excludedSentences(situation, grid)
  if (excluded.length > 0) warnings.push(POSITIVE_ONLY)

  return {
    ...base,
    squareValue: formatEurosShown(Math.round(grid.squareValue)),
    progress: progressOf(model, profile, first, situation.net, today, snapshots.length),
    goals,
    categories,
    excluded,
    noGridSentence: null,
    withoutSquares: withoutSquares(categories),
    warnings: closing(),
  }
}

const TO_FILL_IN = 'montant à saisir'

function enteredSoFar(profile: Profile, latest: Snapshot | undefined): Entered {
  // Tidied as resuming tidies it: an entry left by a half-saved change is not counted.
  const draft = latest ? reconcile({ profile, snapshot: latest }) : null
  const amountOf = (accountId: string): string => {
    if (!draft) return TO_FILL_IN
    const total = accountTotal(draft, accountId)
    if (total === 'no-rate') return NO_RATE
    return total === null ? TO_FILL_IN : formatEurosShown(total)
  }
  const finished = profile.firstLaunch?.finished ?? []
  const all = steps(profile)
  const current = all.find((e) => !finished.includes(e.id))
  return all.map((establishment) => ({
    id: establishment.id,
    establishment: establishment.name,
    status: finished.includes(establishment.id) ? 'done' : establishment === current ? 'current' : 'todo',
    accounts: profile.accounts
      .filter((a) => a.establishmentId === establishment.id)
      .map((a) => ({ name: a.name, amount: amountOf(a.id) })),
  }))
}

// `market`: today's prices and rates, when the browser has them. Null or absent: the snapshot as saved.
// The words of a move of « Montre-moi mes objectifs »: « environ 4 900 € d’argent disponible › en
// bourse ». A square is about a hundredth of what is yours, so the amount is rounded to the hundred
// and said « environ »; with the amounts hidden, it is told in squares.
const MOVE_FROM: Record<GoalCategory, string> = {
  available: 'd’argent disponible',
  secured: 'd’épargne sécurisée',
  markets: 'de placements en bourse',
  gold: 'd’or et de crypto',
  rental: 'd’immobilier locatif',
}
const MOVE_TO: Record<GoalCategory, string> = {
  available: 'en argent disponible',
  secured: 'en épargne sécurisée',
  markets: 'en bourse',
  gold: 'en or et crypto',
  rental: 'en immobilier locatif',
}

// « Environ 80 000 € » (rounded to the hundred, as the moves), or squares with the amounts hidden.
function aboutAmount(squares: number, squareValue: number): string {
  const amount = formatEurosShown(Math.round((squares * squareValue) / 10_000) * 10_000)
  return amount === HIDDEN_AMOUNT ? `${squares}\u00A0${squares > 1 ? 'carrés' : 'carré'}` : `environ ${amount}`
}

function rentalNoteOf(gap: number, squareValue: number): string {
  return gap > 0 ? RENTAL_ABOVE(aboutAmount(gap, squareValue)) : RENTAL_BELOW(aboutAmount(-gap, squareValue))
}

function simulationOf(grid: GridOnly, targets: Record<GoalCategory, number>, misplaced: number) {
  const journey = goalsJourney(grid, targets)
  const moves = journey.moves.map((move) => {
    const amount = formatEurosShown(Math.round((move.squares * grid.squareValue) / 10_000) * 10_000)
    return {
      from: GOAL_COLOR[move.from],
      to: GOAL_COLOR[move.to],
      euros: amount === HIDDEN_AMOUNT ? `${move.squares}\u00A0${move.squares > 1 ? 'carrés' : 'carré'}` : `environ ${amount}`,
      percent: `${move.squares}\u00A0%`,
      fromWords: MOVE_FROM[move.from],
      toWords: MOVE_TO[move.to],
    }
  })
  return { real: journey.real, blocks: journey.blocks, sources: journey.sources, arrivals: journey.arrivals, misplaced, moves }
}

// The available money's goal in months, its words and its text, for a row and for the detail; null for
// a goal in percents, or without a budget to count months with.
export function cushionGoalOf(
  allocation: GoalAllocation,
  budget: Budget | null,
): ((available: Cents) => { words: string; held: number; cushion: NonNullable<RowGoal['cushion']> }) | null {
  const months = allocation.cushionMonths
  if (months === undefined || !budget || budget.monthly <= 0) return null
  return (available) => ({
    words: cushionRowWords(cushion(available, budget)!.months, months),
    held: cushion(available, budget)!.months,
    cushion: { months, euros: formatEurosShown(months * budget.monthly), basis: budget.basis },
  })
}

export function monArgentView(model: Model, today: IsoDate, market: Market | null = null): MonArgentView {
  if (model.profile === null) {
    return model.unreadable.profile > 0 ? { kind: 'unreadable-profile' } : { kind: 'first-launch' }
  }
  const profile = model.profile.value
  const snapshots = model.snapshots.map((s) => s.value)
  const firstLaunch = profile.firstLaunch
  // A profile with nothing in it and a first launch not finished is a launch not yet begun.
  if (firstLaunch && !firstLaunch.complete && profile.establishments.length === 0) return { kind: 'first-launch' }
  // The same rule as launchComplete, written out so TypeScript keeps firstLaunch defined below.
  const complete = firstLaunch === undefined || firstLaunch.complete

  try {
    if (!complete) {
      const remaining = profile.establishments.filter((e) => !firstLaunch.finished.includes(e.id))
      if (remaining.length === 0) return { kind: 'reveal-pending' }
      const onlyBanks = remaining.every((e) => e.kind === 'institution' && e.catalogId !== 'employee-savings')
      const entered = enteredSoFar(profile, snapshots[snapshots.length - 1])
      return { kind: 'resume', remaining: remaining.length, onlyBanks, entered }
    }
    if (snapshots.length === 0) {
      return { kind: 'error', reason: model.unreadable.snapshots > 0 ? 'unreadable' : 'inconsistent' }
    }
    return { kind: 'board', ...buildBoard(model, profile, snapshots, today, market) }
  } catch (error) {
    if (error instanceof ComputeFailure) {
      const stored = model.snapshots.map((s) => ({ id: s.id, value: s.value }))
      const cut = profile.lines.find((l) => recountUnfinished(profile, stored, l.id))
      return { kind: 'error', reason: error.reason, ...(cut ? { unfinished: { href: `/ligne/${cut.id}`, name: cut.name } } : {}) }
    }
    throw error
  }
}
