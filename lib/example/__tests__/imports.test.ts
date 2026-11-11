import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { describe, expect, test } from 'vitest'

// « Rien ne part » (spec of the landing, « L’exemple »): the example's code never reaches what
// talks to the server, opens the vault or remembers a model in the tab. Checked on the import
// graph itself, followed file by file from every module of the example: a brick that one day
// starts saving something drags its import in, and this test fails.
// `import type` is left out: a type alone runs nothing in the browser.

const ROOT = join(__dirname, '..', '..', '..')
const EXAMPLE_ROOTS = ['app/(exemple)', 'components/example', 'lib/example']
const FORBIDDEN = [
  'lib/vault/',
  'lib/supabase/',
  'lib/model/repository.ts',
  'lib/app/use-model.ts',
  'lib/app/session-memory.ts',
  'lib/market/use-market.ts',
]

// `import x from`, `import { a, type b } from`, `export { a } from`, `import './side-effect'`;
// not `import type …` nor `export type …`.
const IMPORT = /^\s*(?:import|export)\s+(?!type\b)[^'"]*?\sfrom\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm

function resolve(from: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(ROOT, spec.slice(2))
  else if (spec.startsWith('.')) base = join(dirname(from), spec)
  else return null // a package: react, next…
  if (/\.(css|svg|png|ico|woff2?)$/.test(spec)) return null
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  throw new Error(`cannot resolve ${spec} from ${relative(ROOT, from)}`)
}

// Every file reached from `entries`, with the file that first imported it.
function reached(entries: string[]): Map<string, string | null> {
  const seen = new Map<string, string | null>()
  const walk = (file: string, parent: string | null) => {
    if (seen.has(file)) return
    seen.set(file, parent)
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      const target = resolve(file, match[1] ?? match[2] ?? match[3])
      if (target) walk(target, file)
    }
  }
  for (const entry of entries) walk(entry, null)
  return seen
}

function sources(dir: string): string[] {
  const full = join(ROOT, dir)
  if (!existsSync(full)) return []
  return readdirSync(full, { recursive: true, encoding: 'utf8' })
    .map((name) => join(full, name))
    .filter((file) => /\.tsx?$/.test(file) && !/__tests__/.test(file) && statSync(file).isFile())
}

function forbiddenIn(entries: string[]): string[] {
  const graph = reached(entries)
  const found: string[] = []
  for (const [file, parent] of graph) {
    const path = relative(ROOT, file)
    if (FORBIDDEN.some((f) => path.startsWith(f))) found.push(`${path} <- ${parent ? relative(ROOT, parent) : '?'}`)
  }
  return found
}

describe('the example’s imports', () => {
  test('the example has modules to check: its three pages, its frame and its person', () => {
    const files = EXAMPLE_ROOTS.flatMap(sources).map((f) => relative(ROOT, f))
    expect(files).toEqual(
      expect.arrayContaining([
        'app/(exemple)/exemple/layout.tsx',
        'app/(exemple)/exemple/page.tsx',
        'app/(exemple)/exemple/categorie/[id]/page.tsx',
        'app/(exemple)/exemple/evolution/page.tsx',
        'lib/example/person.ts',
      ]),
    )
  })

  test('the check sees a forbidden import when there is one (the real euro / percent switch saves)', () => {
    expect(forbiddenIn([join(ROOT, 'components/money/DisplayMode.tsx')])).toEqual(
      expect.arrayContaining([expect.stringMatching(/^lib\/model\/repository\.ts/)]),
    )
  })

  test('nothing in the example reaches the vault, Supabase, the repository, the model loader or the prices', () => {
    expect(forbiddenIn(EXAMPLE_ROOTS.flatMap(sources))).toEqual([])
  })
})
