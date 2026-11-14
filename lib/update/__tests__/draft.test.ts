import { describe, expect, test } from 'vitest'
import { NO_MARKET } from '@/lib/market/live'
import { exampleProfile, exampleSnapshot, unitsEntry } from '@/lib/model/__tests__/fixtures'
import type { Account, Line, Profile, UpdateDraft } from '@/lib/model/types'
import {
  addEstablishment,
  asksPurchasePrice,
  withAddedEstablishments,
  confirmLine,
  currentEntry,
  hasChangesHere,
  isStale,
  linesOf,
  markStep,
  nothingChangedHere,
  restateValue,
  setTakenOn,
  setValue,
  skipTheRest,
  startDraft,
  tidyDraft,
  verifiedWords,
} from '../draft'

const TODAY = '2026-11-07'
const base = exampleSnapshot
const profile = exampleProfile
const fresh = () => startDraft('s1')

const lep: Account = { id: 'lep', establishmentId: 'boursobank', type: 'lep', name: 'LEP' }
const lepLine: Line = { id: 'lep-line', accountId: 'lep', name: 'LEP', kind: 'amount', currency: 'EUR' }
const etf2: Line = { id: 'etf-2', accountId: 'pea', name: 'ETF monde', kind: 'units', currency: 'EUR' }

// A draft that added a LEP (a new account) and a second fund to the existing PEA.
function withAdded(draft: UpdateDraft = fresh()): UpdateDraft {
  return {
    ...draft,
    values: [
      ...draft.values,
      { lineId: 'lep-line', kind: 'amount', amount: 200_000, seenOn: TODAY },
      { lineId: 'etf-2', kind: 'units', units: 10, unitPrice: 100, averagePrice: 90, seenOn: TODAY },
    ],
    added: { accounts: [...draft.added.accounts, lep], lines: [...draft.added.lines, lepLine, etf2] },
    arrivals: { ...draft.arrivals, lep: 'opened', 'etf-2': 'existing' },
  }
}

describe('skipTheRest (« Terminer ici »)', () => {
  test('every establishment with no status is skipped, the one given and the settled ones are left as they are', () => {
    const marked = markStep(markStep(fresh(), 'boursobank', 'done'), 'home', 'skipped')
    expect(skipTheRest(profile, marked, 'boursobank').progress).toEqual({
      boursobank: 'done',
      home: 'skipped',
      linxea: 'skipped',
    })
    const begun = markStep(fresh(), 'linxea', 'done')
    expect(skipTheRest(profile, begun, 'boursobank').progress).toEqual({
      linxea: 'done',
      home: 'skipped',
    })
  })
  test('does not touch the draft it was given', () => {
    const draft = fresh()
    skipTheRest(profile, draft, 'boursobank')
    expect(draft.progress).toEqual({})
  })
})

const ids = (draft: UpdateDraft, establishmentId: string) => linesOf(profile, draft, establishmentId).map((r) => r.line.id)

describe('startDraft and isStale', () => {
  test('a fresh draft holds nothing but the snapshot it starts from', () => {
    expect(startDraft('s1')).toEqual({
      schema: 1,
      basedOn: 's1',
      values: [],
      confirmed: [],
      progress: {},
      contributions: {},
      added: { accounts: [], lines: [] },
      arrivals: {},
      closed: [],
      takenOn: null,
    })
  })

  test('a draft is stale once a newer snapshot exists', () => {
    expect(isStale(startDraft('s1'), 's1')).toBe(false)
    expect(isStale(startDraft('s1'), 's2')).toBe(true)
  })
})

describe('linesOf', () => {
  test('lists the establishment’s lines in profile order', () => {
    expect(ids(fresh(), 'boursobank')).toEqual(['current-line', 'livret-a-line', 'etf'])
    expect(ids(fresh(), 'home')).toEqual(['house-line', 'mortgage-line', 'gold-line'])
    expect(ids(fresh(), 'linxea')).toEqual(['euro-fund', 'life-uc'])
  })

  test('gives each line its account', () => {
    const rows = linesOf(profile, fresh(), 'boursobank')
    expect(rows[2]).toEqual({ line: profile.lines[2], account: profile.accounts[2], added: false, closed: false })
  })

  test('a line closed in an earlier update is absent', () => {
    const closedBefore: Profile = {
      ...profile,
      lines: profile.lines.map((l) => (l.id === 'livret-a-line' ? { ...l, closedOn: '2026-09-30' } : l)),
    }
    expect(linesOf(closedBefore, fresh(), 'boursobank').map((r) => r.line.id)).toEqual(['current-line', 'etf'])
  })

  test('a line added to an existing account follows its lines; one in an added account comes last', () => {
    const rows = linesOf(profile, withAdded(), 'boursobank')
    expect(rows.map((r) => r.line.id)).toEqual(['current-line', 'livret-a-line', 'etf', 'etf-2', 'lep-line'])
    expect(rows[3]).toEqual({ line: etf2, account: profile.accounts[2], added: true, closed: false })
    expect(rows[4]).toEqual({ line: lepLine, account: lep, added: true, closed: false })
  })

  test('a line closed during this update stays, marked closed', () => {
    const rows = linesOf(profile, { ...fresh(), closed: ['gold-line'] }, 'home')
    expect(rows.map((r) => [r.line.id, r.closed])).toEqual([
      ['house-line', false],
      ['mortgage-line', false],
      ['gold-line', true],
    ])
  })
})

