import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

// The magnifier « Trouver » sits at the top of every screen of the application that has the tab bar
// (docs/superpowers/specs/2026-11-14-trouver-design.md); the full-screen flows (the update, the first
// launch, « Trouver » itself) have none: one never leaves an entry half done to search.
const ROOT = join(process.cwd(), 'app', '(app)')
const FULL_SCREEN = ['mise-a-jour', 'premier-lancement', 'trouver']

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === '__tests__') return []
    if (statSync(path).isDirectory()) return files(path)
    return name.endsWith('.tsx') ? [path] : []
  })
}

const all = files(ROOT)
const relative = (path: string) => path.slice(ROOT.length + 1)
const withTabs = all.filter((path) => /<TabBar\b/.test(readFileSync(path, 'utf8')))
const fullScreen = all.filter((path) => FULL_SCREEN.some((root) => relative(path).startsWith(`${root}/`)))

test('the screens with the tab bar are found', () => {
  expect(withTabs.length).toBeGreaterThanOrEqual(10)
})

test.each(withTabs.map((path) => [relative(path), path]))('%s has the magnifier', (_, path) => {
  expect(readFileSync(path, 'utf8')).toMatch(/<Find(Link|Corner)\b/)
})

// A magnifier inside a magnifier draws two links « Trouver ».
const withCorner = [...all, join(process.cwd(), 'components', 'line', 'LineSheet.tsx')]
test.each(withCorner.map((path) => [relative(path), path]))('%s never nests a corner in a corner', (_, path) => {
  expect(readFileSync(path, 'utf8')).not.toMatch(/<FindCorner>\s*<FindCorner>/)
})

test.each(fullScreen.map((path) => [relative(path), path]))('%s has no magnifier', (_, path) => {
  expect(readFileSync(path, 'utf8')).not.toMatch(/\bFind(Link|Corner)\b/)
})
