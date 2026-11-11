import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { exampleProfile, exampleSnapshot } from '@/lib/model/__tests__/fixtures'
import type { Planned } from '@/lib/correct/types'

const repo = vi.hoisted(() => ({
  loadProfile: vi.fn(),
  loadSnapshots: vi.fn(),
  loadDraft: vi.fn(),
  saveProfile: vi.fn(),
  saveSnapshot: vi.fn(),
}))
vi.mock('@/lib/model/repository', () => repo)

import { saveCorrection } from '@/lib/correct/save'

const client = {} as SupabaseClient
const key = {} as CryptoKey
const stamp = '2026-10-01T00:00:00Z'
const snap = (id: string) => ({ id, value: exampleSnapshot, updatedAt: stamp })

let calls: string[]

beforeEach(() => {
  calls = []
  vi.resetAllMocks()
  repo.loadProfile.mockResolvedValue({ profile: { id: 'p1', value: exampleProfile, updatedAt: stamp }, unreadable: 0 })
  repo.loadSnapshots.mockResolvedValue({ snapshots: [snap('a'), snap('b')], unreadable: 0 })
  repo.loadDraft.mockResolvedValue({ draft: null, unreadable: 0 })
  repo.saveProfile.mockImplementation(async () => void calls.push('profile'))
  repo.saveSnapshot.mockImplementation(async (_c, _k, _v, id) => void calls.push(`snapshot:${id}`))
})

const writesPlan: Planned = {
  writes: [
    { kind: 'profile', value: exampleProfile },
    { kind: 'snapshot', id: 'b', value: exampleSnapshot },
    { kind: 'snapshot', id: 'c', value: exampleSnapshot },
  ],
}

describe('saveCorrection', () => {
  test('runs the writes in the order the plan gives', async () => {
    expect(await saveCorrection(client, key, () => writesPlan)).toBe('saved')
    expect(calls).toEqual(['profile', 'snapshot:b', 'snapshot:c'])
    expect(repo.saveProfile).toHaveBeenCalledWith(client, key, exampleProfile, 'p1')
  })

  test('stops at the first failed write, and leaves the later ones unwritten', async () => {
    repo.saveSnapshot.mockImplementation(async (_c, _k, _v, id) => {
      if (id === 'b') throw new Error('boom')
      calls.push(`snapshot:${id}`)
    })
    await expect(saveCorrection(client, key, () => writesPlan)).rejects.toThrow('boom')
    expect(repo.saveSnapshot).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['profile'])
  })

  test('writes nothing while an update is running, even one started after the fiche opened', async () => {
    repo.loadDraft.mockResolvedValue({ draft: { id: 'd', value: { basedOn: 'b' }, updatedAt: stamp }, unreadable: 0 })
    expect(await saveCorrection(client, key, () => writesPlan)).toBe('update-running')
    expect(repo.saveProfile).not.toHaveBeenCalled()
    expect(repo.saveSnapshot).not.toHaveBeenCalled()
  })

  test('an unreadable draft counts as an update running', async () => {
    repo.loadDraft.mockResolvedValue({ draft: null, unreadable: 1 })
    expect(await saveCorrection(client, key, () => writesPlan)).toBe('update-running')
  })

  test('a stale draft does not block', async () => {
    repo.loadDraft.mockResolvedValue({ draft: { id: 'd', value: { basedOn: 'a' }, updatedAt: stamp }, unreadable: 0 })
    expect(await saveCorrection(client, key, () => writesPlan)).toBe('saved')
  })

  test('writes nothing on an unreadable snapshot', async () => {
    repo.loadSnapshots.mockResolvedValue({ snapshots: [snap('a')], unreadable: 1 })
    expect(await saveCorrection(client, key, () => writesPlan)).toBe('unreadable')
    expect(repo.saveProfile).not.toHaveBeenCalled()
  })

  test('writes nothing on an unreadable or missing profile', async () => {
    repo.loadProfile.mockResolvedValue({ profile: null, unreadable: 0 })
    expect(await saveCorrection(client, key, () => writesPlan)).toBe('unreadable')
    repo.loadProfile.mockResolvedValue({ profile: { id: 'p1', value: exampleProfile, updatedAt: stamp }, unreadable: 1 })
    expect(await saveCorrection(client, key, () => writesPlan)).toBe('unreadable')
    expect(repo.saveProfile).not.toHaveBeenCalled()
  })

  test('applies the plan to the state read now, not to the one on screen', async () => {
    let seen: unknown
    await saveCorrection(client, key, (state) => {
      seen = state
      return { writes: [] }
    })
    expect(seen).toEqual({
      profile: { id: 'p1', value: exampleProfile },
      snapshots: [
        { id: 'a', value: exampleSnapshot },
        { id: 'b', value: exampleSnapshot },
      ],
    })
  })

  test('returns the refusal and writes nothing', async () => {
    expect(await saveCorrection(client, key, () => ({ refused: 'only-line' }))).toBe('only-line')
    expect(repo.saveProfile).not.toHaveBeenCalled()
    expect(repo.saveSnapshot).not.toHaveBeenCalled()
  })

  test('an empty plan is saved without writing', async () => {
    expect(await saveCorrection(client, key, () => ({ writes: [] }))).toBe('saved')
    expect(repo.saveProfile).not.toHaveBeenCalled()
  })
})
