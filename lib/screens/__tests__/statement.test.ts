import { describe, expect, test } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import { amountEntry, exampleProfile, unitsEntry } from '@/lib/model/__tests__/fixtures'
import type { Profile, Snapshot, SnapshotEntry, UpdateDraft } from '@/lib/model/types'
import { LOCKED_UNREADABLE, LOCKED_UPDATE } from '@/lib/screens/line-words'
import { HIDDEN_AMOUNT, setAmountsHidden } from '@/lib/format'
import { splitChange } from '@/lib/model/change'
import { correctionPreview, planPaidTotal, statementLineView, statementTotalView, statementView } from '@/lib/screens/statement'
import {
  ERASE_REFUSED,
  LOCKED_UPDATE_TOTAL,
  TOTAL_TO_COPY,
  STATEMENT_HISTORY,
  STATEMENT_LEAD,
  TODAY_CORRECTED,
  TODAY_GONE,
  UPDATE_STOPS,
} from '@/lib/screens/statement-words'

const TODAY = '2026-11-12'
const plain = (text: string | null | undefined) => text?.replace(/[  ]/g, ' ') ?? null
const loaded = <T,>(value: T, id: string) => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })

const snapshot = (takenOn: string, entries: SnapshotEntry[]): Snapshot => ({
  schema: 1,
  takenOn,
  fx: {},
  entries,
  contributions: {},
  arrivals: {},
})

// Two lines added later (gold), one closed later (the euro fund, closed in 2026).
const profile: Profile = {
  ...exampleProfile,
  lines: exampleProfile.lines.map((l) => (l.id === 'euro-fund' ? { ...l, closedOn: '2026-09-01' } : l)),
}
const old = snapshot('2025-11-16', [
  amountEntry('current-line', 2_000),
  amountEntry('livret-a-line', 10_000),
  unitsEntry('etf', 80, 200, 180),
  amountEntry('euro-fund', 20_000),
  amountEntry('house-line', 300_000),
  amountEntry('mortgage-line', 190_000),
])
const middle = snapshot('2026-06-30', [
  amountEntry('current-line', 2_000),
  amountEntry('livret-a-line', 11_000),
  unitsEntry('etf', 80, 220, 180),
  amountEntry('euro-fund', 20_000),
  amountEntry('house-line', 300_000),
  amountEntry('mortgage-line', 185_000),
])
const latest = snapshot('2026-10-30', [
  amountEntry('current-line', 2_500),
  amountEntry('livret-a-line', 12_000),
  unitsEntry('etf', 80, 250, 180),
  amountEntry('house-line', 300_000),
  amountEntry('mortgage-line', 180_000),
  amountEntry('gold-line', 2_000),
])

function modelOf(snapshots: Snapshot[], extra: Partial<Model> = {}): Model {
  return {
    profile: loaded(profile, 'p'),
    snapshots: snapshots.map((s, i) => loaded(s, `s${i}`)),
    goals: [],
    settings: null,
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
    ...extra,
  }
}

const ready = <T extends { kind: string }>(view: T) => {
  if (view.kind !== 'ready') throw new Error(`expected ready, got ${view.kind}`)
  return view as Extract<T, { kind: 'ready' }>
}

