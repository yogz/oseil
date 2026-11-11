import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

// Every screen of the application that waits for the vault or the market shows the one wait of
// the site (components/ui/VaultWait.tsx), never a blank screen (Nicolas, 10 November 2026).
const ROOT = join(process.cwd(), 'app', '(app)')
const WAITS_FOR = /\b(useModel|useFirstLaunch|useUpdateScreen|useMarket)\(/

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === '__tests__') return []
    if (statSync(path).isDirectory()) return pages(path)
    return name === 'page.tsx' ? [path] : []
  })
}

// The welcome of the first launch shows itself at once: the model only decides whether the import
// link appears, in a line that is always there.
const NEVER_BLANK = [join(ROOT, 'premier-lancement', 'page.tsx')]

const waiting = pages(ROOT).filter((path) => !NEVER_BLANK.includes(path) && WAITS_FOR.test(readFileSync(path, 'utf8')))

test('the screens that wait are found', () => {
  expect(waiting.length).toBeGreaterThan(10)
})

test.each(waiting.map((path) => [path.slice(ROOT.length + 1), path]))('%s waits with the grid', (_, path) => {
  const source = readFileSync(path, 'utf8')
  expect(source).toMatch(/\bVaultWait\b/)
  expect(source).not.toMatch(/=== 'loading'\) return null/)
  expect(source).not.toMatch(/<Waiting\b/)
})
