'use client'

import Link from 'next/link'
import { Sheet } from '@/components/ui/Sheet'
import { SIGN_UP } from './links'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const WHITE_PILL = `mt-5 inline-flex min-h-13 w-full items-center justify-center rounded-full bg-ink px-6 text-body font-semibold text-ground ${FOCUS}`
const CONTINUE = `mt-1 inline-flex min-h-11 w-full items-center justify-center text-body text-ink-soft underline decoration-rule-strong underline-offset-4 ${FOCUS}`

// What « Mettre à jour » and the gear open in the example (spec of the landing, « Ce qu’on ne peut
// pas y faire »): the example keeps nothing, an account would. At the bottom of a phone, over the
// screen it leaves dimmed; « Continuer l’exemple », Escape or a touch on the dimmed screen close it,
// and the focus goes back to what opened it.
export function ExampleSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="L’exemple ne garde rien"
      text="Crée ton compte pour noter tes propres chiffres. Ils seront chiffrés sur ton appareil."
    >
      <Link href={SIGN_UP} className={WHITE_PILL}>
        Créer mon compte
      </Link>
      <button type="button" onClick={onClose} className={CONTINUE}>
        Continuer l’exemple
      </button>
    </Sheet>
  )
}
