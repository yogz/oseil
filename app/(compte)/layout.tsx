import type { Metadata } from 'next'
import Link from 'next/link'
import { PRIVATE_METADATA } from '@/lib/app/site-metadata'
import { LandingGrid } from '@/components/landing/LandingGrid'
import { Brand } from '@/components/ui/Brand'

// The account screens — sign up, sign in, the recovery key. They open on the mark of the site (C1):
// the first image of someone who comes back.
//
// Decided by Nicolas on 10 November 2026, after the audit of the account screens:
// - the mark is a link to the landing: from the iPhone home screen, these screens had no way out;
// - on a phone, the mark is the small one of the landing, close to the top, so the form starts
//   higher (an iPhone SE kept half its first screen for the mark and its margins);
// - on a computer, the two columns of the landing (app/(public)/accueil/page.tsx, which copies those
//   of PageColumns): the grid on the left, touched it opens the example; the form on the right.
export const metadata: Metadata = PRIVATE_METADATA

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-4 pb-10 lg:grid lg:max-w-5xl lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-14 lg:pt-6">
      <header className="mb-6 flex min-h-11 items-center lg:col-span-2 lg:mb-8">
        <Link
          href="/"
          aria-label="Oseil, retour à l’accueil"
          className="inline-flex min-h-11 items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <Brand />
        </Link>
      </header>
      <div className="hidden lg:col-start-1 lg:row-start-2 lg:block">
        <LandingGrid />
      </div>
      <div className="flex min-w-0 flex-col lg:col-start-2 lg:row-start-2 lg:pt-6">{children}</div>
    </main>
  )
}
