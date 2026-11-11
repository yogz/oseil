import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { expect, test } from 'vitest'

// French typography is a rule of the copy, not of the taste of whoever writes the next sentence:
//   - the apostrophe is curved (’), never straight (');
//   - a no-break space comes before ? ! : ; so such a sign never starts a line on its own;
//   - a number and its unit (€, %, mois, jours, ans) are held together by a no-break space.
// This reads every piece of text in the source (a string, a template, a line of JSX) and
// refuses what breaks one of them. Comments are not copy, and are not read.

const ROOT = join(__dirname, '..', '..')
const FOLDERS = ['app', 'components', 'lib']
// The security policy is code that happens to hold quotes, and tests are free to say what they want.
const SKIPPED = ['lib/security-headers.ts']

function sourcesIn(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name)
    if (statSync(path).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : sourcesIn(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

type Piece = { text: string; line: number }

function piecesOf(path: string): Piece[] {
  const source = readFileSync(path, 'utf8')
  const kind = path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind)
  const pieces: Piece[] = []
  const keep = (node: ts.Node, text: string) => {
    const line = file.getLineAndCharacterOfPosition(node.getStart()).line + 1
    pieces.push({ text, line })
  }
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node)) {
      const parent = node.parent
      if (!ts.isImportDeclaration(parent) && !ts.isExportDeclaration(parent)) keep(node, node.text)
    } else if (
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      keep(node, node.text)
    } else if (ts.isJsxText(node)) {
      keep(node, node.text.replace(/&nbsp;/g, ' ').replace(/&apos;|&#39;/g, "'"))
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return pieces
}

const RULES: [string, RegExp][] = [
  ['a straight apostrophe (write ’)', /\p{L}'(?=[\p{L}\d$])/u],
  ['a breaking space before ? ! : ; (write a no-break space)', /[ \t\r\n]+[?!:;](?=[\s.,)…»”’"'`<}]|$)/],
  ['a breaking space between a number and its unit (write a no-break space)', /\d (?:€|%|mois|jours?|ans?)(?![\p{L}])/u],
]

const sources = FOLDERS.flatMap((folder) => sourcesIn(join(ROOT, folder))).filter(
  (path) => !SKIPPED.includes(relative(ROOT, path)),
)

test('the copy is read from the source files', () => {
  expect(sources.length).toBeGreaterThan(100)
})

test('French copy: curved apostrophes, no-break spaces before ? ! : ; and before a unit', () => {
  const faults: string[] = []
  for (const path of sources) {
    for (const { text, line } of piecesOf(path)) {
      for (const [rule, pattern] of RULES) {
        if (pattern.test(text)) faults.push(`${relative(ROOT, path)}:${line}  ${rule}  «${text.slice(0, 70)}»`)
      }
    }
  }
  expect(faults).toEqual([])
})

test('the rule does catch what it is written for', () => {
  const [straight, space, unit] = RULES.map(([, pattern]) => pattern)
  expect(straight.test("l'ami")).toBe(true)
  expect(straight.test('l’ami')).toBe(false)
  expect(space.test('Où ?')).toBe(true)
  expect(space.test('Où ?')).toBe(false)
  expect(space.test('a\n  ?')).toBe(true)
  expect(unit.test('3 mois')).toBe(true)
  expect(unit.test('3 mois')).toBe(false)
  expect(unit.test('3 € de plus')).toBe(true)
})
