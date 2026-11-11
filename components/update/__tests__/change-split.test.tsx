// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import type { ResultView } from '@/lib/update/result'
import { ChangeSplit } from '../ChangeSplit'

afterEach(cleanup)

type Split = Extract<ResultView, { kind: 'result' }>['split']
const row = (part: 'effort' | 'markets' | 'property', amount: string, loss = false) => ({
  part,
  label: part === 'effort' ? 'Ton effort' : 'Les marchés et les intérêts',
  detail: 'une phrase',
  amount,
  loss,
})

test('draws two parts, 65 % and 35 % wide, in the colours of the parts', () => {
  const split: Split = {
    bar: [
      { part: 'effort', share: 0.65 },
      { part: 'markets', share: 0.35 },
    ],
    rows: [row('effort', '2 600 €'), row('markets', '1 400 €')],
  }
  render(<ChangeSplit split={split} />)
  const parts = screen.getAllByTestId('split-part')
  expect(parts).toHaveLength(2)
  expect(parts[0]).toHaveStyle({ width: '65%' })
  // B4: white is the colour of a reference, never of a figure: the effort is grey, the markets an outline.
  expect(parts[0]).toHaveClass('bg-ink-muted')
  expect(parts[0]).not.toHaveClass('bg-ink')
  expect(parts[1]).toHaveStyle({ width: '35%' })
  expect(parts[1]).toHaveClass('border')
  expect(screen.getByText('Ton effort')).toBeInTheDocument()
  expect(screen.getByText('2 600 €')).not.toHaveClass('text-loss')
})

test('the house has its own colour', () => {
  render(<ChangeSplit split={{ bar: [{ part: 'property', share: 1 }], rows: [row('effort', '0 €')] }} />)
  expect(screen.getByTestId('split-part')).toHaveClass('bg-cat-property')
})

test('a loss on the markets: no bar, the markets amount in text-loss, the effort never', () => {
  const split: Split = {
    bar: null,
    rows: [row('effort', '0 €'), row('markets', '-1 900 €', true)],
  }
  render(<ChangeSplit split={split} />)
  expect(screen.queryByTestId('split-part')).not.toBeInTheDocument()
  expect(screen.getByText('-1 900 €')).toHaveClass('text-loss')
  expect(screen.getByText('0 €')).not.toHaveClass('text-loss')
})

test('the colour follows `loss` only, whatever the part', () => {
  const split: Split = { bar: null, rows: [row('effort', '-500 €', true), row('markets', '300 €', false)] }
  render(<ChangeSplit split={split} />)
  expect(screen.getByText('-500 €')).toHaveClass('text-loss')
  expect(screen.getByText('300 €')).not.toHaveClass('text-loss')
})
