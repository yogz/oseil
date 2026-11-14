import { expect, test } from 'vitest'
import { spendingQuestion } from '../spending-words'

test('the title names what the field asks: the spending, or the net income', () => {
  expect(spendingQuestion('expenses')).toBe('Combien dépenses-tu par mois, à peu près ?')
  expect(spendingQuestion('salary')).toBe('Combien gagnes-tu par mois, à peu près ?')
})
