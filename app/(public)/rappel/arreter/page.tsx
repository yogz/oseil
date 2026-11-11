import type { Metadata } from 'next'
import Link from 'next/link'
import { StopReminder } from '@/components/reminder/StopReminder'
import { Brand } from '@/components/ui/Brand'
import { PageColumns } from '@/components/ui/PageColumns'
import { STOP_REMINDER_SENTENCE, STOP_REMINDER_TITLE } from '@/lib/screens/words'

// The page of « Ne plus recevoir ce rappel », at the bottom of the reminder e-mail
// (`https://oseil.fr/rappel/arreter?jeton=…`). Public: it opens without signing in (lib/auth/routing.ts).
// Opening it switches nothing off; only the touch on the button does (components/reminder/StopReminder.tsx).
//
// Dynamic by nature: it reads the address it was opened with.

// Opened from an e-mail, with its own key in the address: never in a search engine (11 November 2026).
export const metadata: Metadata = { title: { absolute: 'Oseil, le rappel par e-mail' }, robots: { index: false, follow: false } }

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The token of the link, or null when it has none that could be one (absent, repeated, not a uuid).
function tokenOf(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && UUID.test(value) ? value : null
}

export default async function StopReminderPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const token = tokenOf((await searchParams).jeton)
  return (
    // The shell of the privacy page: on a computer, the two columns of Mon argent (PageColumns), the title
    // and its sentence on the left, the button on the right.
    <main className="mx-auto flex w-full max-w-md flex-col px-5 pt-2 pb-12 lg:max-w-5xl lg:pt-6">
      <header className="flex min-h-11 items-center lg:mb-8">
        <Link href="/" className={`inline-flex min-h-11 items-center ${FOCUS}`}>
          <Brand />
        </Link>
      </header>
      <PageColumns
        aside={
          <>
            <h1 className="pt-6 text-title font-semibold leading-tight tracking-[-0.01em] lg:pt-0">{STOP_REMINDER_TITLE}</h1>
            <p className="mt-3 text-body leading-relaxed text-ink-soft">{STOP_REMINDER_SENTENCE}</p>
          </>
        }
      >
        <StopReminder token={token} />
      </PageColumns>
    </main>
  )
}
