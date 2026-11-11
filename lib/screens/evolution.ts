// The Évolution tab, in figures and in words: the curve of what is yours, the goals snapshot by
// snapshot, where the progress comes from, and the list of snapshots. No React, no database here.
// Every snapshot is read at its own rates (convertible), never at today's.

import { GOAL_CATEGORIES } from '@/lib/catalog'
import { formatDayMonth, formatEurosShown, formatMonthYear, formatPercent1 } from '@/lib/format'
import type { Model } from '@/lib/app/use-model'
import { convertible } from '@/lib/market/live'
import { splitChange, wholeAccountChanges, type ChangeSplit } from '@/lib/model/change'
import { currentShares, goalInEffect, goalSquares, heldSquares } from '@/lib/model/goals'
import {
  computeSituation,
  EntryKindError,
  MissingRateError,
  UncategorisedLineError,
  UnknownLineError,
  type Situation,
} from '@/lib/model/situation'
import { buildGrid, cellsOf, homeRange } from '@/lib/model/squares'
import type { CategoryId, Cents, GoalAllocation, GoalCategory, IsoDate, Profile, Snapshot } from '@/lib/model/types'
import { splitView, type SplitRow } from '@/lib/update/result'
import {
  COMPARED_TO_FIRST_GOALS,
  EXISTING_ADDED_ALONG_THE_WAY,
  TRACE_WORDS,
  unconvertedNote,
  unknownPaymentsSentence,
  unreadableNote,
  nextCapSentence,
} from './evolution-words'

export type EvolutionPoint = { snapshotId: string; date: IsoDate; net: Cents; squareValue: Cents | null }
export type EvolutionView =
  | { kind: 'none' }
  | { kind: 'unreadable'; notes: string[] } // part of the vault cannot be read: no curve, it is said
  | { kind: 'single'; point: EvolutionPoint; dateLabel: string; notes: string[] }
  | {
      kind: 'history'
      dateLabel: string // « Chiffres du 30 septembre 2026 »: of when the figures are
      sinceFirst: {
        euros: string
        // The same gain as a share of the first snapshot's net; none when that net was not positive.
        percent: string | null
        squareThen: string | null
        squareNow: string | null
        firstLabel: string
        sinceLabel: string // the month of the first snapshot, its year only when it is not this year
      }
      // One point per day (the latest snapshot of that day). The curve is drawn only with two days
      // or more, a positive net somewhere and a gap that shows: otherwise a sentence says why it is not
      // there. 'flat': on a scale that starts at 0 (never stretched, it would flatter the gap) the
      // gap is too small to be seen.
      curve: 'chart' | 'one-day' | 'not-positive' | 'flat'
      points: EvolutionPoint[]
      nextCap: Cents | null
      // B2: said under the curve, « À 450 000 €, un carré vaudra 4 500 €. » (null without a cap).
      capSentence: string | null
      goals: {
        rows: Array<{ snapshotId: string; date: IsoDate; misplaced: Array<{ category: GoalCategory; count: number }> }>
        comparedToFirst: boolean
        comparedWords: string
        // Per category, oldest first: the gap to that snapshot's own target, in points of the
        // share outside the home (+ above, − below); `target` is the latest target share.
        traces: Array<{ category: GoalCategory; gaps: number[]; target: number; word: string }>
      } | null
      // Planche 4: the grid at each real snapshot, oldest first, one per day (its latest, as on the
      // curve), only those with a grid. Null under two: there is nothing to step through.
      // `home`: the squares of « Chez toi », in their own green as on Mon argent (null without a rental).
      steps: Array<{
        snapshotId: string
        date: string
        net: string
        squareValue: string
        cells: CategoryId[]
        home: { from: number; to: number } | null
      }> | null
      split: {
        bar: ReturnType<typeof splitView>['bar']
        rows: SplitRow[]
        unknownPayments: string[]
      }
      snapshots: Array<{ id: string; date: string; net: string; squareValue: string | null }>
      notes: string[]
    }

// A date is always written with its year here: a year no real date can share forces it.
export const withYear = (date: IsoDate) => formatDayMonth(date, '0000-01-01')

// The word under a category's trace, from the distances to its goal (in points of the share
// outside the home), oldest first, compared in whole points.
export function traceWord(gaps: readonly number[]): string {
  const first = Math.round(Math.abs(gaps[0]))
  const last = Math.round(Math.abs(gaps[gaps.length - 1]))
  if (last === 0) return TRACE_WORDS.reached
  if (last <= 2) return TRACE_WORDS.almost
  if (last < first) return TRACE_WORDS.closer
  if (last > first) return TRACE_WORDS.further
  return TRACE_WORDS.steady
}

