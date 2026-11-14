import { afterEach, describe, expect, test } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import { setAmountsHidden } from '@/lib/format'
import type { Market } from '@/lib/market/types'
import { account, amountEntry, line, snapshotOf, unitsEntry } from '@/lib/model/__tests__/fixtures'
import type { Account, Establishment, Line, Profile, Settings, Snapshot } from '@/lib/model/types'
import { findView, type FindRow, type FindView } from '@/lib/screens/find'

const TODAY = '2026-11-14'
// Intl writes narrow no-break spaces; the tests read plain ones.
const plain = (text: string | null | undefined) => text?.replace(/[  ]/g, ' ') ?? ''
const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const at = (establishmentId: string, a: Account): Account => ({ ...a, establishmentId })

const BOURSO: Establishment = { id: 'bourso', name: 'BoursoBank', kind: 'institution' }
const AMUNDI: Establishment = { id: 'amundi', name: 'Amundi', kind: 'institution' }
const SG: Establishment = { id: 'sg', name: 'Société Générale', kind: 'institution' }

const ACCOUNTS = [
  at('bourso', account('pea', 'pea', { name: 'PEA' })),
  at('amundi', account('pee', 'employee-savings', { name: 'PEE' })),
  at('sg', account('cur', 'current', { name: 'Compte courant' })),
  at('sg', account('livret', 'livret-a', { name: 'Livret A' })),
]
const LINES: Line[] = [
  line('o1', 'pea', { kind: 'units', name: 'OVHCLOUD', quoteSymbol: 'OVH.PA' }),
  line('o2', 'pee', { kind: 'units', name: 'Actions OVHcloud', quoteSymbol: 'OVH.PA' }),
  line('al', 'pea', { kind: 'units', name: 'Air Liquide', quoteSymbol: 'AI.PA' }),
  line('te', 'pea', { kind: 'units', name: 'Total Énergies' }),
  line('or', 'pea', { kind: 'units', name: 'Orange', closedOn: '2026-05-01' }),
  line('cur-line', 'cur', { name: 'Compte courant' }),
  line('la-line', 'livret', { name: 'Livret A' }),
]
// 200 + 100 + 150 + 100 + 1 000 + 3 000 = 4 550 €.
const LATEST: Snapshot = snapshotOf([
  unitsEntry('o1', 10, 20, 10),
  unitsEntry('o2', 5, 20, 16),
  unitsEntry('al', 1, 150, null),
  unitsEntry('te', 2, 50, 40),
  amountEntry('cur-line', 1_000),
  amountEntry('la-line', 3_000),
])
const OLDER: Snapshot = { ...snapshotOf([amountEntry('cur-line', 900), amountEntry('la-line', 2_000)]), takenOn: '2025-11-30' }

function modelOf(parts: Partial<{ establishments: Establishment[]; accounts: Account[]; lines: Line[]; snapshots: Snapshot[]; settings: Settings }> = {}): Model {
  const profile: Profile = {
    schema: 1,
    establishments: parts.establishments ?? [BOURSO, AMUNDI, SG],
    accounts: parts.accounts ?? ACCOUNTS,
    lines: parts.lines ?? LINES,
  }
  const snapshots = parts.snapshots ?? [OLDER, LATEST]
  return {
    profile: loaded(profile),
    snapshots: snapshots.map((s, i) => loaded(s, i === snapshots.length - 1 ? 's-latest' : `s-${s.takenOn}`)),
    goals: [],
    settings: parts.settings ? loaded(parts.settings) : null,
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
  }
}

const MODEL = modelOf()

function results(query: string, model = MODEL, market: Market | null = null): Extract<FindView, { kind: 'results' }> {
  const view = findView(model, market, query, TODAY)
  if (view.kind !== 'results') throw new Error(`expected results, got ${view.kind}`)
  return view
}
const group = (view: Extract<FindView, { kind: 'results' }>, title: string) => view.groups.find((g) => g.title === title)
const titles = (rows: FindRow[] | undefined) => (rows ?? []).map((r) => r.title)

