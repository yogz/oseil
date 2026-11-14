import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Brand } from '@/components/ui/Brand'
import { PageColumns } from '@/components/ui/PageColumns'

// The privacy page (decided by Nicolas on 10 November 2026): public, read before an account exists,
// from the landing, the sign-up and the Réglages. Every sentence here is a claim about the code —
// what is encrypted (lib/vault), what leaves in clear (CLAUDE.md « Rien ne part en clair »), where
// the market data goes (lib/market) — and must stay true when the code changes. Adding a sentence
// is checking it first.
//
// Static: nothing here depends on who reads it.

export const metadata: Metadata = {
  title: 'Confidentialité',
  description: 'Ce qu’Oseil ne peut pas lire, ce qu’il garde en clair, ses prestataires et tes droits.',
  alternates: { canonical: '/confidentialite' },
}

const CONTACT = 'hello@milou.studio'
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const INLINE_LINK = `text-ink underline decoration-rule-strong underline-offset-4 ${FOCUS}`
const SECTION = 'mt-6 flex flex-col gap-3 border-t border-hairline pt-5'
const SECTION_TITLE = 'text-subtitle font-semibold leading-snug'
const SENTENCE = 'text-body leading-relaxed text-ink-soft'

function Mail() {
  return (
    <a href={`mailto:${CONTACT}`} className={INLINE_LINK}>
      {CONTACT}
    </a>
  )
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className={SECTION}>
      <h2 className={SECTION_TITLE}>{title}</h2>
      {children}
    </section>
  )
}

function Said({ children }: { children: ReactNode }) {
  return <p className={SENTENCE}>{children}</p>
}