// The next round value of a square above `squareValue`: by 100 € below 1 000 €, by 500 € above.
function nextCapOf(squareValue: Cents): Cents {
  const euros = squareValue / 100
  const step = euros < 1000 ? 100 : 500
  return (Math.floor(euros / step) + 1) * step * 100
}

// The share of the scale (0 up to the next cap) below which two points cannot be told apart.
// The chart is about 150 px high: 3 % is about 5 px.
export const FLAT_SHARE = 0.03

function isFlat(points: readonly EvolutionPoint[], nextCap: Cents | null): boolean {
  const nets = points.map((p) => Math.max(0, p.net))
  // The chart's own scale: the cap is a square value, a net is a hundred squares.
  const top = Math.max(1, nextCap === null ? 0 : nextCap * 100, ...nets)
  return (Math.max(...nets) - Math.min(...nets)) / top < FLAT_SHARE
}

const signed = (cents: Cents): string => (Math.round(cents / 100) > 0 ? `+${formatEurosShown(cents)}` : formatEurosShown(cents))

type Item = {
  id: string
  date: IsoDate
  snapshot: Snapshot // converted: only the lines that convert
  situation: Situation
  point: EvolutionPoint
}

// `today` only decides whether the date of the figures says its year (a snapshot of another year).
export function evolutionView(model: Model, today: IsoDate): EvolutionView {
  // A curve missing a snapshot, or read without its profile, would say something false.
  if (model.unreadable.profile > 0 || model.unreadable.snapshots > 0) return { kind: 'unreadable', notes: [] }
  if (!model.profile || model.snapshots.length === 0) return { kind: 'none' }
  const profile: Profile = model.profile.value

  const notes: string[] = []
  const items: Item[] = []
  const ordered = [...model.snapshots].sort((a, b) =>
    a.value.takenOn < b.value.takenOn ? -1 : a.value.takenOn > b.value.takenOn ? 1 : 0,
  )
  for (const loaded of ordered) {
    const { snapshot, names } = convertible(profile, loaded.value)
    const date = loaded.value.takenOn
    let situation: Situation
    try {
      situation = computeSituation(profile, snapshot)
    } catch (error) {
      if (
        error instanceof MissingRateError ||
        error instanceof UnknownLineError ||
        error instanceof UncategorisedLineError ||
        error instanceof EntryKindError
      ) {
        notes.push(unreadableNote(withYear(date)))
        continue
      }
      throw error
    }
    if (names.length > 0) notes.push(unconvertedNote(withYear(date), names))
    const grid = buildGrid(situation)
    items.push({
      id: loaded.id,
      date,
      snapshot,
      situation,
      point: {
        snapshotId: loaded.id,
        date,
        net: situation.net,
        squareValue: grid.kind === 'grid' ? grid.squareValue : null,
      },
    })
  }

  if (items.length === 0) return { kind: 'unreadable', notes }
  if (items.length === 1) return { kind: 'single', point: items[0].point, dateLabel: withYear(items[0].date), notes }

  const first = items[0]
  const last = items[items.length - 1]
  // Snapshots of the same day are one point on the calendar: the latest of that day, as the
  // app reads the latest snapshot (same-day snapshots keep their storage order).
  const byDay = new Map<IsoDate, EvolutionPoint>()
  for (const item of items) byDay.set(item.date, item.point)
  const points = [...byDay.values()]
  const nextCap = last.point.squareValue === null ? null : nextCapOf(last.point.squareValue)
  const curve =
    points.length < 2
      ? 'one-day'
      : points.every((p) => p.net <= 0)
        ? 'not-positive'
        : isFlat(points, nextCap)
          ? 'flat'
          : 'chart'

  const squareText = (p: EvolutionPoint) => (p.squareValue === null ? null : formatEurosShown(Math.round(p.squareValue)))
  const gain = last.point.net - first.point.net
  const monthYear = formatMonthYear(first.date)
  const sinceFirst = {
    euros: signed(gain),
    percent:
      first.point.net > 0
        ? `${gain > 0 ? '+' : ''}${formatPercent1((gain / first.point.net) * 100)}`
        : null,
    sinceLabel: first.date.slice(0, 4) === today.slice(0, 4) ? monthYear.replace(/\s\d{4}$/, '') : monthYear,
    squareThen: squareText(first.point),
    squareNow: squareText(last.point),
    firstLabel: formatMonthYear(first.date),
  }

  return {
    kind: 'history',
    dateLabel: `Chiffres du ${formatDayMonth(last.date, today)}`,
    sinceFirst,
    curve,
    points,
    nextCap,
    capSentence: nextCap === null ? null : nextCapSentence(formatEurosShown(nextCap * 100), formatEurosShown(nextCap)),
    // An unreadable goal would leave a partial goal history: none is shown, as on Mon argent.
    goals: model.unreadable.goals > 0 ? null : goalsOf(items, model.goals.map((g) => g.value)),
    steps: stepsOf(items),
    split: splitOf(profile, items),
    snapshots: [...items].reverse().map((i) => ({
      id: i.id,
      date: withYear(i.date),
      net: formatEurosShown(i.point.net),
      squareValue: squareText(i.point),
    })),
    notes,
  }
}

