import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { LandingActions, LandingTopLink } from '@/components/landing/LandingChoices'
import { LandingGrid } from '@/components/landing/LandingGrid'
import { LandingTour } from '@/components/landing/LandingTour'
import { LockIcon } from '@/components/ui/LockIcon'
import { landingTour } from '@/lib/landing/tour'
import { Brand } from '@/components/ui/Brand'
import type { CategoryId } from '@/lib/model/types'
import { FILL } from '@/components/money/HundredSquares'
import { SITE_STRUCTURED_DATA } from '@/lib/app/site-metadata'
import { ACCOUNT_DELETED, ACCOUNT_DELETED_PARAM } from '@/lib/screens/settings-words'

// Served at `/`: its canonical address is `/`, never `/accueil`.
export const metadata: Metadata = { alternates: { canonical: '/' } }

// The structured data, written as the page is: `<` escaped so that no text can close the script.
const STRUCTURED_DATA = JSON.stringify(SITE_STRUCTURED_DATA).replace(/</g, '\\u003c')

// The landing: what a visitor without a session sees at `/`. `proxy.ts`
// rewrites `/` here, so the address stays `/`; a visitor never sees
// `/accueil` itself. It lives outside the (app) group, whose layout sends
// anyone without a session to /connexion.
//
// Rendered per request, never prerendered: the browser keeps a static page for
// minutes, and would show this one again at `/` after signing in, in place of
// Mon argent. A dynamic page is not kept.
//
// On a phone, the first screen (mark, grid, title, sentence, choices) fits without scrolling: the
// block is never taller than the screen with Safari's bars shown (`100svh`), and the grid's box is
// the only one that gives up height when room is short (the idea of lib/app/grid-fit.ts, in CSS: a
// box square at most, the grid as wide as the box allows). The box can shrink all the way, so the
// block never overflows its cap onto the promises below; the cap itself never goes under 520 px
// (32.5rem), so that on a very short screen (a phone held sideways) the grid keeps a readable size
// and the page scrolls instead. Nothing is measured, so nothing moves once the page is in the browser. On a computer, the two columns of Mon argent
// (components/ui/PageColumns.tsx: two halves, 56 px apart): the grid on the left, the reading on
// the right. The first-screen block then gives its pieces to the columns (`lg:contents`).

const PROMISES: Array<{ category: CategoryId; title: string; caption: string }> = [
  {
    category: 'secured',
    title: 'Tes chiffres restent à toi',
    caption: 'Chiffrés sur ton appareil : même nous ne pouvons pas les lire. Tu les emportes en Excel quand tu veux.',
  },
  {
    category: 'available',
    title: 'Quelques minutes par mois',
    caption: 'Tu notes tes comptes une fois. Les actions et les fonds que tu suis se mettent à jour tout seuls.',
  },
  {
    category: 'gold',
    title: 'Tes objectifs, pas les nôtres',
    caption: 'Tu choisis ta répartition idéale ; Oseil te montre si tu y es.',
  },
]

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

