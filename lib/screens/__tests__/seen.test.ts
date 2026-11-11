import { describe, expect, test } from 'vitest'
import { exampleProfile, exampleSnapshot } from '@/lib/model/__tests__/fixtures'
import type { Establishment, Snapshot } from '@/lib/model/types'
import { behindEstablishments, notReviewedSentence, olderDatesLabel } from '@/lib/screens/seen'

const TODAY = '2026-11-07'
const OLD = '2026-09-30'
const establishment = (id: string): Establishment => exampleProfile.establishments.find((e) => e.id === id)!
const boursobank = establishment('boursobank')
const linxea = establishment('linxea')
const home = establishment('home')

// The example's lines, seen on the snapshot's day unless `dates` says otherwise.
function snapshotSeen(dates: Record<string, string>): Snapshot {
  return {
    ...exampleSnapshot,
    takenOn: TODAY,
    entries: exampleSnapshot.entries.map((e) => ({ ...e, seenOn: dates[e.lineId] ?? TODAY })),
  }
}

// The snapshot before: the one the update started from.
const previous: Snapshot = { ...exampleSnapshot, takenOn: OLD }
const LINXEA_OLD = { 'euro-fund': OLD, 'life-uc': OLD }
const BOURSOBANK_OLD = { 'current-line': OLD, 'livret-a-line': OLD, etf: OLD }
const HOME_OLD = { 'house-line': OLD, 'mortgage-line': OLD, 'gold-line': OLD }

describe('behindEstablishments', () => {
  test('Linxea and the house at the old date: only Linxea is behind, the house is not counted', () => {
    const snapshot = snapshotSeen({ ...LINXEA_OLD, 'house-line': OLD })
    expect(behindEstablishments(exampleProfile, snapshot, previous)).toEqual([{ establishment: linxea, seenOn: OLD }])
  })

  test('an establishment with lines at two old dates is listed with the oldest', () => {
    const snapshot = snapshotSeen({ 'euro-fund': OLD, 'life-uc': '2026-08-31' })
    expect(behindEstablishments(exampleProfile, snapshot, previous)).toEqual([{ establishment: linxea, seenOn: '2026-08-31' }])
  })

  test('half reviewed: one line seen since the previous snapshot, the others not, is still behind, with its oldest date', () => {
    const snapshot = snapshotSeen({ 'current-line': OLD, etf: '2026-08-31' })
    expect(behindEstablishments(exampleProfile, snapshot, previous)).toEqual([{ establishment: boursobank, seenOn: '2026-08-31' }])
  })

  test('banks fully reviewed (every line at the new date) never show; only the one left untouched does', () => {
    const snapshot = snapshotSeen(LINXEA_OLD)
    expect(behindEstablishments(exampleProfile, snapshot, previous)).toEqual([{ establishment: linxea, seenOn: OLD }])
  })

  test('in the order of the steps: « Chez toi » first, then the banks', () => {
    const snapshot = snapshotSeen({ ...LINXEA_OLD, ...HOME_OLD, ...BOURSOBANK_OLD })
    expect(behindEstablishments(exampleProfile, snapshot, previous).map((b) => b.establishment.id)).toEqual([
      'home',
      'boursobank',
      'linxea',
    ])
  })

  test('every line seen on the snapshot’s day: nothing is behind', () => {
    expect(behindEstablishments(exampleProfile, snapshotSeen({}), previous)).toEqual([])
  })

  test('a line with no entry in the snapshot (closed) does not make its bank behind', () => {
    const snapshot = snapshotSeen({ 'gold-line': OLD, 'mortgage-line': OLD })
    const withoutGold = { ...snapshot, entries: snapshot.entries.filter((e) => e.lineId !== 'gold-line') }
    expect(behindEstablishments(exampleProfile, withoutGold, previous)).toEqual([{ establishment: home, seenOn: OLD }])
    const neither = { ...withoutGold, entries: withoutGold.entries.filter((e) => e.lineId !== 'mortgage-line') }
    expect(behindEstablishments(exampleProfile, neither, previous)).toEqual([])
  })

  test('a single snapshot (the first launch, even over several days): no bank is behind (F7)', () => {
    const firstLaunch = snapshotSeen({ ...BOURSOBANK_OLD, ...LINXEA_OLD })
    expect(behindEstablishments(exampleProfile, firstLaunch, undefined)).toEqual([])
  })

  test('two snapshots the same day: a bank seen that day is not dated next to it', () => {
    const sameDay: Snapshot = { ...exampleSnapshot, takenOn: TODAY }
    expect(behindEstablishments(exampleProfile, snapshotSeen({}), sameDay)).toEqual([])
  })
})