function stepsOf(items: Item[]): Extract<EvolutionView, { kind: 'history' }>['steps'] {
  const byDay = new Map<IsoDate, Item>()
  for (const item of items) byDay.set(item.date, item)
  const steps = []
  for (const item of byDay.values()) {
    const grid = buildGrid(item.situation)
    if (grid.kind !== 'grid') continue
    steps.push({
      snapshotId: item.id,
      date: withYear(item.date),
      net: formatEurosShown(item.situation.net),
      squareValue: formatEurosShown(Math.round(grid.squareValue)),
      cells: cellsOf(grid),
      home: homeRange(grid.categories),
    })
  }
  return steps.length < 2 ? null : steps
}

function goalsOf(items: Item[], allocations: GoalAllocation[]) {
  if (allocations.length === 0) return null
  const earliest = allocations.reduce((a, b) => (b.validFrom < a.validFrom ? b : a))
  let comparedToFirst = false

  const rows: Array<{ snapshotId: string; date: IsoDate; misplaced: Array<{ category: GoalCategory; count: number }> }> = []
  // Squares are not compared from one snapshot to the next: the home takes a different number
  // of them each time, and the targets with it. The traces compare shares of what is outside it.
  const gaps = new Map<GoalCategory, number[]>(GOAL_CATEGORIES.map((c) => [c, []]))
  let latestTarget: Record<GoalCategory, number> | null = null

  for (const item of items) {
    const grid = buildGrid(item.situation)
    if (grid.kind !== 'grid') continue
    let goal = goalInEffect(allocations, item.date)
    if (!goal) {
      goal = earliest
      comparedToFirst = true
    }
    const targets = goalSquares(goal.shares, grid)
    const misplaced: Array<{ category: GoalCategory; count: number }> = []
    for (const category of GOAL_CATEGORIES) {
      const squares = heldSquares(grid, category)
      if (squares > targets[category]) misplaced.push({ category, count: squares - targets[category] })
    }
    rows.push({ snapshotId: item.id, date: item.date, misplaced })

    // Nothing (or less than nothing) outside the home: no share to compare, no dot.
    let shares: Record<GoalCategory, number>
    try {
      shares = currentShares(grid)
    } catch {
      continue
    }
    latestTarget = goal.shares
    for (const category of GOAL_CATEGORIES) gaps.get(category)!.push(shares[category] - goal.shares[category])
  }

  if (rows.length === 0) return null
  const target = latestTarget as Record<GoalCategory, number> | null
  return {
    rows,
    comparedToFirst,
    comparedWords: COMPARED_TO_FIRST_GOALS,
    traces:
      target === null
        ? []
        : GOAL_CATEGORIES
            // No rental trace while nothing is aimed at it nor held in it: a person without a
            // rental sees today's four traces.
            .filter((category) => category !== 'rental' || target.rental > 0 || gaps.get(category)!.some((g) => g !== 0))
            .map((category) => ({
              category,
              gaps: gaps.get(category)!,
              target: target[category],
              word: traceWord(gaps.get(category)!),
            })),
  }
}

function splitOf(profile: Profile, items: Item[]) {
  const total: ChangeSplit = { effort: 0, markets: 0, property: 0, existingAdded: 0, total: 0 }
  const unknown: string[] = []
  const accountOf = new Map(profile.accounts.map((a) => [a.id, a]))

  for (let i = 1; i < items.length; i++) {
    const before = items[i - 1].snapshot
    const after = items[i].snapshot
    const part = splitChange(profile, before, after)
    total.effort += part.effort
    total.markets += part.markets
    total.property += part.property
    total.existingAdded += part.existingAdded
    total.total += part.total

    // A contributions account held at both dates whose payments are unknown, and that moved:
    // its whole change went to « marchés ».
    for (const [id, delta] of wholeAccountChanges(profile, before, after)) {
      const account = accountOf.get(id)
      if (!account || Object.hasOwn(after.contributions, id) || Math.round(delta / 100) === 0) continue
      const sentence = unknownPaymentsSentence(account.name)
      if (!unknown.includes(sentence)) unknown.push(sentence)
    }
  }

  const repaid = items[0].situation.owed - items[items.length - 1].situation.owed
  const { bar, rows } = splitView(total, repaid, EXISTING_ADDED_ALONG_THE_WAY, formatEurosShown)
  return { bar, rows, unknownPayments: unknown }
}
