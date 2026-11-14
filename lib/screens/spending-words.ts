// The words of « Combien dépenses-tu par mois ? » (first launch, and the Réglages). The title names what
// the field asks: the spending, or the net income once « Je ne connais pas mes dépenses » is touched
// (UX review, 12 November 2026).

import type { Budget } from '@/lib/model/types'

export const SPENDING_QUESTION = 'Combien dépenses-tu par mois, à peu près ?'
export const SALARY_QUESTION = 'Combien gagnes-tu par mois, à peu près ?'
// Said under either title: it speaks of neither the spending nor the income, only of what they are for.
export const SPENDING_WHY = 'Pour savoir combien de mois ton argent disponible te couvrirait si tes revenus s’arrêtaient.'

export function spendingQuestion(basis: Budget['basis']): string {
  return basis === 'salary' ? SALARY_QUESTION : SPENDING_QUESTION
}