describe('setValue, confirmLine and currentEntry', () => {
  test('a new amount is kept, dated the day it is typed', () => {
    const draft = setValue(fresh(), base, 'livret-a-line', { kind: 'amount', amount: 1_300_000 }, TODAY, {})
    expect(draft.values).toEqual([{ lineId: 'livret-a-line', kind: 'amount', amount: 1_300_000, seenOn: TODAY }])
    expect(draft.confirmed).toEqual([])
    expect(currentEntry(base, draft, 'livret-a-line', NO_MARKET.prices)).toEqual({
      lineId: 'livret-a-line',
      kind: 'amount',
      amount: 1_300_000,
      seenOn: TODAY,
    })
  })

  test('without a typed value, the current entry is the base one', () => {
    expect(currentEntry(base, fresh(), 'livret-a-line', NO_MARKET.prices)).toEqual(base.entries[1])
    expect(currentEntry(base, fresh(), 'nope', NO_MARKET.prices)).toBeNull()
  })

  test('the base amount typed again is a confirmation, not a value', () => {
    const draft = setValue(fresh(), base, 'livret-a-line', { kind: 'amount', amount: 1_200_000 }, TODAY, {})
    expect(draft.values).toEqual([])
    expect(draft.confirmed).toEqual(['livret-a-line'])
  })

  test('the base amount typed after another one drops the other one', () => {
    const typed = setValue(fresh(), base, 'livret-a-line', { kind: 'amount', amount: 1_300_000 }, TODAY, {})
    const back = setValue(typed, base, 'livret-a-line', { kind: 'amount', amount: 1_200_000 }, TODAY, {})
    expect(back.values).toEqual([])
    expect(back.confirmed).toEqual(['livret-a-line'])
  })

  test('a value typed after a confirmation takes its place', () => {
    const confirmed = confirmLine(fresh(), 'livret-a-line')
    const typed = setValue(confirmed, base, 'livret-a-line', { kind: 'amount', amount: 1_300_000 }, TODAY, {})
    expect(typed.confirmed).toEqual([])
    expect(typed.values.map((e) => e.lineId)).toEqual(['livret-a-line'])
  })

  test('a second value replaces the first', () => {
    const first = setValue(fresh(), base, 'livret-a-line', { kind: 'amount', amount: 1_300_000 }, TODAY, {})
    const second = setValue(first, base, 'livret-a-line', { kind: 'amount', amount: 1_400_000 }, TODAY, {})
    expect(second.values).toEqual([{ lineId: 'livret-a-line', kind: 'amount', amount: 1_400_000, seenOn: TODAY }])
  })

  test('confirmLine after a typed value drops it', () => {
    const typed = setValue(fresh(), base, 'livret-a-line', { kind: 'amount', amount: 1_300_000 }, TODAY, {})
    const confirmed = confirmLine(typed, 'livret-a-line')
    expect(confirmed.values).toEqual([])
    expect(confirmed.confirmed).toEqual(['livret-a-line'])
    expect(currentEntry(base, confirmed, 'livret-a-line', NO_MARKET.prices)).toEqual(base.entries[1])
  })

  test('confirming twice keeps one confirmation', () => {
    expect(confirmLine(confirmLine(fresh(), 'etf'), 'etf').confirmed).toEqual(['etf'])
  })

  test('a new unit price is kept', () => {
    const draft = setValue(fresh(), base, 'etf', { kind: 'units', units: 100, unitPrice: 260, averagePrice: 200 }, TODAY, {})
    expect(draft.values).toEqual([
      { lineId: 'etf', kind: 'units', units: 100, unitPrice: 260, averagePrice: 200, seenOn: TODAY },
    ])
  })

  test('the same units, price and average price are a confirmation', () => {
    const draft = setValue(fresh(), base, 'etf', { kind: 'units', units: 100, unitPrice: 250, averagePrice: 200 }, TODAY, {})
    expect(draft.values).toEqual([])
    expect(draft.confirmed).toEqual(['etf'])
  })

  test('a changed average price alone is a value', () => {
    const draft = setValue(fresh(), base, 'etf', { kind: 'units', units: 100, unitPrice: 250, averagePrice: null }, TODAY, {})
    expect(draft.values.map((e) => e.lineId)).toEqual(['etf'])
  })

  test('a line without a base entry keeps whatever is typed', () => {
    const noEntry = { ...base, entries: base.entries.filter((e) => e.lineId !== 'gold-line') }
    const draft = setValue(fresh(), noEntry, 'gold-line', { kind: 'amount', amount: 0 }, TODAY, {})
    expect(draft.values).toEqual([{ lineId: 'gold-line', kind: 'amount', amount: 0, seenOn: TODAY }])
  })

  test('an added line is verified by being added: confirming it keeps its value', () => {
    const draft = confirmLine(withAdded(), 'lep-line')
    expect(draft.confirmed).toEqual([])
    expect(currentEntry(base, draft, 'lep-line', NO_MARKET.prices)).toEqual({ lineId: 'lep-line', kind: 'amount', amount: 200_000, seenOn: TODAY })
  })

  test('a closed line takes neither a value nor a confirmation', () => {
    const closed = { ...fresh(), closed: ['gold-line'] }
    expect(() => setValue(closed, base, 'gold-line', { kind: 'amount', amount: 100 }, TODAY, {})).toThrow(/closed/)
    expect(() => confirmLine(closed, 'gold-line')).toThrow(/closed/)
  })

  test('a value of another kind than the base entry is refused', () => {
    expect(() => setValue(fresh(), base, 'etf', { kind: 'amount', amount: 100 }, TODAY, {})).toThrow(/kind/)
    expect(() =>
      setValue(fresh(), base, 'livret-a-line', { kind: 'units', units: 1, unitPrice: 1, averagePrice: null }, TODAY, {}),
    ).toThrow(/kind/)
  })

  test('a value of another kind than an added line is refused', () => {
    expect(() => setValue(withAdded(), base, 'etf-2', { kind: 'amount', amount: 100 }, TODAY, {})).toThrow(/kind/)
    const ok = setValue(withAdded(), base, 'etf-2', { kind: 'units', units: 11, unitPrice: 100, averagePrice: 90 }, TODAY, {})
    expect(ok.values.find((e) => e.lineId === 'etf-2')).toMatchObject({ units: 11 })
  })
})

