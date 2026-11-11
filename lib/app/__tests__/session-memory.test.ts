import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, test } from 'vitest'
import type { Model } from '../use-model'
import { updateEcho } from '../arrival'
import {
  forgetEverything,
  forgetInEveryTab,
  forgetModel,
  modelMark,
  rememberModel,
  rememberVault,
  rememberedModel,
  rememberedVault,
  vaultMark,
} from '../session-memory'

const KEY = { key: 1 } as unknown as CryptoKey
const OTHER_KEY = { key: 2 } as unknown as CryptoKey
const client = {} as SupabaseClient
const model = (snapshots: number): Model => ({
  profile: null,
  snapshots: [],
  goals: [],
  settings: null,
  draft: null,
  unreadable: { profile: 0, snapshots, goals: 0, settings: 0, draft: 0 },
})

beforeEach(forgetEverything)

// Signing in or out, and starting over, forget everything (lib/auth, lib/vault/store.ts): an update's
// echo not yet played never reaches the next person on the device.
test('forgetting everything forgets an update’s echo not yet played', () => {
  updateEcho.ask()
  forgetEverything()
  expect(updateEcho.due()).toBe(false)
})

test('signing out in this tab forgets it too', () => {
  updateEcho.ask()
  forgetInEveryTab()
  expect(updateEcho.due()).toBe(false)
})

describe('the tab’s memory between two screens', () => {
  test('keeps the vault opened last and the model read last, for that person only', () => {
    rememberVault({ userId: 'a', dataKey: KEY }, vaultMark())
    rememberModel({ userId: 'a', model: model(1), client }, modelMark())

    expect(rememberedVault()).toEqual({ userId: 'a', dataKey: KEY })
    expect(rememberedModel('a')).toEqual({ userId: 'a', model: model(1), client })
    expect(rememberedModel('b')).toBeNull()
  })

  test('forgetting the model keeps the vault; forgetting everything keeps nothing', () => {
    rememberVault({ userId: 'a', dataKey: KEY }, vaultMark())
    rememberModel({ userId: 'a', model: model(1), client }, modelMark())
    forgetModel()
    expect(rememberedModel('a')).toBeNull()
    expect(rememberedVault()).toEqual({ userId: 'a', dataKey: KEY })

    rememberModel({ userId: 'a', model: model(1), client }, modelMark())
    forgetEverything()
    expect(rememberedModel('a')).toBeNull()
    expect(rememberedVault()).toBeNull()
  })

  // A reading under way when a write begins may hold what the write replaces.
  test('an answer asked for before a forget is not kept after it', () => {
    const readingBegan = modelMark()
    forgetModel()
    rememberModel({ userId: 'a', model: model(1), client }, readingBegan)
    expect(rememberedModel('a')).toBeNull()

    const checkBegan = vaultMark()
    forgetEverything()
    rememberVault({ userId: 'a', dataKey: KEY }, checkBegan)
    expect(rememberedVault()).toBeNull()
  })

  test('the vault of another person drops the previous person’s model', () => {
    rememberVault({ userId: 'a', dataKey: KEY }, vaultMark())
    rememberModel({ userId: 'a', model: model(1), client }, modelMark())

    rememberVault({ userId: 'b', dataKey: OTHER_KEY }, vaultMark())
    expect(rememberedVault()).toEqual({ userId: 'b', dataKey: OTHER_KEY })
    expect(rememberedModel('a')).toBeNull()
    expect(rememberedModel('b')).toBeNull()
  })

  test('the same person checked again keeps their model', () => {
    rememberVault({ userId: 'a', dataKey: KEY }, vaultMark())
    rememberModel({ userId: 'a', model: model(1), client }, modelMark())

    rememberVault({ userId: 'a', dataKey: OTHER_KEY }, vaultMark())
    expect(rememberedVault()).toEqual({ userId: 'a', dataKey: OTHER_KEY })
    expect(rememberedModel('a')).toEqual({ userId: 'a', model: model(1), client })
  })
})
