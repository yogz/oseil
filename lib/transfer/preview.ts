// What the preview of an import points out without refusing it. Apart from import.ts, which
// the import screen's tests replace whole.
import type { IsoDate } from '@/lib/model/types'
import type { ImportSummary } from './import'

// A relevé that holds far fewer placements than the fullest one: most likely a piece of the
// patrimoine, not a photo of it (an AI made one relevé per document date, 10 November 2026). Not
// a refusal: someone may truly have had one livret in 2015. A relevé with no placement at all is
// written on purpose (its own row) and is left alone, as is a file with a single relevé.
export const PARTIAL_SHARE = 0.5

export function partialRelevés(summary: ImportSummary): { takenOn: IsoDate; placements: number; most: number }[] {
  const most = Math.max(0, ...summary.relevés.map((r) => r.placements))
  return summary.relevés
    .filter((r) => r.placements > 0 && r.placements < most * PARTIAL_SHARE)
    .map((r) => ({ takenOn: r.takenOn, placements: r.placements, most }))
}
