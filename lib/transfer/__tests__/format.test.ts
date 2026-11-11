import { describe, expect, it } from 'vitest'
import { ACCOUNT_TYPES, CATEGORIES, CURRENCIES, GOAL_CATEGORIES, GROUP_LABELS, RESIDENCE_LABELS } from '@/lib/catalog'
import {
  COLUMNS,
  HOME_NAME,
  KIND_NAMES,
  SETTING_NAMES,
  SETTING_VALUES,
  SHEETS,
  normalizeWord,
  readDate,
  readDecimal,
  readEuros,
  readPercent,
  readText,
  readYesNo,
  wordLookup,
} from '../format'

const ok = (value: unknown) => ({ ok: true, value })

describe('readEuros', () => {
  it('reads numbers into cents', () => {
    expect(readEuros(1234.56)).toEqual(ok(123456))
    expect(readEuros(1200.5)).toEqual(ok(120050))
    expect(readEuros(0.005)).toEqual(ok(1))
    expect(readEuros(-0.005)).toEqual(ok(-1))
  })

  it('reads French and plain texts, whatever the space', () => {
    for (const space of [' ', ' ', ' ']) {
      expect(readEuros(`1${space}234,56${space}€`)).toEqual(ok(123456))
    }
    expect(readEuros('−12 000')).toEqual(ok(-1200000))
    expect(readEuros(1.005)).toEqual(ok(101))
    expect(readEuros(-1.005)).toEqual(ok(-101))
    const zero = readEuros('-0')
    expect(zero.ok && Object.is(zero.value, 0)).toBe(true)
    expect(readEuros('-12 000')).toEqual(ok(-1200000))
    expect(readEuros('1200.5')).toEqual(ok(120050))
  })

  it('never returns minus zero', () => {
    const result = readEuros(-0)
    expect(result.ok && Object.is(result.value, 0)).toBe(true)
  })

  it('refuses what is not an amount', () => {
    for (const cell of ['1.234,56', 'abc', true, new Date(), Infinity]) {
      expect(readEuros(cell).ok).toBe(false)
    }
  })

  it('reads an empty cell as null', () => {
    expect(readEuros(null)).toEqual(ok(null))
    expect(readEuros('  ')).toEqual(ok(null))
  })
})

describe('readDecimal', () => {
  it('keeps the decimals', () => {
    expect(readDecimal(12.345678)).toEqual(ok(12.345678))
    expect(readDecimal('0,9441')).toEqual(ok(0.9441))
    expect(readDecimal(null)).toEqual(ok(null))
    expect(readDecimal('x').ok).toBe(false)
  })
})

describe('readDate', () => {
  it('reads every spelling of 5 November 2026', () => {
    expect(readDate(new Date(Date.UTC(2026, 10, 5)))).toEqual(ok('2026-11-05'))
    expect(readDate('05/11/2026')).toEqual(ok('2026-11-05'))
    expect(readDate('2026-11-05')).toEqual(ok('2026-11-05'))
    // Excel serial, base 30 December 1899: (UTC 2026-11-05 - UTC 1899-12-30) / 86 400 000 = 46331.
    expect(readDate(46331)).toEqual(ok('2026-11-05'))
  })

  it('refuses an impossible date', () => {
    expect(readDate('31/02/2026').ok).toBe(false)
    expect(readDate('nope').ok).toBe(false)
    expect(readDate(true).ok).toBe(false)
    expect(readDate(2026).ok).toBe(false)
    expect(readDate(5).ok).toBe(false)
    expect(readDate(new Date(Date.UTC(999, 0, 1))).ok).toBe(false)
    expect(readDate(new Date(Date.UTC(10000, 0, 1))).ok).toBe(false)
  })

  it('ignores the time of a serial', () => {
    expect(readDate(46331.75)).toEqual(ok('2026-11-05'))
  })

  it('reads an empty cell as null', () => {
    expect(readDate(null)).toEqual(ok(null))
  })
})

describe('readYesNo', () => {
  it('reads oui as true and empty as false', () => {
    expect(readYesNo('Oui')).toEqual(ok(true))
    expect(readYesNo(' oui ')).toEqual(ok(true))
    expect(readYesNo('')).toEqual(ok(false))
    expect(readYesNo(null)).toEqual(ok(false))
    expect(readYesNo('non')).toEqual(ok(false))
  })

  it('refuses anything else', () => {
    expect(readYesNo('peut-être').ok).toBe(false)
  })
})

describe('readPercent', () => {
  it('reads plain numbers and keeps decimals', () => {
    expect(readPercent(25)).toEqual(ok(25))
    expect(readPercent(0.25)).toEqual(ok(0.25))
    expect(readPercent('25 %')).toEqual(ok(25))
    expect(readPercent(null)).toEqual(ok(null))
  })

  it('refuses negatives and texts', () => {
    expect(readPercent(-1).ok).toBe(false)
    expect(readPercent('beaucoup').ok).toBe(false)
  })
})