// Decision 7: a line attached to its price opens with today's price in the box.
describe('today’s price in the box', () => {
  const PRICES = { etf: 260 }
  const units = (unitPrice: number) => ({ kind: 'units', units: 100, unitPrice, averagePrice: 200 }) as const

  test('the box opens with today’s price, the rest of the base entry kept', () => {
    expect(currentEntry(base, fresh(), 'etf', PRICES)).toEqual(unitsEntry('etf', 100, 260, 200))
  })

  test('a typed value still wins over today’s price', () => {
    const typed = setValue(fresh(), base, 'etf', units(255), TODAY, PRICES)
    expect(currentEntry(base, typed, 'etf', PRICES)).toEqual({ ...unitsEntry('etf', 100, 255, 200), seenOn: TODAY })
  })

  test('a price for an amount line, or for no line, changes nothing', () => {
    expect(currentEntry(base, fresh(), 'livret-a-line', { 'livret-a-line': 3 })).toEqual(base.entries[1])
    expect(currentEntry(base, fresh(), 'nope', { nope: 3 })).toBeNull()
  })

  test('today’s price left as it is, typed again, confirms the line', () => {
    const draft = setValue(fresh(), base, 'etf', units(260), TODAY, PRICES)
    expect(draft.values).toEqual([])
    expect(draft.confirmed).toEqual(['etf'])
  })

  // « Inchangé » and the box left as it is mean the same thing: the box as it opened.
  test('typing back the price the box opened with is « Inchangé »', () => {
    expect(setValue(fresh(), base, 'etf', units(260), TODAY, PRICES)).toEqual(confirmLine(fresh(), 'etf'))
  })

  test('the base price typed over today’s price is a value, not a confirmation', () => {
    const draft = setValue(fresh(), base, 'etf', units(250), TODAY, PRICES)
    expect(draft.values).toEqual([{ ...unitsEntry('etf', 100, 250, 200), seenOn: TODAY }])
    expect(draft.confirmed).toEqual([])
  })

  test('a converted price keeps its four decimals in the box', () => {
    expect(currentEntry(base, fresh(), 'etf', { etf: 306.6458 })).toMatchObject({ unitPrice: 306.6458 })
  })

  // A box read without the prices would show the base one while the save takes today's:
  // the prices are never optional, so no caller can forget them. tsc checks this line.
  test('the box cannot be read without the prices', () => {
    // @ts-expect-error: the prices are required.
    expect(currentEntry(base, fresh(), 'etf')).toEqual(base.entries[2])
  })

  // F10: a value typed without the prices would take the base price for what the box opened
  // with: today's price typed back would be a value, not « inchangé ». tsc checks this line.
  test('a value cannot be set without the prices', () => {
    const typed = { kind: 'units' as const, units: 100, unitPrice: 260, averagePrice: 200 }
    // @ts-expect-error: the prices are required.
    expect(setValue(fresh(), base, 'etf', typed, TODAY).values).toHaveLength(1)
    expect(setValue(fresh(), base, 'etf', typed, TODAY, { etf: 260 }).confirmed).toEqual(['etf'])
  })
})