afterEach(() => setAmountsHidden(false))

describe('the empty case and nothing found', () => {
  test('an empty case, or only spaces, gives the hint and nothing else', () => {
    expect(findView(MODEL, null, '', TODAY)).toEqual({ kind: 'empty', hint: 'Une action, un compte, un mois, un réglage.' })
    expect(findView(MODEL, null, '   ', TODAY)).toEqual({ kind: 'empty', hint: 'Une action, un compte, un mois, un réglage.' })
  })

  test('nothing found says so, and no typo is forgiven', () => {
    expect(findView(MODEL, null, 'ovhh', TODAY)).toEqual({ kind: 'none', sentence: 'Rien ne porte ce nom chez toi.' })
  })

  test('the results end with the promise that nothing leaves', () => {
    expect(results('ovh').footer).toBe('Tout se cherche sur ton téléphone, rien ne part.')
  })
})

describe('matching, without case or accents', () => {
  test('« ovh » finds « Actions OVHcloud » and « OVHCLOUD », the letters found marked', () => {
    const lines = group(results('ovh'), 'Tes lignes')!
    expect(titles(lines.rows)).toEqual(['OVHCLOUD', 'Actions OVHcloud'])
    expect(lines.rows.map((r) => r.hit)).toEqual([
      [0, 3],
      [8, 11],
    ])
  })

  test('« societe » finds « Société Générale », and « ENERGIES » finds « Total Énergies »', () => {
    const accounts = group(results('societe'), 'Tes comptes')!
    expect(titles(accounts.rows)).toEqual(['Société Générale'])
    expect(accounts.rows[0]).toMatchObject({ kind: 'bank', hit: [0, 7] })
    expect(titles(group(results('ENERGIES'), 'Tes lignes')!.rows)).toEqual(['Total Énergies'])
  })

  test('what starts with the text comes before what contains it, even when smaller', () => {
    const model = modelOf({
      lines: [line('big', 'pea', { kind: 'units', name: 'Fonds Europe' }), line('small', 'pea', { kind: 'units', name: 'Europe Asie' })],
      snapshots: [snapshotOf([unitsEntry('big', 100, 100, null), unitsEntry('small', 1, 100, null)])],
    })
    expect(titles(group(results('europe', model), 'Tes lignes')!.rows)).toEqual(['Europe Asie', 'Fonds Europe'])
  })

  test('at most five per group, the others behind « Voir les N autres » or « Voir l’autre »', () => {
    const many = (n: number) =>
      modelOf({
        lines: Array.from({ length: n }, (_, i) => line(`f${i}`, 'pea', { kind: 'units', name: `Fonds ${i}` })),
        snapshots: [snapshotOf(Array.from({ length: n }, (_, i) => unitsEntry(`f${i}`, 1, 100 + i, null)))],
      })
    const seven = group(results('fonds', many(7)), 'Tes lignes')!
    expect(seven.rows).toHaveLength(5)
    expect(seven.more).toHaveLength(2)
    expect(seven.moreLabel).toBe('Voir les 2 autres')
    expect(group(results('fonds', many(6)), 'Tes lignes')!.moreLabel).toBe('Voir l’autre')
    expect(group(results('fonds', many(5)), 'Tes lignes')!.moreLabel).toBeNull()
  })
})

