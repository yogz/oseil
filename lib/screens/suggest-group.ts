// Proposes a chapter (group) for a line of « Épargne sécurisée » or
// « Placements en bourse ». Pure rule, run in the browser: nothing is sent anywhere.
// Four rules, first answer wins: name, account type, listing, then « ne se devine pas ».

import { RANGED_GROUPS, type RangedCategory } from '@/lib/catalog'
import type { Account, GroupId, Line } from '@/lib/model/types'

export type Reason = 'index' | 'name' | 'account' | 'listing'

export const REASON_WORDS: Record<Reason, string> = {
  index: 'deviné d’après son indice',
  name: 'deviné d’après son nom',
  account: 'deviné d’après son type de compte',
  listing: 'deviné d’après sa place de cotation',
}

export const UNGUESSED = 'ne se devine pas'

// Lowercase, accents stripped.
const normalise = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

// `excluded`: the keyword says nothing when « ex », « ex- » or « hors » comes just before it
// (« MSCI Pacific ex Japan » is everything but Japan).
type Keyword = { word: string; group: GroupId; reason: 'index' | 'name'; prefix?: true; excluded?: true }

// In the spec's order. `prefix` keywords match the start of a word (« obligataire »).
const KEYWORDS: Keyword[] = [
  { word: 'monétaire', group: 'money-market', reason: 'name' },
  { word: 'court terme', group: 'money-market', reason: 'name' },
  { word: 'money market', group: 'money-market', reason: 'name' },
  { word: 'obligat', group: 'bonds', reason: 'name', prefix: true },
  { word: 'bond', group: 'bonds', reason: 'name', prefix: true },
  { word: 'S&P 500', group: 'us', reason: 'index' },
  { word: 'Nasdaq', group: 'us', reason: 'index' },
  { word: 'MSCI USA', group: 'us', reason: 'index' },
  { word: 'Russell', group: 'us', reason: 'index' },
  { word: 'Euro Stoxx', group: 'europe', reason: 'index' },
  { word: 'Stoxx Europe', group: 'europe', reason: 'index' },
  { word: 'CAC 40', group: 'europe', reason: 'index' },
  { word: 'DAX', group: 'europe', reason: 'index' },
  { word: 'MSCI EMU', group: 'europe', reason: 'index' },
  { word: 'MSCI Europe', group: 'europe', reason: 'index' },
  { word: 'MSCI World', group: 'world', reason: 'index' },
  { word: 'ACWI', group: 'world', reason: 'index' },
  { word: 'monde', group: 'world', reason: 'name' },
  { word: 'world', group: 'world', reason: 'name' },
  // Japan is not an emerging country (9 November 2026): its own chapter, before the emerging words.
  { word: 'MSCI Japan', group: 'japan', reason: 'index', excluded: true },
  { word: 'Nikkei', group: 'japan', reason: 'index', excluded: true },
  { word: 'Topix', group: 'japan', reason: 'index', excluded: true },
  { word: 'Japon', group: 'japan', reason: 'name', excluded: true },
  { word: 'Japan', group: 'japan', reason: 'name', excluded: true },
  { word: 'emerging', group: 'emerging', reason: 'name' },
  { word: 'émergents', group: 'emerging', reason: 'name' },
  { word: 'Chine', group: 'emerging', reason: 'name' },
  { word: 'China', group: 'emerging', reason: 'name' },
  { word: 'Inde', group: 'emerging', reason: 'name' },
  { word: 'India', group: 'emerging', reason: 'name' },
]

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// A keyword must start a word, so « Index » does not hit « Inde »; unless it is a
// prefix keyword it must also end one, so « Mondelez » does not hit « monde ».
const NOT_EXCLUDED = '(?<!(?<![\\p{L}\\p{N}])(?:ex|hors)[\\s-]+)'
const KEYWORD_PATTERNS = KEYWORDS.map((keyword) => ({
  keyword,
  pattern: new RegExp(
    `${keyword.excluded ? NOT_EXCLUDED : ''}(?<![\\p{L}\\p{N}])${escape(normalise(keyword.word))}${keyword.prefix ? '' : '(?![\\p{L}\\p{N}])'}`,
    'u',
  ),
}))

// A name that mentions a fund manager or a fund word looks like a fund.
const FUND_WORDS = ['iShares', 'Amundi', 'Lyxor', 'Xtrackers', 'Vanguard', 'SPDR', 'BNP Paribas Easy', 'Ossiam', 'ETF', 'UCITS', 'fonds', 'fund', 'SICAV']
const FUND_PATTERN = new RegExp(`(?<![\\p{L}\\p{N}])(?:${FUND_WORDS.map((word) => escape(normalise(word))).join('|')})(?![\\p{L}\\p{N}])`, 'u')

const EUROPEAN_SUFFIXES = ['.PA', '.AS', '.DE', '.MI', '.MC', '.BR', '.L', '.SW']

function guess(line: Line, account: Account, category: RangedCategory): { group: GroupId; reason: Reason } | null {
  const name = normalise(line.name)

  for (const { keyword, pattern } of KEYWORD_PATTERNS) {
    if (pattern.test(name)) return { group: keyword.group, reason: keyword.reason }
  }

  if (category === 'secured' && line.kind === 'amount' && (account.type === 'life-insurance' || account.type === 'per')) {
    return { group: 'euro-fund', reason: 'account' }
  }

  if (line.quoteSymbol && !FUND_PATTERN.test(name)) {
    const symbol = line.quoteSymbol.toUpperCase()
    // No suffix: United States. A listed European suffix: Europe. Any other suffix: no proposal.
    if (!symbol.includes('.')) return { group: 'us', reason: 'listing' }
    if (EUROPEAN_SUFFIXES.some((suffix) => symbol.endsWith(suffix))) return { group: 'europe', reason: 'listing' }
  }

  return null
}

export function suggestGroup(line: Line, account: Account, category: RangedCategory): { group: GroupId; reason: Reason } | null {
  const found = guess(line, account, category)
  if (!found) return null
  // A chapter of the other category is ignored: the line stays unguessed here.
  return (RANGED_GROUPS[category] as readonly GroupId[]).includes(found.group) ? found : null
}
