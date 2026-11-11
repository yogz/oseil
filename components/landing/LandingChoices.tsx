'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'
import { accountHere } from '@/lib/auth/account-here'

// Whether an account has served on this device (lib/auth/account-here.ts), or null while it is not
// known: the server cannot read it, and the first render in the browser repeats what the server sent.
// The marker changes on no one's watch here, so there is nothing to subscribe to.
const noChange = () => () => {}
export function useAccountHere(): boolean | null {
  return useSyncExternalStore(
    noChange,
    () => accountHere.isSet(),
    () => null,
  )
}

export const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
// Links that look like pills: each of them leads to another screen.
export const WHITE_PILL =
  'inline-flex min-h-13 w-full items-center justify-center rounded-full bg-ink px-6 text-body font-semibold text-ground lg:w-auto lg:px-7 ' +
  FOCUS
export const OUTLINE_PILL =
  'mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full border border-rule-strong px-6 text-body font-medium text-ink lg:mt-0 lg:min-h-13 lg:w-auto lg:px-7 ' +
  FOCUS
const LINK = `inline-flex min-h-11 items-center text-body text-ink-soft underline decoration-rule-strong underline-offset-4 ${FOCUS}`

// The two versions: a first visit is asked to create an account; a device where one has served is
// asked to sign in. The other way stays a link.
function choicesOf(accountServed: boolean) {
  return accountServed
    ? { first: { href: '/connexion', label: 'Me connecter' }, other: { href: '/inscription', label: 'Créer un compte' } }
    : { first: { href: '/inscription', label: 'Créer mon compte' }, other: { href: '/connexion', label: 'J’ai déjà un compte' } }
}

// The choices under the sentence. Their room is kept before the marker is read and holds nothing
// until then: nothing jumps, and nothing to focus is about to change. `min-h-39` (156 px) is the
// phone's column: the white pill (min-h-13, 52) + the outlined pill's margin (mt-3, 12) + the
// outlined pill (min-h-12, 48) + the link (min-h-11, 44). `lg:min-h-13`: the two pills side by side.
export function LandingActions() {
  const served = useAccountHere()
  const choices = served === null ? null : choicesOf(served)
  return (
    <div data-landing-actions="" className="mt-5 flex min-h-39 flex-col lg:mt-6 lg:min-h-13 lg:flex-row lg:items-center lg:gap-3">
      {choices ? (
        <>
          <Link href={choices.first.href} className={WHITE_PILL}>
            {choices.first.label}
          </Link>
          <Link href="/exemple" className={OUTLINE_PILL}>
            Voir un exemple
          </Link>
          {/* On a computer, this link is at the top right instead. */}
          <Link href={choices.other.href} className={`${LINK} justify-center lg:hidden`}>
            {choices.other.label}
          </Link>
        </>
      ) : null}
    </div>
  )
}

// On a computer, the other way in, at the top right, level with the mark. Empty until known.
export function LandingTopLink() {
  const served = useAccountHere()
  const other = served === null ? null : choicesOf(served).other
  return (
    <div data-landing-top-link="" className="hidden lg:flex">
      {other ? (
        <Link href={other.href} className={LINK}>
          {other.label}
        </Link>
      ) : null}
    </div>
  )
}