describe('restateValue', () => {
  // « Changer » on the house: the same estimate typed again is dated again (decision 3).
  test('the base value typed under « Changer » is kept as a value, not as a confirmation', () => {
    const draft = restateValue(fresh(), base, 'house-line', { kind: 'amount', amount: 30_000_000 }, TODAY)
    expect(draft.values).toEqual([{ lineId: 'house-line', kind: 'amount', amount: 30_000_000, seenOn: TODAY }])
    expect(draft.confirmed).toEqual([])
  })

  test('it takes the place of a confirmation, and of an earlier value', () => {
    const confirmed = confirmLine(fresh(), 'house-line')
    const restated = restateValue(confirmed, base, 'house-line', { kind: 'amount', amount: 30_000_000 }, TODAY)
    expect(restated.confirmed).toEqual([])
    const again = restateValue(restated, base, 'house-line', { kind: 'amount', amount: 32_000_000 }, TODAY)
    expect(again.values).toEqual([{ lineId: 'house-line', kind: 'amount', amount: 32_000_000, seenOn: TODAY }])
  })

  test('it refuses a closed line and another kind, like setValue', () => {
    const closed = { ...fresh(), closed: ['house-line'] }
    expect(() => restateValue(closed, base, 'house-line', { kind: 'amount', amount: 1 }, TODAY)).toThrow(/closed/)
    expect(() =>
      restateValue(fresh(), base, 'house-line', { kind: 'units', units: 1, unitPrice: 1, averagePrice: null }, TODAY),
    ).toThrow(/kind/)
  })
})

describe('markStep and setTakenOn', () => {
  test('markStep records an establishment’s status', () => {
    const done = markStep(fresh(), 'boursobank', 'done')
    expect(done.progress).toEqual({ boursobank: 'done' })
    expect(markStep(done, 'boursobank', 'skipped').progress).toEqual({ boursobank: 'skipped' })
  })

  test('setTakenOn records the chosen date', () => {
    expect(setTakenOn(fresh(), '2026-11-01').takenOn).toBe('2026-11-01')
  })
})

describe('hasChangesHere', () => {
  const here = (draft: UpdateDraft) => hasChangesHere(profile, draft, 'boursobank')

  test('nothing has changed in a fresh draft, nor after a confirmation', () => {
    expect(here(fresh())).toBe(false)
    expect(here(confirmLine(fresh(), 'etf'))).toBe(false)
  })

  test('a typed value is a change', () => {
    expect(here(setValue(fresh(), base, 'livret-a-line', { kind: 'amount', amount: 1_300_000 }, TODAY, {}))).toBe(true)
  })

  test('a contribution on one of its accounts is a change', () => {
    expect(here({ ...fresh(), contributions: { pea: 10_000 } })).toBe(true)
  })

  test('a typed 0 on one of its accounts is a change', () => {
    expect(here({ ...fresh(), contributions: { pea: 0 } })).toBe(true)
  })

  test('an added line is a change', () => {
    expect(here(withAdded())).toBe(true)
  })

  test('a closed line is a change', () => {
    expect(here({ ...fresh(), closed: ['etf'] })).toBe(true)
  })

  test('a change at Linxea leaves BoursoBank unchanged', () => {
    const atLinxea: UpdateDraft = {
      ...setValue(fresh(), base, 'euro-fund', { kind: 'amount', amount: 3_100_000 }, TODAY, {}),
      contributions: { life: 50_000 },
      closed: ['life-uc'],
    }
    expect(here(atLinxea)).toBe(false)
    expect(hasChangesHere(profile, atLinxea, 'linxea')).toBe(true)
  })
})

describe('nothingChangedHere', () => {
  test('confirms every line of the establishment and marks it done', () => {
    const draft = nothingChangedHere(profile, fresh(), 'boursobank')
    expect([...draft.confirmed].sort()).toEqual(['current-line', 'etf', 'livret-a-line'])
    expect(draft.progress).toEqual({ boursobank: 'done' })
    expect(draft.values).toEqual([])
  })

  test('never drops a value already typed there', () => {
    const typed = setValue(fresh(), base, 'livret-a-line', { kind: 'amount', amount: 1_300_000 }, TODAY, {})
    const draft = nothingChangedHere(profile, typed, 'boursobank')
    expect(draft.values).toEqual(typed.values)
    expect([...draft.confirmed].sort()).toEqual(['current-line', 'etf'])
  })

  test('leaves the other establishments alone', () => {
    const draft = nothingChangedHere(profile, fresh(), 'boursobank')
    expect(draft.confirmed).not.toContain('euro-fund')
  })

  test('does not confirm a closed line, nor an added one', () => {
    const draft = nothingChangedHere(profile, { ...withAdded(), closed: ['etf'] }, 'boursobank')
    expect([...draft.confirmed].sort()).toEqual(['current-line', 'livret-a-line'])
    expect(draft.closed).toEqual(['etf'])
  })
})

