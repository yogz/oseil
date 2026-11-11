// What the detail of one category shows, as words and figures. Pure: no React, no database.

import type { Model } from '@/lib/app/use-model'
import { bankAt, CATEGORIES, isRanged } from '@/lib/catalog'
import {
  formatDayMonth,
  formatEurosShown,
  HIDDEN_AMOUNT,
  formatPercent1,
  formatPriceShown,
  formatUnits,
  formatWholePercent,
} from '@/lib/format'
import { gapWords, goalInEffect, goalSquares, hasSteeredSquares, splitsProperty } from '@/lib/model/goals'
import {
  categoryOf,
  computeSituation,
  entryValue,
  EntryKindError,
  MissingRateError,
  pocketOf,
  toEuroCents,
  UncategorisedLineError,
  UnknownLineError,
} from '@/lib/model/situation'
import { buildGrid, shareLabel } from '@/lib/model/squares'
import type { CategoryId, Cents, GoalCategory, IsoDate } from '@/lib/model/types'
import { convertible, usablePrices, withPrices } from '@/lib/market/live'
import type { Market } from '@/lib/market/types'
import { lastKnownPrice, unconvertedSentence } from '@/lib/market/words'
import { CHAPTER_LABELS, chapterOf, WORLD_FUND_NOTE, type ChapterId } from '@/lib/screens/chapters'
import { DEBT_SENTENCE } from '@/lib/screens/line-words'
import { debtsOf } from '@/lib/screens/debts'
import { excludedSentence, noGridSentence, pocketSentence } from '@/lib/screens/mon-argent'
import { titleRows } from '@/lib/screens/titles'
import { NO_GOAL, whereWords } from '@/lib/screens/words'

export type DetailLine = {
  lineId: string
  name: string
  euros: string
  percent: string
  where: string
  squares: number
  // « a gagné 5 000 € depuis l’achat »; a mode where it rounds to zero says « ni gain ni perte ».
  // null when it rounds to zero in both modes, or cannot be known.
  result: { tone: { euros: Tone; percent: Tone }; euros: string; percent: string } | null
  details: string | null
  // The loans this line finances, said under it: « une fois déduits 178 900 € encore dus à Caisse d’Épargne ».
  // The line's figure is already net of them (like its squares): the sub-line says that subtraction.
  loans: Array<{ lineId: string; sentence: string }>
  chapter: ChapterId | null // null: this category is not told in chapters (property)
  // « prix d’achat manquant »: in « Placements en bourse », a line whose gain since purchase cannot be known.
  noPrice: string | null
  // That caption leads to the line's average price: only a line held in parts has one to type in.
  priceToSet: boolean
}

export type Tone = 'gain' | 'loss' | 'zero'
// The gain since purchase, signed: « +8,2 % » / « −410 € »; a zero has no sign (« 0,0 % »). Its tone
// is given per mode: a gain can be « +30 € » and « 0,0 % » at once.
export type GainFigure = { tone: { euros: Tone; percent: Tone }; euros: string; percent: string }
// The same, said to VoiceOver in words, one per display mode: « + » and « − » are not read reliably.
export type Said = { euros: string; percent: string }

export type DetailChapter = {
  id: ChapterId
  label: string
  euros: string
  percent: string
  squares: number // its squares in the grid, drawn above its sub-line
  sub: string // « 14 carrés sur 22 · 17 lignes » (in « Placements en bourse »: « … · 12 lignes, 1 sans prix »)
  lines: DetailLine[]
  // « Placements en bourse » only (null elsewhere): its gain since purchase, 'unknown' when no line
  // of it has a purchase price, and the whole row as one sentence for VoiceOver.
  gain: GainFigure | 'unknown' | null
  said: Said | null
  // The two groups of Immobilier only (null elsewhere): « pas d’objectif » for « Pour y vivre », the
  // gap to its goal for « En location », or, under its loans, why it has no square.
  aim: string | null
  goal: { actual: number; target: number } | null
  // « Pour y vivre » drawn in the green of « Chez toi », as its squares in the grid: only when both
  // pockets have squares (lib/model/squares.ts, homeRange).
  home: boolean
}

