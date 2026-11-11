import Link from 'next/link'
import { LEAVE, SIGN_UP } from './links'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const LINK = `inline-flex min-h-11 shrink-0 items-center whitespace-nowrap text-ink underline decoration-rule-strong underline-offset-4 ${FOCUS}`

// At the top of every screen of the example, and staying there: what it is, and the two ways out.
// One line, never wrapped, on a 375-point phone (spec of the landing, « Entrée et sortie »).
export function ExampleBanner() {
  return (
    <div data-example-banner="" className="sticky top-0 z-30 border-b border-hairline bg-ground">
      <div className="mx-auto flex w-full max-w-md items-center gap-3 px-4 text-caption lg:max-w-5xl lg:px-5">
        <p className="mr-auto min-w-0 truncate whitespace-nowrap text-ink-soft">Exemple, chiffres inventés</p>
        <Link href={SIGN_UP} className={LINK}>
          Créer mon compte
        </Link>
        <Link href={LEAVE} className={LINK}>
          Quitter
        </Link>
      </div>
    </div>
  )
}
