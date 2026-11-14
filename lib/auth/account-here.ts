// « Un compte a servi ici »: a flag on this device, and nothing else. It says
// nothing about the person (no address, no id) and never leaves the browser.
// The landing page reads it to put « Me connecter » first. It is set on every
// successful entry and cleared only when the account is deleted: neither
// sign-out nor « repartir de zéro » forgets it, since the account still
// exists then. A storage that refuses
// (private browsing, a server render) reads as not set: a first-visit landing,
// which is only a comfort lost, never a lock.

const KEY = 'oseil-compte-ici'

export const accountHere = {
  isSet(): boolean {
    try {
      return localStorage.getItem(KEY) === '1'
    } catch {
      return false
    }
  },
  set(): void {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      // See above.
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(KEY)
    } catch {
      // See above.
    }
  },
}