export type CategoryDetailView = {
  name: string
  euros: string
  percent: string
  header: string
  goal: { actual: number; target: number } | null
  debts: Array<{ lineId: string; name: string; owed: string }> // the loans that lower this category
  debtSentence: string | null
  note: string | null // this category's lines left out for want of a rate
  leftOut: Array<{ lineId: string; name: string }> // the same lines, each to its fiche
  lines: DetailLine[]
  tooSmall: DetailLine[]
  titlesLink: boolean // the category holds a line whose price could be followed
  worldNote: string | null // « Placements en bourse » with a line in « Fonds monde »: what MSCI World holds in the United States
  chapters: DetailChapter[] | null // null: one chapter would hold everything, or nothing to tell apart
  ranging: { href: string; label: string } | null // the way to « Ranger par zone/type »
  squares: boolean // false: out of the grid, or no grid at all; its lines are listed all the same
  // « Placements en bourse » only (null elsewhere): the gain since purchase of the lines whose purchase
  // price is known, and what is left out (« depuis l’achat, hors 2 lignes »); or that it is unknown.
  purchaseGain: { kind: 'known'; figure: GainFigure; rest: string; said: Said } | { kind: 'unknown'; text: string } | null
}

// What a line gained since purchase, in euro cents, and what it cost; null when it cannot be known.
type Bought = { gain: Cents; cost: Cents } | null

const MINUS = '−'
const SIGNS: Record<Tone, string> = { gain: '+', loss: MINUS, zero: '' }
const NEITHER = 'ni gain ni perte depuis l’achat'

// The direction of a gain as each mode shows it: decided on the rounded figure, never on the exact
// cents, so that « +0,0 % » in green or « −0 € » in red cannot be written. A gain of 30 € on
// 1 000 000 € is « +30 € » but « 0,0 % ».
function tonesOf(gain: Cents, cost: Cents): { euros: Tone; percent: Tone } {
  const direction: Tone = gain > 0 ? 'gain' : 'loss'
  return {
    euros: Math.round(Math.abs(gain) / 100) === 0 ? 'zero' : direction,
    percent: Math.round((Math.abs(gain) / cost) * 1000) === 0 ? 'zero' : direction,
  }
}

// One gain, both modes: the unsigned figures and their tones.
function bothModes(gain: Cents, cost: Cents) {
  return {
    tone: tonesOf(gain, cost),
    euros: formatEurosShown(Math.abs(gain)),
    percent: formatPercent1((Math.abs(gain) / cost) * 100),
  }
}

// Σ gain / Σ cost over the known lines; null when none is known. A masked amount keeps no sign.
function gainFigure(bought: Bought[]): { figure: GainFigure; said: Said } | null {
  const known = bought.filter((b): b is NonNullable<Bought> => b !== null)
  if (known.length === 0) return null
  const gain = known.reduce((sum, b) => sum + b.gain, 0)
  const cost = known.reduce((sum, b) => sum + b.cost, 0)
  const { tone, euros, percent } = bothModes(gain, cost)
  const said = (t: Tone, figure: string) =>
    t === 'zero' ? NEITHER : `${t === 'gain' ? 'en hausse de' : 'en baisse de'} ${figure} depuis l’achat`
  return {
    figure: {
      tone,
      euros: euros === HIDDEN_AMOUNT ? euros : `${SIGNS[tone.euros]}${euros}`,
      percent: `${SIGNS[tone.percent]}${percent}`,
    },
    said: { euros: said(tone.euros, euros), percent: said(tone.percent, percent) },
  }
}

// « 2 lignes », « 12 lignes, 1 sans prix », « 1 ligne sans prix » (all of them without a price).
function countWithPrices(lines: number, missing: number): string {
  if (missing === 0) return linesWord(lines)
  return missing === lines ? `${linesWord(lines)} sans prix` : `${linesWord(lines)}, ${missing} sans prix`
}

