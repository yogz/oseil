import { describe, expect, test } from 'vitest'
import { parseProfile, parseSnapshot } from '@/lib/model/documents'
import { computeSituation, MissingRateError } from '@/lib/model/situation'
import {
  addAccount,
  chooseWhere,
  completeFirstLaunch,
  finishStep,
  launchComplete,
  putLine,
  reconcile,
  removeLine,
  reopenStep,
  steps,
  withRate,
  type SetupDraft,
} from '../first-launch'

const TODAY = '2026-11-06'
const LATER = '2026-11-07'
let counter = 0
const id = () => `id-${++counter}`

const BOURSO = { catalogId: 'boursobank', name: 'BoursoBank' }

function started(): SetupDraft {
  return chooseWhere(null, { banks: [BOURSO], outside: ['my-home', 'gold'] }, TODAY, id)
}

function withLivretA(draft: SetupDraft) {
  return addAccount(draft, { establishmentId: draft.profile.establishments[0].id, type: 'livret-a', name: 'Livret A' }, id)
}

describe('chooseWhere and steps', () => {
  test('a bank, a home and gold make « Chez toi » after the bank in the profile', () => {
    const draft = started()
    expect(draft.profile.establishments.map((e) => e.name)).toEqual(['BoursoBank', 'Chez toi'])
    expect(draft.profile.establishments[1].kind).toBe('home')
    expect(draft.profile.firstLaunch).toEqual({ planned: ['my-home', 'gold'], finished: [], complete: false })
    expect(draft.snapshot).toEqual({ schema: 1, takenOn: TODAY, fx: {}, entries: [], contributions: {}, arrivals: {} })
  })

  test('steps: « Chez toi », then banks in the order chosen, then employee savings', () => {
    const draft = chooseWhere(
      null,
      { banks: [{ name: 'Ma banque' }, BOURSO], outside: ['my-home', 'employee-savings', 'gold'] },
      TODAY,
      id,
    )
    expect(steps(draft.profile).map((e) => e.name)).toEqual(['Chez toi', 'Ma banque', 'BoursoBank', 'Épargne salariale'])
    const savings = draft.profile.establishments.find((e) => e.name === 'Épargne salariale')
    expect(savings).toMatchObject({ kind: 'institution', catalogId: 'employee-savings' })
  })

  test('steps: « Chez toi », BoursoBank, LCL, Épargne salariale whatever the order they were created in', () => {
    const draft = chooseWhere(
      null,
      { banks: [BOURSO, { catalogId: 'lcl', name: 'LCL' }], outside: ['employee-savings', 'my-home'] },
      TODAY,
      id,
    )
    expect(steps(draft.profile).map((e) => e.name)).toEqual(['Chez toi', 'BoursoBank', 'LCL', 'Épargne salariale'])
  })

  test('no « Chez toi » when only employee savings is chosen outside', () => {
    const draft = chooseWhere(null, { banks: [], outside: ['employee-savings'] }, TODAY, id)
    expect(steps(draft.profile).map((e) => e.name)).toEqual(['Épargne salariale'])
  })

  test('choosing again keeps what stays, adds new, removes unchosen with their content', () => {
    let draft = started()
    const bourso = draft.profile.establishments[0]
    const home = draft.profile.establishments[1]
    const added = addAccount(draft, { establishmentId: bourso.id, type: 'livret-a', name: 'Livret A' }, id)
    draft = putLine(
      added.draft,
      { accountId: added.accountId, name: 'Livret A', entry: { kind: 'amount', amount: 1_000_000 } },
      TODAY,
      id,
    ).draft
    const homeAccount = addAccount(draft, { establishmentId: home.id, type: 'home', name: 'Maison' }, id)
    draft = putLine(
      homeAccount.draft,
      { accountId: homeAccount.accountId, name: 'Maison', entry: { kind: 'amount', amount: 20_000_000 } },
      TODAY,
      id,
    ).draft
    draft = finishStep(finishStep(draft, bourso.id), home.id)

    const next = chooseWhere(
      draft,
      { banks: [{ catalogId: 'fortuneo', name: 'Fortuneo' }], outside: ['my-home'] },
      LATER,
      id,
    )
    expect(next.profile.establishments.map((e) => e.name)).toEqual(['Fortuneo', 'Chez toi'])
    expect(next.profile.establishments[1].id).toBe(home.id)
    expect(next.profile.accounts.map((a) => a.name)).toEqual(['Maison'])
    expect(next.profile.lines.map((l) => l.name)).toEqual(['Maison'])
    expect(next.snapshot.entries).toHaveLength(1)
    expect(next.profile.firstLaunch?.finished).toEqual([home.id])
    expect(next.profile.firstLaunch?.planned).toEqual(['my-home'])
    expect(parseProfile(next.profile)).not.toBeNull()
  })

  test('a typed bank is recognised by name, a catalogue bank by catalogId', () => {
    const first = chooseWhere(null, { banks: [{ name: 'Ma banque' }, BOURSO], outside: [] }, TODAY, id)
    const again = chooseWhere(first, { banks: [{ name: 'Ma banque' }, BOURSO], outside: [] }, TODAY, id)
    expect(again.profile.establishments.map((e) => e.id)).toEqual(first.profile.establishments.map((e) => e.id))
  })

  test('does not mutate its input', () => {
    const draft = started()
    const copy = structuredClone(draft)
    chooseWhere(draft, { banks: [], outside: [] }, LATER, id)
    expect(draft).toEqual(copy)
  })
})