describe('verifiedWords', () => {
  const words = (draft: UpdateDraft, establishmentId = 'boursobank', p: Profile = profile) =>
    verifiedWords(p, draft, establishmentId)

  test('counts the lines confirmed, in the singular up to one', () => {
    expect(words(fresh())).toBe('0 ligne sur 3 vérifiée')
    expect(words(confirmLine(fresh(), 'etf'))).toBe('1 ligne sur 3 vérifiée')
  })

  test('in the plural from two', () => {
    const all = ['current-line', 'livret-a-line', 'etf'].reduce(confirmLine, fresh())
    expect(words(all)).toBe('3 lignes sur 3 vérifiées')
  })

  test('a typed value counts as verified', () => {
    expect(words(setValue(fresh(), base, 'etf', { kind: 'units', units: 1, unitPrice: 1, averagePrice: null }, TODAY, {}))).toBe(
      '1 ligne sur 3 vérifiée',
    )
  })

  test('an added line counts as verified', () => {
    expect(words(withAdded())).toBe('2 lignes sur 5 vérifiées')
  })

  test('a closed line is not counted', () => {
    expect(words({ ...confirmLine(fresh(), 'etf'), closed: ['current-line'] })).toBe('1 ligne sur 2 vérifiée')
  })

  // Decision 2: every line of a finished bank is dated as seen, so the counter says so too.
  test('a bank marked done has all its open lines verified', () => {
    expect(words(markStep(fresh(), 'boursobank', 'done'))).toBe('3 lignes sur 3 vérifiées')
    expect(words(markStep({ ...fresh(), closed: ['etf'] }, 'boursobank', 'done'))).toBe('2 lignes sur 2 vérifiées')
  })

  test('a bank skipped for this time is not verified', () => {
    expect(words(markStep(fresh(), 'boursobank', 'skipped'))).toBe('0 ligne sur 3 vérifiée')
  })

  test('an establishment without any line gives null', () => {
    const withEmpty: Profile = {
      ...profile,
      establishments: [...profile.establishments, { id: 'empty', name: 'Vide', kind: 'institution' }],
    }
    expect(words(fresh(), 'empty', withEmpty)).toBeNull()
  })
})

