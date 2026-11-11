// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { TextField } from '../TextField'

afterEach(cleanup)

test('a date field is a date input with its bounds, and a dark picker', () => {
  render(<TextField label="Date" type="date" min="2026-09-30" max="2026-11-07" defaultValue="2026-11-07" />)
  const input = screen.getByLabelText('Date')
  expect(input).toHaveAttribute('type', 'date')
  expect(input).toHaveAttribute('min', '2026-09-30')
  expect(input).toHaveAttribute('max', '2026-11-07')
  expect(input).toHaveClass('scheme-dark')
})

test('a text field has no dark-picker class', () => {
  render(<TextField label="Nom" type="text" />)
  expect(screen.getByLabelText('Nom')).not.toHaveClass('scheme-dark')
})
