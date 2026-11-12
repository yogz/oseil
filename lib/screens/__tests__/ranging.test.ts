import { describe, expect, test } from 'vitest'
import { account, line, profileOf } from '@/lib/model/__tests__/fixtures'
import { RANGED_GROUPS } from '@/lib/catalog'
import { UNGUESSED } from '@/lib/screens/suggest-group'
import { whereWords } from '@/lib/screens/words'
import { rangingView } from '@/lib/screens/ranging'

const profile = profileOf(
  [account('pea', 'pea'), account('cto', 'securities')],
  [
    line('a', 'pea', { name: 'Amundi MSCI World', kind: 'units' }),
    line('b', 'pea', { name: 'Ma pépite', kind: 'units' }),
    line('c', 'cto', { name: 'Fonds Europe', kind: 'units', group: 'europe' }),
    line('d', 'cto', { name: 'Fermée', kind: 'units', closedOn: '2026-01-01' }),
    line('e', 'cto', { name: 'Refusée', kind: 'units', group: 'unknown' }),
  ],
)

describe('rangingView', () => {
  const view = rangingView(profile, 'markets')

  test('rows are the open lines of the category, in profile order', () => {
    expect(view.rows.map((r) => r.lineId)).toEqual(['a', 'b', 'c', 'e'])
    expect(view.rows.map((r) => r.name)).toEqual(['Amundi MSCI World', 'Ma pépite', 'Fonds Europe', 'Refusée'])
  })

  test('chosen: the proposal, else unknown; a stored group wins', () => {
    expect(view.rows[0]).toMatchObject({ chosen: 'world', reason: 'deviné d’après son indice' })
    expect(view.rows[1]).toMatchObject({ chosen: 'unknown', reason: UNGUESSED })
    expect(view.rows[2]).toMatchObject({ chosen: 'europe', reason: null })
  })

  test('a stored « unknown » stays unknown, no reason', () => {
    expect(view.rows[3]).toMatchObject({ chosen: 'unknown', reason: null })
  })

  test('options follow RANGED_GROUPS', () => {
    expect(view.options.map((o) => o.id)).toEqual([...RANGED_GROUPS.markets])
    // Japan between the United States and the emerging countries (Nicolas, 9 November 2026).
    expect(view.options.map((o) => o.label)).toEqual([
      'Europe',
      'États-Unis',
      'Japon',
      'Pays émergents',
      'Fonds monde',
      'Hors bourse (non coté, prêts)',
      'Je ne sais pas',
    ])
    expect(view.options.find((o) => o.id === 'unknown')?.label).toBe('Je ne sais pas')
  })

  test('titles and back link', () => {
    expect(view.title).toBe('Ranger par zone')
    expect(view.back).toEqual({ href: '/categorie/markets', label: '‹ Placements en bourse' })
    expect(view.intro).toContain('rien n’est rangé avant « Valider »')
  })

  test('secured', () => {
    const secured = rangingView(
      profileOf([account('life', 'life-insurance')], [line('f', 'life', { name: 'Fonds euros' })]),
      'secured',
    )
    expect(secured.title).toBe('Ranger par type')
    expect(secured.back.label).toBe('‹ Épargne sécurisée')
    expect(secured.rows[0]).toMatchObject({ chosen: 'euro-fund' })
  })

  test('a stored chapter of another category counts as absent', () => {
    const moved = rangingView(
      profileOf([account('pea', 'pea')], [line('x', 'pea', { name: 'Fonds euros', kind: 'units', group: 'euro-fund' })]),
      'markets',
    )
    expect(moved.rows[0].chosen).toBe('unknown')
    expect(moved.rows[0].reason).toBe(UNGUESSED)
    const guessed = rangingView(
      profileOf([account('pea', 'pea')], [line('y', 'pea', { name: 'Amundi MSCI World', kind: 'units', group: 'euro-fund' })]),
      'markets',
    )
    expect(guessed.rows[0]).toMatchObject({ chosen: 'world', reason: 'deviné d’après son indice' })
  })

  test('each row says where its line is', () => {
    expect(view.rows[0].where).toBe(whereWords(profile.lines[0], profile.accounts[0], profile.establishments[0]))
    expect(view.rows[0].where).toContain('PEA')
  })
})