describe('addAccount and putLine', () => {
  test('a Livret A at 10 000 € gives an amount line and a dated entry', () => {
    const { draft, accountId } = withLivretA(started())
    const { draft: done, lineId } = putLine(
      draft,
      { accountId, name: 'Livret A', entry: { kind: 'amount', amount: 1_000_000 } },
      LATER,
      id,
    )
    expect(done.profile.lines).toEqual([{ id: lineId, accountId, name: 'Livret A', kind: 'amount', currency: 'EUR' }])
    expect(done.snapshot.entries).toEqual([{ lineId, kind: 'amount', amount: 1_000_000, seenOn: LATER }])
    expect(done.snapshot.takenOn).toBe(LATER)
    expect(parseProfile(done.profile)).not.toBeNull()
    expect(parseSnapshot(done.snapshot)).not.toBeNull()
  })

  test('an existing lineId updates the line and its entry', () => {
    const { draft, accountId } = withLivretA(started())
    const first = putLine(draft, { accountId, name: 'Livret A', entry: { kind: 'amount', amount: 100 } }, TODAY, id)
    const second = putLine(
      first.draft,
      { accountId, lineId: first.lineId, name: 'Mon livret', entry: { kind: 'amount', amount: 200 } },
      LATER,
      id,
    )
    expect(second.lineId).toBe(first.lineId)
    expect(second.draft.profile.lines).toHaveLength(1)
    expect(second.draft.profile.lines[0].name).toBe('Mon livret')
    expect(second.draft.snapshot.entries).toEqual([{ lineId: first.lineId, kind: 'amount', amount: 200, seenOn: LATER }])
  })

  test('editing a line keeps its chapter', () => {
    const { draft, accountId } = withLivretA(started())
    const first = putLine(draft, { accountId, name: 'Livret A', entry: { kind: 'amount', amount: 100 } }, TODAY, id)
    const grouped = {
      ...first.draft,
      profile: { ...first.draft.profile, lines: first.draft.profile.lines.map((l) => ({ ...l, group: 'bonds' as const })) },
    }
    const second = putLine(
      grouped,
      { accountId, lineId: first.lineId, name: 'Mon livret', entry: { kind: 'amount', amount: 200 } },
      LATER,
      id,
    )
    expect(second.draft.profile.lines[0]).toMatchObject({ name: 'Mon livret', group: 'bonds' })
  })

  test('a units line on a Livret A is refused', () => {
    const { draft, accountId } = withLivretA(started())
    expect(() =>
      putLine(
        draft,
        { accountId, name: 'Parts', entry: { kind: 'units', units: 1, unitPrice: 1, averagePrice: null } },
        TODAY,
        id,
      ),
    ).toThrow(/units/)
  })

  test('a line on an unknown account is refused', () => {
    expect(() =>
      putLine(started(), { accountId: 'nope', name: 'x', entry: { kind: 'amount', amount: 1 } }, TODAY, id),
    ).toThrow(/account/)
  })

  test('an « other » account needs a category on its line', () => {
    const draft = started()
    const { draft: d1, accountId } = addAccount(
      draft,
      { establishmentId: draft.profile.establishments[0].id, type: 'other', name: 'Autre' },
      id,
    )
    expect(() => putLine(d1, { accountId, name: 'x', entry: { kind: 'amount', amount: 1 } }, TODAY, id)).toThrow(
      /category/,
    )
    const ok = putLine(d1, { accountId, name: 'x', category: 'markets', entry: { kind: 'amount', amount: 1 } }, TODAY, id)
    expect(ok.draft.profile.lines[0].category).toBe('markets')
    expect(parseProfile(ok.draft.profile)).not.toBeNull()
  })

  test('addAccount keeps unlockOn, and refuses an unknown establishment', () => {
    const draft = started()
    const { draft: d1, accountId } = addAccount(
      draft,
      { establishmentId: draft.profile.establishments[1].id, type: 'loan', name: 'Prêt', unlockOn: '2030-01-01' },
      id,
    )
    expect(d1.profile.accounts.find((a) => a.id === accountId)?.unlockOn).toBe('2030-01-01')
    expect(() => addAccount(draft, { establishmentId: 'nope', type: 'loan', name: 'x' }, id)).toThrow(/establishment/)
  })
})