describe('tidyDraft', () => {
  // The profile changed after the draft was written (another device, a correction): some ids are gone.
  const orphaned: UpdateDraft = {
    ...withAdded(),
    values: [
      ...withAdded().values,
      { lineId: 'livret-a-line', kind: 'amount', amount: 1_300_000, seenOn: TODAY },
      { lineId: 'gone-line', kind: 'amount', amount: 100, seenOn: TODAY },
      { lineId: 'gone-added', kind: 'amount', amount: 100, seenOn: TODAY },
    ],
    confirmed: ['etf', 'gone-line', 'etf'],
    closed: ['gold-line', 'gone-line', 'gold-line'],
    contributions: { life: 10_000, 'gone-account': 5_000 },
    progress: { boursobank: 'done', 'gone-bank': 'skipped' },
    added: {
      accounts: [lep, { id: 'lost', establishmentId: 'gone-bank', type: 'lep', name: 'LEP perdu' }],
      lines: [
        lepLine,
        etf2,
        { id: 'gone-added', accountId: 'gone-account', name: 'x', kind: 'amount', currency: 'EUR' },
        { id: 'lost-line', accountId: 'lost', name: 'y', kind: 'amount', currency: 'EUR' },
      ],
    },
    arrivals: { lep: 'opened', 'etf-2': 'existing', lost: 'opened', 'gone-added': 'opened' },
  }

  test('a draft that matches the profile is kept as it is', () => {
    const draft = withAdded(confirmLine(fresh(), 'etf'))
    expect(tidyDraft(profile, draft)).toEqual(draft)
  })

  test('drops values, confirmations and closings of lines the profile no longer has', () => {
    const tidy = tidyDraft(profile, orphaned)
    expect(tidy.values.map((e) => e.lineId)).toEqual(['lep-line', 'etf-2', 'livret-a-line'])
    expect(tidy.confirmed).toEqual(['etf'])
    expect(tidy.closed).toEqual(['gold-line'])
  })

  test('drops added accounts of an unknown establishment, and added lines of an unknown account', () => {
    const tidy = tidyDraft(profile, orphaned)
    expect(tidy.added.accounts).toEqual([lep])
    expect(tidy.added.lines).toEqual([lepLine, etf2])
    expect(tidy.arrivals).toEqual({ lep: 'opened', 'etf-2': 'existing' })
  })

  test('drops contributions of unknown accounts and progress of unknown establishments', () => {
    const tidy = tidyDraft(profile, orphaned)
    expect(tidy.contributions).toEqual({ life: 10_000 })
    expect(tidy.progress).toEqual({ boursobank: 'done' })
  })

  test('a line closed in the profile since keeps no value, confirmation or closing', () => {
    const since: Profile = {
      ...profile,
      lines: profile.lines.map((l) => (l.id === 'etf' || l.id === 'gold-line' ? { ...l, closedOn: '2026-10-15' } : l)),
    }
    const draft = { ...setValue(fresh(), base, 'etf', { kind: 'units', units: 1, unitPrice: 1, averagePrice: null }, TODAY, {}), confirmed: ['etf'], closed: ['gold-line'] }
    const tidy = tidyDraft(since, draft)
    expect(tidy.values).toEqual([])
    expect(tidy.confirmed).toEqual([])
    expect(tidy.closed).toEqual([])
  })

  test('a value of another kind than its line is dropped', () => {
    const draft = { ...fresh(), values: [{ lineId: 'etf', kind: 'amount' as const, amount: 100, seenOn: TODAY }] }
    expect(tidyDraft(profile, draft).values).toEqual([])
  })

  test('values and confirmations never share a line, and a closed line keeps neither', () => {
    const draft: UpdateDraft = {
      ...setValue(fresh(), base, 'livret-a-line', { kind: 'amount', amount: 1_300_000 }, TODAY, {}),
      confirmed: ['livret-a-line', 'gold-line'],
      closed: ['gold-line'],
    }
    const tidy = tidyDraft(profile, { ...draft, values: [...draft.values, { lineId: 'gold-line', kind: 'amount', amount: 1, seenOn: TODAY }] })
    expect(tidy.values.map((e) => e.lineId)).toEqual(['livret-a-line'])
    expect(tidy.confirmed).toEqual([])
    expect(tidy.closed).toEqual(['gold-line'])
  })

  // The profile was saved, the snapshot was not, and the page was reloaded: the
  // additions are already in the profile and must not be added a second time.
  test('an addition the profile already holds leaves `added`, keeping its value and its arrival', () => {
    const halfSaved: Profile = {
      ...profile,
      accounts: [...profile.accounts, { id: 'new-1', establishmentId: 'boursobank', type: 'lep', name: 'LEP' }],
      lines: [...profile.lines, { id: 'new-2', accountId: 'new-1', name: 'LEP', kind: 'amount', currency: 'EUR' }],
    }
    const draft: UpdateDraft = {
      ...fresh(),
      values: [{ lineId: 'new-2', kind: 'amount', amount: 200_000, seenOn: TODAY }],
      contributions: { 'new-1': 5_000 },
      added: {
        accounts: [{ id: 'new-1', establishmentId: 'boursobank', type: 'lep', name: 'LEP' }],
        lines: [{ id: 'new-2', accountId: 'new-1', name: 'LEP', kind: 'amount', currency: 'EUR' }],
      },
      arrivals: { 'new-1': 'opened' },
    }
    const tidy = tidyDraft(halfSaved, draft)
    expect(tidy.added).toEqual({ accounts: [], lines: [] })
    expect(linesOf(halfSaved, tidy, 'boursobank').map((r) => r.line.id)).toEqual([
      'current-line',
      'livret-a-line',
      'etf',
      'new-2',
    ])
    expect(tidy.values).toEqual(draft.values)
    expect(tidy.contributions).toEqual({ 'new-1': 5_000 })
    expect(tidy.arrivals).toEqual({ 'new-1': 'opened' })
  })

  // Tidied on one load, saved, then tidied again on the next: `added` is already empty
  // the second time, and the arrival must survive it.
  test('tidying a second time changes nothing, and keeps the arrivals of additions already saved', () => {
    const halfSaved: Profile = { ...profile, accounts: [...profile.accounts, lep], lines: [...profile.lines, lepLine, etf2] }
    const once = tidyDraft(halfSaved, withAdded())
    expect(once.arrivals).toEqual({ lep: 'opened', 'etf-2': 'existing' })
    expect(tidyDraft(halfSaved, once)).toEqual(once)
  })

  test('a line added to an existing account and already in the profile keeps its arrival', () => {
    const halfSaved: Profile = { ...profile, lines: [...profile.lines, etf2] }
    const tidy = tidyDraft(halfSaved, withAdded())
    expect(tidy.added).toEqual({ accounts: [lep], lines: [lepLine] })
    expect(tidy.arrivals).toEqual({ lep: 'opened', 'etf-2': 'existing' })
    expect(linesOf(halfSaved, tidy, 'boursobank').map((r) => r.line.id)).toEqual([
      'current-line',
      'livret-a-line',
      'etf',
      'etf-2',
      'lep-line',
    ])
  })

  // Decision 4: a line added then closed in the same update disappears. closeLine removes it;
  // a draft written elsewhere may still list it under `closed`.
  test('an added line listed as closed is dropped, with its value and its arrival', () => {
    const loan: Account = { id: 'new-loan', establishmentId: 'boursobank', type: 'loan', name: 'Prêt', financedLineId: 'etf-2' }
    const added = withAdded()
    const draft: UpdateDraft = {
      ...added,
      added: { accounts: [...added.added.accounts, loan], lines: added.added.lines },
      closed: ['etf-2', 'gold-line'],
    }
    const tidy = tidyDraft(profile, draft)
    expect(tidy.added.lines).toEqual([lepLine])
    expect(tidy.values.map((e) => e.lineId)).toEqual(['lep-line'])
    expect(tidy.arrivals).toEqual({ lep: 'opened' })
    expect(tidy.closed).toEqual(['gold-line'])
    expect(tidy.added.accounts).toEqual([lep, { id: 'new-loan', establishmentId: 'boursobank', type: 'loan', name: 'Prêt' }])
  })

  test('an added loan financing a line that is gone loses its financedLineId', () => {
    const loan: Account = { id: 'new-loan', establishmentId: 'boursobank', type: 'loan', name: 'Prêt', financedLineId: 'gone-line' }
    const kept: Account = { id: 'kept-loan', establishmentId: 'boursobank', type: 'loan', name: 'Prêt 2', financedLineId: 'house-line' }
    const draft = { ...fresh(), added: { accounts: [loan, kept], lines: [] } }
    expect(tidyDraft(profile, draft).added.accounts).toEqual([
      { id: 'new-loan', establishmentId: 'boursobank', type: 'loan', name: 'Prêt' },
      kept,
    ])
  })
})

