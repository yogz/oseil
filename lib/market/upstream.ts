import { MarketUnavailableError } from './types'

export const UPSTREAM_TIMEOUT_MS = 5_000
export const USER_AGENT = 'Mozilla/5.0 (compatible; stefin/1.0)'

/** One request to a market source. A network error or a timeout becomes a MarketUnavailableError with a null status. */
export async function upstream(
  url: string,
  source: MarketUnavailableError['source'],
  fetcher: typeof fetch,
): Promise<Response> {
  try {
    return await fetcher(url, {
      headers: { 'User-Agent': USER_AGENT },
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch {
    throw new MarketUnavailableError(source, null)
  }
}