describe('readText', () => {
  it('trims and turns blank into null', () => {
    expect(readText('  Livret A ')).toEqual(ok('Livret A'))
    expect(readText('   ')).toEqual(ok(null))
    expect(readText(null)).toEqual(ok(null))
    expect(readText(42)).toEqual(ok('42'))
    expect(readText(true).ok).toBe(false)
  })
})

describe('words', () => {
  it('normalises case, accents, spaces and apostrophes', () => {
    expect(normalizeWord('  Assurance-Vie ')).toBe(normalizeWord('assurance-vie'))
    expect(normalizeWord('L’or')).toBe(normalizeWord("L'or"))
    expect(normalizeWord('Épargne   sécurisée')).toBe(normalizeWord('epargne securisee'))
  })

  it('finds every account type back by its label', () => {
    const find = wordLookup(Object.entries(ACCOUNT_TYPES).map(([id, info]) => [info.label, id] as [string, string]))
    for (const [id, info] of Object.entries(ACCOUNT_TYPES)) {
      expect(find(` ${info.label.toUpperCase()} `)).toBe(id)
    }
    expect(find('inconnu')).toBeUndefined()
    expect(find(null)).toBeUndefined()
  })

  it('has no two labels that collide in any list', () => {
    const lists: Record<string, string[]> = {
      types: Object.values(ACCOUNT_TYPES).map((t) => t.label),
      categories: Object.values(CATEGORIES).map((c) => c.label),
      groups: Object.values(GROUP_LABELS),
      currencies: CURRENCIES.map((c) => c.code),
      kinds: Object.values(KIND_NAMES),
      settings: Object.values(SETTING_NAMES),
      residences: Object.values(RESIDENCE_LABELS),
    }
    for (const [name, labels] of Object.entries(lists)) {
      expect(new Set(labels.map(normalizeWord)).size, name).toBe(labels.length)
    }
  })
})

describe('names', () => {
  it('keeps the sheet names and the home name', () => {
    expect(SHEETS.snapshots).toBe('Relevés')
    expect(HOME_NAME).toBe('Chez toi')
    expect(SETTING_VALUES.display.percent).toBe('pour cent')
  })

  it('lists the columns in the order of the spec', () => {
    expect(COLUMNS.accounts.map((c) => c.title)).toEqual([
      'Banque', 'Compte', 'Ligne', 'Type de compte', 'Type de logement', 'Catégorie', 'Chapitre', 'Façon de compter', 'Devise',
      'Symbole suivi', 'Débloqué le', 'Long à récupérer', 'Logement financé', 'Fermée le', 'Taux d’achat (1 € = …)',
      'Identifiant (laisser vide)', 'Identifiant du compte (laisser vide)',
    ])
    expect(COLUMNS.snapshots.map((c) => c.title)).toEqual([
      'Date du relevé', 'N° du relevé', 'Banque', 'Compte', 'Ligne', 'Valeur en euros (calculé)', 'Montant',
      'Devise (calculé)', 'Parts', 'Prix d’une part', 'Prix moyen d’achat', 'Chiffre vu le (si plus ancien)',
      'Ouverte avec de l’argent neuf', 'Taux de change', 'Identifiant (laisser vide)',
    ])
    expect(COLUMNS.contributions.map((c) => c.title)).toEqual([
      'Date du relevé', 'N° du relevé', 'Banque', 'Compte', 'Versé', 'Identifiant du compte (laisser vide)',
    ])
    expect(COLUMNS.goals.map((c) => c.title)).toEqual([
      'À partir du', 'Argent disponible (%)', 'Épargne sécurisée (%)', 'Placements en bourse (%)', 'Or et crypto (%)',
      'Immobilier locatif (%)', 'Argent disponible (mois)',
    ])
    expect(COLUMNS.settings.map((c) => c.title)).toEqual(['Réglage', 'Valeur'])
  })

  it('takes the goal columns from the one list of goal keys, the two columns added since optional', () => {
    expect(COLUMNS.goals.slice(1).map((c) => c.key)).toEqual([...GOAL_CATEGORIES, 'cushionMonths'])
    // A file written before the immobilier locatif, or before the months of the cushion, has none of
    // these columns: it must still import.
    const optional = [...COLUMNS.accounts, ...COLUMNS.goals].filter((c) => ['residence', 'rental', 'cushionMonths'].includes(c.key))
    expect(optional.map((c) => [c.key, c.required])).toEqual([
      ['residence', false],
      ['rental', false],
      ['cushionMonths', false],
    ])
  })

  it('marks identifiers quiet and computed columns computed, with unique keys', () => {
    for (const columns of Object.values(COLUMNS)) {
      expect(new Set(columns.map((c) => c.key)).size).toBe(columns.length)
    }
    const quiet = COLUMNS.accounts.filter((c) => c.quiet).map((c) => c.key)
    expect(quiet).toEqual(['reference', 'accountReference'])
    const computed = COLUMNS.snapshots.filter((c) => c.computed).map((c) => c.title)
    expect(computed).toEqual(['Valeur en euros (calculé)', 'Devise (calculé)'])
  })
})
