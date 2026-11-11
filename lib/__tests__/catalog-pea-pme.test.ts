// The PEA-PME, its own type (Nicolas, 11 November 2026, after three experts): an envelope of its own,
// which people look for under its name, and which Oseil treats exactly as a PEA.
import { expect, test } from 'vitest'
import { ACCOUNT_TYPES, MULTI_LINE_TYPES, canFollowPrice } from '@/lib/catalog'

test('the PEA-PME is a type of its own, named so, counted exactly as a PEA', () => {
  const { label, explanation, ...rest } = ACCOUNT_TYPES['pea-pme']
  expect(label).toBe('PEA-PME')
  expect(explanation).toBe('plan d’épargne en actions pour les PME et les ETI')
  const { label: _label, explanation: _explanation, ...pea } = ACCOUNT_TYPES.pea
  expect(rest).toEqual(pea)
  expect(MULTI_LINE_TYPES).toContain('pea-pme')
  expect(canFollowPrice('pea-pme')).toBe(true)
})

test('it comes right after the PEA in the list of investments', () => {
  const ids = Object.keys(ACCOUNT_TYPES)
  expect(ids.indexOf('pea-pme')).toBe(ids.indexOf('pea') + 1)
})