describe('removeLine, finishStep, completeFirstLaunch', () => {
  test('removing the last line of an account removes the account too', () => {
    const { draft, accountId } = withLivretA(started())
    const a = putLine(draft, { accountId, name: 'A', entry: { kind: 'amount', amount: 1 } }, TODAY, id)
    const b = putLine(a.draft, { accountId, name: 'B', entry: { kind: 'amount', amount: 2 } }, TODAY, id)
    const afterOne = removeLine(b.draft, a.lineId)
    expect(afterOne.profile.accounts).toHaveLength(1)
    expect(afterOne.snapshot.entries.map((e) => e.lineId)).toEqual([b.lineId])
    const afterAll = removeLine(afterOne, b.lineId)
    expect(afterAll.profile.accounts).toEqual([])
    expect(afterAll.profile.lines).toEqual([])
    expect(afterAll.snapshot.entries).toEqual([])
  })

  test('removing the last line of an account drops its contributions and its total paid in', () => {
    const { draft, accountId } = withLivretA(started())
    const a = putLine(draft, { accountId, name: 'A', entry: { kind: 'amount', amount: 1 } }, TODAY, id)
    const b = putLine(a.draft, { accountId, name: 'B', entry: { kind: 'amount', amount: 2 } }, TODAY, id)
    const withTotals: SetupDraft = {
      ...b.draft,
      snapshot: { ...b.draft.snapshot, contributions: { [accountId]: 5 }, paidTotals: { [accountId]: 10 } },
    }
    const afterOne = removeLine(withTotals, a.lineId)
    expect(afterOne.snapshot.paidTotals).toEqual({ [accountId]: 10 })
    const afterAll = removeLine(afterOne, b.lineId)
    expect(afterAll.snapshot.contributions).toEqual({})
    expect(afterAll.snapshot.paidTotals).toEqual({})
    // Resuming tidies a total left behind by an account gone from the profile.
    expect(reconcile({ profile: afterAll.profile, snapshot: afterOne.snapshot }).snapshot.paidTotals).toEqual({})
    expect(removeLine(b.draft, a.lineId).snapshot).not.toHaveProperty('paidTotals')
  })

  test('finishStep then completeFirstLaunch gives a profile parseProfile accepts', () => {
    let draft = started()
    for (const e of steps(draft.profile)) draft = finishStep(draft, e.id)
    draft = finishStep(draft, steps(draft.profile)[0].id) // twice: no duplicate
    expect(draft.profile.firstLaunch?.finished).toHaveLength(2)
    draft = completeFirstLaunch(draft)
    expect(draft.profile.firstLaunch?.complete).toBe(true)
    expect(parseProfile(draft.profile)).not.toBeNull()
  })
})

