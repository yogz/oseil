// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import FirstLaunchLayout from '../layout'

afterEach(cleanup)

// « Se déconnecter » is on the welcome and on « Où est ton argent ? » (the Réglages cannot be
// reached from them and nothing is typed yet), and in the Réglages. Not on every step.
test('the layout of the first launch adds no sign-out of its own', () => {
  render(
    <FirstLaunchLayout>
      <h1>Une étape</h1>
    </FirstLaunchLayout>,
  )
  expect(screen.getByRole('heading', { name: 'Une étape' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Se déconnecter' })).not.toBeInTheDocument()
})
