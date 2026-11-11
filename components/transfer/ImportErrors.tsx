'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { formatError, type ImportError } from '@/lib/transfer/import-types'
import { errorsPrompt } from '@/lib/transfer/instructions'

// More would be a wall: the person corrects the first ones, then chooses the file again.
export const SHOWN_ERRORS = 20

// By sheet, in the order they come (the import sorts them by sheet, then by row); the errors
// of the whole file (not an Excel file, too big) first.
function bySheet(errors: ImportError[]): ImportError[][] {
  const groups = new Map<string | null, ImportError[]>([[null, []]])
  for (const error of errors) {
    const group = groups.get(error.sheet)
    if (group) group.push(error)
    else groups.set(error.sheet, [error])
  }
  return [...groups.values()].filter((group) => group.length > 0)
}

export function ImportErrors({ errors }: { errors: ImportError[] }) {
  const ordered = bySheet(errors).flat()
  const shown = bySheet(ordered.slice(0, SHOWN_ERRORS))
  const others = ordered.length - SHOWN_ERRORS
  return (
    <section aria-label="Ce qui ne va pas dans le fichier" className="flex flex-col">
      <p role="alert" className="text-body leading-relaxed text-ink">
        Rien n’est enregistré. Corrige ces points dans le fichier, puis choisis-le de nouveau.
      </p>
      {shown.map((group, i) => (
        <ul key={group[0].sheet ?? `file-${i}`} className="mt-4 flex flex-col gap-2">
          {group.map((error, j) => (
            <li key={j} className="text-body leading-relaxed text-ink-soft">
              {formatError(error)}
            </li>
          ))}
        </ul>
      ))}
      {others > 0 ? (
        <p className="mt-4 text-body text-ink-soft">
          et {others} {others === 1 ? 'autre' : 'autres'}
        </p>
      ) : null}
      <AiFix errors={ordered} />
    </section>
  )
}

// A file made by an AI is corrected by the same AI (Nicolas, 10 November 2026): the messages, all
// of them, copied by a touch to be pasted back. Without a clipboard they are on screen anyway.
function AiFix({ errors }: { errors: ImportError[] }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(errorsPrompt(errors))
      setCopied(true)
    } catch {
      // The messages stay on screen, to be copied by hand.
    }
  }
  return (
    <div className="mt-6 flex flex-col items-start gap-3">
      <p className="text-body leading-relaxed text-ink-soft">
        Fait avec ton IA&nbsp;? Colle-lui ces messages&nbsp;: elle corrigera le fichier.
      </p>
      <Button variant="secondary" onClick={copy}>
        {copied ? 'Messages copiés' : 'Copier les messages'}
      </Button>
    </div>
  )
}
