import { readFileSync, statSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

test('loads both fonts from the repository, never from Google', () => {
  const layout = readFileSync('app/layout.tsx', 'utf8')
  expect(layout).toContain('next/font/local')
  expect(layout).toContain('./fonts/InterVariable.woff2')
  expect(layout).toContain('./fonts/BricolageGrotesqueVariable.woff2')
  expect(layout).not.toMatch(/next\/font\/google/)
})

test('ships each font with its licence', () => {
  expect(statSync('app/fonts/InterVariable.woff2').size).toBeGreaterThan(100_000)
  expect(readFileSync('app/fonts/OFL-inter.txt', 'utf8')).toContain('SIL Open Font License')
  expect(statSync('app/fonts/BricolageGrotesqueVariable.woff2').size).toBeGreaterThan(100_000)
  expect(readFileSync('app/fonts/OFL-bricolage.txt', 'utf8')).toContain('SIL Open Font License')
})

// The theme planches (Nicolas, 10 November 2026): the markets in raspberry, a ground of « vert
// oseille », and Bricolage Grotesque for the titles and the one big amount.
test('declares exactly the palette of the spec', () => {
  const css = readFileSync('app/globals.css', 'utf8')
  for (const value of [
    '#09110d', '#eef3ee', '#c3cdc5', '#8a988d', '#2BB4D2', '#6A66DC',
    '#8ACB80', '#B4467A', '#EFBE2A', '#3FD182', '#F2877A',
  ]) {
    expect(css).toContain(value)
  }
})

// The light theme (Nicolas, 10 November 2026): the same hue for each category, darker so a square
// keeps 3:1 on the light ground. It follows the device, or the choice made in the Réglages; the
// two blocks that say it must say the same thing.
describe('the light theme', () => {
  const css = readFileSync('app/globals.css', 'utf8')
  const block = (selector: RegExp) => css.match(selector)?.[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim() ?? ''
  // Dark by default (Nicolas, 10 November 2026): the device is followed only once « Comme
  // l’appareil » is chosen, which sets data-theme="system".
  const fromDevice = block(/@media \(prefers-color-scheme: light\) \{\s*:root\[data-theme="system"\] \{([^}]*)\}/)
  const chosen = block(/\n:root\[data-theme="light"\] \{([^}]*)\}/)

  test('declares its palette', () => {
    for (const value of [
      '#f1f5f1', '#121a15', '#3a453e', '#59665e', '#3B92AD', '#564BC8',
      '#679157', '#A12E69', '#A27C0B', '#187A42', '#B23B2E',
    ]) {
      expect(fromDevice).toContain(value)
    }
    expect(fromDevice).toContain('color-scheme: light')
  })

  test('says the same when it comes from the device and when it is chosen', () => {
    expect(chosen).not.toBe('')
    expect(chosen).toBe(fromDevice)
  })

  test('leaves the dark theme the one of a page that says nothing', () => {
    const root = css.match(/\n:root \{([^}]*)\}/)?.[1] ?? ''
    expect(root).toContain('color-scheme: dark')
    expect(root).toContain('#09110d')
  })
})

test('the screen titles and the one big amount take the display font, the rest stays in Inter', () => {
  const css = readFileSync('app/globals.css', 'utf8')
  expect(css).toMatch(/--font-sans:\s*var\(--font-inter\)/)
  expect(css).toMatch(/--font-display:\s*var\(--font-bricolage\)/)
  expect(css).toMatch(/h1,\s*h2\.text-title\s*\{\s*font-family:\s*var\(--font-display\)/)
  const hero = css.match(/@utility hero-figure\s*\{[^}]*\}/)?.[0] ?? ''
  expect(hero).toContain('font-family: var(--font-display)')
})

// Tabular figures widen the hyphen of Inter (« a - t - il », « Marie - Christine »): they live on
// the numbers, never on the page. The figure, the net and the boxes of figures carry them.
test('tabular figures are set on numbers, not on the body', () => {
  const css = readFileSync('app/globals.css', 'utf8')
  const body = css.match(/\nbody\s*\{[^}]*\}/)?.[0] ?? ''
  expect(body).not.toBe('')
  expect(body).not.toMatch(/tabular-nums/)
  expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/font-variant-numeric/)
  for (const file of ['components/money/Figure.tsx', 'components/money/NetAmount.tsx', 'components/ui/TextField.tsx']) {
    expect(readFileSync(file, 'utf8')).toContain('tabular-nums')
  }
})
