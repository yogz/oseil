import { describe, expect, test } from 'vitest'
import {
  DEFAULT_SETTINGS,
  parseGoalAllocation,
  parseProfile,
  parseSettings,
  parseSnapshot,
  parseUpdateDraft,
} from '../documents'
import { computeSituation } from '../situation'
import { amountEntry, exampleProfile, exampleSnapshot, unitsEntry } from './fixtures'

const clone = <T>(value: T): T => structuredClone(value)

describe('parseProfile', () => {
  test('accepts the example unchanged', () => {
    expect(parseProfile(clone(exampleProfile))).toEqual(exampleProfile)
  })

  test('refuses what is not a profile', () => {
    expect(parseProfile(null)).toBeNull()
    expect(parseProfile('profile')).toBeNull()
    expect(parseProfile({ ...clone(exampleProfile), schema: 2 })).toBeNull()

    const unknownType = clone(exampleProfile)
    ;(unknownType.accounts[0] as { type: string }).type = 'piggy-bank'
    expect(parseProfile(unknownType)).toBeNull()

    const orphanAccount = clone(exampleProfile)
    orphanAccount.lines[0].accountId = 'nowhere'
    expect(parseProfile(orphanAccount)).toBeNull()

    const orphanEstablishment = clone(exampleProfile)
    orphanEstablishment.accounts[0].establishmentId = 'nowhere'
    expect(parseProfile(orphanEstablishment)).toBeNull()

    const orphanLoan = clone(exampleProfile)
    orphanLoan.accounts[5].financedLineId = 'nowhere'
    expect(parseProfile(orphanLoan)).toBeNull()

    const lowercaseCurrency = clone(exampleProfile)
    lowercaseCurrency.lines[0].currency = 'usd'
    expect(parseProfile(lowercaseCurrency)).toBeNull()

    const emptyId = clone(exampleProfile)
    emptyId.lines[0].id = ''
    expect(parseProfile(emptyId)).toBeNull()

    const badDate = clone(exampleProfile)
    badDate.lines[0].closedOn = '2026-9-1'
    expect(parseProfile(badDate)).toBeNull()
  })
})

describe('parseProfile, slow accounts', () => {
  const withSlow = (slow: unknown) => {
    const profile = clone(exampleProfile)
    ;(profile.accounts[0] as { slow?: unknown }).slow = slow
    return profile
  }
  test('keeps slow: true, and reads an absent mark as quick', () => {
    expect(parseProfile(withSlow(true))!.accounts[0].slow).toBe(true)
    expect(parseProfile(clone(exampleProfile))!.accounts[0]).not.toHaveProperty('slow')
  })
  test('refuses anything but true', () => {
    for (const bad of [false, 'yes', 1, null]) expect(parseProfile(withSlow(bad))).toBeNull()
  })
})

describe('parseProfile, line rules', () => {
  test('refuses a kind the account type does not allow', () => {
    const profile = clone(exampleProfile)
    profile.lines[1] = { ...profile.lines[1], kind: 'units' } // livret-a
    expect(parseProfile(profile)).toBeNull()
  })

  test('refuses a line that would get no category, but not a loan', () => {
    const profile = clone(exampleProfile)
    profile.accounts.push({ id: 'misc', establishmentId: 'home', type: 'other', name: 'Divers' })
    profile.lines.push({ id: 'misc-line', accountId: 'misc', name: 'Divers', kind: 'amount', currency: 'EUR' })
    expect(parseProfile(profile)).toBeNull()
    profile.lines[profile.lines.length - 1].category = 'available'
    expect(parseProfile(profile)).not.toBeNull()
    expect(parseProfile(clone(exampleProfile))).not.toBeNull() // loan line without category
  })
})

describe('parseProfile, chapter of a line', () => {
  test('keeps a known chapter, refuses an unknown one, accepts none', () => {
    const kept = clone(exampleProfile)
    kept.lines[2] = { ...kept.lines[2], group: 'europe' }
    expect(parseProfile(kept)?.lines[2].group).toBe('europe')
    // Japan has its own chapter since 9 November 2026.
    kept.lines[2] = { ...kept.lines[2], group: 'japan' }
    expect(parseProfile(kept)?.lines[2].group).toBe('japan')

    const refused = clone(exampleProfile)
    refused.lines[2] = { ...refused.lines[2], group: 'asia' as never }
    expect(parseProfile(refused)).toBeNull()

    expect(parseProfile(clone(exampleProfile))?.lines[2].group).toBeUndefined()
  })
})

