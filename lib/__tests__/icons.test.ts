import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

// The browser tab and the iPhone home screen show the mark of the site as images. Their drawings
// live in scripts/icons/, outside app/, because a colour written in app/ is refused by the design
// guard. This test is what keeps them from drifting: every colour they use is a token of
// app/globals.css, the only place where a colour is decided.
const root = join(__dirname, '..', '..')
const tokens = readFileSync(join(root, 'app', 'globals.css'), 'utf8')
const token = (name: string) => tokens.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`))![1].toLowerCase()
const ALLOWED = ['ground', 'ink', 'cat-available', 'cat-secured', 'cat-property'].map(token)

for (const drawing of ['favicon.svg', 'apple-icon.svg']) {
  test(`${drawing} only uses the colours of the site`, () => {
    const svg = readFileSync(join(root, 'scripts', 'icons', drawing), 'utf8')
    const colours = svg.match(/#[0-9a-fA-F]{3,8}\b/g)!.map((c) => c.toLowerCase())
    expect(colours.length).toBeGreaterThan(0)
    for (const colour of colours) expect(ALLOWED).toContain(colour)
    expect(new Set(colours)).toEqual(new Set(ALLOWED))
  })
}

test('the tab and the home screen icons drawn from them are in app/', () => {
  expect(existsSync(join(root, 'app', 'favicon.ico'))).toBe(true)
  expect(existsSync(join(root, 'app', 'apple-icon.png'))).toBe(true)
})

// The preview a messaging app shows for a shared link (WhatsApp, iMessage): drawn from
// scripts/og/og.html, rendered to app/opengraph-image.png (chosen by Nicolas, 10 November 2026).
const PREVIEW_ALLOWED = [
  'ground', 'ink', 'ink-soft', 'cat-available', 'cat-secured', 'cat-property', 'cat-markets', 'cat-gold',
].map(token)

test('the link preview only uses the colours of the site', () => {
  const html = readFileSync(join(root, 'scripts', 'og', 'og.html'), 'utf8')
  const colours = html.match(/#[0-9a-fA-F]{6}\b/g)!.map((c) => c.toLowerCase())
  expect(colours.length).toBeGreaterThan(0)
  for (const colour of colours) expect(PREVIEW_ALLOWED).toContain(colour)
  expect(html).not.toMatch(/rgba?\(/)
})

test('the link preview is in app/, 1200 × 630, with its description for VoiceOver', () => {
  const png = readFileSync(join(root, 'app', 'opengraph-image.png'))
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630])
  expect(readFileSync(join(root, 'app', 'opengraph-image.alt.txt'), 'utf8').trim().length).toBeGreaterThan(20)
})