const NO_PRICE = 'prix d’achat manquant'
const UNKNOWN_SAID = `gain inconnu, ${NO_PRICE}`

// The header's line: the gain of every line whose purchase price is known, and how many are left out.
function purchaseGainOf(bought: Bought[]): CategoryDetailView['purchaseGain'] {
  if (bought.length === 0) return null
  const missing = bought.filter((b) => b === null).length
  const gain = gainFigure(bought)
  if (gain === null) return { kind: 'unknown', text: `Gain depuis l’achat inconnu, ${missing > 1 ? 'prix d’achat manquants' : NO_PRICE}` }
  const leftOut = missing > 0 ? `, sans compter ${linesWord(missing)} sans prix d’achat` : ''
  return {
    kind: 'known',
    figure: gain.figure,
    rest: missing > 0 ? `depuis l’achat, hors ${linesWord(missing)}` : 'depuis l’achat',
    said: { euros: `${gain.said.euros}${leftOut}`, percent: `${gain.said.percent}${leftOut}` },
  }
}

// A number and its word never part (A3): « (15 carrés) » is never left as « carrés) » on a line of its own.
const squaresWord = (n: number) => `${n}\u00A0${n > 1 ? 'carrés' : 'carré'}`
const linesWord = (n: number) => `${n} ${n > 1 ? 'lignes' : 'ligne'}`

