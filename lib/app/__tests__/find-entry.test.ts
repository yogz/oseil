import { afterEach, expect, test } from 'vitest'
import { cameFromInside, findShortcutWanted, forgetFromInside, markFromInside } from '../find-entry'
import { FULL_SCREEN, isFullScreen } from '../full-screen'

type Keys = Partial<Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'isComposing'>>
const key = (keys: Keys) => ({ key: 'k', code: '', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, ...keys })

afterEach(forgetFromInside)

test('⌘K on a Mac, Ctrl+K elsewhere, open « Trouver » from a screen of the application', () => {
  expect(findShortcutWanted(key({ metaKey: true }), '/', true)).toBe(true)
  expect(findShortcutWanted(key({ metaKey: true, key: 'K' }), '/reperes', true)).toBe(true)
  expect(findShortcutWanted(key({ ctrlKey: true }), '/evolution', false)).toBe(true)
  expect(findShortcutWanted(key({ ctrlKey: true }), '/reglages', false)).toBe(true)
})

test('the other keys and the other hands do nothing', () => {
  expect(findShortcutWanted(key({}), '/', true)).toBe(false)
  expect(findShortcutWanted(key({ metaKey: true, key: 'j' }), '/', true)).toBe(false)
  expect(findShortcutWanted(key({ ctrlKey: true }), '/', true)).toBe(false)
  expect(findShortcutWanted(key({ metaKey: true }), '/', false)).toBe(false)
  expect(findShortcutWanted(key({ metaKey: true, altKey: true }), '/', true)).toBe(false)
  expect(findShortcutWanted(key({ metaKey: true, shiftKey: true }), '/', true)).toBe(false)
})

// Review focus 4: one never leaves an update or the first launch half done to search.
test('nothing inside the update, the first launch, or « Trouver » itself', () => {
  for (const path of ['/mise-a-jour', '/mise-a-jour/banque', '/premier-lancement', '/premier-lancement/ou', '/trouver']) {
    expect(findShortcutWanted(key({ metaKey: true }), path, true)).toBe(false)
    expect(findShortcutWanted(key({ ctrlKey: true }), path, false)).toBe(false)
  }
})

test('nothing in the deletion of the account, half typed', () => {
  expect(findShortcutWanted(key({ metaKey: true }), '/reglages/supprimer', true)).toBe(false)
  expect(findShortcutWanted(key({ metaKey: true }), '/reglages', true)).toBe(true)
})

test('a keyboard that is not Latin: the key in the place of K', () => {
  expect(findShortcutWanted(key({ metaKey: true, key: 'л', code: 'KeyK' }), '/', true)).toBe(true)
  expect(findShortcutWanted(key({ ctrlKey: true, key: 'л', code: 'KeyK' }), '/', false)).toBe(true)
  expect(findShortcutWanted(key({ metaKey: true, key: 'л', code: 'KeyL' }), '/', true)).toBe(false)
})

test('the full-screen flows are one list, the frame and the shortcut read it', () => {
  for (const path of FULL_SCREEN) {
    expect(isFullScreen(path)).toBe(true)
    expect(findShortcutWanted(key({ metaKey: true }), `${path}/x`, true)).toBe(false)
  }
  expect(isFullScreen('/reglages/supprimer')).toBe(false)
  expect(isFullScreen('/trouverais')).toBe(false)
})

test('nothing while a word is being composed (an accent, a Japanese keyboard)', () => {
  expect(findShortcutWanted(key({ metaKey: true, isComposing: true }), '/', true)).toBe(false)
})

test('« came from inside Oseil » is false until a way in from the site marks it', () => {
  expect(cameFromInside()).toBe(false)
  markFromInside()
  expect(cameFromInside()).toBe(true)
})