describe('the rows', () => {
  test('a line says where it lives, its amount, its category and leads to its fiche', () => {
    expect(group(results('total'), 'Tes lignes')!.rows[0]).toEqual({
      kind: 'line',
      title: 'Total Énergies',
      hit: [0, 5],
      where: 'PEA chez BoursoBank',
      amount: '100\u00A0€',
      category: 'markets',
      href: '/ligne/te',
    })
  })

  test('a closed line says « fermée », with no amount', () => {
    const row = group(results('orange'), 'Tes lignes')!.rows[0]
    expect(row.where).toBe('PEA chez BoursoBank · fermée')
    expect(row.amount).toBeUndefined()
    expect(row.href).toBe('/ligne/or')
  })

  test('an account leads to the category holding most of it, a bank to « Où est ton argent »', () => {
    const view = results('compte courant')
    expect(group(view, 'Tes comptes')!.rows[0]).toMatchObject({ kind: 'account', title: 'Compte courant', amount: '1\u202F000\u00A0€', href: '/categorie/available' })
    expect(group(results('bourso'), 'Tes comptes')!.rows[0]).toMatchObject({
      kind: 'bank',
      amount: '450\u00A0€',
      href: '/reperes#ou-est-ton-argent',
    })
  })

  test('the prices of the day, when the site has them, are the ones counted', () => {
    const market: Market = { quotes: { 'OVH.PA': { price: 30, currency: 'EUR', asOf: TODAY } }, rates: null }
    expect(plain(results('ovh', MODEL, market).answer?.amount)).toBe('450 €')
  })
})

describe('the answer at the top', () => {
  test('one holding on two accounts, with a symbol: its name, its total, accounts, share and gain', () => {
    const view = results('ovh')
    // 300 € of 4 550 €; bought 180 €.
    expect(view.answer).not.toBeNull()
    expect(plain(view.answer!.title)).toBe('OVHCLOUD')
    expect(plain(view.answer!.amount)).toBe('300 €')
    expect(plain(view.answer!.detail)).toBe('sur 2 comptes · 7 % de ce qui est à toi · +66,7 % depuis l’achat')
  })

  test('lines of two different holdings give no answer (RF 1)', () => {
    const model = modelOf({
      lines: [
        line('w', 'pea', { kind: 'units', name: 'Amundi World', quoteSymbol: 'CW8.PA' }),
        line('e', 'pee', { kind: 'units', name: 'Amundi Europe', quoteSymbol: 'MEU.PA' }),
      ],
      snapshots: [snapshotOf([unitsEntry('w', 1, 100, null), unitsEntry('e', 1, 100, null)])],
    })
    const view = results('amundi', model)
    expect(view.answer).toBeNull()
    expect(titles(group(view, 'Tes lignes')!.rows)).toEqual(['Amundi World', 'Amundi Europe'])
  })

  test('the same name without symbol is one holding too', () => {
    const model = modelOf({
      lines: [line('a', 'pea', { kind: 'units', name: 'Fonds Maison' }), line('b', 'pee', { kind: 'units', name: 'fonds  maison' })],
      snapshots: [snapshotOf([unitsEntry('a', 1, 100, null), unitsEntry('b', 1, 50, null)])],
    })
    const view = results('maison', model)
    expect(plain(view.answer!.amount)).toBe('150 €')
    expect(plain(view.answer!.detail)).toBe('sur 2 comptes · 100 % de ce qui est à toi')
  })

  test('one line and its account of the same name are one answer; the gain is said only when known', () => {
    const view = results('livret')
    expect(plain(view.answer!.title)).toBe('Livret A')
    expect(plain(view.answer!.amount)).toBe('3 000 €')
    expect(plain(view.answer!.detail)).toBe('66 % de ce qui est à toi')
  })

  test('one bank: its accounts, its share', () => {
    const view = results('societe')
    expect(plain(view.answer!.title)).toBe('Société Générale')
    expect(plain(view.answer!.amount)).toBe('4 000 €')
    expect(plain(view.answer!.detail)).toBe('sur 2 comptes · 88 % de ce qui est à toi')
  })

  test('a holding with a line of unknown purchase price has no gain', () => {
    expect(plain(results('air liquide').answer!.detail)).toBe('3 % de ce qui est à toi')
  })

  test('a relevé or a setting is never an answer', () => {
    expect(results('2025').answer).toBeNull()
    expect(results('mot de passe').answer).toBeNull()
  })
})

