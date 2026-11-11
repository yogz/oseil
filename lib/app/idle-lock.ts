// The vault closes by itself after 15 minutes untouched (Nicolas, 11 November 2026, after the audit
// by Codex): an open vault on a computer left on, or a phone put down on a table, shows anyone the
// person's figures. Closing it is signing out: the key leaves the device, and the person opens it
// again at /connexion, with Face ID or their password.
//
// What is kept for it is two words of this device's storage, like the theme or the hint of the
// squares, never sent anywhere: when the person last did something in the application (a time, and
// nothing about them), and that the vault has just closed by itself, for the sign-in to say so.
// The time is shared by every tab: acting in one keeps the others open. It also counts while the
// application is closed: opened again an hour later, the vault is already shut.
//
// A storage that refuses (private browsing, a server render) keeps nothing: the vault then closes
// only while a tab stays open and untouched, never on a time it cannot read.

export const IDLE_LIMIT_MS = 15 * 60 * 1000

export const IDLE_CLOSED_SENTENCE = 'Ton coffre s’est refermé après 15 minutes sans activité.'

const LAST = 'oseil-derniere-activite'
const CLOSED = 'oseil-coffre-referme'

// Pure: whether the vault should close, given the last time something was done. No time known is
// no reason to close.
export function shouldClose(last: number | null, now: number): boolean {
  return last !== null && now - last >= IDLE_LIMIT_MS
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // See above: nothing is kept.
  }
}

export const idleClock = {
  last(): number | null {
    const raw = read(LAST)
    if (raw === null) return null
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
  },
  touch(now: number): void {
    write(LAST, String(now))
  },
  // A successful entry: the clock starts again, and the sentence of the last closing is said no more.
  start(now: number): void {
    write(LAST, String(now))
    write(CLOSED, null)
  },
  // Signing out, by hand or by the clock: no time is left behind for the next person.
  forget(): void {
    write(LAST, null)
  },
  markClosed(): void {
    write(CLOSED, '1')
  },
  wasClosed(): boolean {
    return read(CLOSED) === '1'
  },
}
