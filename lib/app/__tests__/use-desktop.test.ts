import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { DESKTOP_QUERY } from '../use-desktop'

// The hook and the CSS must agree on where the computer layout starts: Tailwind's `lg`.
test('the desktop query is Tailwind\'s lg breakpoint, in rem like the CSS', () => {
  const theme = readFileSync('node_modules/tailwindcss/theme.css', 'utf8')
  const lg = /--breakpoint-lg:\s*([^;]+);/.exec(theme)![1].trim()
  expect(DESKTOP_QUERY).toBe(`(min-width: ${lg})`)
})
