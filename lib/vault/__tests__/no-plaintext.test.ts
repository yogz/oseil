import { describe, expect, test } from 'vitest'
import { signIn, signUp } from '@/lib/auth/account'
import { memoryKeyStore } from '../device'
import {
  changePassword,
  confirmRecoveryKeySeen,
  loadDocuments,
  remakeRecoveryKey,
  resetWithRecoveryKey,
  saveDocument,
  startOver,
} from '../store'
import { fakeSupabase, type RecordedRequest } from './fake-supabase'

const EMAIL = 'a@b.fr'
const PASSWORD = 'correct horse battery'

// Everything a request carries: the path with its query, the headers, the body.
const everythingSent = (recorded: RecordedRequest[]) =>
  recorded.map((r) => [r.path, JSON.stringify(r.headers), r.body ?? ''].join('\n')).join('\n')

describe('no plaintext', () => {
  test('nothing describing a situation leaves the device in clear', async () => {
    const server = fakeSupabase()
    const client = server.client()
    const keys = memoryKeyStore()
    await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: 'http://x' })
    await signIn(client, keys, { email: EMAIL, password: PASSWORD })
    const dataKey = (await keys.get(server.user!.id))!
    const value = {
      name: 'MARQUEUR-EN-CLAIR',
      amount: 123456.78,
      lines: [{ id: 'etf', accountId: 'pea', name: 'ETF', kind: 'units', currency: 'EUR', group: 'europe' }],
    }
    const id = await saveDocument(client, dataKey, { kind: 'profile', value })
    await saveDocument(client, dataKey, { kind: 'profile', id, value })
    await loadDocuments(client, dataKey, 'profile')

    const bodies = server.recorded.map((r) => r.body ?? '').join('\n')
    expect(bodies).toContain('ciphertext')
    expect(server.recorded.some((r) => r.path.startsWith('/auth/v1/signup'))).toBe(true)
    expect(everythingSent(server.recorded)).not.toMatch(/MARQUEUR-EN-CLAIR|123456|correct horse battery/)
    expect(everythingSent(server.recorded)).not.toContain('europe') // a line’s chapter stays sealed

    // Allowlist: a new clear field on a document is a decision to validate, so
    // any key outside this set fails here even if it holds no marker.
    const ALLOWED = ['id', 'user_id', 'kind', 'format', 'iv', 'ciphertext', 'updated_at']
    const writes = server.recorded.filter(
      (r) => r.path.startsWith('/rest/v1/documents') && (r.method === 'POST' || r.method === 'PATCH'),
    )
    expect(writes.map((r) => r.method).sort()).toEqual(['PATCH', 'POST'])
    for (const write of writes) {
      const parsed: unknown = JSON.parse(write.body!)
      for (const row of Array.isArray(parsed) ? parsed : [parsed]) {
        expect(Object.keys(row).filter((key) => !ALLOWED.includes(key)), write.method).toEqual([])
      }
    }
  })

  test('neither the recovery key nor a new password leaves the device', async () => {
    const server = fakeSupabase()
    const client = server.client()
    await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: 'http://x' })
    const first = await signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD })
    if (first.status !== 'new-vault') throw new Error('expected a new vault')
    const typed = first.recoveryDisplay.toLowerCase()
    await resetWithRecoveryKey(client, { recoveryDisplay: typed, newPassword: 'staple battery horse', email: EMAIL })
    await startOver(client, { newPassword: 'third long password', email: EMAIL })

    const sent = everythingSent(server.recorded)
    expect(server.recorded.some((r) => r.method === 'PUT' && r.path.startsWith('/auth/v1/user'))).toBe(true)
    for (const secret of [
      first.recoveryDisplay,
      first.recoveryDisplay.replace(/-/g, ''),
      typed,
      'staple battery horse',
      'third long password',
      PASSWORD,
    ]) {
      expect(sent).not.toContain(secret)
    }
  })

  test('a renewed recovery key leaves the device nowhere', async () => {
    const server = fakeSupabase()
    const client = server.client()
    await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: 'http://x' })
    const first = await signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD })
    const second = await signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD })
    if (first.status !== 'new-vault' || second.status !== 'renewed-recovery') throw new Error('expected a renewal')
    await confirmRecoveryKeySeen(client, second.recoveryDisplay.toLowerCase().replace(/-/g, ' '))

    const sent = everythingSent(server.recorded)
    for (const key of [first.recoveryDisplay, second.recoveryDisplay]) {
      expect(sent).not.toContain(key)
      expect(sent).not.toContain(key.replace(/-/g, ''))
    }
    // The only new clear field on a vault is the date of the confirmation.
    const vaultWrites = server.recorded.filter(
      (r) => r.path.startsWith('/rest/v1/vaults') && (r.method === 'POST' || r.method === 'PATCH'),
    )
    const ALLOWED = ['user_id', 'kdf', 'wrapped_by_password', 'wrapped_by_recovery', 'recovery_confirmed_at', 'updated_at']
    for (const write of vaultWrites) {
      expect(Object.keys(JSON.parse(write.body!)).filter((key) => !ALLOWED.includes(key)), write.method).toEqual([])
    }
  })

  test('changing the password and remaking the recovery key send neither password nor key', async () => {
    const server = fakeSupabase()
    const client = server.client()
    await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: 'http://x' })
    const first = await signIn(client, memoryKeyStore(), { email: EMAIL, password: PASSWORD })
    if (first.status !== 'new-vault') throw new Error('expected a new vault')
    const mark = server.recorded.length
    await changePassword(client, { email: EMAIL, oldPassword: PASSWORD, newPassword: 'staple battery horse' })
    const remade = await remakeRecoveryKey(client, { email: EMAIL, password: 'staple battery horse' })
    if (!remade) throw new Error('expected a new recovery key')
    await confirmRecoveryKeySeen(client, remade)

    const after = server.recorded.slice(mark)
    expect(after.some((r) => r.method === 'PUT' && r.path.startsWith('/auth/v1/user'))).toBe(true)
    const sent = everythingSent(after)
    for (const secret of [PASSWORD, 'staple battery horse', remade, remade.replace(/-/g, ''), first.recoveryDisplay]) {
      expect(sent).not.toContain(secret)
    }
    // Nothing new in clear on a vault.
    const ALLOWED = ['wrapped_by_password', 'wrapped_by_recovery', 'recovery_confirmed_at', 'updated_at']
    const vaultWrites = after.filter((r) => r.path.startsWith('/rest/v1/vaults') && r.method === 'PATCH')
    expect(vaultWrites).toHaveLength(3)
    for (const write of vaultWrites) {
      const body = JSON.parse(write.body!) as Record<string, unknown>
      expect(Object.keys(body).filter((key) => !ALLOWED.includes(key))).toEqual([])
      for (const key of ['wrapped_by_password', 'wrapped_by_recovery'] as const) {
        if (key in body) expect(Object.keys(body[key] as object).sort()).toEqual(['ciphertext', 'iv'])
      }
    }
  })
})