// `searchParams` survives the rewrite of `/` (proxy.ts keeps the query on a rewrite). Optional, so that
// the tests can render the page as a visitor arriving with nothing in the address.
export default async function LandingPage({ searchParams }: { searchParams?: SearchParams } = {}) {
  await connection()
  // After « Supprimer mon compte » (components/settings/DeleteAccount.tsx), the site comes here by a full load.
  const deleted = (await searchParams)?.[ACCOUNT_DELETED_PARAM.name] === ACCOUNT_DELETED_PARAM.value
  return (
    <main className="mx-auto flex w-full max-w-md flex-col px-5 pb-10 lg:grid lg:max-w-5xl lg:grid-cols-2 lg:grid-rows-[auto_auto_1fr_auto] lg:items-start lg:gap-x-14 lg:pt-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: STRUCTURED_DATA }} />
      <div className="flex max-h-[max(100svh,32.5rem)] flex-col pt-2 pb-2 lg:contents">
        <header className="flex min-h-11 items-center justify-between lg:col-span-2 lg:mb-8">
          <Brand />
          <LandingTopLink />
        </header>
        <div className="mt-1 aspect-square min-h-0 shrink [container-type:size] lg:col-start-1 lg:row-span-2 lg:row-start-2 lg:mt-0 lg:aspect-auto lg:min-h-0 lg:[container-type:normal]">
          <LandingGrid />
        </div>
        <div className="lg:col-start-2 lg:row-start-2 lg:pt-6">
          {deleted ? (
            <p role="status" className="mt-5 border-l-2 border-ink pl-3 text-body leading-relaxed text-ink lg:mt-0 lg:mb-5">
              {ACCOUNT_DELETED}
            </p>
          ) : null}
          <h1 className="mt-5 text-title font-semibold leading-tight tracking-[-0.01em] lg:mt-0">Ton argent, en 100 carrés</h1>
          <p className="mt-2 text-body leading-normal text-ink-soft">
            Fais l’état des lieux de ton patrimoine, vois comment il est réparti, ajuste-le à tes objectifs et
            suis-le mois après mois.
          </p>
          <LandingActions />
        </div>
      </div>
      <ul className="mt-7 border-t border-hairline lg:col-start-2 lg:row-start-3">
        {PROMISES.map((promise) => (
          <li key={promise.title} className="flex gap-3 border-b border-hairline py-3.5">
            <span aria-hidden="true" className={`mt-1.5 size-square-s shrink-0 rounded-square ${FILL[promise.category]}`} />
            <div>
              <p className="text-body text-ink">{promise.title}</p>
              <p className="mt-0.5 text-caption leading-normal text-ink-muted">{promise.caption}</p>
            </div>
          </li>
        ))}
      </ul>
      <LandingTour tour={landingTour()} />
      {/* Planche C, chosen by Nicolas on 11 November 2026: the simple sentence first, the AI review
          under it, the technical detail folded for those who want to check. */}
      <aside
        data-audit-note=""
        aria-labelledby="security-title"
        className="mt-14 rounded-control border border-hairline bg-field px-4 py-3.5 lg:col-span-2 lg:mt-20"
      >
        <p className="inline-flex items-center gap-1.5 rounded-full border border-rule-strong py-0.5 pr-2.5 pl-2 text-caption text-ink">
          <LockIcon className="size-3.5 shrink-0" />
          Chiffré sur ton appareil
        </p>
        <h2 id="security-title" className="mt-2.5 text-body font-medium text-ink">
          Personne d’autre que toi ne peut lire tes chiffres
        </h2>
        <p className="mt-1.5 text-caption leading-relaxed text-ink-soft">
          Ton mot de passe ne quitte jamais ton appareil. Tes montants sont chiffrés avant d’être envoyés{' '}: nous
          ne recevons que des données illisibles.
        </p>
        <p className="mt-2 text-caption leading-normal text-ink-muted">
          Sécurité relue par une IA, Gemini 4 Argon (Antigravity), le 11{' '}novembre 2026.
        </p>
        <details className="mt-1 group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-caption text-ink-soft underline decoration-rule-strong underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [&::-webkit-details-marker]:hidden">
            Le détail technique
          </summary>
          <p className="text-caption leading-relaxed text-ink-muted">
            Chiffrement de bout en bout (zero-knowledge). Ton navigateur dérive ton mot de passe par Argon2id
            (64{' '}Mio, 3{' '}itérations) puis HKDF-SHA256 en deux clés distinctes, l’une pour
            t’authentifier et l’autre pour déverrouiller ta clé de chiffrement AES-GCM 256. Cette clé reste gardée en
            mode non-extractible dans ton navigateur (IndexedDB), et le secret matériel de Face ID (WebAuthn PRF) est
            filtré par liste blanche avant tout envoi. Le serveur ne reçoit que des paquets chiffrés et authentifiés
            (AAD liés à ton compte), isolés dans PostgreSQL par une double barrière (filtrage applicatif et règles RLS
            vérifiées par 34 tests automatisés){' '}: même en ouvrant la base, personne ne peut lire tes chiffres.
          </p>
        </details>
        {/* The code itself, public for reading since 11 November 2026 (scripts/publish-public.sh). */}
        <a
          href="https://github.com/yogz/oseil"
          className="inline-flex min-h-11 items-center text-caption text-ink-soft underline decoration-rule-strong underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Le code est ouvert{'\u00A0'}: le lire sur GitHub ›
        </a>
      </aside>
      <footer className="mt-6 flex flex-wrap items-center gap-x-4 lg:col-span-2 lg:mt-8">
        <p className="text-caption text-ink-muted">Oseil</p>
        <Link
          href="/confidentialite"
          className="inline-flex min-h-11 items-center text-caption text-ink-muted underline decoration-rule-strong underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Confidentialité
        </Link>
      </footer>
    </main>
  )
}
