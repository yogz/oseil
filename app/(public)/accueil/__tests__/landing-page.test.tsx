// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { memoryStorage } from '@/lib/auth/__tests__/memory-storage'
import LandingPage, { metadata } from '../page'
import { SITE_STRUCTURED_DATA } from '@/lib/app/site-metadata'

const { connection } = vi.hoisted(() => ({ connection: vi.fn(async () => {}) }))
vi.mock('next/server', () => ({ connection }))

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const hrefsOf = (name: string) => screen.getAllByRole('link', { name }).map((link) => link.getAttribute('href'))

test('the landing opens on the mark of the site and its promise, with no session to read', async () => {
  const { container } = render(await LandingPage())
  expect(container.querySelector('[data-brand-mark]')).not.toBeNull()
  expect(screen.getByRole('heading', { level: 1, name: 'Ton argent, en 100 carrés' })).toBeInTheDocument()
  expect(
    screen.getByText(
      'Fais l’état des lieux de ton patrimoine, vois comment il est réparti, ajuste-le à tes objectifs et suis-le mois après mois.',
    ),
  ).toBeInTheDocument()
})

// A static page is kept by the browser for minutes: after signing in, `/` would show it again.
test('the landing waits for the request, so that it is never prerendered', async () => {
  connection.mockClear()
  await LandingPage()
  expect(connection).toHaveBeenCalledTimes(1)
})

