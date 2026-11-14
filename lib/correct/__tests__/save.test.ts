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

import { readForCorrection, saveCorrection } from '@/lib/correct/save'

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

describe('readForCorrection', () => {
  const running = () =>
    repo.loadDraft.mockResolvedValue({ draft: { id: 'd', value: { basedOn: 'b' }, updatedAt: stamp }, unreadable: 0 })
  const state = {
    profile: { id: 'p1', value: exampleProfile },
    snapshots: [
      { id: 'a', value: exampleSnapshot },
      { id: 'b', value: exampleSnapshot },
    ],
  }

  test('refuses while an update is running, by default', async () => {
    running()
    expect(await readForCorrection(client, key)).toBe('update-running')
  })

  test('for a past relevé, reads the state while an update is running, and says it runs', async () => {
    running()
    expect(await readForCorrection(client, key, { pastOnly: true })).toEqual({ ...state, updateRunning: true })
  })

  test('for a past relevé, without an update, reads the state as it does by default', async () => {
    expect(await readForCorrection(client, key, { pastOnly: true })).toEqual(state)
    expect(await readForCorrection(client, key)).toEqual(state)
  })

  test('for a past relevé, an unreadable draft still refuses', async () => {
    repo.loadDraft.mockResolvedValue({ draft: null, unreadable: 1 })
    expect(await readForCorrection(client, key, { pastOnly: true })).toBe('update-running')
  })

  test('for a past relevé, unreadable data still refuses', async () => {
    running()
    repo.loadSnapshots.mockResolvedValue({ snapshots: [snap('a')], unreadable: 1 })
    expect(await readForCorrection(client, key, { pastOnly: true })).toBe('unreadable')
  })
})

describe('saveCorrection on a past relevé', () => {
  beforeEach(() =>
    repo.loadDraft.mockResolvedValue({ draft: { id: 'd', value: { basedOn: 'b' }, updatedAt: stamp }, unreadable: 0 }),
  )
  const past: Planned = { writes: [{ kind: 'snapshot', id: 'a', value: exampleSnapshot }] }

  test('saves while an update is running, the plan told it runs', async () => {
    let seen: unknown
    const outcome = await saveCorrection(
      client,
      key,
      (s) => {
        seen = s.updateRunning
        return past
      },
      { pastOnly: true },
    )
    expect(outcome).toBe('saved')
    expect(seen).toBe(true)
    expect(calls).toEqual(['snapshot:a'])
  })

  test('writes nothing when the plan reaches the latest relevé while an update is running', async () => {
    const reaching: Planned = { writes: [past.writes[0], { kind: 'snapshot', id: 'b', value: exampleSnapshot }] }
    expect(await saveCorrection(client, key, () => reaching, { pastOnly: true })).toBe('update-running')
    expect(repo.saveSnapshot).not.toHaveBeenCalled()
  })

  test('writes nothing when the plan rewrites the profile while an update is running', async () => {
    const profiled: Planned = { writes: [past.writes[0], { kind: 'profile', value: exampleProfile }] }
    expect(await saveCorrection(client, key, () => profiled, { pastOnly: true })).toBe('update-running')
    expect(repo.saveSnapshot).not.toHaveBeenCalled()
    expect(repo.saveProfile).not.toHaveBeenCalled()
  })

  test('by default still refuses the whole correction', async () => {
    expect(await saveCorrection(client, key, () => past)).toBe('update-running')
    expect(repo.saveSnapshot).not.toHaveBeenCalled()
  })
})