describe('reconcile and unticking', () => {
  test('a profile ahead of its snapshot is made consistent, and computeSituation accepts it', () => {
    const { draft, accountId } = withLivretA(started())
    const a = putLine(draft, { accountId, name: 'A', entry: { kind: 'amount', amount: 100 } }, TODAY, id)
    const b = putLine(a.draft, { accountId, name: 'B', entry: { kind: 'amount', amount: 50 } }, TODAY, id)
    const removed = removeLine(b.draft, a.lineId)
    // The profile save succeeded, the snapshot save failed.
    const stored = { profile: removed.profile, snapshot: b.draft.snapshot }
    expect(() => computeSituation(stored.profile, stored.snapshot)).toThrow()
    const resumed = reconcile(stored)
    expect(resumed.snapshot.entries.map((e) => e.lineId)).toEqual([b.lineId])
    expect(() => computeSituation(resumed.profile, resumed.snapshot)).not.toThrow()
  })

  test('a snapshot entry whose kind differs from its line is dropped', () => {
    const { draft, accountId } = withLivretA(started())
    const a = putLine(draft, { accountId, name: 'A', entry: { kind: 'amount', amount: 100 } }, TODAY, id)
    const stale = {
      profile: a.draft.profile,
      snapshot: {
        ...a.draft.snapshot,
        entries: [{ lineId: a.lineId, kind: 'units' as const, units: 1, unitPrice: 1, seenOn: TODAY }],
      },
    } as unknown as SetupDraft
    expect(reconcile(stale).snapshot.entries).toEqual([])
  })

  test('unticking Ma maison removes the home account while « Chez toi » stays for gold', () => {
    const draft = started()
    const home = draft.profile.establishments[1]
    const h = addAccount(draft, { establishmentId: home.id, type: 'home', name: 'Maison' }, id)
    const hl = putLine(h.draft, { accountId: h.accountId, name: 'Maison', entry: { kind: 'amount', amount: 9 } }, TODAY, id)
    const g = addAccount(hl.draft, { establishmentId: home.id, type: 'gold', name: 'Or' }, id)
    const gl = putLine(g.draft, { accountId: g.accountId, name: 'Or', entry: { kind: 'amount', amount: 5 } }, TODAY, id)
    const next = chooseWhere(gl.draft, { banks: [BOURSO], outside: ['gold'] }, TODAY, id)
    expect(next.profile.accounts.map((a) => a.name)).toEqual(['Or'])
    expect(next.snapshot.entries.map((e) => e.lineId)).toEqual([gl.lineId])
    expect(parseProfile(next.profile)).not.toBeNull()
  })

  test('a lot 3 draft planning « loan » is chosen again without losing its loan account', () => {
    const base = chooseWhere(null, { banks: [BOURSO], outside: ['my-home'] }, TODAY, id)
    const home = base.profile.establishments[1]
    const h = addAccount(base, { establishmentId: home.id, type: 'home', name: 'Maison' }, id)
    const hl = putLine(h.draft, { accountId: h.accountId, name: 'Maison', entry: { kind: 'amount', amount: 9 } }, TODAY, id)
    const l = addAccount(hl.draft, { establishmentId: home.id, type: 'loan', name: 'Prêt', financedLineId: hl.lineId }, id)
    const ll = putLine(l.draft, { accountId: l.accountId, name: 'Prêt', entry: { kind: 'amount', amount: 5 } }, TODAY, id)
    const legacy: SetupDraft = {
      ...ll.draft,
      profile: { ...ll.draft.profile, firstLaunch: { planned: ['my-home', 'loan'], finished: [], complete: false } },
    }
    expect(parseProfile(legacy.profile)).not.toBeNull()
    const next = chooseWhere(legacy, { banks: [BOURSO], outside: ['my-home'] }, TODAY, id)
    expect(next.profile.accounts.map((a) => a.name)).toEqual(['Maison', 'Prêt'])
    expect(next.profile.accounts.find((a) => a.type === 'loan')?.financedLineId).toBe(hl.lineId)
    expect(next.profile.lines.map((x) => x.name)).toEqual(['Maison', 'Prêt'])
    expect(next.profile.firstLaunch?.planned).toEqual(['my-home'])
    // Unticking « my-home » too removes the home, never the loan (the legacy id has no type to remove).
    const gold = chooseWhere(legacy, { banks: [BOURSO], outside: ['gold'] }, TODAY, id)
    expect(gold.profile.accounts.map((a) => a.name)).toEqual(['Prêt'])
  })

  test('a new choice never writes the legacy « loan » id; gold makes « Chez toi », employee savings alone does not', () => {
    expect(() => chooseWhere(null, { banks: [], outside: ['loan'] }, TODAY, id)).toThrow(/Unknown outside choice/)
    expect(chooseWhere(null, { banks: [], outside: ['gold'] }, TODAY, id).profile.establishments.map((e) => e.name)).toEqual(['Chez toi'])
    expect(
      chooseWhere(null, { banks: [], outside: ['employee-savings'] }, TODAY, id).profile.establishments.map((e) => e.name),
    ).toEqual(['Épargne salariale'])
  })

  test('home stays while the other home is still ticked; a never-planned type stays', () => {
    const draft = chooseWhere(null, { banks: [], outside: ['my-home', 'other-home'] }, TODAY, id)
    const home = draft.profile.establishments[0]
    const h = addAccount(draft, { establishmentId: home.id, type: 'home', name: 'Maison' }, id)
    const hl = putLine(h.draft, { accountId: h.accountId, name: 'Maison', entry: { kind: 'amount', amount: 9 } }, TODAY, id)
    const g = addAccount(hl.draft, { establishmentId: home.id, type: 'gold', name: 'Or' }, id)
    const gl = putLine(g.draft, { accountId: g.accountId, name: 'Or', entry: { kind: 'amount', amount: 3 } }, TODAY, id)
    const next = chooseWhere(gl.draft, { banks: [], outside: ['other-home'] }, TODAY, id)
    expect(next.profile.accounts.map((a) => a.name)).toEqual(['Maison', 'Or'])
  })

  test('refusals and dedupe', () => {
    const draft = started()
    expect(() => chooseWhere(draft, { banks: [], outside: ['nope'] }, TODAY, id)).toThrow(/outside/)
    expect(() => finishStep(draft, 'nope')).toThrow(/establishment/)
    expect(() =>
      addAccount(draft, { establishmentId: draft.profile.establishments[0].id, type: 'loan', name: 'x', financedLineId: 'nope' }, id),
    ).toThrow(/financed/)
    const twice = chooseWhere(null, { banks: [{ name: 'Ma banque' }, { name: 'Ma banque' }], outside: [] }, TODAY, id)
    expect(twice.profile.establishments).toHaveLength(1)
  })
})

