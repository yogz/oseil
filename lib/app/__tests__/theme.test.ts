// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { memoryStorage } from '@/lib/auth/__tests__/memory-storage'
import { THEME_KEY, THEME_SCRIPT, applyTheme, readTheme } from '../theme'

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

const runScript = () => new Function(THEME_SCRIPT)()

describe('the appearance chosen on this device', () => {
  test('is dark until something else is chosen, whatever the device says', () => {
    expect(readTheme()).toBe('dark')
    runScript()
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  test('« Clair » and « Comme l’appareil » are kept on this device and set on the page at once', () => {
    applyTheme('light')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(readTheme()).toBe('light')
    applyTheme('system')
    expect(localStorage.getItem(THEME_KEY)).toBe('system')
    expect(document.documentElement.dataset.theme).toBe('system')
    expect(readTheme()).toBe('system')
  })

  test('« Sombre » forgets the choice: it is the default', () => {
    applyTheme('light')
    applyTheme('dark')
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  test('the script of the page sets the kept choice before anything is drawn', () => {
    localStorage.setItem(THEME_KEY, 'light')
    runScript()
    expect(document.documentElement.dataset.theme).toBe('light')
    localStorage.setItem(THEME_KEY, 'system')
    runScript()
    expect(document.documentElement.dataset.theme).toBe('system')
  })

  test('anything else kept under the key is ignored', () => {
    localStorage.setItem(THEME_KEY, 'rose')
    runScript()
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(readTheme()).toBe('dark')
  })
})
