// The instructions for an AI, at a fixed address (Nicolas, 11 November 2026): the short sentence of the
// import sends the AI there. The same text for everyone; nothing about anyone.
import { expect, test } from 'vitest'
import { AI_PROMPT } from '@/lib/transfer/instructions'
import { GET } from '../route'

test('serves the whole instructions as markdown, in UTF-8', async () => {
  const response = GET()
  expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
  expect(await response.text()).toBe(AI_PROMPT)
})
