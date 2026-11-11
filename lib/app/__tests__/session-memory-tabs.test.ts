// @vitest-environment jsdom
// The other tabs of the same browser, through a BroadcastChannel. In this
// environment, the channel is Node's: each `new BroadcastChannel` stands for a
// tab, and a tab never hears its own messages.
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { signIn, signOut } from '@/lib/auth/account'
import { signInWithFaceId, type PreparedSignIn } from '@/lib/auth/face-id'
import type { WebAuthn } from '@/lib/auth/webauthn'
import { startOver } from '@/lib/vault/store'
import {
  TAB_CHANNEL,
  forgetEverything,
  forgetInEveryTab,
  modelMark,
  rememberModel,
  rememberVault,
  rememberedModel,
  rememberedVault,
  vaultMark,
} from '../session-memory'
import type { Model } from '../use-model'

// No key derivation here: what is tested happens before it.
vi.mock('@/lib/vault/kdf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/vault/kdf')>()),
  deriveSecrets: () => Promise.reject(new Error('not derived in this test')),
}))

const model: Model = {
  profile: null,
  snapshots: [],
  goals: [],
  settings: null,
  draft: null,
  unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
}
const client = {
  auth: {
    signOut: async () => ({ error: null }),
    getUser: async () => ({ data: { user: null }, error: new Error('no user in this test') }),
  },
} as unknown as SupabaseClient
const keys = { get: vi.fn(), set: vi.fn(), delete: vi.fn(), clear: async () => {} }
const refusingWebAuthn = {
  get: () => Promise.reject(new DOMException('cancelled', 'NotAllowedError')),
} as unknown as WebAuthn

function remembered() {
  rememberVault({ userId: 'someone', dataKey: {} as CryptoKey }, vaultMark())
  rememberModel({ userId: 'someone', model, client }, modelMark())
}

const opened: BroadcastChannel[] = []
function anotherTab() {
  const channel = new BroadcastChannel(TAB_CHANNEL)
  opened.push(channel)
  const heard: unknown[] = []
  channel.onmessage = (event: MessageEvent) => heard.push(event.data)
  return { channel, heard }
}
const settled = () => new Promise((resolve) => setTimeout(resolve, 30))

beforeEach(forgetEverything)
afterEach(() => {
  for (const channel of opened.splice(0)) channel.close()
})

describe('the other tabs of this browser', () => {
  test.each<[string, () => Promise<unknown>]>([
    ['signing out', () => signOut(client, keys)],
    ['signing in with a password', () => signIn(client, keys, { email: 'a@b.fr', password: 'correct horse battery' })],
    ['signing in with Face ID', () => signInWithFaceId(client, keys, refusingWebAuthn, {} as PreparedSignIn)],
    ['starting over', () => startOver(client, { newPassword: 'staple battery horse', email: 'a@b.fr' })],
  ])('%s forgets here and tells every other tab to forget', async (_, act) => {
    remembered()
    const other = anotherTab()

    const acting = act().catch(() => {})
    expect(rememberedVault()).toBeNull()
    expect(rememberedModel('someone')).toBeNull()
    await acting
    await vi.waitFor(() => expect(other.heard).toEqual(['forget']))
  })

  test('a word from another tab forgets everything here, and is not passed on', async () => {
    remembered()
    const other = anotherTab()

    other.channel.postMessage('forget')
    await vi.waitFor(() => expect(rememberedVault()).toBeNull())
    expect(rememberedModel('someone')).toBeNull()
    await settled()
    expect(other.heard).toEqual([])
  })

  test('anything else from another tab forgets nothing', async () => {
    remembered()
    anotherTab().channel.postMessage('hello')
    await settled()
    expect(rememberedVault()).not.toBeNull()
  })

  test('forgetting alone, as a screen does, tells no other tab', async () => {
    const other = anotherTab()
    forgetEverything()
    await settled()
    expect(other.heard).toEqual([])
  })

  test('a broadcast here reaches the other tabs only once each', async () => {
    const first = anotherTab()
    const second = anotherTab()
    forgetInEveryTab()
    await vi.waitFor(() => expect(first.heard).toEqual(['forget']))
    await vi.waitFor(() => expect(second.heard).toEqual(['forget']))
    await settled()
    expect(first.heard).toEqual(['forget'])
    expect(second.heard).toEqual(['forget'])
  })
})
