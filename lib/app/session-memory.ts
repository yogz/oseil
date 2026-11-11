// What the tab keeps from one screen to the next: the vault it opened last and
// the model it read last, so that a screen arriving after another one draws at
// once instead of a blank. In this tab's memory only (module scope, like the
// prices of lib/market/use-market.ts): never localStorage, sessionStorage nor
// IndexedDB, gone with any full page load, and nothing of it travels anywhere.
// Only the browser fills it: the hooks' effects and the sign-in functions never
// run on the server.
//
// Every write to the stored documents forgets the model (lib/model/repository.ts),
// so the next screen reads afresh. Signing in or out, and starting over, forget
// everything in every tab of this browser (lib/auth, lib/vault/store.ts): on a
// shared computer, the next person never gets the previous one's screens back
// from another tab. Each forget is counted: an answer asked for before a
// forget is not kept after it, so a reading already under way when a write
// began cannot bring back what the write replaced.

import type { SupabaseClient } from '@supabase/supabase-js'
import { updateEcho } from './arrival'
import type { Model } from './use-model'

export type RememberedVault = { userId: string; dataKey: CryptoKey }
export type RememberedModel = { userId: string; model: Model; client: SupabaseClient }

let vault: RememberedVault | null = null
let model: RememberedModel | null = null
let vaultForgets = 0
let modelForgets = 0

// The other tabs of this browser. Only a word goes through, never anything of
// the person, and it stays in the browser.
export const TAB_CHANNEL = 'stefin-tab-memory'
const FORGET = 'forget'
const tabs = openTabs()

function openTabs(): BroadcastChannel | null {
  // On the server, or in a browser without it, there is no other tab to tell.
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null
  try {
    const channel = new BroadcastChannel(TAB_CHANNEL)
    // Forgotten here, and not passed on: no echo between tabs.
    channel.onmessage = (event: MessageEvent) => {
      if (event.data === FORGET) forgetEverything()
    }
    return channel
  } catch {
    return null
  }
}

/** Taken when a check of the vault begins, and handed back with its answer. */
export function vaultMark(): number {
  return vaultForgets
}

export function rememberVault(opened: RememberedVault, mark: number): void {
  if (mark !== vaultForgets) return
  // Another person: nothing of the previous one stays.
  if (vault?.userId !== opened.userId) forgetModel()
  vault = opened
}

export function rememberedVault(): RememberedVault | null {
  return vault
}

/** Taken when a reading of the model begins, and handed back with its answer. */
export function modelMark(): number {
  return modelForgets
}

export function rememberModel(read: RememberedModel, mark: number): void {
  if (mark !== modelForgets) return
  model = read
}

export function rememberedModel(userId: string): RememberedModel | null {
  return model?.userId === userId ? model : null
}

export function forgetModel(): void {
  modelForgets += 1
  model = null
}

/** In this tab only: what a screen learns alone (no session, no key). */
export function forgetEverything(): void {
  vaultForgets += 1
  vault = null
  forgetModel()
  // An update's echo not yet played belongs to the person who saved it, never to the next one.
  updateEcho.done()
}

/** In this tab, and in every other tab of this browser: signing in or out, starting over. */
export function forgetInEveryTab(): void {
  forgetEverything()
  try {
    tabs?.postMessage(FORGET)
  } catch {
    // A channel the browser has closed: this tab has forgotten all the same.
  }
}
