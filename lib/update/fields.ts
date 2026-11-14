import type { AccountTypeId, Cents } from '@/lib/model/types'
import { parseDecimal, parseEuros } from '@/lib/parse'

// The one place these messages are written: the first launch's forms and the update's rows read them here.
export const UNREADABLE_AMOUNT = 'Ce montant n’est pas lisible.'
export const NEGATIVE_AMOUNT = 'Ce montant ne peut pas être négatif.'
export const ZERO_HOME = 'Ce montant doit être supérieur à zéro.'
export const UNREADABLE_NUMBER = 'Ce nombre n’est pas lisible.'

// An amount follows the first launch's rules: only a current account may be negative,
// a home is worth more than zero. A loan is what is still owed: positive or zero.
export function readAmount(text: string, type: AccountTypeId): { cents: Cents } | { error: string } {
  const cents = parseEuros(text)
  if (cents === null) return { error: UNREADABLE_AMOUNT }
  if (cents < 0 && type !== 'current') return { error: NEGATIVE_AMOUNT }
  if (cents === 0 && type === 'home') return { error: ZERO_HOME }
  return { cents }
}

export function readNumber(text: string): { value: number } | { error: string } {
  const value = parseDecimal(text)
  return value === null ? { error: UNREADABLE_NUMBER } : { value }
}

// The total paid in since the opening: 0 or more, what was taken out already taken off it.
export function readPaidTotal(text: string): { cents: Cents } | { error: string } {
  const cents = parseEuros(text)
  if (cents === null) return { error: UNREADABLE_AMOUNT }
  return cents < 0 ? { error: NEGATIVE_AMOUNT } : { cents }
}
