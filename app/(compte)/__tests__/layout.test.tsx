// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import AccountLayout from '../layout'

afterEach(cleanup)

// C1, then the logo chosen by Nicolas on 9 November 2026: two squares by two, three filled in the
// colours of the categories and the last one an outline in the white of the reference, still to fill.
test('the account screens open on the mark and the name of the site, above their title', () => {
  const { container } = render(
    <AccountLayout>
      <h1>Te connecter</h1>
    </AccountLayout>,
  )
  const mark = container.querySelector('[data-brand-mark]')!
  expect(mark).toHaveAttribute('aria-hidden', 'true')
  const squares = Array.from(mark.children)
  expect(squares).toHaveLength(4)
  expect(squares.map((square) => square.className.match(/bg-cat-[a-z]+/)?.[0])).toEqual([
    // Option B1, chosen by Nicolas on 12 November 2026: available, markets, gold, then the square to fill.
    'bg-cat-available',
    'bg-cat-markets',
    'bg-cat-gold',
    undefined,
  ])
  expect(squares[3]).toHaveClass('border-ink')
  const name = screen.getByText('Oseil')
  expect(name.compareDocumentPosition(screen.getByRole('heading', { name: 'Te connecter' }))).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
})

// Decided by Nicolas on 10 November 2026, after the audit of the account screens: the mark leads back
// to the landing (from the iPhone home screen, these screens had no way out), and on a computer the
// screens take the two columns of the landing, the grid on the left and the form on the right.
test('the mark leads back to the landing', () => {
  render(
    <AccountLayout>
      <h1>Te connecter</h1>
    </AccountLayout>,
  )
  const home = screen.getByRole('link', { name: 'Oseil, retour à l’accueil' })
  expect(home).toHaveAttribute('href', '/')
  expect(home).toContainElement(screen.getByText('Oseil'))
})

test('on a computer, the grid of the landing sits left of the form, and stays off a phone', () => {
  render(
    <AccountLayout>
      <h1>Te connecter</h1>
    </AccountLayout>,
  )
  const grid = screen.getByRole('link', { name: 'Ouvrir l’exemple' })
  const column = grid.parentElement!
  expect(column).toHaveClass('hidden', 'lg:block', 'lg:col-start-1')
  const form = screen.getByRole('heading', { name: 'Te connecter' }).parentElement!
  expect(form).toHaveClass('lg:col-start-2')
  expect(screen.getByRole('main')).toHaveClass('lg:grid-cols-2')
})
