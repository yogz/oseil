import { AuthApiError, AuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, test, vi } from 'vitest'
import { isStartOverConfirmed, readRecoveryLink, requestPasswordReset } from '../recovery'

describe('readRecoveryLink', () => {
  test('takes the tokens of a recovery link', () => {
    expect(
      readRecoveryLink('#access_token=aaa&expires_at=1&expires_in=3600&refresh_token=rrr&token_type=bearer&type=recovery'),
    ).toEqual({ access_token: 'aaa', refresh_token: 'rrr' })
  })

  // An expired or already used link comes back with an error instead of tokens.
  test.each([
    ['no fragment', ''],
    ['an error', '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'],
    ['another kind of link', '#access_token=aaa&refresh_token=rrr&type=signup'],
    ['a missing refresh token', '#access_token=aaa&type=recovery'],
  ])('finds nothing in %s', (_, hash) => {
    expect(readRecoveryLink(hash)).toBeNull()
  })
})

describe('isStartOverConfirmed', () => {
  test.each(['repartir de zéro', '  Repartir de zéro ', 'REPARTIR DE ZÉRO', 'repartir de zéro'])('accepts « %s »', (text) => {
    expect(isStartOverConfirmed(text)).toBe(true)
  })

  test.each(['', 'repartir', 'repartir de zero', 'repartir  de zéro', 'oui'])('refuses « %s »', (text) => {
    expect(isStartOverConfirmed(text)).toBe(false)
  })
})

describe('requestPasswordReset', () => {
  function clientAnswering(answer: () => Promise<{ data: unknown; error: unknown }>) {
    const resetPasswordForEmail = vi.fn(answer)
    return { client: { auth: { resetPasswordForEmail } } as unknown as SupabaseClient, resetPasswordForEmail }
  }

  test('asks for the address as the account knows it, with the way back', async () => {
    const { client, resetPasswordForEmail } = clientAnswering(async () => ({ data: {}, error: null }))
    await expect(
      requestPasswordReset(client, { email: '  Me@Example.COM ', redirectTo: 'http://localhost:3000/nouveau-mot-de-passe' }),
    ).resolves.toBe('sent')
    expect(resetPasswordForEmail).toHaveBeenCalledWith('me@example.com', {
      redirectTo: 'http://localhost:3000/nouveau-mot-de-passe',
    })
  })

  // A refusal could depend on whether the account exists (a rate limit only
  // applies to an address that receives mail): it is told like a success.
  test('says the same thing when the server refuses', async () => {
    const { client } = clientAnswering(async () => ({
      data: null,
      error: new AuthApiError('For security purposes, you can only request this after 30 seconds.', 429, 'over_email_send_rate_limit'),
    }))
    await expect(requestPasswordReset(client, { email: 'me@example.com', redirectTo: 'x' })).resolves.toBe('sent')
  })

  // No answer at all is not an answer: nothing has left, and that is said.
  test.each([
    ['the network fails', async () => ({ data: null, error: new AuthRetryableFetchError('fetch failed', 0) })],
    ['the call throws', async () => Promise.reject(new TypeError('fetch failed'))],
  ])('says it did not go through when %s', async (_, answer) => {
    const { client } = clientAnswering(answer)
    await expect(requestPasswordReset(client, { email: 'me@example.com', redirectTo: 'x' })).resolves.toBe('unreachable')
  })
})
