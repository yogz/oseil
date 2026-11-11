import { AI_PROMPT } from '@/lib/transfer/instructions'

// The instructions for an AI, at a fixed address (Nicolas, 11 November 2026: the whole text was « trop
// long » to copy on a phone). The import copies one short sentence that sends the AI here
// (AI_LINK_PROMPT). The same text for everyone, built with the site: nothing about anyone. An address
// with an extension is left out of the proxy (proxy.ts), so it opens without a session, like robots.txt.
export const dynamic = 'force-static'

export function GET(): Response {
  return new Response(AI_PROMPT, { headers: { 'content-type': 'text/markdown; charset=utf-8' } })
}
