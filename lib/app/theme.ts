// The appearance of the site on this device. Dark by default (Nicolas, 10 November 2026): « Clair »
// and « Comme l’appareil » are chosen in the Réglages. The choice is a word kept in the browser's
// local storage, and nothing else: it says nothing about the person and never leaves the browser.
// It cannot live in the vault with the other settings, which opens only after the sign-in: the
// colours must be right before the first screen is drawn.
//
// The colours themselves live in app/globals.css: dark on a page that says nothing, light with
// data-theme="light", and with data-theme="system" whatever the device asks for.

export type ThemeChoice = 'dark' | 'light' | 'system'

export const THEME_KEY = 'oseil-apparence'

const isKept = (value: unknown): value is 'light' | 'system' => value === 'light' || value === 'system'

export function readTheme(): ThemeChoice {
  try {
    const kept = localStorage.getItem(THEME_KEY)
    return isKept(kept) ? kept : 'dark'
  } catch {
    // A storage that refuses (private browsing, a server render): the default, dark.
    return 'dark'
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'dark') delete root.dataset.theme
  else root.dataset.theme = choice
  try {
    if (choice === 'dark') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, choice)
  } catch {
    // The page changes all the same; the choice is only not kept.
  }
}

// Run in the head of every page, before anything is drawn, so a kept choice never flashes the
// dark theme first. The policy of the site already allows an inline script (lib/security-headers.ts).
export const THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==='light'||t==='system')document.documentElement.dataset.theme=t}catch(e){}`
