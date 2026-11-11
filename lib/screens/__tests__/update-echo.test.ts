import { describe, expect, test } from 'vitest'
import { exampleProfile, exampleSnapshot } from '@/lib/model/__tests__/fixtures'
import type { Snapshot } from '@/lib/model/types'
import { echoLines } from '../update-echo'

// The snapshot just saved, taken on 7 November: `seen` lists the lines seen then, the others keep
// the date they had (30 September).
function savedWith(seen: string[]): Snapshot {
  return {
    ...exampleSnapshot,
    takenOn: '2026-11-07',
    entries: exampleSnapshot.entries.map((e) => ({ ...e, seenOn: seen.includes(e.lineId) ? '2026-11-07' : e.seenOn })),
  }
}

describe('the echo of the bank just updated', () => {
  test('a partial update lights the lines seen now', () => {
    // BoursoBank done, Linxea and « Chez toi » kept their date.
    const snapshot = savedWith(['current-line', 'livret-a-line', 'etf'])
    expect(echoLines(exampleProfile, snapshot)).toEqual(['current-line', 'livret-a-line', 'etf'])
  })

  test('a full update lights nothing', () => {
    const all = exampleSnapshot.entries.map((e) => e.lineId)
    expect(echoLines(exampleProfile, savedWith(all))).toEqual([])
  })

  test('the house keeps its estimate date in a full update: still no echo', () => {
    // A bank done leaves the house at its date unless « Changer » gave it a value (lib/update/build.ts).
    const all = exampleSnapshot.entries.map((e) => e.lineId).filter((id) => id !== 'house-line')
    expect(echoLines(exampleProfile, savedWith(all))).toEqual([])
  })

  test('nothing seen now lights nothing', () => {
    expect(echoLines(exampleProfile, savedWith([]))).toEqual([])
  })
})