describe('parseProfile, first launch', () => {
  test('keeps a valid firstLaunch, rebuilt', () => {
    const profile = { ...clone(exampleProfile), firstLaunch: { planned: ['gold', 'loan'], finished: ['linxea'], complete: false } }
    expect(parseProfile(profile)).toEqual(profile)
    const extra = { ...clone(profile), firstLaunch: { ...profile.firstLaunch, junk: 1 } }
    expect(parseProfile(extra)?.firstLaunch).toEqual(profile.firstLaunch)
    expect(parseProfile(clone(exampleProfile))).not.toHaveProperty('firstLaunch')
  })

  test('a lot 3 profile planning « loan », with a loan inside « Chez toi », stays readable and nets the house', () => {
    const profile = { ...clone(exampleProfile), firstLaunch: { planned: ['my-home', 'loan'], finished: [], complete: false } }
    expect(parseProfile(profile)).toEqual(profile)
    const situation = computeSituation(parseProfile(profile)!, clone(exampleSnapshot))
    expect(situation.categories.find((c) => c.category === 'property')?.value).toBe(12_000_000)
  })

  test('refuses an unknown outside id, a missing establishment, or a malformed value', () => {
    const base = clone(exampleProfile)
    const bad: unknown[] = [
      { planned: ['castle'], finished: [], complete: false },
      { planned: ['bogus'], finished: [], complete: false },
      { planned: [], finished: ['nowhere'], complete: false },
      { planned: [], finished: [], complete: 'yes' },
      { planned: 'gold', finished: [], complete: false },
      { planned: [], finished: [] },
      null,
      'done',
    ]
    for (const firstLaunch of bad) expect(parseProfile({ ...base, firstLaunch }), JSON.stringify(firstLaunch)).toBeNull()
  })
})

describe('dates and cents', () => {
  test('refuses impossible dates and unsafe integers', () => {
    expect(parseSnapshot({ ...clone(exampleSnapshot), takenOn: '2026-02-30' })).toBeNull()
    expect(parseSnapshot({ ...clone(exampleSnapshot), takenOn: '2026-13-45' })).toBeNull()
    expect(parseSnapshot({ ...clone(exampleSnapshot), takenOn: '2028-02-29' })).not.toBeNull()
    expect(parseSnapshot({ ...clone(exampleSnapshot), contributions: { pea: 1e300 } })).toBeNull()
  })
})

describe('parseSnapshot', () => {
  test('accepts the example unchanged', () => {
    expect(parseSnapshot(clone(exampleSnapshot))).toEqual(exampleSnapshot)
  })

  test('refuses what is not a snapshot', () => {
    expect(parseSnapshot({ ...clone(exampleSnapshot), schema: 2 })).toBeNull()
    expect(parseSnapshot({ ...clone(exampleSnapshot), takenOn: '30/09/2026' })).toBeNull()

    const decimalAmount = clone(exampleSnapshot)
    decimalAmount.entries[0] = { lineId: 'current-line', kind: 'amount', amount: 12.5, seenOn: '2026-09-30' }
    expect(parseSnapshot(decimalAmount)).toBeNull()

    const negativeUnits = clone(exampleSnapshot)
    negativeUnits.entries[2] = {
      lineId: 'etf', kind: 'units', units: -1, unitPrice: 250, averagePrice: null, seenOn: '2026-09-30',
    }
    expect(parseSnapshot(negativeUnits)).toBeNull()

    const duplicate = clone(exampleSnapshot)
    duplicate.entries.push({ ...duplicate.entries[0] })
    expect(parseSnapshot(duplicate)).toBeNull()
  })

  test('checks the rates, the contributions and the arrivals', () => {
    expect(parseSnapshot({ ...clone(exampleSnapshot), fx: { USD: 0.9 } })).not.toBeNull()
    expect(parseSnapshot({ ...clone(exampleSnapshot), fx: { USD: 0 } })).toBeNull()
    expect(parseSnapshot({ ...clone(exampleSnapshot), fx: { USD: -1 } })).toBeNull()
    expect(parseSnapshot({ ...clone(exampleSnapshot), fx: { USD: Infinity } })).toBeNull()
    expect(parseSnapshot({ ...clone(exampleSnapshot), fx: { usd: 0.9 } })).toBeNull()
    expect(parseSnapshot({ ...clone(exampleSnapshot), contributions: { pea: 5000 } })).not.toBeNull()
    expect(parseSnapshot({ ...clone(exampleSnapshot), contributions: { pea: 50.5 } })).toBeNull()
    expect(parseSnapshot({ ...clone(exampleSnapshot), arrivals: { etf: 'opened' } })).not.toBeNull()
    expect(parseSnapshot({ ...clone(exampleSnapshot), arrivals: { etf: 'new' } })).toBeNull()
  })
})