test('a first visit offers to create an account first, then the example, then to sign in', async () => {
  render(await LandingPage())
  // Under the sentence, and again at the end of the tour.
  expect(hrefsOf('Créer mon compte')).toEqual(['/inscription', '/inscription'])
  expect(screen.getByRole('link', { name: 'Voir un exemple' })).toHaveAttribute('href', '/exemple')
  // Under the pills on a phone, at the top right on a computer.
  const signIn = hrefsOf('J’ai déjà un compte')
  expect(signIn.length).toBeGreaterThan(0)
  expect(signIn.every((href) => href === '/connexion')).toBe(true)
  expect(screen.queryByRole('link', { name: 'Me connecter' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Créer un compte' })).toBeNull()
})

test('on a device where an account has served, signing in comes first', async () => {
  localStorage.setItem('oseil-compte-ici', '1')
  render(await LandingPage())
  expect(screen.getByRole('link', { name: 'Me connecter' })).toHaveAttribute('href', '/connexion')
  expect(screen.getByRole('link', { name: 'Voir un exemple' })).toHaveAttribute('href', '/exemple')
  const signUp = hrefsOf('Créer un compte')
  expect(signUp.length).toBeGreaterThan(0)
  expect(signUp.every((href) => href === '/inscription')).toBe(true)
  expect(screen.queryByRole('link', { name: 'Créer mon compte' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'J’ai déjà un compte' })).toBeNull()
})

test('a storage that refuses reads as a first visit', async () => {
  const refuse = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  }
  vi.stubGlobal('localStorage', { length: 0, key: refuse, getItem: refuse, setItem: refuse, removeItem: refuse, clear: refuse })
  render(await LandingPage())
  expect(hrefsOf('Créer mon compte')).toEqual(['/inscription', '/inscription'])
})

// The server cannot read the marker: what it sends keeps the room of the choices, empty, so that
// nothing moves once the browser has read it, and nothing can be focused that is about to change.
test('before the marker is read, the choices keep their room and hold nothing', async () => {
  localStorage.setItem('oseil-compte-ici', '1')
  const before = document.createElement('div')
  before.innerHTML = renderToString(await LandingPage())
  const reserved = before.querySelector('[data-landing-actions]')
  expect(reserved).not.toBeNull()
  expect(reserved?.querySelector('a, button')).toBeNull()
  expect(before.querySelector('[data-landing-top-link]')?.querySelector('a, button')).toBeNull()

  const { container } = render(await LandingPage())
  const shown = container.querySelector('[data-landing-actions]')
  expect(shown?.className).toBe(reserved?.className)
  expect(shown?.querySelector('a')).not.toBeNull()
})

test('the grid is an example to open', async () => {
  render(await LandingPage())
  const grid = screen.getByRole('link', { name: 'Ouvrir l’exemple' })
  expect(grid).toHaveAttribute('href', '/exemple')
  expect(grid.querySelectorAll('[data-square]')).toHaveLength(100)
})

// No amount on the landing: a figure there would be read as someone's money.
test('the landing shows no figure but the 100 of its title', async () => {
  for (const marker of [false, true]) {
    if (marker) localStorage.setItem('oseil-compte-ici', '1')
    const { container, unmount } = render(await LandingPage())
    // What is read on screen: the structured data, for the search engines, is never shown; the
    // security note at the foot carries its own cryptographic parameters and date.
    const shown = container.cloneNode(true) as HTMLElement
    for (const el of Array.from(shown.querySelectorAll('script, [data-audit-note]'))) el.remove()
    const text = shown.textContent ?? ''
    expect(text).not.toContain('€')
    expect(text.replace('100', '')).not.toMatch(/\d/)
    unmount()
  }
})

// What the search engines read to know what Oseil is (lib/app/site-metadata.ts).
test('the landing carries the structured data, and names `/` as its address', async () => {
  const { container } = render(await LandingPage())
  const script = container.querySelector('script[type="application/ld+json"]')
  expect(JSON.parse(script?.textContent ?? '')).toEqual(SITE_STRUCTURED_DATA)
  expect(metadata.alternates).toEqual({ canonical: '/' })
})

test('the three promises and the foot of the page', async () => {
  const { container } = render(await LandingPage())
  for (const line of ['Tes chiffres restent à toi', 'Quelques minutes par mois', 'Tes objectifs, pas les nôtres']) {
    expect(screen.getByText(line)).toBeInTheDocument()
  }
  expect(container.textContent).toContain('Tu choisis ta répartition idéale ; Oseil te montre si\u00A0tu\u00A0y\u00A0es.')
  expect(container.textContent).toContain('Chiffrés sur ton appareil : même nous ne pouvons pas les lire.')
  expect(screen.getByText('Oseil', { selector: 'footer p' })).toBeInTheDocument()
})

test('the foot of the page leads to the privacy page', async () => {
  render(await LandingPage())
  expect(screen.getByRole('link', { name: 'Confidentialité' })).toHaveAttribute('href', '/confidentialite')
})

// The words come first: every step is sent whole, readable with no script, and the picture beside
// them, which says nothing they do not, is hidden from VoiceOver.
test('the tour tells its five steps in the page as sent, its picture hidden from screen readers', async () => {
  const sent = document.createElement('div')
  sent.innerHTML = renderToString(await LandingPage())
  const tour = sent.querySelector('[data-landing-tour]')!
  expect(tour.querySelector('h2')?.textContent).toBe('Ton tableur de suivi, en mieux')
  expect(Array.from(tour.querySelectorAll('ol > li h3')).map((h) => h.textContent)).toEqual([
    'Tu notes tes comptes une fois',
    'Tu vois où est ton argent',
    'Tu choisis tes objectifs, on te dit où tu en es',
    'Les cours se mettent à jour seuls',
    'Tu le suis relevé après relevé',
  ])
  expect(tour.querySelector('[data-tour-picture]')?.getAttribute('aria-hidden')).toBe('true')
})

// At the end of the tour: a first visit is asked for an account; a device where one has served
// already has « Me connecter » at the top, and is offered the whole example only.
test('the end of the tour leads to the whole example, and to an account on a first visit', async () => {
  for (const marker of [false, true]) {
    if (marker) localStorage.setItem('oseil-compte-ici', '1')
    const { container, unmount } = render(await LandingPage())
    const tour = container.querySelector('[data-landing-tour]') as HTMLElement
    const links = Array.from(tour.querySelectorAll('a')).map((a) => [a.textContent, a.getAttribute('href')])
    expect(links).toEqual(
      marker
        ? [['Voir l’exemple en entier', '/exemple']]
        : [
            ['Créer mon compte', '/inscription'],
            ['Voir l’exemple en entier', '/exemple'],
          ],
    )
    unmount()
  }
})

// Planche C (Nicolas, 11 November 2026): the simple sentence first, the AI review under it, the
// technical detail folded; the padlock says « chiffré » in words beside it.
test('shows the security note at the bottom of the landing, its detail folded', async () => {
  render(await LandingPage())
  const note = screen.getByRole('complementary', { name: 'Personne d’autre que toi ne peut lire tes chiffres' })
  expect(note).toHaveTextContent('Chiffré sur ton appareil')
  expect(note.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  expect(note).toHaveTextContent(/Sécurité relue par une IA, Gemini 4 Argon \(Antigravity\), le 11\snovembre 2026/)
  const detail = note.querySelector('details')!
  expect(detail.open).toBe(false)
  expect(detail.querySelector('summary')).toHaveTextContent('Le détail technique')
  expect(detail).toHaveTextContent(/Argon2id \(64\sMio, 3\sitérations\)/)
  expect(detail).toHaveTextContent(/AES-GCM 256/)
})

// The code is public for reading (scripts/publish-public.sh): anyone can check what the note says.
test('the security note leads to the public code', async () => {
  render(await LandingPage())
  const note = screen.getByRole('complementary', { name: 'Personne d’autre que toi ne peut lire tes chiffres' })
  const link = within(note).getByRole('link', { name: /Le code est ouvert/ })
  expect(link).toHaveAttribute('href', 'https://github.com/yogz/oseil')
})