describe('the page of a relevé', () => {
  const model = modelOf([old, middle, latest])

  test('says its date in full, its total, what a square was worth and its lead', () => {
    const view = ready(statementView(model, 's0', TODAY))
    expect(plain(view.title)).toBe('Relevé du 16 novembre 2025')
    // 2 000 + 10 000 + 16 000 + 20 000 + 300 000 − 190 000
    expect(plain(view.total)).toBe('158 000 €')
    expect(plain(view.squareValue)).toBe('un carré valait 1 580 €')
    expect(view.lead).toBe(STATEMENT_LEAD)
    expect(STATEMENT_LEAD).toBe('Les chiffres de ce jour-là. Les corriger change ta courbe, pas tes chiffres d’aujourd’hui.')
  })

  test('ranges its lines by bank, in the order of the update', () => {
    const view = ready(statementView(model, 's0', TODAY))
    // The update starts at home, then the banks (lib/setup/first-launch steps), whatever the profile's order.
    expect(view.banks.map((b) => b.name)).toEqual(['Chez toi', 'BoursoBank', 'Linxea'])
    expect(view.banks[1].lines.map((l) => l.lineId)).toEqual(['current-line', 'livret-a-line', 'etf'])
  })

  // Review Focus 3.
  test('shows a line closed later, and not a line added later', () => {
    const view = ready(statementView(model, 's0', TODAY))
    const ids = view.banks.flatMap((b) => b.lines.map((l) => l.lineId))
    expect(ids).toContain('euro-fund')
    expect(ids).not.toContain('gold-line')
    expect(ids).not.toContain('life-uc')
  })

  test('each line: its category, its name, its figure that day and a link to correct it', () => {
    const view = ready(statementView(model, 's0', TODAY))
    const etf = view.banks[1].lines[2]
    expect(etf).toMatchObject({ name: 'ETF', category: 'markets', href: '/releve/s0/ligne/etf' })
    expect(plain(etf.figure)).toBe('16 000 €')
    const loan = view.banks[0].lines.find((l) => l.lineId === 'mortgage-line')!
    // A loan: what was owed, positive, no category of its own.
    expect(loan.category).toBeNull()
    expect(plain(loan.figure)).toBe('190 000 €')
  })

  test('has no page for an unknown relevé, nor for one the list leaves out', () => {
    expect(statementView(model, 'nope', TODAY).kind).toBe('none')
    const unreadable = snapshot('2026-01-01', [amountEntry('ghost', 1_000)])
    expect(statementView(modelOf([old, unreadable, latest]), 's1', TODAY).kind).toBe('none')
    expect(statementView(modelOf([old, latest], { profile: null }), 's0', TODAY).kind).toBe('none')
  })

  test('follows the same filter as « Tes relevés »: without Chez toi, its lines and its total leave the home out', () => {
    const without = modelOf([old, middle, latest], { settings: loaded({ schema: 1, withoutHome: true } as never, 'set') })
    const view = ready(statementView(without, 's0', TODAY))
    expect(view.banks.map((b) => b.name)).not.toContain('Chez toi')
    expect(plain(view.total)).toBe('48 000 €')
  })
})

describe('correcting one line at a relevé', () => {
  const model = modelOf([old, middle, latest])

  test('dates everything with that relevé', () => {
    const view = ready(statementLineView(model, 's0', 'livret-a-line', TODAY))
    expect(plain(view.back.label)).toBe('Relevé du 16 novembre 2025')
    expect(view.back.href).toBe('/releve/s0')
    expect(plain(view.title)).toBe('Son montant au 16 novembre 2025')
    expect(plain(view.labels.amount)).toBe('Son montant ce jour-là (EUR)')
    expect(plain(view.submit)).toBe('Corriger le 16 novembre 2025')
    expect(view.history).toBe(STATEMENT_HISTORY)
    expect(STATEMENT_HISTORY).toBe('Ce relevé fait partie de ton histoire : ta courbe et D’où ça vient vont bouger.')
    expect(view.entry).toEqual(amountEntry('livret-a-line', 10_000))
    expect(view.isLatest).toBe(false)
  })

  test('a line in parts: its title and its three labels', () => {
    const view = ready(statementLineView(model, 's0', 'etf', TODAY))
    expect(plain(view.title)).toBe('Ses parts et son prix moyen au 16 novembre 2025')
    expect(plain(view.labels.units)).toBe('Ses parts ce jour-là')
    expect(plain(view.labels.price)).toBe('Le prix d’une part ce jour-là (EUR)')
    expect(plain(view.labels.average)).toBe('Son prix moyen ce jour-là (EUR, laisse vide si tu ne le sais pas)')
    expect(plain(view.today)).toBe('Aujourd’hui : 80 parts à 250,00 €, inchangé')
  })

  test('says the line’s figure at the latest relevé, or that it no longer exists', () => {
    expect(plain(ready(statementLineView(model, 's0', 'livret-a-line', TODAY)).today)).toBe('Aujourd’hui : 12 000 €, inchangé')
    expect(ready(statementLineView(model, 's0', 'euro-fund', TODAY)).today).toBe(TODAY_GONE)
    expect(TODAY_GONE).toBe('Aujourd’hui : la ligne n’existe plus')
  })

  test('a line closed after the latest relevé, still in it, no longer exists either', () => {
    const closedLater: Profile = {
      ...profile,
      lines: profile.lines.map((l) => (l.id === 'livret-a-line' ? { ...l, closedOn: '2026-11-05' } : l)),
    }
    const view = ready(statementLineView({ ...model, profile: { ...model.profile!, value: closedLater } }, 's0', 'livret-a-line', TODAY))
    expect(view.today).toBe(TODAY_GONE)
  })

  test('a loan: what was owed that day, in its title and its label', () => {
    const view = ready(statementLineView(model, 's0', 'mortgage-line', TODAY))
    expect(plain(view.title)).toBe('Ce qui reste à rembourser au 16 novembre 2025')
    expect(plain(view.labels.amount)).toBe('Ce qui reste à rembourser ce jour-là (EUR)')
    expect(view.accountType).toBe('loan')
    expect(plain(view.today)).toBe('Aujourd’hui : 180 000 €, inchangé')
  })

  test('on the latest relevé: no « Aujourd’hui » sentence, it is today', () => {
    const view = ready(statementLineView(model, 's2', 'livret-a-line', TODAY))
    expect(view.isLatest).toBe(true)
    expect(view.today).toBeNull()
  })

  // Review Focus 2: of two relevés of the same day, the latest is the last one stored.
  test('of two relevés of the same day, only the last stored is the latest', () => {
    const twice = modelOf([old, latest, latest])
    expect(ready(statementLineView(twice, 's2', 'etf', TODAY)).isLatest).toBe(true)
    expect(ready(statementLineView(twice, 's1', 'etf', TODAY)).isLatest).toBe(false)
  })

  test('has nothing for a line that is not on that relevé’s page', () => {
    expect(statementLineView(model, 's0', 'gold-line', TODAY).kind).toBe('none')
    expect(statementLineView(model, 'nope', 'etf', TODAY).kind).toBe('none')
  })

  test('the latest relevé is refused while an update runs; a past one is not', () => {
    const draft = loaded({ basedOn: 's2' } as unknown as UpdateDraft, 'd')
    const running = modelOf([old, middle, latest], { draft })
    expect(ready(statementLineView(running, 's2', 'etf', TODAY)).locked).toEqual({ kind: 'update-running', message: LOCKED_UPDATE })
    expect(ready(statementLineView(running, 's0', 'etf', TODAY)).locked).toBeNull()
    const unreadableDraft = modelOf([old, middle, latest], { unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 1 } })
    expect(ready(statementLineView(unreadableDraft, 's0', 'etf', TODAY)).locked?.kind).toBe('unreadable')
  })
})