describe('« Masquer les montants » (RF 2)', () => {
  test('every amount and the answer figure are « ••• »', () => {
    setAmountsHidden(true)
    for (const query of ['ovh', 'societe', 'novembre', 'o']) {
      const view = results(query)
      if (view.answer) expect(view.answer.amount).toBe('•••')
      const amounts = view.groups.flatMap((g) => [...g.rows, ...g.more]).flatMap((r) => (r.amount === undefined ? [] : [r.amount]))
      expect(amounts.length).toBeGreaterThan(0)
      for (const amount of amounts) expect(amount).toBe('•••')
    }
  })
})

describe('the relevés', () => {
  test('found by their month or their year, each to its page', () => {
    const rows = group(results('novembre 2025'), 'Tes relevés')!.rows
    expect(rows).toEqual([
      { kind: 'statement', title: '30 novembre 2025', hit: [3, 16], amount: '2\u202F900\u00A0€', href: '/releve/s-2025-11-30' },
    ])
    expect(titles(group(results('2026'), 'Tes relevés')!.rows)).toEqual(['30 septembre 2026'])
    expect(titles(group(results('2025'), 'Tes relevés')!.rows)).toEqual(['30 novembre 2025'])
  })

  test('the newest first', () => {
    expect(titles(group(results('30'), 'Tes relevés')!.rows)).toEqual(['30 septembre 2026', '30 novembre 2025'])
  })
})

describe('the settings', () => {
  test('a setting says where it lands, by its title or another word', () => {
    expect(group(results('mot de passe'), 'Dans les réglages')!.rows).toEqual([
      { kind: 'setting', title: 'Ton mot de passe, dans les Réglages', hit: [4, 16], href: '/reglages#compte' },
    ])
    expect(group(results('salaire'), 'Dans les réglages')!.rows).toEqual([
      { kind: 'setting', title: 'Tes dépenses et tes revenus, dans les Réglages', hit: null, href: '/reglages#depenses' },
    ])
    expect(group(results('supprimer'), 'Dans les réglages')!.rows[0].href).toBe('/reglages/supprimer')
    expect(group(results('confidentialite'), 'Dans les réglages')!.rows[0].href).toBe('/confidentialite')
  })

  test('the settings are found even without a profile', () => {
    const model: Model = { ...MODEL, profile: null, snapshots: [] }
    expect(titles(group(results('apparence', model), 'Dans les réglages')!.rows)).toEqual(['L’apparence, dans les Réglages'])
  })
})

describe('« Ce que tu peux faire »', () => {
  test('a line that could follow its price and does not: relink it', () => {
    expect(results('total').actions).toEqual([
      { kind: 'action', title: 'Relier « Total Énergies » à son cours', hit: null, href: '/titres' },
    ])
    expect(results('ovh').actions).toEqual([])
  })

  test('an account or a bank found: update the figures', () => {
    expect(titles(results('societe').actions)).toEqual(['Mettre à jour tes chiffres'])
    expect(results('societe').actions[0].href).toBe('/mise-a-jour')
  })

  test('one relevé found: correct it', () => {
    expect(results('novembre 2025').actions).toEqual([
      { kind: 'action', title: 'Corriger le relevé du 30 novembre 2025', hit: null, href: '/releve/s-2025-11-30' },
    ])
  })

  test('the screens: « Tes titres » and the update, by their words, never twice', () => {
    expect(results('titres').actions).toEqual([{ kind: 'action', title: 'Tes titres et leurs cours', hit: null, href: '/titres' }])
    expect(titles(results('mise a jour').actions)).toEqual(['Mettre à jour tes chiffres'])
  })
})