// A row of a short list: the name in the colour of the text, what it is for after it.
function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <li className="border-b border-hairline py-3 first:pt-0 last:border-b-0 last:pb-0">
      <p className="text-body text-ink">{name}</p>
      <p className="mt-0.5 text-caption leading-normal text-ink-muted">{children}</p>
    </li>
  )
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col px-5 pt-2 pb-12 lg:max-w-5xl lg:pt-6">
      <header className="flex min-h-11 items-center lg:mb-8">
        <Link href="/" className={`inline-flex min-h-11 items-center ${FOCUS}`}>
          <Brand />
        </Link>
      </header>
      <PageColumns
        aside={
          <>
            <h1 className="pt-6 text-title font-semibold leading-tight tracking-[-0.01em] lg:pt-0">Confidentialité</h1>
            <p className="mt-1 text-caption text-ink-muted">Mise à jour le 11 novembre 2026</p>
            <p data-lead="" className="mt-4 text-subtitle leading-snug text-ink">
              Ce qui décrit ta situation est chiffré sur ton appareil avant de partir. Ni nous ni nos prestataires
              ne pouvons le lire.
            </p>
          </>
        }
      >
        <Part title="Ce que nous ne pouvons pas lire">
          <Said>
            Tes montants, tes comptes, tes placements, tes objectifs, tes notes&nbsp;: tout ce qui décrit ta
            situation est chiffré dans ton navigateur (<span className="whitespace-nowrap">AES-GCM 256</span>) avant
            d’être envoyé.
          </Said>
          <Said>Notre serveur ne garde que ces paquets chiffrés. Personne ne peut les ouvrir sans ta clé.</Said>
          <Said>Ton mot de passe ne part jamais. Seul un secret qui en est tiré sert à te connecter.</Said>
        </Part>

        <Part title="Ce que nous gardons en clair">
          <ul>
            <Row name="Ton adresse e-mail">
              Pour te connecter, pour t’écrire quand il faut confirmer ton adresse ou changer ton mot de passe, et
              pour te rappeler de mettre à jour tes chiffres, si tu ne l’as pas coupé.
            </Row>
            <Row name="Des repères techniques">
              Les dates de création et de mise à jour de tes paquets chiffrés, et leur type. Rien de ce qu’ils
              contiennent.
            </Row>
            <Row name="Pour Face ID">
              L’identifiant et la clé publique de ta clé d’accès. Ton visage et ton empreinte restent sur ton
              appareil.
            </Row>
            <Row name="Pour le rappel par e-mail">Si tu l’as coupé, et la date du dernier envoyé.</Row>
          </ul>
        </Part>

        <Part title="Les cours de bourse">
          <Said>
            Pour suivre le prix d’un titre, son symbole boursier (par exemple «&nbsp;CW8.PA&nbsp;») passe par notre
            serveur jusqu’à Yahoo Finance. Quand tu cherches un titre, le texte de ta recherche fait le même
            chemin.
          </Said>
          <Said>Les taux de change viennent de la Banque centrale européenne. Leur demande ne contient rien sur toi.</Said>
          <Said>
            Jamais de quantité, de montant ni de nom de compte. Et ces services ne savent pas qui demande&nbsp;:
            c’est notre serveur qui leur parle, pas ton navigateur.
          </Said>
        </Part>

        <Part title="Nos prestataires">
          <Said>Ils font tourner Oseil, sous contrat, sans accès à tes chiffres.</Said>
          <ul>
            <Row name="Supabase">La base de données, en Irlande.</Row>
            <Row name="Vercel">
              L’hébergement du site. Ses serveurs sont à Dublin&nbsp;; les pages passent par son réseau mondial.
            </Row>
            <Row name="Resend">L’envoi des e-mails, depuis l’Irlande.</Row>
          </ul>
        </Part>

        <Part title="La mesure d’audience">
          <Said>
            Nous pouvons mesurer l’audience du site, à des fins techniques seulement&nbsp;: nombre de visites, pages
            vues, vitesse.
          </Said>
          <Said>
            Sans cookie, sans suivre une personne d’une visite à l’autre, sans aucun montant ni nom, avec des outils
            hébergés en Europe (PostHog, Vercel).
          </Said>
          <Said>Pas de publicité, et rien n’est revendu. Jamais.</Said>
        </Part>

        <Part title="Sur ton appareil">
          <ul>
            <Row name="Des cookies techniques">
              Pour que tu restes connecté. Ils sont strictement nécessaires&nbsp;: c’est pourquoi Oseil ne t’affiche
              pas de bandeau.
            </Row>
            <Row name="La clé de ton coffre">Gardée par ton navigateur, effacée quand tu te déconnectes.</Row>
            <Row name="Deux petites marques">Qu’un compte a déjà servi sur cet appareil, et que Face ID y est activé.</Row>
            <Row name="Ton choix d’apparence">Claire ou sombre.</Row>
          </ul>
          <Said>Rien de cela ne sert à te suivre.</Said>
        </Part>

        <Part title="Tes droits">
          <Said>Tu peux accéder à tes données, les corriger, les emporter et les effacer.</Said>
          <Said>
            Pour les emporter, «&nbsp;Mes chiffres en fichier&nbsp;», dans les Réglages, te donne tous tes chiffres
            en Excel.
          </Said>
          <Said>
            Pour effacer, «&nbsp;Supprimer mon compte&nbsp;», dans les Réglages, efface ton compte et tout ce qu’il
            contient. Pour tout le reste, écris à <Mail />.
          </Said>
          <Said>
            Tu peux aussi saisir la CNIL (
            <a href="https://www.cnil.fr" className={INLINE_LINK}>
              cnil.fr
            </a>
            ).
          </Said>
        </Part>

        <Part title="Combien de temps">
          <Said>
            Tant que ton compte existe. Quand il est supprimé, tout est effacé&nbsp;; les sauvegardes techniques de
            nos prestataires disparaissent ensuite, à leur propre rythme.
          </Said>
        </Part>

        <Part title="Si tu perds tes clés">
          <Said>
            Si tu perds ton mot de passe et ta clé de secours, nous ne pouvons pas rouvrir tes chiffres à ta place.
            C’est le prix d’un coffre que nous ne pouvons pas lire.
          </Said>
          <Said>Garde ta clé de secours en lieu sûr, et télécharge tes chiffres de temps en temps.</Said>
        </Part>

        <Part title="Qui en répond">
          <Said>
            Le responsable du traitement de tes données est Milou Studio.
          </Said>
          <Said>
            Une question, une demande&nbsp;: <Mail />.
          </Said>
        </Part>
      </PageColumns>
    </main>
  )
}
