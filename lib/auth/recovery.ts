// A forgotten password: the reset link, and the rule that guards starting over.
//
// The link uses Supabase's implicit flow. Its e-mail points to Supabase, which
// sends the person on to /nouveau-mot-de-passe with a session in the address's
// fragment — the part after « # », which a browser never sends to any server.
// Unlike the default flow, it works in a browser other than the one that asked
// for the link: people open their mail on their phone.

import { isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js'
import { normalizeEmail } from '@/lib/vault/kdf'

// Any answer from the server — accepted, refused, rate limited — is told the
// same way: a refusal can depend on whether the address has an account (a rate
// limit only applies to an address that receives mail), and saying so would
// tell anyone who has one. Only no answer at all is told apart: then nothing
// has left, whoever the address belongs to.
export async function requestPasswordReset(
  client: SupabaseClient,
  input: { email: string; redirectTo: string },
): Promise<'sent' | 'unreachable'> {
  try {
    const { error } = await client.auth.resetPasswordForEmail(normalizeEmail(input.email), {
      redirectTo: input.redirectTo,
    })
    return error && isAuthRetryableFetchError(error) ? 'unreachable' : 'sent'
  } catch {
    return 'unreachable'
  }
}

export type RecoveryTokens = { access_token: string; refresh_token: string }

// The session a reset link carries, or null: no fragment, a link that has
// expired or already served (Supabase then sends an error instead), or a link
// of another kind.
export function readRecoveryLink(hash: string): RecoveryTokens | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (params.get('type') !== 'recovery' || !accessToken || !refreshToken) return null
  return { access_token: accessToken, refresh_token: refreshToken }
}

export const START_OVER_PHRASE = 'repartir de zéro'

// Starting over erases every document for good, so it takes the phrase typed
// out. Case and the spaces around it do not count; an « é » typed as « e »
// plus an accent (some keyboards do) is the same « é ».
export function isStartOverConfirmed(text: string): boolean {
  return text.normalize('NFC').trim().toLocaleLowerCase('fr') === START_OVER_PHRASE
}