describe('a loan kept in its bank when the home it finances goes away', () => {
  function loanInBank() {
    const base = chooseWhere(null, { banks: [BOURSO], outside: ['my-home', 'gold'] }, TODAY, id)
    const bank = base.profile.establishments[0]
    const home = base.profile.establishments.find((e) => e.name === 'Chez toi')!
    const h = addAccount(base, { establishmentId: home.id, type: 'home', name: 'Maison' }, id)
    const hl = putLine(h.draft, { accountId: h.accountId, name: 'Ma maison', entry: { kind: 'amount', amount: 9 } }, TODAY, id)
    const l = addAccount(hl.draft, { establishmentId: bank.id, type: 'loan', name: 'Prêt', financedLineId: hl.lineId }, id)
    const ll = putLine(l.draft, { accountId: l.accountId, name: 'Prêt', entry: { kind: 'amount', amount: 5 } }, TODAY, id)
    return { draft: ll.draft, bank, homeLineId: hl.lineId, loanAccountId: l.accountId, loanLineId: ll.lineId }
  }

  function expectLoanKept(next: SetupDraft, s: ReturnType<typeof loanInBank>) {
    const loan = next.profile.accounts.find((a) => a.id === s.loanAccountId)
    expect(loan?.establishmentId).toBe(s.bank.id)
    expect(loan && 'financedLineId' in loan).toBe(false)
    expect(next.profile.lines.some((x) => x.id === s.loanLineId && x.accountId === s.loanAccountId)).toBe(true)
    // saveProfile validates with parseProfile, so passing it is what saving needs.
    expect(parseProfile(next.profile)).not.toBeNull()
  }

  test('removing the house line', () => {
    const s = loanInBank()
    expectLoanKept(removeLine(s.draft, s.homeLineId), s)
  })

  test('unticking « Ma maison » while gold keeps « Chez toi »', () => {
    const s = loanInBank()
    const next = chooseWhere(s.draft, { banks: [BOURSO], outside: ['gold'] }, TODAY, id)
    expect(next.profile.establishments.map((e) => e.name)).toContain('Chez toi')
    expectLoanKept(next, s)
  })

  test('unticking every home item makes « Chez toi » disappear', () => {
    const s = loanInBank()
    const next = chooseWhere(s.draft, { banks: [BOURSO], outside: [] }, TODAY, id)
    expect(next.profile.establishments.map((e) => e.name)).not.toContain('Chez toi')
    expectLoanKept(next, s)
  })
})

