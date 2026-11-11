import { describe, expect, test, vi } from 'vitest'
import { signIn, signOut, signUp } from '@/lib/auth/account'
import { memoryKeyStore, type KeyStore } from '../device'
import { loadDocuments, saveDocument } from '../store'
import { fakeSupabase } from './fake-supabase'

const EMAIL = 'a@b.fr'
const PASSWORD = 'correct horse battery'

describe('device key store', () => {
  test('remembers the key across reloads and forgets it on sign-out', async () => {
    const server = fakeSupabase()
    const client = server.client()
    const keys = memoryKeyStore()
    await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: 'http://x' })
    await signIn(client, keys, { email: EMAIL, password: PASSWORD })
    const userId = server.user!.id
    const id = await saveDocument(client, (await keys.get(userId))!, { kind: 'profile', value: 'Alix' })

    // A reload keeps the device store: the key is still there and still opens the documents.
    const key = await keys.get(userId)
    expect(key).toBeInstanceOf(CryptoKey)
    expect(await loadDocuments(client, key!, 'profile')).toEqual({
      documents: [{ id, value: 'Alix', updatedAt: expect.any(String), createdAt: expect.any(String) }],
      unreadable: [],
    })

    // The keys are forgotten before the session is closed, so a sign-out that
    // fails on the server side still leaves nothing on the device.
    let requestsWhenForgotten = -1
    const watched: KeyStore = {
      ...keys,
      clear: async () => {
        requestsWhenForgotten = server.recorded.length
        await keys.clear()
      },
    }
    await signOut(client, watched)
    expect(await keys.get(userId)).toBeNull()
    const logout = server.recorded.findIndex((r) => r.path.startsWith('/auth/v1/logout'))
    expect(requestsWhenForgotten).toBeGreaterThanOrEqual(0)
    expect(logout).toBeGreaterThanOrEqual(requestsWhenForgotten)
    expect((await client.auth.getSession()).data.session).toBeNull()
  })

  test('forgets the key on sign-out even when the session can no longer be loaded', async () => {
    const server = fakeSupabase()
    const client = server.client()
    const keys = memoryKeyStore()
    await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: 'http://x' })
    await signIn(client, keys, { email: EMAIL, password: PASSWORD })
    const userId = server.user!.id
    expect(await keys.get(userId)).toBeInstanceOf(CryptoKey)

    // Two hours later the access token has expired and the server refuses the refresh.
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000)
      const outcome = await signOut(client, keys).then(
        () => null,
        (error: unknown) => error,
      )
      expect(await keys.get(userId)).toBeNull()
      expect((await client.auth.getSession()).data.session).toBeNull()
      // The failure is still reported, but only once the key is gone.
      expect(outcome).toMatchObject({ code: 'refresh_token_not_found' })
    } finally {
      vi.useRealTimers()
    }
    expect(server.recorded.some((r) => r.path === '/auth/v1/token?grant_type=refresh_token')).toBe(true)
  })

  test('keeps one key per person, and forgets them all at once', async () => {
    const keys = memoryKeyStore()
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt'])
    expect(await keys.get('someone')).toBeNull()
    await keys.set('someone', key)
    expect(await keys.get('someone')).toBe(key)
    expect(await keys.get('someone-else')).toBeNull()
    await keys.delete('someone')
    expect(await keys.get('someone')).toBeNull()

    await keys.set('someone', key)
    await keys.set('someone-else', key)
    await keys.clear()
    expect(await keys.get('someone')).toBeNull()
    expect(await keys.get('someone-else')).toBeNull()
  })
})