describe('no input is changed', () => {
  const typed = withAdded(setValue(fresh(), base, 'livret-a-line', { kind: 'amount', amount: 1_300_000 }, TODAY, {}))
  const calls: Array<[string, (draft: UpdateDraft) => unknown]> = [
    ['linesOf', (d) => linesOf(profile, d, 'boursobank')],
    ['currentEntry', (d) => currentEntry(base, d, 'livret-a-line', NO_MARKET.prices)],
    ['setValue', (d) => setValue(d, base, 'etf', { kind: 'units', units: 1, unitPrice: 2, averagePrice: null }, TODAY, {})],
    ['setValue (same as base)', (d) => setValue(d, base, 'livret-a-line', { kind: 'amount', amount: 1_200_000 }, TODAY, {})],
    ['currentEntry (today’s price)', (d) => currentEntry(base, d, 'etf', { etf: 260 })],
    [
      'setValue (today’s price)',
      (d) => setValue(d, base, 'etf', { kind: 'units', units: 100, unitPrice: 260, averagePrice: 200 }, TODAY, { etf: 260 }),
    ],
    ['restateValue', (d) => restateValue(d, base, 'house-line', { kind: 'amount', amount: 30_000_000 }, TODAY)],
    ['confirmLine', (d) => confirmLine(d, 'livret-a-line')],
    ['markStep', (d) => markStep(d, 'boursobank', 'done')],
    ['hasChangesHere', (d) => hasChangesHere(profile, d, 'boursobank')],
    ['nothingChangedHere', (d) => nothingChangedHere(profile, d, 'boursobank')],
    ['verifiedWords', (d) => verifiedWords(profile, d, 'boursobank')],
    ['setTakenOn', (d) => setTakenOn(d, TODAY)],
    ['tidyDraft', (d) => tidyDraft(profile, d)],
  ]

  test.each(calls)('%s leaves the draft, the profile and the snapshot as they were', (_name, call) => {
    const draft = structuredClone(typed)
    const before = structuredClone({ draft, profile, base })
    const result = call(draft)
    expect({ draft, profile, base }).toEqual(before)
    if (typeof result === 'object' && result !== null && 'schema' in result) expect(result).not.toBe(draft)
  })
})