describe('parseProfile, residence of a home', () => {
  const withResidence = (index: number, residence: unknown) => {
    const profile = clone(exampleProfile)
    ;(profile.accounts[index] as { residence?: unknown }).residence = residence
    return profile
  }
  const home = exampleProfile.accounts.findIndex((a) => a.type === 'home')
  const current = exampleProfile.accounts.findIndex((a) => a.type !== 'home')

  test('keeps each residence type on a home, and reads an absent one as it was', () => {
    for (const residence of ['main', 'secondary', 'rental']) {
      expect(parseProfile(withResidence(home, residence))!.accounts[home].residence).toBe(residence)
    }
    expect(parseProfile(clone(exampleProfile))!.accounts[home]).not.toHaveProperty('residence')
  })

  test('refuses an unknown type, and a residence on an account that is not a home', () => {
    for (const bad of ['holiday', '', null, 1]) expect(parseProfile(withResidence(home, bad))).toBeNull()
    expect(parseProfile(withResidence(current, 'rental'))).toBeNull()
    expect(parseProfile(withResidence(current, 'main'))).toBeNull()
  })
})

describe('parseGoalAllocation', () => {
  const goal = { schema: 1, validFrom: '2026-01-01', shares: { available: 15, secured: 35, markets: 45, gold: 5 } }

  test('reads a goal saved before the rental share with a rental of 0, and a five-key goal as it is', () => {
    expect(parseGoalAllocation(clone(goal))).toEqual({ ...goal, shares: { ...goal.shares, rental: 0 } })
    const five = { ...goal, shares: { available: 10, secured: 30, markets: 40, gold: 5, rental: 15 } }
    expect(parseGoalAllocation(clone(five))).toEqual(five)
  })

  test('still refuses a sum that is not 100, with or without the rental share', () => {
    expect(parseGoalAllocation({ ...goal, shares: { ...goal.shares, rental: 10 } })).toBeNull()
    expect(parseGoalAllocation({ ...goal, shares: { available: 10, secured: 30, markets: 40, gold: 5, rental: 10 } })).toBeNull()
    expect(parseGoalAllocation({ ...goal, shares: { available: 10, secured: 30, markets: 40, gold: 5, rental: -15 } })).toBeNull()
    expect(parseGoalAllocation({ ...goal, shares: { ...goal.shares, rental: 'none' } })).toBeNull()
  })

  // docs/superpowers/specs/2026-11-11-coussin-objectif-design.md: the available money in months.
  const months = {
    schema: 1,
    validFrom: '2026-11-11',
    shares: { available: 0, secured: 33, markets: 60, gold: 7, rental: 0 },
    cushionMonths: 4,
  }

  test('keeps the months of the cushion, with no share of available money', () => {
    expect(parseGoalAllocation(clone(months))).toEqual(months)
    expect(parseGoalAllocation({ ...months, cushionMonths: 1.5 })).toEqual({ ...months, cushionMonths: 1.5 })
  })

  test('refuses months that are not among the choices, or beside a share of available money', () => {
    for (const bad of [0, 25, 3.5, -4, '4', null]) {
      expect(parseGoalAllocation({ ...months, cushionMonths: bad })).toBeNull()
    }
    expect(parseGoalAllocation({ ...months, shares: { available: 10, secured: 23, markets: 60, gold: 7, rental: 0 } })).toBeNull()
  })

  test('a goal without months has no months at all', () => {
    expect(parseGoalAllocation(clone(goal))).not.toHaveProperty('cushionMonths')
  })

  test('accepts shares totalling 100 within a hundredth', () => {
    expect(parseGoalAllocation(clone(goal))).not.toBeNull()
    expect(
      parseGoalAllocation({ ...goal, shares: { available: 33.33, secured: 33.33, markets: 33.34, gold: 0 } }),
    ).not.toBeNull()
  })

  test('refuses a total of 99, a negative share, a missing share or a bad date', () => {
    expect(parseGoalAllocation({ ...goal, shares: { ...goal.shares, gold: 4 } })).toBeNull()
    const at = (total: number) => ({ ...goal, shares: { available: total, secured: 0, markets: 0, gold: 0 } })
    expect(parseGoalAllocation(at(99.99))).not.toBeNull()
    expect(parseGoalAllocation(at(100.01))).not.toBeNull()
    expect(parseGoalAllocation(at(99.98))).toBeNull()
    expect(
      parseGoalAllocation({ ...goal, shares: { available: 33.33, secured: 33.33, markets: 33.33, gold: 0 } }),
    ).not.toBeNull()
    expect(parseGoalAllocation({ ...goal, shares: { available: 110, secured: -10, markets: 0, gold: 0 } })).toBeNull()
    expect(parseGoalAllocation({ ...goal, shares: { available: 15, secured: 35, markets: 50 } })).toBeNull()
    expect(parseGoalAllocation({ ...goal, validFrom: 'soon' })).toBeNull()
    expect(parseGoalAllocation({ ...goal, schema: 2 })).toBeNull()
  })
})

