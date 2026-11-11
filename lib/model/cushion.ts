import type { Budget, Cents } from '@/lib/model/types'

// How many months of the budget the available money covers, to the nearest half month.
// No usable budget means no answer (null), never 0.
export function cushion(
  available: Cents,
  budget: Budget | null,
): { months: number; basis: Budget['basis'] } | null {
  if (!budget || budget.monthly <= 0) return null
  const months = Math.max(0, available) / budget.monthly
  return { months: Math.round(months * 2) / 2, basis: budget.basis }
}
