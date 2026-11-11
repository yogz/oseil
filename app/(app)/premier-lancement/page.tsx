'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { SignOutFrame } from '@/components/account/SignOutFrame'
import { HundredSquares } from '@/components/money/HundredSquares'
import { useModel } from '@/lib/app/use-model'
import { CATEGORY_ORDER } from '@/lib/catalog'
import { todayIso } from '@/lib/dates'
import { monArgentView } from '@/lib/screens/mon-argent'
import { IMPORT_LINK } from '@/lib/transfer/format'
import { isVaultEmpty } from '@/lib/transfer/save-import'

// A fixed split, only to show what a grid looks like: it is nobody's money.
const EXAMPLE_SPLIT = [20, 20, 25, 5, 30]
const EXAMPLE = CATEGORY_ORDER.map((category, i) => ({ category, count: EXAMPLE_SPLIT[i] }))

// The Réglages cannot be reached from here and nothing is typed yet: the way out is « Se déconnecter ».
export default function WelcomePage() {
  return (
    <SignOutFrame>
      <Welcome />
    </SignOutFrame>
  )
}

function Welcome() {
  const state = useModel()
  const router = useRouter()
  // Only a profile past the first launch leaves: a launch not yet begun (or begun
  // without any establishment) stays here, which Mon argent also sends back to.
  const leaves = state.status === 'ready' && monArgentView(state.model, todayIso()).kind !== 'first-launch'

  // The import is offered only to an empty vault (no bank, nothing unreadable): it never replaces anything.
  const canImport = state.status === 'ready' && isVaultEmpty(state.model)

  useEffect(() => {
    if (leaves) router.replace('/')
  }, [leaves, router])

  return (
    // The whole welcome (« Tu peux t’arrêter… » and the import link's line included) fits one screen,
    // the way the landing does (app/(public)/accueil/page.tsx), in CSS only: the block is never taller
    // than the screen with Safari's bars shown (`100svh`, less the 12 px above it), and the grid's box
    // is the only one that gives up height when room is short. The cap never goes under 520 px, so a
    // phone held sideways keeps a readable grid and scrolls instead. Nothing is measured: nothing moves.
    <div className="flex max-h-[max(calc(100svh-0.75rem),32.5rem)] flex-col">
      {/* Smaller than the width, and one width whatever the model: the grid never jumps when it loads.
          Square at most; on a short screen the box gets shorter and the grid as wide as it allows. */}
      <div className="mx-auto aspect-square min-h-0 w-full max-w-[15.5rem] shrink [container-type:size]">
        <div className="mx-auto w-[min(100cqw,100cqh)]">
          <HundredSquares squares={EXAMPLE} animate label="Une grille de cent carrés, en exemple" />
        </div>
      </div>
      <h1 className="mt-6 text-title font-semibold leading-tight tracking-[-0.01em]">Ton argent, en 100 carrés</h1>
      <p className="mt-2 text-body leading-normal text-ink-soft">
        Chaque carré, c’est 1&nbsp;% de ce qui est à toi. D’un coup d’œil, tu vois où est ton argent, et s’il est là
        où tu le veux.
      </p>
      <p className="mt-2 text-body leading-normal text-ink">
        Pour commencer, on fait le tour de ce que tu possèdes. Compte un quart d’heure.
      </p>
      <Link
        href="/premier-lancement/ou"
        className="mt-5 inline-flex min-h-13 w-full items-center justify-center rounded-full bg-ink px-6 text-body font-semibold text-ground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        C’est parti
      </Link>
      <p className="mt-3 text-center text-caption text-ink-muted">Tu peux t’arrêter quand tu veux, rien n’est perdu.</p>
      {/* The line is always there, so nothing moves when the link appears; empty (nothing to focus or
          announce) until the vault is known to be empty. */}
      <div data-import-line className="flex min-h-11 justify-center">
        {canImport ? (
          <Link
            href="/premier-lancement/importer"
            // In the colour of the text, not grey (10 November 2026): a second way in, seen at once, that
            // still leaves « C’est parti » the way first.
            className="inline-flex min-h-11 items-center text-caption font-semibold text-ink underline decoration-rule-strong underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {IMPORT_LINK}
          </Link>
        ) : null}
      </div>
    </div>
  )
}