describe('what the screen says of the figures typed', () => {
  test('the other relevés that held the same figure, corrected too', () => {
    const model = modelOf([old, middle, latest])
    // The current account held 2 000 € in the first two relevés, 2 500 € today.
    const preview = correctionPreview(model, 's0', 'current-line', { kind: 'amount', amount: 300_000 })
    expect('refused' in preview).toBe(false)
    if ('refused' in preview) return
    expect(preview.others).toBe(1)
    expect(plain(preview.othersSentence)).toBe('Ce chiffre est le même dans 1 autre relevé : on le corrige aussi.')
    expect(plain(preview.today)).toBe('Aujourd’hui : 2 500 €, inchangé')
  })

  test('several relevés, and today too when the same figure reached it', () => {
    const model = modelOf([old, middle, latest])
    // The house: 300 000 € everywhere.
    const preview = correctionPreview(model, 's0', 'house-line', { kind: 'amount', amount: 31_000_000 })
    if ('refused' in preview) throw new Error('refused')
    expect(plain(preview.othersSentence)).toBe('Ce chiffre est le même dans 2 autres relevés : on les corrige aussi.')
    expect(preview.today).toBe(TODAY_CORRECTED)
    expect(TODAY_CORRECTED).toBe('Aujourd’hui aussi : ce chiffre était le même, il est corrigé.')
  })

  test('alone: no sentence about other relevés', () => {
    const preview = correctionPreview(modelOf([old, middle, latest]), 's0', 'livret-a-line', { kind: 'amount', amount: 1_000_000 })
    if ('refused' in preview) throw new Error('refused')
    expect(preview.others).toBe(0)
    expect(preview.othersSentence).toBeNull()
  })

  test('while an update runs, today is never corrected, and the screen says so', () => {
    const draft = loaded({ basedOn: 's2' } as unknown as UpdateDraft, 'd')
    const preview = correctionPreview(modelOf([old, middle, latest], { draft }), 's0', 'house-line', { kind: 'amount', amount: 31_000_000 })
    if ('refused' in preview) throw new Error('refused')
    expect(preview.others).toBe(1)
    expect(plain(preview.today)).toBe('Aujourd’hui : 300 000 €, inchangé')
    expect(preview.lockedNote).toBe(UPDATE_STOPS)
    expect(plain(UPDATE_STOPS)).toBe(
      'Une mise à jour est en cours : ton dernier relevé n’est pas corrigé. Corrige ce chiffre dans ta mise à jour.',
    )
  })

  test('an unreadable draft blocks every correction, past relevé or not', () => {
    const preview = correctionPreview(
      modelOf([old, middle, latest], { unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 1 } }),
      's0',
      'livret-a-line',
      { kind: 'amount', amount: 1_000_000 },
    )
    expect(preview).toEqual({ refused: 'unreadable', message: LOCKED_UNREADABLE })
  })

  test('the latest relevé, while an update runs, is refused with the fiche’s words', () => {
    const draft = loaded({ basedOn: 's2' } as unknown as UpdateDraft, 'd')
    const preview = correctionPreview(modelOf([old, middle, latest], { draft }), 's2', 'etf', {
      kind: 'units',
      units: 81,
      unitPrice: 250,
      averagePrice: 180,
    })
    expect(preview).toEqual({ refused: 'locked', message: LOCKED_UPDATE })
  })

  test('a known figure of a past relevé cannot be erased', () => {
    const preview = correctionPreview(modelOf([old, middle, latest]), 's0', 'etf', {
      kind: 'units',
      units: 80,
      unitPrice: 200,
      averagePrice: null,
    })
    expect(preview).toEqual({ refused: 'erase', message: ERASE_REFUSED })
    expect(ERASE_REFUSED).toBe('Un chiffre de ce jour-là ne peut pas être effacé.')
  })
})