describe('parseSettings', () => {
  test('defaults have no budget, euros, amounts shown', () => {
    expect(DEFAULT_SETTINGS).toEqual({ schema: 1, budget: null, display: 'euros', hideAmounts: false })
    expect(parseSettings(clone(DEFAULT_SETTINGS))).toEqual(DEFAULT_SETTINGS)
  })

  test('checks the budget, the display and the flag', () => {
    const budget = { basis: 'salary', monthly: 250000 }
    expect(parseSettings({ ...DEFAULT_SETTINGS, budget })).not.toBeNull()
    expect(parseSettings({ ...DEFAULT_SETTINGS, budget: { ...budget, monthly: 0 } })).toBeNull()
    expect(parseSettings({ ...DEFAULT_SETTINGS, budget: { ...budget, monthly: 10.5 } })).toBeNull()
    expect(parseSettings({ ...DEFAULT_SETTINGS, budget: { ...budget, basis: 'luck' } })).toBeNull()
    expect(parseSettings({ ...DEFAULT_SETTINGS, display: 'dollars' })).toBeNull()
    expect(parseSettings({ ...DEFAULT_SETTINGS, hideAmounts: 'yes' })).toBeNull()
    expect(parseSettings({ ...DEFAULT_SETTINGS, schema: 2 })).toBeNull()
  })
})

describe('parseUpdateDraft', () => {
  const fullDraft = () => ({
    schema: 1 as const,
    basedOn: 'snapshot-1',
    values: [amountEntry('livret-a-line', 13_000, '2026-11-07'), unitsEntry('etf', 110, 260, 205, '2026-11-07')],
    confirmed: ['current-line'],
    progress: { boursobank: 'done' as const, linxea: 'skipped' as const },
    contributions: { life: -200_000 },
    added: {
      accounts: [{ id: 'new-account', establishmentId: 'linxea', type: 'per' as const, name: 'PER' }],
      lines: [
        { id: 'new-line', accountId: 'new-account', name: 'Fonds euros', kind: 'amount' as const, currency: 'EUR' },
      ],
    },
    arrivals: { 'new-account': 'opened' as const },
    closed: ['gold-line'],
    takenOn: '2026-11-07' as string | null,
  })

  test('round-trips a full draft, and accepts a null date', () => {
    expect(parseUpdateDraft(clone(fullDraft()))).toEqual(fullDraft())
    expect(parseUpdateDraft({ ...fullDraft(), takenOn: null })).toEqual({ ...fullDraft(), takenOn: null })
  })

  test('refuses what is not a draft', () => {
    const bad: Array<[string, unknown]> = [
      ['schema 2', { ...fullDraft(), schema: 2 }],
      ['empty basedOn', { ...fullDraft(), basedOn: '' }],
      [
        'two values for a line',
        { ...fullDraft(), values: [amountEntry('etf', 1, '2026-11-07'), amountEntry('etf', 2, '2026-11-07')] },
      ],
      ['fractional cents', { ...fullDraft(), values: [{ ...amountEntry('etf', 1, '2026-11-07'), amount: 1.5 }] }],
      ['unknown step status', { ...fullDraft(), progress: { x: 'later' } }],
      ['fractional contribution', { ...fullDraft(), contributions: { life: 10.5 } }],
      ['unknown arrival', { ...fullDraft(), arrivals: { x: 'new' } }],
      ['impossible date', { ...fullDraft(), takenOn: '2026-02-30' }],
      [
        'lowercase currency',
        {
          ...fullDraft(),
          added: {
            accounts: [],
            lines: [{ id: 'l', accountId: 'a', name: 'x', kind: 'amount', currency: 'eur' }],
          },
        },
      ],
    ]
    for (const [label, value] of bad) expect(parseUpdateDraft(clone(value)), label).toBeNull()
    expect(parseUpdateDraft(null)).toBeNull()
    expect(parseUpdateDraft('draft')).toBeNull()
  })
})