describe('reopenStep', () => {
  test('a finished step becomes the current one again, the others stay finished', () => {
    let draft = started()
    const [home, bourso] = steps(draft.profile)
    draft = finishStep(finishStep(draft, bourso.id), home.id)
    const reopened = reopenStep(draft, bourso.id)
    expect(reopened.profile.firstLaunch?.finished).toEqual([home.id])
    expect(reopened.profile.accounts).toEqual(draft.profile.accounts)
    expect(reopened.snapshot).toEqual(draft.snapshot)
    expect(draft.profile.firstLaunch?.finished).toEqual([bourso.id, home.id]) // untouched
  })

  test('a step not finished is left as it is; an unknown one is refused', () => {
    const draft = started()
    expect(reopenStep(draft, draft.profile.establishments[0].id).profile.firstLaunch?.finished).toEqual([])
    expect(() => reopenStep(draft, 'nope')).toThrow(/establishment/)
  })
})

describe('choosing again after steps are finished', () => {
  function finishedAll(draft: SetupDraft) {
    for (const e of steps(draft.profile)) draft = finishStep(draft, e.id)
    return draft
  }

  test('a new item for « Chez toi » makes « Chez toi » a step to do again', () => {
    const draft = finishedAll(started())
    const [home, bourso] = steps(draft.profile)
    const next = chooseWhere(draft, { banks: [BOURSO], outside: ['my-home', 'gold', 'crypto'] }, TODAY, id)
    expect(next.profile.firstLaunch?.finished).toEqual([bourso.id])
    expect(steps(next.profile).map((e) => e.id)).toEqual([home.id, bourso.id])
  })

  test('the same items, or one fewer, leave « Chez toi » finished', () => {
    const draft = finishedAll(started())
    const finished = draft.profile.firstLaunch?.finished
    expect(chooseWhere(draft, { banks: [BOURSO], outside: ['my-home', 'gold'] }, TODAY, id).profile.firstLaunch?.finished).toEqual(finished)
    expect(chooseWhere(draft, { banks: [BOURSO], outside: ['my-home'] }, TODAY, id).profile.firstLaunch?.finished).toEqual(finished)
  })

  test('a new employee savings item is a new step, and finished banks stay finished', () => {
    const draft = finishedAll(started())
    const next = chooseWhere(draft, { banks: [BOURSO], outside: ['my-home', 'gold', 'employee-savings'] }, TODAY, id)
    expect(next.profile.firstLaunch?.finished).toEqual(draft.profile.firstLaunch?.finished)
    const savings = next.profile.establishments.find((e) => e.catalogId === 'employee-savings')!
    expect(next.profile.firstLaunch?.finished).not.toContain(savings.id)
  })

  test('a complete first launch stays complete; a new one starts not complete', () => {
    expect(started().profile.firstLaunch?.complete).toBe(false)
    const complete = completeFirstLaunch(finishedAll(started()))
    expect(chooseWhere(complete, { banks: [BOURSO], outside: ['my-home', 'gold'] }, TODAY, id).profile.firstLaunch?.complete).toBe(true)
    const halfway = started()
    expect(chooseWhere(halfway, { banks: [BOURSO], outside: ['my-home'] }, TODAY, id).profile.firstLaunch?.complete).toBe(false)
  })
})

describe('launchComplete', () => {
  test('no profile is not complete; a profile without a first launch is past it', () => {
    expect(launchComplete(null)).toBe(false)
    expect(launchComplete(started().profile)).toBe(false)
    expect(launchComplete(completeFirstLaunch(started()).profile)).toBe(true)
    const { firstLaunch: _removed, ...older } = started().profile
    void _removed
    expect(launchComplete(older)).toBe(true)
  })
})