// A bank or « Chez toi » added during the update (Nicolas, 10 November 2026): it lives in the
// draft until the save, like an added account, and the update's screens see it in the profile.
describe('an establishment added during the update', () => {
  const coinbase = { name: 'Coinbase', catalogId: 'coinbase' }
  const ids = () => 'cb'
  const noHome: Profile = { ...profile, establishments: profile.establishments.filter((e) => e.kind !== 'home') }

  test('is kept in the draft, and shown with the profile', () => {
    const draft = addEstablishment(profile, fresh(), coinbase, ids)
    expect(draft.added.establishments).toEqual([{ id: 'cb', name: 'Coinbase', kind: 'institution', catalogId: 'coinbase' }])
    expect(withAddedEstablishments(profile, draft).establishments.map((e) => e.id)).toEqual([
      ...profile.establishments.map((e) => e.id),
      'cb',
    ])
  })

  test('the profile is the same object while nothing is added, and stays the same for the same draft', () => {
    expect(withAddedEstablishments(profile, fresh())).toBe(profile)
    const draft = addEstablishment(profile, fresh(), coinbase, ids)
    expect(withAddedEstablishments(profile, draft)).toBe(withAddedEstablishments(profile, draft))
  })

  test('is refused when the bank is already there, in the profile or in the draft', () => {
    expect(() => addEstablishment(profile, fresh(), { name: 'BoursoBank', catalogId: 'boursobank' }, ids)).toThrow()
    const once = addEstablishment(profile, fresh(), coinbase, ids)
    expect(() => addEstablishment(profile, once, coinbase, () => 'cb2')).toThrow()
  })

  test('« Chez toi », only when the profile has none', () => {
    expect(() => addEstablishment(profile, fresh(), 'home', ids)).toThrow()
    const draft = addEstablishment(noHome, fresh(), 'home', () => 'h')
    expect(draft.added.establishments).toEqual([{ id: 'h', name: 'Chez toi', kind: 'home' }])
    expect(() => addEstablishment(noHome, draft, 'home', () => 'h2')).toThrow()
  })

  test('tidying keeps it, with the accounts, values and progress that point at it', () => {
    const cbAccount: Account = { id: 'cb-acc', establishmentId: 'cb', type: 'crypto', name: 'Crypto' }
    const cbLine: Line = { id: 'cb-line', accountId: 'cb-acc', name: 'Bitcoin', kind: 'amount', currency: 'EUR' }
    const added = addEstablishment(profile, fresh(), coinbase, ids)
    const draft: UpdateDraft = {
      ...added,
      added: { ...added.added, accounts: [cbAccount], lines: [cbLine] },
      values: [{ lineId: 'cb-line', kind: 'amount', amount: 50_000, seenOn: TODAY }],
      progress: { cb: 'done' },
      contributions: { 'cb-acc': 50_000 },
      arrivals: { 'cb-acc': 'opened' },
    }
    expect(tidyDraft(profile, draft)).toEqual(draft)
  })

  test('tidying drops it once the profile holds it (saved, then the snapshot was not)', () => {
    const draft = addEstablishment(profile, fresh(), coinbase, ids)
    const saved = withAddedEstablishments(profile, draft)
    const tidy = tidyDraft(saved, { ...draft, progress: { cb: 'done' } })
    expect(tidy.added.establishments ?? []).toEqual([])
    expect(tidy.progress).toEqual({ cb: 'done' })
  })
})

describe('asksPurchasePrice: the parts box asks for the purchase price the base snapshot lacks', () => {
  const withEtf = (entry: ReturnType<typeof unitsEntry> | null) => ({
    ...base,
    entries: base.entries.filter((e) => e.lineId !== 'etf').concat(entry ? [entry] : []),
  })
  const answered: Profile = { ...profile, lines: profile.lines.map((l) => (l.id === 'etf' ? { ...l, purchaseUnknown: true } : l)) }

  test('no average price, or a cost of zero: asked', () => {
    expect(asksPurchasePrice(profile, withEtf(unitsEntry('etf', 100, 250, null)), 'etf')).toBe(true)
    expect(asksPurchasePrice(profile, withEtf(unitsEntry('etf', 100, 250, 0)), 'etf')).toBe(true)
    expect(asksPurchasePrice(profile, withEtf(unitsEntry('etf', 0, 250, 200)), 'etf')).toBe(true)
  })

  test('a known price, « Je ne sais pas » answered, or nothing in the base: not asked', () => {
    expect(asksPurchasePrice(profile, base, 'etf')).toBe(false)
    expect(asksPurchasePrice(answered, withEtf(unitsEntry('etf', 100, 250, null)), 'etf')).toBe(false)
    expect(asksPurchasePrice(profile, withEtf(null), 'etf')).toBe(false)
  })

  test('the rule of the purchase gap: outside « Placements en bourse », gold in units, not asked', () => {
    const gold: Profile = { ...profile, lines: [...profile.lines, { id: 'bar', accountId: 'gold', name: 'Lingot', kind: 'units', currency: 'EUR' }] }
    const snapshot = { ...base, entries: [...base.entries, unitsEntry('bar', 1, 2_000, null)] }
    expect(profile.accounts.some((a) => a.id === 'gold' && a.type === 'gold')).toBe(true)
    expect(asksPurchasePrice(gold, snapshot, 'bar')).toBe(false)
  })
})