// `market`: today's prices, when the browser has them. The same prices as « Mon argent »: the last
// saved snapshot, its quoted lines repriced, its rates untouched, a line no rate converts left out.
// A category with no square opens too, as long as it holds a line or a debt: that is where a typo
// that took its squares away gets corrected.
export function categoryDetailView(
  model: Model,
  category: CategoryId,
  today: IsoDate,
  market: Market | null = null,
): CategoryDetailView | null {
  if (model.profile === null || model.snapshots.length === 0) return null
  const profile = model.profile.value
  const saved = model.snapshots[model.snapshots.length - 1].value
  const { prices } = market ? usablePrices(profile, saved, market, today) : { prices: {} }
  const { snapshot } = convertible(profile, withPrices(saved, prices))

  let situation
  let grid
  try {
    situation = computeSituation(profile, snapshot)
    grid = buildGrid(situation)
  } catch (error) {
    if (
      error instanceof MissingRateError ||
      error instanceof UnknownLineError ||
      error instanceof UncategorisedLineError ||
      error instanceof EntryKindError
    ) {
      return null
    }
    throw error
  }
  const totals = situation.categories.find((c) => c.category === category)
  if (!totals) return null
  const owedHere = debtsOf(profile, snapshot).filter((d) => d.category === category)
  if (totals.lines.length === 0 && owedHere.length === 0) return null

  // In the grid, each line has its squares; out of it, each line is listed with none.
  const entry = grid.kind === 'grid' ? grid.categories.find((c) => c.category === category) : undefined
  const squares = entry !== undefined
  const listed: Array<{ lineId: string; value: Cents; squares: number }> =
    entry?.lines ?? totals.lines.map((l) => ({ lineId: l.lineId, value: l.value, squares: 0 }))

  // Same rule as « Mon argent »: goals only count when something outside Chez toi can be compared.
  let goal: CategoryDetailView['goal'] = null
  let targets: Record<GoalCategory, number> | null = null
  if (grid.kind === 'grid') {
    const allocation = model.unreadable.goals > 0 ? null : goalInEffect(model.goals.map((g) => g.value), today)
    if (allocation && hasSteeredSquares(grid)) targets = goalSquares(allocation.shares, grid)
    if (entry && targets && category !== 'property') goal = { actual: entry.squares, target: targets[category as GoalCategory] }
  }
  // With a rental, or a rental share still to reach, Immobilier is told in its two pockets, as on
  // Mon argent; without either, as it always was.
  const inPockets = category === 'property' && splitsProperty(situation, targets)

  // Out of the grid, the sentence of « Mon argent » says why; a category at exactly zero has none there.
  let header: string
  if (entry) {
    header = goal
      ? `${squaresWord(entry.squares)} sur 100, ${gapWords(goal.actual, goal.target)} (${squaresWord(goal.target)})`
      : `${squaresWord(entry.squares)} sur 100`
  } else if (grid.kind === 'none') {
    header = noGridSentence(situation)
  } else {
    header = grid.excluded.includes(category) ? excludedSentence(category, situation) : `${squaresWord(0)} sur 100`
  }

  // The gain since purchase, told in « Placements en bourse » only: by line, by chapter and in total.
  const tellsGain = category === 'markets'
  const bought = new Map<string, Bought>()
  const detailLines = listed.map((held): DetailLine => {
    const line = profile.lines.find((l) => l.id === held.lineId)!
    const account = profile.accounts.find((a) => a.id === line.accountId)!
    const establishment = profile.establishments.find((e) => e.id === account.establishmentId)!
    const snapshotEntry = snapshot.entries.find((e) => e.lineId === held.lineId)!

    let result: DetailLine['result'] = null
    let details: string | null = null
    bought.set(held.lineId, null)
    if (snapshotEntry.kind === 'units') {
      const parts = [`${formatUnits(snapshotEntry.units)} ${snapshotEntry.units > 1 ? 'parts' : 'part'}`]
      if (snapshotEntry.averagePrice !== null) {
        parts.push(`prix moyen d’achat ${formatPriceShown(snapshotEntry.averagePrice, line.currency)}`)
        const cost = toEuroCents(snapshotEntry.units * snapshotEntry.averagePrice * 100, line, snapshot.fx)
        const gain = entryValue(snapshotEntry, line, snapshot.fx) - cost
        // A cost of zero (0 units, or an average price of 0) leaves no percent to give: such a line
        // is counted « sans prix » and says « prix d’achat manquant », like a line with no price
        // (decided on review, 10 November 2026: one rule, no third kind of line).
        if (cost > 0) {
          bought.set(held.lineId, { gain, cost })
          const { tone, euros, percent } = bothModes(gain, cost)
          const told = (t: Tone, figure: string) => (t === 'zero' ? NEITHER : `${t === 'gain' ? 'a gagné' : 'a perdu'} ${figure} depuis l’achat`)
          if (tone.euros !== 'zero' || tone.percent !== 'zero') {
            result = { tone, euros: told(tone.euros, euros), percent: told(tone.percent, percent) }
          }
        }
      }
      const price = formatPriceShown(snapshotEntry.unitPrice, line.currency)
      // Only a price taken today is « du jour »; any other is the snapshot's own.
      parts.push(
        Object.hasOwn(prices, line.id)
          ? `prix du jour ${price}`
          : lastKnownPrice(price, formatDayMonth(saved.takenOn, today)),
      )
      // What is yours is the net, debts taken off; the grid's total leaves out the negative categories.
      // With nothing that is yours, there is no share of it to give.
      if (situation.net > 0) parts.push(`${formatPercent1((held.value / situation.net) * 100)} de ce qui est à toi`)
      details = parts.join(' · ')
    }

    const euros = formatEurosShown(held.value)
    const noPrice = tellsGain && bought.get(held.lineId) === null ? NO_PRICE : null
    return {
      lineId: held.lineId,
      name: line.name,
      euros,
      // No square, no share of the grid: the figure stays in euros.
      percent: squares && held.value > 0 ? shareLabel(held.squares) : euros,
      where: whereWords(line, account, establishment),
      squares: held.squares,
      result,
      details,
      loans: [],
      chapter: inPockets ? pocketOf(account) : chapterOf(line, account, category),
      noPrice,
      priceToSet: noPrice !== null && snapshotEntry.kind === 'units',
    }
  })

  // A loan reads as part of the line it finances, in this category: « une fois déduits … encore dus à … »,
  // under a figure that is already the line less the loan. It stays a row of its own when it finances
  // nothing here, or when it exceeds the line (the line's figure is then below zero).
  const attached = new Set<string>()
  for (const d of owedHere) {
    const loanLine = profile.lines.find((l) => l.id === d.lineId)!
    const loanAccount = profile.accounts.find((a) => a.id === loanLine.accountId)!
    const index = listed.findIndex((l) => l.lineId === loanAccount.financedLineId)
    if (index < 0 || listed[index].value < 0) continue
    const establishment = profile.establishments.find((e) => e.id === loanAccount.establishmentId)!
    detailLines[index].loans.push({
      lineId: d.lineId,
      sentence: `une fois déduits ${formatEurosShown(d.value)} encore dus ${bankAt(establishment)}`,
    })
    attached.add(d.lineId)
  }

  // `listed` keeps the order of the profile; the biggest value leads (stable sort). Out of the grid,
  // no line is « too small »: none has a square.
  const order = listed.map((l, i) => ({ value: l.value, line: detailLines[i], tooSmall: squares && l.value > 0 && l.squares === 0 }))
  order.sort((a, b) => b.value - a.value)

  // The chapters: the lines of the view's order (biggest first) gathered by chapter, the chapter with
  // the most value first, « Je ne sais pas » and « Autres » last. A too-small line sits in its chapter.
  const byChapter = new Map<ChapterId, { value: Cents; squares: number; lines: DetailLine[] }>()
  for (const o of order) {
    const id = o.line.chapter
    if (id === null) continue
    const chapter = byChapter.get(id) ?? { value: 0, squares: 0, lines: [] }
    chapter.value += o.value
    chapter.squares += o.line.squares
    chapter.lines.push(o.line)
    byChapter.set(id, chapter)
  }
  // A rental share with no rental left: « En location » stays, empty, so the goals still add up.
  if (inPockets && !byChapter.has('location')) byChapter.set('location', { value: 0, squares: 0, lines: [] })
  const lastChapter = (id: ChapterId) => (id === 'unknown' || id === 'other' ? 1 : 0)
  // Immobilier's two groups keep their order, « Pour y vivre » first, as on Mon argent.
  const pocketRank = (id: ChapterId) => (id === 'location' ? 1 : 0)
  // A group of Immobilier: what it is compared with. A pocket under its loans (the other one keeps
  // squares) says why it has none; the header says it when both are.
  const pocketAim = (id: ChapterId, c: { value: Cents; squares: number; lines: DetailLine[] }) => {
    if (!inPockets) return { aim: null, goal: null }
    if (c.lines.length === 0) {
      // Only « En location », kept for its share: nothing held yet, its target still drawn.
      if (!targets) return { aim: null, goal: null }
      return { aim: `${gapWords(0, targets.rental, false)} (${squaresWord(targets.rental)})`, goal: { actual: 0, target: targets.rental } }
    }
    if (entry && c.value <= 0) {
      const pocket = id === 'location' ? 'location' : 'chez-toi'
      const goal = targets && pocket === 'location' ? { actual: 0, target: targets.rental } : null
      return { aim: pocketSentence(pocket, c.lines.length), goal }
    }
    if (!targets) return { aim: null, goal: null }
    if (id !== 'location') return { aim: NO_GOAL, goal: null }
    const target = targets.rental
    return { aim: `${gapWords(c.squares, target)} (${squaresWord(target)})`, goal: { actual: c.squares, target } }
  }
  const rentalSquares = byChapter.get('location')?.squares ?? 0
  const chapters: DetailChapter[] | null =
    byChapter.size < 2 && !inPockets
      ? null
      : [...byChapter.entries()]
          .sort(([ida, a], [idb, b]) =>
            inPockets ? pocketRank(ida) - pocketRank(idb) : lastChapter(ida) - lastChapter(idb) || b.value - a.value,
          )
          .map(([id, c]): DetailChapter => {
            const euros = formatEurosShown(c.value)
            // « En location » kept for its goal share alone (no line): 0 %, as the sub-row of Mon argent.
            const percent =
              c.lines.length === 0 ? formatWholePercent(0) : entry && c.value > 0 && c.squares > 0 ? shareLabel(c.squares) : euros
            const boughtHere = c.lines.map((l) => bought.get(l.lineId) ?? null)
            const missing = boughtHere.filter((b) => b === null).length
            const count = tellsGain ? countWithPrices(c.lines.length, missing) : linesWord(c.lines.length)
            // A pocket under its loans has no square to count, not « less than one ». With no line,
            // nothing to count: only its gap and its bar are said.
            const sub =
              c.lines.length === 0
                ? ''
                : !entry || (inPockets && c.value <= 0)
                  ? count
                  : c.squares === 0
                    ? `moins d’un carré · ${count}`
                    : `${squaresWord(c.squares)} sur ${entry.squares} · ${count}`
            const label = CHAPTER_LABELS[id]
            const gain = tellsGain ? gainFigure(boughtHere) : null
            const gainSaid = gain?.said ?? { euros: UNKNOWN_SAID, percent: UNKNOWN_SAID }
            const subSaid = sub.replace(' · ', ', ')
            return {
              id,
              label,
              squares: c.squares,
              euros,
              percent,
              sub,
              lines: c.lines,
              gain: tellsGain ? (gain?.figure ?? 'unknown') : null,
              said: tellsGain
                ? {
                    euros: `${label}, ${euros}, ${subSaid}, ${gainSaid.euros}`,
                    percent: `${label}, ${percent}, ${subSaid}, ${gainSaid.percent}`,
                  }
                : null,
              ...pocketAim(id, c),
              home: inPockets && id === 'chez-toi' && c.squares > 0 && rentalSquares > 0,
            }
          })

  const ranging =
    isRanged(category) && listed.length > 0
      ? { href: `/categorie/${category}/ranger`, label: category === 'markets' ? 'Ranger par zone ›' : 'Ranger par type ›' }
      : null

  const followable = new Set(titleRows(profile, undefined).map((row) => row.lineId))

  // A loan is the line of no category: the line it finances already shows its value less the loan.
  const debts = owedHere.filter((d) => !attached.has(d.lineId)).map((d) => ({ lineId: d.lineId, name: profile.lines.find((l) => l.id === d.lineId)!.name, owed: formatEurosShown(d.value) }))
  // « dont » puts what is owed inside what is held: said only when it fits, never more than the whole.
  // Beyond it, the header says why there is no square and each debt row says what it still owes.
  const owed = owedHere.reduce((sum, d) => sum + d.value, 0)
  const gross = totals.value + owed
  const debtSentence = owed > 0 && owed <= gross ? DEBT_SENTENCE(formatEurosShown(gross), formatEurosShown(owed)) : null

  // The lines of this category that no rate converts: each page says what it left out of itself.
  const kept = new Set(snapshot.entries.map((e) => e.lineId))
  const leftOut = saved.entries.flatMap((e) => {
    if (kept.has(e.lineId)) return []
    const line = profile.lines.find((l) => l.id === e.lineId)
    const account = line && profile.accounts.find((a) => a.id === line.accountId)
    return line && account && categoryOf(line, account) === category ? [{ lineId: line.id, name: line.name }] : []
  })

  const euros = formatEurosShown(totals.value)
  return {
    name: CATEGORIES[category].label,
    euros,
    percent: entry ? shareLabel(entry.squares) : euros,
    header,
    goal,
    debts,
    debtSentence,
    note: unconvertedSentence(leftOut.map((l) => l.name)),
    leftOut,
    lines: order.filter((o) => !o.tooSmall).map((o) => o.line),
    tooSmall: order.filter((o) => o.tooSmall).map((o) => o.line),
    titlesLink: listed.some((held) => followable.has(held.lineId)),
    worldNote: category === 'markets' && detailLines.some((l) => l.chapter === 'world') ? WORLD_FUND_NOTE : null,
    chapters,
    ranging,
    squares,
    purchaseGain: tellsGain ? purchaseGainOf(listed.map((l) => bought.get(l.lineId) ?? null)) : null,
  }
}
