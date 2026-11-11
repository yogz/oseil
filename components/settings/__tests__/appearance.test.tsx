// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { THEME_KEY } from '@/lib/app/theme'
import { memoryStorage } from '@/lib/auth/__tests__/memory-storage'
import { AppearanceChoice } from '../AppearanceChoice'

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

test('offers the three appearances, « Sombre » first and chosen by default', () => {
  render(<AppearanceChoice />)
  const buttons = screen.getAllByRole('button').map((b) => b.textContent)
  expect(buttons).toEqual(['Sombre', 'Clair', 'Comme l’appareil'])
  expect(screen.getByRole('button', { name: 'Sombre' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Clair' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('button', { name: 'Comme l’appareil' })).toHaveAttribute('aria-pressed', 'false')
})

test('a touch changes the page at once and keeps the choice on this device only', () => {
  render(<AppearanceChoice />)
  fireEvent.click(screen.getByRole('button', { name: 'Clair' }))
  expect(screen.getByRole('button', { name: 'Clair' })).toHaveAttribute('aria-pressed', 'true')
  expect(document.documentElement.dataset.theme).toBe('light')
  expect(localStorage.getItem(THEME_KEY)).toBe('light')
})

test('shows the choice already kept', () => {
  localStorage.setItem(THEME_KEY, 'system')
  render(<AppearanceChoice />)
  expect(screen.getByRole('button', { name: 'Comme l’appareil' })).toHaveAttribute('aria-pressed', 'true')
})
