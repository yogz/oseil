import { expect, test } from 'vitest'
import { readAmount, readNumber, readPaidTotal } from '../fields'

test('an amount reads as cents', () => {
  expect(readAmount('10 000', 'livret-a')).toEqual({ cents: 1_000_000 })
})

test('an empty or unreadable amount is not readable', () => {
  expect(readAmount('', 'livret-a')).toEqual({ error: 'Ce montant n’est pas lisible.' })
  expect(readAmount('abc', 'livret-a')).toEqual({ error: 'Ce montant n’est pas lisible.' })
})

test('a negative amount is refused, except on a current account', () => {
  expect(readAmount('-5', 'livret-a')).toEqual({ error: 'Ce montant ne peut pas être négatif.' })
  expect(readAmount('-5', 'loan')).toEqual({ error: 'Ce montant ne peut pas être négatif.' })
  expect(readAmount('-5', 'current')).toEqual({ cents: -500 })
})

test('a home must be worth more than zero', () => {
  expect(readAmount('0', 'home')).toEqual({ error: 'Ce montant doit être supérieur à zéro.' })
})

test('a total paid in is 0 or more: money taken out is already in it', () => {
  expect(readPaidTotal('18 400')).toEqual({ cents: 1_840_000 })
  expect(readPaidTotal('0')).toEqual({ cents: 0 })
  expect(readPaidTotal('-2000')).toEqual({ error: 'Ce montant ne peut pas être négatif.' })
  expect(readPaidTotal('')).toEqual({ error: 'Ce montant n’est pas lisible.' })
})

test('a number reads, and an ambiguous one is refused', () => {
  expect(readNumber('3,5')).toEqual({ value: 3.5 })
  expect(readNumber('3.800')).toEqual({ error: 'Ce nombre n’est pas lisible.' })
})
