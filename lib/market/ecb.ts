import { MarketUnavailableError, type Rates } from './types'
import { upstream } from './upstream'

export const ECB_DAILY_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:'([^']*)'|"([^"]*)")`).exec(tag)
  return match ? (match[1] ?? match[2] ?? null) : null
}

export function parseEcbDaily(xml: string): Rates | null {
  const tags = xml.match(/<Cube\b[^>]*>/g) ?? []
  let on: string | null = null
  const perEuro: Record<string, number> = {}
  for (const tag of tags) {
    const time = attribute(tag, 'time')
    if (time !== null) {
      on = time
      continue
    }
    const currency = attribute(tag, 'currency')
    if (currency === null) continue
    const rate = Number(attribute(tag, 'rate'))
    if (!/^[A-Z]{3}$/.test(currency) || !Number.isFinite(rate) || rate <= 0) return null
    perEuro[currency] = rate
  }
  if (on === null || !/^\d{4}-\d{2}-\d{2}$/.test(on)) return null
  if (Object.keys(perEuro).length === 0) return null
  return { on, perEuro }
}

export async function fetchRates(fetcher: typeof fetch = fetch): Promise<Rates> {
  const response = await upstream(ECB_DAILY_URL, 'ecb', fetcher)
  if (!response.ok) throw new MarketUnavailableError('ecb', response.status)
  let text: string
  try {
    text = await response.text()
  } catch {
    throw new MarketUnavailableError('ecb', response.status)
  }
  const rates = parseEcbDaily(text)
  if (!rates) throw new MarketUnavailableError('ecb', response.status)
  return rates
}
