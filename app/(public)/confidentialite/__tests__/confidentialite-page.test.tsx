// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import PrivacyPage, { metadata } from '../page'

vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props} />,
}))

afterEach(cleanup)

test('one title, the date of the text, and the strongest promise first', () => {
  const { container } = render(<PrivacyPage />)
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByRole('heading', { level: 1, name: 'Confidentialité' })).toBeInTheDocument()
  expect(screen.getByText('Mise à jour le 11 novembre 2026')).toBeInTheDocument()
  const lead = container.querySelector('[data-lead]')
  expect(lead).toHaveTextContent('Ni nous ni nos prestataires ne pouvons le lire.')
  expect(metadata.title).toBe('Confidentialité')
  expect(metadata.alternates).toEqual({ canonical: '/confidentialite' })
})

test('the sections, in order', () => {
  render(<PrivacyPage />)
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
    'Ce que nous ne pouvons pas lire',
    'Ce que nous gardons en clair',
    'Les cours de bourse',
    'Nos prestataires',
    'La mesure d’audience',
    'Sur ton appareil',
    'Tes droits',
    'Combien de temps',
    'Si tu perds tes clés',
    'Qui en répond',
  ])
})

test('the contact is an e-mail to write to, and the CNIL a link', () => {
  render(<PrivacyPage />)
  const mails = screen.getAllByRole('link', { name: 'hello@milou.studio' })
  expect(mails.length).toBeGreaterThan(0)
  for (const mail of mails) expect(mail).toHaveAttribute('href', 'mailto:hello@milou.studio')
  expect(screen.getByRole('link', { name: 'cnil.fr' })).toHaveAttribute('href', 'https://www.cnil.fr')
  expect(screen.getByText(/Milou Studio/)).toBeInTheDocument()
})

test('the mark of the site leads back to the address of the site', () => {
  render(<PrivacyPage />)
  expect(screen.getByRole('link', { name: 'Oseil' })).toHaveAttribute('href', '/')
})

// The page says what leaves and what does not: it must never say a figure is sent.
test('what the page promises about the market data', () => {
  const { container } = render(<PrivacyPage />)
  const text = container.textContent ?? ''
  expect(text).toContain('Jamais de quantité, de montant ni de nom de compte.')
  expect(text).toContain('AES-GCM 256')
  expect(text).not.toContain('€')
})

// The reminder e-mail (spec of the reminder, « Page de confidentialité »).
test('what the server knows about the reminder e-mail', () => {
  const { container } = render(<PrivacyPage />)
  const text = container.textContent ?? ''
  expect(text).toContain('et pour te rappeler de mettre à jour tes chiffres, si tu ne l’as pas coupé')
  expect(screen.getByText('Pour le rappel par e-mail')).toBeInTheDocument()
  expect(text).toContain('Si tu l’as coupé, et la date du dernier envoyé.')
})