describe('what is shown is only what is held', () => {
  test('during an unfinished first launch, no row has an amount and there is no answer', () => {
    const model = modelOf()
    model.profile = loaded({ ...model.profile!.value, firstLaunch: { planned: [], finished: [], complete: false } })
    for (const query of ['ovh', 'societe', 'livret', '2025', 'o']) {
      const view = results(query, model)
      expect(view.answer).toBeNull()
      for (const row of view.groups.flatMap((g) => [...g.rows, ...g.more])) expect(row.amount).toBeUndefined()
    }
    expect(titles(group(results('2025', model), 'Tes relevés')!.rows)).toEqual(['30 novembre 2025'])
  })

  test('closed lines and lines missing from the last relevé never count: the answer is about what is held', () => {
    const model = modelOf({
      lines: [
        line('open', 'pea', { kind: 'units', name: 'Orange', quoteSymbol: 'ORA.PA' }),
        line('shut', 'pee', { kind: 'units', name: 'Orange SA', closedOn: '2026-05-01' }),
        line('gone', 'pee', { kind: 'units', name: 'Orange Bank' }),
      ],
      snapshots: [snapshotOf([unitsEntry('open', 2, 100, null)])],
    })
    const view = results('orange', model)
    expect(group(view, 'Tes lignes')!.rows).toHaveLength(3)
    expect(plain(view.answer!.title)).toBe('Orange')
    expect(plain(view.answer!.amount)).toBe('200 €')
  })

  test('open lines of two holdings give no answer, even beside a closed one', () => {
    const model = modelOf({
      lines: [
        line('a', 'pea', { kind: 'units', name: 'Orange', quoteSymbol: 'ORA.PA' }),
        line('b', 'pee', { kind: 'units', name: 'Orange Bank', quoteSymbol: 'OBK.PA' }),
        line('c', 'pee', { kind: 'units', name: 'Orange SA', closedOn: '2026-05-01' }),
      ],
      snapshots: [snapshotOf([unitsEntry('a', 1, 100, null), unitsEntry('b', 1, 100, null)])],
    })
    expect(results('orange', model).answer).toBeNull()
  })

  test('no share above 100 % (loans elsewhere), nor for what is outside the grid', () => {
    const loans = modelOf({
      accounts: [at('sg', account('cur', 'current', { name: 'Compte courant' })), at('sg', account('loan', 'loan', { name: 'Prêt perso' }))],
      lines: [line('cur-line', 'cur', { name: 'Compte courant' }), line('loan-line', 'loan', { name: 'Prêt perso' })],
      snapshots: [snapshotOf([amountEntry('cur-line', 1_000), amountEntry('loan-line', 800)])],
    })
    expect(results('compte courant', loans).answer!.detail).toBeNull()

    const HOME: Establishment = { id: 'home', name: 'Chez toi', kind: 'home' }
    const withoutHome = modelOf({
      establishments: [SG, HOME],
      accounts: [at('sg', account('cur', 'current', { name: 'Compte courant' })), at('home', account('house', 'home', { name: 'Maison' }))],
      lines: [line('cur-line', 'cur', { name: 'Compte courant' }), line('house-line', 'house', { name: 'Maison' })],
      snapshots: [snapshotOf([amountEntry('cur-line', 10_000), amountEntry('house-line', 300_000)])],
      settings: { schema: 1, budget: null, display: 'euros', hideAmounts: false, withoutHome: true },
    })
    const house = results('maison', withoutHome).answer!
    expect(plain(house.amount)).toBe('300 000 €')
    expect(house.detail).toBeNull()
    expect(plain(results('compte courant', withoutHome).answer!.detail)).toBe('100 % de ce qui est à toi')
  })

  test('« oeuvre » finds « Œuvre », and runs of spaces count as one', () => {
    const model = modelOf({
      lines: [line('w', 'pea', { kind: 'units', name: 'Fonds  Œuvre' })],
      snapshots: [snapshotOf([unitsEntry('w', 1, 100, null)])],
    })
    expect(group(results('oeuvre', model), 'Tes lignes')!.rows[0].hit).toEqual([7, 12])
    expect(titles(group(results('fonds oeuvre', model), 'Tes lignes')!.rows)).toEqual(['Fonds  Œuvre'])
  })
})
