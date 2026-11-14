// The ways into « Trouver » (docs/superpowers/specs/2026-11-14-trouver-design.md): the magnifier at the
// top of every screen with the tab bar, and ⌘K on a Mac (Ctrl+K elsewhere).

import { isFullScreen, within } from './full-screen'

export const FIND_HREF = '/trouver'

// One never leaves an update, the first launch or a half-typed deletion of the account to search; in
// « Trouver », it is already open. The full-screen flows are the one list of full-screen.ts.
const ALSO_NO_SHORTCUT = ['/reglages/supprimer']

type Keys = Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'isComposing'>

// Whether a key pressed on `path` asks for « Trouver »: ⌘K on a Mac, Ctrl+K elsewhere, never while a
// word is being composed (an accent, a Japanese keyboard). The key K is known by its letter, or by its
// place on the keyboard when the layout is not Latin (a Russian keyboard writes « л » there).
export function findShortcutWanted(event: Keys, path: string, mac: boolean): boolean {
  if (event.isComposing || event.altKey || event.shiftKey) return false
  if (event.key.toLowerCase() !== 'k' && event.code !== 'KeyK') return false
  if (mac ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey) return false
  return !isFullScreen(path) && !ALSO_NO_SHORTCUT.some((root) => within(path, root))
}

export const isMac = (platform: string) => /Mac|iPhone|iPad|iPod/.test(platform)

// Whether « Trouver » was opened from a screen of Oseil in this tab: only then does « Fermer » go back.
// Opened from its address (a bookmark, another site before), going back would leave Oseil: it goes to
// Mon argent instead. In memory only, never stored; a reload forgets it.
let fromInside = false

export const markFromInside = () => {
  fromInside = true
}
export const cameFromInside = () => fromInside
// For the tests.
export const forgetFromInside = () => {
  fromInside = false
}
