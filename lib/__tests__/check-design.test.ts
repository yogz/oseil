import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, expect, test } from 'vitest'

const root = mkdtempSync(join(tmpdir(), 'check-design-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** Writes `source` at `relativePath` under the temp dir and runs the guard on it. */
function run(source: string, relativePath = 'sample.tsx') {
  const file = join(root, relativePath)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, source)
  const result = spawnSync('bash', ['scripts/check-design.sh', file], { encoding: 'utf8' })
  return { code: result.status, output: result.stdout + result.stderr }
}

test.each([
  ['<div className="rounded-lg" />', 'rayon interdit'],
  ['<div className="dark:bg-ground" />', 'variante dark: interdite'],
  ['<div style={{ color: "#ff0000" }} />', 'couleur en dur'],
  ['<div className="shadow-md" />', 'ombre interdite'],
  ['<div className="bg-linear-to-b" />', 'dégradé interdit'],
  ['<h2 className="uppercase tracking-wide">Chez toi</h2>', 'capitales interdites'],
  ['<p>Bravo 🎉</p>', 'émoji interdit'],
  ['<p className="text-[15px]" />', 'taille de texte hors échelle'],
  ['<p className="text-sm text-ink" />', 'taille de texte hors échelle'],
  ['<p className="lg:text-5xl" />', 'taille de texte hors échelle'],
])('refuses %s', (source, rule) => {
  const { code, output } = run(source)
  expect(code).toBe(1)
  expect(output).toContain(rule)
})

test('accepts the allowed vocabulary', () => {
  const { code } = run(
    '<div className="rounded-square rounded-control rounded-full rounded-none bg-cat-markets shadow-none text-caption text-body text-subtitle text-title text-hero text-ink text-center" />',
  )
  expect(code).toBe(0)
})

test('allows a gradient only in the evolution chart and the tail of a travelling dot', () => {
  const gradient = '<div className="bg-linear-to-b" />'
  expect(run(gradient, 'components/evolution/EvolutionChart.tsx').code).toBe(0)
  expect(run(gradient, 'components/evolution/TraceComet.tsx').code).toBe(0)
  expect(run(gradient, 'components/evolution/Other.tsx').code).toBe(1)
})