describe('a line in another currency', () => {
  const setup = () => {
    const added = withLivretA(started())
    return { draft: added.draft, accountId: added.accountId }
  }
  const amount = { kind: 'amount', amount: 1000 } as const

  test('a new line is in euros by default', () => {
    const { draft, accountId } = setup()
    const put = putLine(draft, { accountId, name: 'A', entry: amount }, TODAY, id)
    expect(put.draft.profile.lines[0].currency).toBe('EUR')
  })

  test('a dollar line after withRate keeps USD, and a rewrite keeps it too', () => {
    const { draft, accountId } = setup()
    const first = putLine(withRate(draft, 'USD', 0.8957), { accountId, name: 'A', entry: amount, currency: 'USD' }, TODAY, id)
    expect(first.draft.profile.lines[0].currency).toBe('USD')
    expect(first.draft.snapshot.fx).toEqual({ USD: 0.8957 })
    const again = putLine(first.draft, { accountId, lineId: first.lineId, name: 'A', entry: amount }, TODAY, id)
    expect(again.draft.profile.lines[0].currency).toBe('USD')
    expect(again.draft.snapshot.fx).toEqual({ USD: 0.8957 })
  })

  // No snapshot holds it yet: during the first launch, a line may still change its currency.
  test('a dollar line rewritten in pounds during the first launch takes pounds', () => {
    const { draft, accountId } = setup()
    const first = putLine(withRate(draft, 'USD', 0.8957), { accountId, name: 'A', entry: amount, currency: 'USD' }, TODAY, id)
    const again = putLine(
      withRate(first.draft, 'GBP', 1.2),
      { accountId, lineId: first.lineId, name: 'A', entry: amount, currency: 'GBP' },
      TODAY,
      id,
    )
    expect(again.draft.profile.lines[0].currency).toBe('GBP')
  })

  test('a currency outside the catalog throws', () => {
    const { draft, accountId } = setup()
    expect(() => putLine(draft, { accountId, name: 'A', entry: amount, currency: 'JPY' }, TODAY, id)).toThrow()
    expect(() => putLine(draft, { accountId, name: 'A', entry: amount, currency: 'usd' }, TODAY, id)).toThrow()
  })

  test('a loan stays in euros', () => {
    const base = started()
    const bank = base.profile.establishments[0].id
    const loan = addAccount(withRate(base, 'USD', 0.9), { establishmentId: bank, type: 'loan', name: 'Prêt' }, id)
    expect(() =>
      putLine(loan.draft, { accountId: loan.accountId, name: 'Prêt', entry: amount, currency: 'USD' }, TODAY, id),
    ).toThrow()
  })

  test('the quote symbol: kept, kept on rewrite, removed by null, refused when malformed', () => {
    const { draft, accountId } = setup()
    const a = putLine(draft, { accountId, name: 'A', entry: amount, quoteSymbol: 'CW8.PA' }, TODAY, id)
    expect(a.draft.profile.lines[0].quoteSymbol).toBe('CW8.PA')
    const b = putLine(a.draft, { accountId, lineId: a.lineId, name: 'A', entry: amount }, TODAY, id)
    expect(b.draft.profile.lines[0].quoteSymbol).toBe('CW8.PA')
    const c = putLine(b.draft, { accountId, lineId: a.lineId, name: 'A', entry: amount, quoteSymbol: null }, TODAY, id)
    expect(c.draft.profile.lines[0].quoteSymbol).toBeUndefined()
    expect(() => putLine(draft, { accountId, name: 'A', entry: amount, quoteSymbol: 'CW8 PA' }, TODAY, id)).toThrow()
  })

  test('without a rate, putLine throws MissingRateError', () => {
    const { draft, accountId } = setup()
    expect(() => putLine(draft, { accountId, name: 'A', entry: amount, currency: 'USD' }, TODAY, id)).toThrow(MissingRateError)
  })

  test('withRate refuses a rate that is not a finite number above 0, and leaves euros alone', () => {
    const { draft } = setup()
    expect(() => withRate(draft, 'USD', 0)).toThrow()
    expect(() => withRate(draft, 'USD', NaN)).toThrow()
    expect(() => withRate(draft, 'USD', Infinity)).toThrow()
    expect(withRate(draft, 'EUR', 2)).toEqual(draft)
  })

  test('rewriting a dollar line without a new rate leaves the shared rate alone', () => {
    const { draft, accountId } = setup()
    const first = putLine(withRate(draft, 'USD', 0.8957), { accountId, name: 'A', entry: amount, currency: 'USD' }, TODAY, id)
    const again = putLine(first.draft, { accountId, lineId: first.lineId, name: 'B', entry: amount }, TODAY, id)
    expect(again.draft.snapshot.fx).toEqual({ USD: 0.8957 })
  })
})
