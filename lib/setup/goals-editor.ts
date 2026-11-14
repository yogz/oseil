// The goals the person sets at first launch, in whole percents of the money
// outside Chez toi. Pure: no React, no database. Chez toi has no goal: its
// monthly repayments and new estimates would otherwise move the gap on their own.

import { CUSHION_MONTHS, GOAL_CATEGORIES, GOAL_PRESETS } from '@/lib/catalog'
import { formatWholePercent } from '@/lib/format'
import { heldValue } from '@/lib/model/goals'
import type { Situation } from '@/lib/model/situation'
import { largestRemainder, type Grid } from '@/lib/model/squares'
import type { Budget, Cents, GoalAllocation, GoalCategory, IsoDate, Profile } from '@/lib/model/types'

type GridOnly = Extract<Grid, { kind: 'grid' }>

// The sentence of the editor when every square is Chez toi's. `homes`: how many homes Chez toi holds
// (chezToiHomes); none (a property line on another account alone) reads as one.
export function nothingToSplit(homes: number): string {
  const where = homes > 1 ? 'dans tes logements' : 'dans ton logement'
  return `Tout ton argent est ${where} : il n’y a rien à répartir pour l’instant.`
}

// The homes of Chez toi in this situation: the lines of its pocket held on a home, a rental never.
export function chezToiHomes(profile: Profile, situation: Situation): number {
  const held = situation.categories.find((c) => c.pockets)?.pockets?.['chez-toi'].lines ?? []
  return held.filter((h) => {
    const line = profile.lines.find((l) => l.id === h.lineId)
    return line !== undefined && profile.accounts.find((a) => a.id === line.accountId)?.type === 'home'
  }).length
}

export type GoalsDraft = Record<GoalCategory, number> // whole percents of the money outside the home, totalling 100
export type GoalPreset = 'current' | keyof typeof GOAL_PRESETS

const WHOLE = 100

// The goal shares a saved goal shows (the Réglages): the rental share only once it is above 0, so a
// person without one sees today's four.
export function shownGoalCategories(shares: Record<GoalCategory, number>): GoalCategory[] {
  return GOAL_CATEGORIES.filter((c) => c !== 'rental' || shares[c] > 0)
}

// The rows of the editor, and the parts of its bar: one rule for both, fixed when it opens, so that a
// share brought down to 0 keeps its row. The rental row when the person has a rental, or when the
// goal saved gives it a part (without the row, the sum on screen would not make 100).
export function editorCategories(hasRental: boolean, saved: Record<GoalCategory, number> | null): GoalCategory[] {
  return GOAL_CATEGORIES.filter((c) => c !== 'rental' || hasRental || (saved?.rental ?? 0) > 0)
}

// What the goals are shared out of: every goal share, Chez toi left out, the rental included. The
// grid holds only what is positive: a rental under its loans counts for nothing here.
export function outsideHome(grid: GridOnly): Cents {
  return GOAL_CATEGORIES.reduce((sum, c) => sum + heldValue(grid, c), 0)
}

// Today's split of the money outside the home; null when there is none.
export function startGoals(grid: GridOnly): GoalsDraft | null {
  if (outsideHome(grid) <= 0) return null
  const parts = largestRemainder(
    GOAL_CATEGORIES.map((c) => heldValue(grid, c)),
    WHOLE,
  )
  return Object.fromEntries(GOAL_CATEGORIES.map((c, i) => [c, parts[i]])) as GoalsDraft
}

// An example takes its shares exactly; « current » goes back to today's split.
export function applyPreset(preset: GoalPreset, current: GoalsDraft): GoalsDraft {
  if (preset === 'current') return { ...current }
  return { ...GOAL_PRESETS[preset].shares }
}

export function remaining(draft: GoalsDraft): number {
  return WHOLE - GOAL_CATEGORIES.reduce((sum, c) => sum + draft[c], 0)
}

// The line under the rows. At 100 % every « + » is greyed: the line says how to move a share
// (UX review, 12 November 2026).
export function placedSentence(left: number): string {
  if (left === 0) return `${formatWholePercent(WHOLE)} répartis : baisse une part pour en monter une autre.`
  return `Il reste ${formatWholePercent(left)} à placer`
}

// One percent at a time: never below 0, never more than 100 in total.
export function step(draft: GoalsDraft, category: GoalCategory, delta: 1 | -1): GoalsDraft {
  const next = draft[category] + delta
  if (next < 0 || (delta === 1 && remaining(draft) <= 0)) return draft
  return { ...draft, [category]: next }
}

// The shares saved are the percents shown, as they are; with `months`, the available money is aimed at in
// months of the budget, and its share is 0.
export function toAllocation(draft: GoalsDraft, today: IsoDate, months?: number): GoalAllocation {
  if (remaining(draft) !== 0) throw new Error('Every percent must be placed before saving')
  if (months === undefined) return { schema: 1, validFrom: today, shares: { ...draft } }
  if (draft.available !== 0) throw new Error('A goal in months has no share of available money')
  return { schema: 1, validFrom: today, shares: { ...draft }, cushionMonths: months }
}

// ---- The available money in months (docs/superpowers/specs/2026-11-11-coussin-objectif-design.md) ----

// What a share of the money outside the home is worth in months of the budget, to the nearest choice.
export function monthsFromShare(share: number, outside: Cents, budget: Budget): number {
  const months = ((share / WHOLE) * outside) / budget.monthly
  return CUSHION_MONTHS.reduce((best, m) => (Math.abs(m - months) < Math.abs(best - months) ? m : best))
}

// The four other shares as parts of what the cushion leaves, in whole percents totalling 100. Nothing
// but available money: all of it to the secured savings, the first one after it.
export function othersOf(draft: GoalsDraft): GoalsDraft {
  const others = GOAL_CATEGORIES.filter((c) => c !== 'available')
  const weights = others.map((c) => draft[c])
  const parts = largestRemainder(weights.some((w) => w > 0) ? weights : others.map((c) => (c === 'secured' ? 1 : 0)), WHOLE)
  return { available: 0, ...Object.fromEntries(others.map((c, i) => [c, parts[i]])) } as GoalsDraft
}

// One step along the choices of months, never beyond either end.
export function stepMonths(months: number, delta: 1 | -1): number {
  const at = CUSHION_MONTHS.indexOf(months)
  return CUSHION_MONTHS[Math.min(CUSHION_MONTHS.length - 1, Math.max(0, at + delta))]
}
