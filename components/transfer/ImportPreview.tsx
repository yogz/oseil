import { todayIso } from '@/lib/dates'
import { formatDayMonth, formatEuros } from '@/lib/format'
import type { ImportSummary } from '@/lib/transfer/import'
import { partialRelevés } from '@/lib/transfer/preview'

// French counts: the singular for one (and for none, said « aucun »), never « 0 objectifs ».
function count(n: number, one: string, many: string, none: string): string {
  if (n === 0) return none
  return `${n} ${n === 1 ? one : many}`
}

// « 14 relevés · 6 banques · 23 placements · 2 objectifs »
export function summaryLine(summary: ImportSummary): string {
  return [
    count(summary.relevés.length, 'relevé', 'relevés', 'aucun relevé'),
    count(summary.banks, 'banque', 'banques', 'aucune banque'),
    count(summary.lines, 'placement', 'placements', 'aucun placement'),
    count(summary.goals, 'objectif', 'objectifs', 'aucun objectif'),
  ].join(' · ')
}

// What the file holds, for the person to recognise their figures (a zero too many shows in a
// total) before anything is written. The real figures, never masked: this is what is about to
// be saved, read as one reads an entry.
export function ImportPreview({ summary }: { summary: ImportSummary }) {
  const today = todayIso()
  // Newest first: the figure the person knows best comes at the top.
  const relevés = [...summary.relevés].reverse()
  return (
    <section aria-label="Ce que contient le fichier" className="flex flex-col">
      <p className="text-body font-medium text-ink tabular-nums">{summaryLine(summary)}</p>
      {relevés.length > 0 ? (
        <ul aria-label="Les relevés" className="mt-4 flex flex-col divide-y divide-hairline border-y border-hairline">
          {relevés.map((relevé, i) => (
            <li key={`${relevé.takenOn}-${i}`} className="flex min-h-11 items-center justify-between gap-4 py-2 text-body">
              <span className="text-ink-soft">{formatDayMonth(relevé.takenOn, today)}</span>
              {relevé.total === null ? (
                <span className="text-ink-muted">aucun placement</span>
              ) : (
                <span className="text-ink tabular-nums">{formatEuros(relevé.total)}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <PartialRelevés summary={summary} today={today} />
      <Gaps summary={summary} />
      {summary.bankNames.length > 0 ? (
        <p className="mt-4 text-body leading-relaxed text-ink-soft">{summary.bankNames.join(', ')}</p>
      ) : null}
      <p className="mt-6 text-subtitle font-semibold text-ink">Ça ressemble à tes chiffres&nbsp;?</p>
    </section>
  )
}

// Said, not refused: a placement absent from a relevé is not counted on that day, so a relevé made
// of a piece of the patrimoine draws a fall that never happened.
function PartialRelevés({ summary, today }: { summary: ImportSummary; today: string }) {
  const partial = partialRelevés(summary)
  if (partial.length === 0) return null
  return (
    <div className="mt-4 flex flex-col gap-2">
      {partial.map((relevé) => (
        <p key={relevé.takenOn} className="text-body leading-relaxed text-ink">
          Le relevé du {formatDayMonth(relevé.takenOn, today)} ne contient que{' '}
          {count(relevé.placements, 'placement', 'placements', 'aucun placement')}, contre {relevé.most} dans le plus
          complet.
        </p>
      ))}
      <p className="text-body leading-relaxed text-ink-soft">
        Un placement absent d’un relevé n’y est pas compté. Si ce n’est pas voulu, complète le fichier avant
        d’importer, ou demande à ton IA de mettre tous tes placements dans chaque relevé.
      </p>
    </div>
  )
}

// « Livret A, PEE Criteo et 3 autres »: a few names, not a wall.
const SHOWN_NAMES = 4
function names(list: string[]): string {
  if (list.length <= SHOWN_NAMES) return list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} et ${list.at(-1)}`
  const rest = list.length - (SHOWN_NAMES - 1)
  return `${list.slice(0, SHOWN_NAMES - 1).join(', ')} et ${rest} autres`
}

// What the file leaves out, said rather than guessed (a ChatGPT file had no loan and dropped the
// PEE it had no figure for, 10 November 2026). No loan is a neutral fact: many have none, and
// whoever has one sees at once that the net figure would be too high. A line with no figure is
// kept, and filled at the first monthly update, which offers every open line.
function Gaps({ summary }: { summary: ImportSummary }) {
  const missing = summary.withoutFigure
  if (summary.loans > 0 && missing.length === 0) return null
  return (
    <div className="mt-4 flex flex-col gap-2">
      {summary.loans === 0 ? (
        <p className="text-body leading-relaxed text-ink-soft">
          Ce fichier ne contient aucun crédit. Si tu en as un, ajoute-le avant d’importer&nbsp;: sans lui, ton patrimoine
          net serait trop haut.
        </p>
      ) : null}
      {missing.length > 0 ? (
        <p className="text-body leading-relaxed text-ink-soft">
          {missing.length === 1 ? 'Un placement n’a aucun chiffre' : `${missing.length} placements n’ont aucun chiffre`}
          &nbsp;: {names(missing)}. {missing.length === 1 ? 'Il ne compte' : 'Ils ne comptent'} qu’une fois{' '}
          {missing.length === 1 ? 'rempli' : 'remplis'}, à ta prochaine mise à jour.
        </p>
      ) : null}
    </div>
  )
}