// docs/superpowers/specs/2026-11-14-total-verse-design.md, planche 10D.
describe('the total paid in, on a relevé', () => {
  const withTotals = (s: Snapshot, paidTotals: Record<string, number>): Snapshot => ({ ...s, paidTotals })
  const draft = loaded({ basedOn: 's2' } as unknown as UpdateDraft, 'd')

  test('a row per account that takes one: its figure, or « à recopier »; none for a livret', () => {
    const model = modelOf([withTotals(old, { life: 1_500_000 }), middle, latest])
    const bourso = ready(statementView(model, 's0', TODAY)).banks.find((b) => b.name === 'BoursoBank')!
    const linxea = ready(statementView(model, 's0', TODAY)).banks.find((b) => b.name === 'Linxea')!
    // The PEA is followed in parts only, without a total: its average price does the work.
    expect(bourso.totals).toEqual([])
    expect(linxea.totals).toHaveLength(1)
    expect(plain(linxea.totals[0].label)).toBe('Total versé sur Assurance-vie')
    expect(plain(linxea.totals[0].figure)).toBe('15 000 €')
    expect(linxea.totals[0].href).toBe('/releve/s0/total/life')
    expect(ready(statementView(model, 's1', TODAY)).banks.find((b) => b.name === 'Linxea')!.totals[0].figure).toBeNull()
    expect(TOTAL_TO_COPY).toBe('à recopier')
  })

  test('a cost-basis account: with a line in amount, or a total already there', () => {
    // Gold is followed in amount.
    const home = ready(statementView(modelOf([old, middle, latest]), 's2', TODAY)).banks.find((b) => b.name === 'Chez toi')!
    expect(home.totals.map((t) => t.accountId)).toEqual(['gold'])
    const pea = ready(statementView(modelOf([withTotals(old, { pea: 1_000_000 }), middle, latest]), 's0', TODAY))
    expect(pea.banks.find((b) => b.name === 'BoursoBank')!.totals.map((t) => t.accountId)).toEqual(['pea'])
  })

  // As the update keeps the box when its base had a total (paidTotalAccounts).
  test('a cost-basis account in parts only, with a total at the relevé before: a row « à recopier », and its screen', () => {
    const model = modelOf([withTotals(old, { pea: 1_000_000 }), middle, latest])
    const bourso = ready(statementView(model, 's1', TODAY)).banks.find((b) => b.name === 'BoursoBank')!
    expect(bourso.totals).toEqual([
      { accountId: 'pea', label: 'Total versé sur PEA', figure: null, href: '/releve/s1/total/pea' },
    ])
    const view = ready(statementTotalView(model, 's1', 'pea', TODAY))
    expect(view.previous).toEqual({ total: 1_000_000, on: '2025-11-16' })
    expect(view.current).toBeNull()
    // Two relevés on, the chain is broken: no row.
    expect(ready(statementView(model, 's2', TODAY)).banks.find((b) => b.name === 'BoursoBank')!.totals).toEqual([])
  })

  test('the row’s figure is hidden with the amounts', () => {
    setAmountsHidden(true)
    try {
      const view = ready(statementView(modelOf([withTotals(old, { life: 1_500_000 }), middle, latest]), 's0', TODAY))
      expect(view.banks.find((b) => b.name === 'Linxea')!.totals[0].figure).toBe(HIDDEN_AMOUNT)
    } finally {
      setAmountsHidden(false)
    }
  })

  test('its screen: titled with the account, back to the relevé, the total of the relevé before recalled', () => {
    const model = modelOf([old, withTotals(middle, { life: 1_500_000 }), withTotals(latest, { gold: 100_000 })])
    const view = ready(statementTotalView(model, 's1', 'life', TODAY))
    expect(plain(view.title)).toBe('Total versé sur Assurance-vie')
    expect(view.back).toEqual({ href: '/releve/s1', label: ready(statementView(model, 's1', TODAY)).title })
    expect(view.current).toBe(1_500_000)
    // The relevé before has no total: nothing to recall.
    expect(view.previous).toBeNull()
    expect(view.account.id).toBe('life')
    expect(view.locked).toBeNull()
    const after = ready(statementTotalView(modelOf([withTotals(old, { life: 1_000_000 }), middle, latest]), 's1', 'life', TODAY))
    expect(after.previous).toEqual({ total: 1_000_000, on: '2025-11-16' })
    expect(after.current).toBeNull()
  })

  test('has nothing for an account without a row on that relevé', () => {
    const model = modelOf([old, middle, latest])
    expect(statementTotalView(model, 's0', 'livret-a', TODAY).kind).toBe('none')
    expect(statementTotalView(model, 's0', 'pea', TODAY).kind).toBe('none')
    expect(statementTotalView(model, 'nope', 'life', TODAY).kind).toBe('none')
  })

  test('the latest relevé is refused while an update runs, with its own sentence; a past one is not', () => {
    const running = modelOf([old, middle, latest], { draft })
    expect(ready(statementTotalView(running, 's2', 'gold', TODAY)).locked).toEqual({ kind: 'update-running', message: LOCKED_UPDATE_TOTAL })
    expect(LOCKED_UPDATE_TOTAL).toBe('Une mise à jour est en cours. Termine-la ou abandonne-la avant de corriger un total versé.')
    expect(ready(statementTotalView(running, 's0', 'life', TODAY)).locked).toBeNull()
    const unreadableDraft = modelOf([old, middle, latest], { unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 1 } })
    expect(ready(statementTotalView(unreadableDraft, 's0', 'life', TODAY)).locked).toEqual({ kind: 'unreadable', message: LOCKED_UNREADABLE })
  })

  test('the save, planned again on what is read then: that relevé only, refused when it moved meanwhile', () => {
    const snapshots = [old, middle, latest].map((value, i) => ({ id: `s${i}`, value }))
    const state = { profile: { id: 'p', value: profile }, snapshots }
    const planned = planPaidTotal(state, 's0', 'life', null, 1_000_000)
    if ('refused' in planned) throw new Error('refused')
    expect(planned.writes.map((w) => (w.kind === 'snapshot' ? w.id : 'profile'))).toEqual(['s0'])
    // Someone typed another total since the screen opened.
    expect(planPaidTotal(state, 's0', 'life', 900_000, 1_000_000)).toEqual({ refused: 'not-held' })
    expect(planPaidTotal({ ...state, updateRunning: true }, 's2', 'gold', null, 1)).toEqual({ refused: 'update-running' })
    expect(planPaidTotal(state, 'nope', 'life', null, 1)).toEqual({ refused: 'not-held' })
  })

  // Review Focus 2: correcting a past total changes the two neighbouring periods and nothing else.
  test('once saved, the period after it is split with it', () => {
    const after = withTotals(middle, { life: 1_500_000 })
    const before = splitChange(profile, old, after)
    const planned = planPaidTotal({ profile: { id: 'p', value: profile }, snapshots: [old, after, latest].map((value, i) => ({ id: `s${i}`, value })) }, 's0', 'life', null, 1_000_000)
    if ('refused' in planned) throw new Error('refused')
    const corrected = (planned.writes[0] as { value: Snapshot }).value
    const split = splitChange(profile, corrected, after)
    // 15 000 € paid in since the opening, 10 000 € at the relevé before: 5 000 € of effort, the rest markets.
    expect(split.effort - before.effort).toBe(500_000)
    expect(split.total).toBe(before.total)
  })
})