describe('notReviewedSentence', () => {
  test('nothing behind: no sentence', () => {
    expect(notReviewedSentence([], TODAY)).toBeNull()
  })

  test('one bank', () => {
    expect(notReviewedSentence([{ establishment: linxea, seenOn: OLD }], TODAY)).toBe(
      '1 banque non revue\u00A0: ses chiffres datent du 30 septembre',
    )
  })

  test('two banks with one date, as the spec writes it', () => {
    const behind = [
      { establishment: boursobank, seenOn: OLD },
      { establishment: linxea, seenOn: OLD },
    ]
    expect(notReviewedSentence(behind, TODAY)).toBe('2 banques non revues\u00A0: leurs chiffres datent du 30 septembre')
  })

  test('two banks with two dates: the most recent one, « ou d’avant »', () => {
    const behind = [
      { establishment: boursobank, seenOn: '2026-08-31' },
      { establishment: linxea, seenOn: OLD },
    ]
    expect(notReviewedSentence(behind, TODAY)).toBe(
      '2 banques non revues\u00A0: leurs chiffres datent du 30 septembre ou d’avant',
    )
  })

  test('« Chez toi » among them: the establishments are named', () => {
    const behind = [
      { establishment: home, seenOn: OLD },
      { establishment: linxea, seenOn: OLD },
    ]
    expect(notReviewedSentence(behind, TODAY)).toBe(
      'Pas revus cette fois\u00A0: Chez toi, Linxea. Leurs chiffres datent du 30 septembre.',
    )
  })

  test('« Chez toi » alone', () => {
    expect(notReviewedSentence([{ establishment: home, seenOn: OLD }], TODAY)).toBe(
      'Pas revu cette fois\u00A0: Chez toi. Ses chiffres datent du 30 septembre.',
    )
  })

  test('« Chez toi » and a bank at two dates', () => {
    const behind = [
      { establishment: home, seenOn: '2026-08-31' },
      { establishment: linxea, seenOn: OLD },
    ]
    expect(notReviewedSentence(behind, TODAY)).toBe(
      'Pas revus cette fois\u00A0: Chez toi, Linxea. Leurs chiffres datent du 30 septembre ou d’avant.',
    )
  })

  test('a date of another year is written with its year', () => {
    expect(notReviewedSentence([{ establishment: linxea, seenOn: '2025-12-31' }], TODAY)).toBe(
      '1 banque non revue\u00A0: ses chiffres datent du 31 décembre 2025',
    )
  })

  // A bank passed whose shares took today's price: its figures are old, except that price.
  test('a bank whose shares took today’s price: the sentence says so', () => {
    expect(notReviewedSentence([{ establishment: linxea, seenOn: OLD }], TODAY, true)).toBe(
      '1 banque non revue\u00A0: ses chiffres datent du 30 septembre, sauf le prix du jour de tes actions',
    )
    const banks = [
      { establishment: boursobank, seenOn: OLD },
      { establishment: linxea, seenOn: OLD },
    ]
    expect(notReviewedSentence(banks, TODAY, true)).toBe(
      '2 banques non revues\u00A0: leurs chiffres datent du 30 septembre, sauf le prix du jour de tes actions',
    )
  })

  test('with « Chez toi » among them, the sentence still ends with its full stop', () => {
    const behind = [
      { establishment: home, seenOn: OLD },
      { establishment: linxea, seenOn: OLD },
    ]
    expect(notReviewedSentence(behind, TODAY, true)).toBe(
      'Pas revus cette fois\u00A0: Chez toi, Linxea. Leurs chiffres datent du 30 septembre, sauf le prix du jour de tes actions.',
    )
  })
})

describe('olderDatesLabel', () => {
  test('nothing behind: null', () => {
    expect(olderDatesLabel([], TODAY)).toBeNull()
  })

  test('one bank', () => {
    expect(olderDatesLabel([{ establishment: linxea, seenOn: OLD }], TODAY)).toBe('1 banque pas revue depuis le 30 septembre')
  })

  test('two banks at the same date', () => {
    const behind = [
      { establishment: linxea, seenOn: OLD },
      { establishment: boursobank, seenOn: OLD },
    ]
    expect(olderDatesLabel(behind, TODAY)).toBe('2 banques pas revues depuis le 30 septembre')
  })

  test('« Chez toi » is named, never counted as a bank', () => {
    const home = { id: 'home', name: 'Chez toi', kind: 'home' as const }
    expect(olderDatesLabel([{ establishment: home, seenOn: OLD }], TODAY)).toBe('Chez toi pas revu depuis le 30 septembre')
    expect(
      olderDatesLabel(
        [
          { establishment: home, seenOn: OLD },
          { establishment: linxea, seenOn: OLD },
          { establishment: boursobank, seenOn: OLD },
        ],
        TODAY,
      ),
    ).toBe('Chez toi et 2 banques pas revus depuis le 30 septembre')
  })

  // Short, whatever the number of banks (Nicolas, 10 November 2026): a list of six names read as
  // banks seen on the date before it.
  test('two dates: the most recent, « ou d’avant »', () => {
    const behind = [
      { establishment: boursobank, seenOn: '2026-08-31' },
      { establishment: linxea, seenOn: OLD },
    ]
    expect(olderDatesLabel(behind, TODAY)).toBe('2 banques pas revues depuis le 30 septembre ou d’avant')
  })
})
