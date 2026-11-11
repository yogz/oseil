// « Face ID activé ici »: a flag on this device, and nothing else. It decides
// whether the offer to activate Face ID is shown after a password sign-in and,
// when this device knows it, names the passkey it uses (its WebAuthn credential
// id, which the server already holds): the settings mark that key « cet
// appareil », and removing it clears the flag. A flag set without a name (a
// keychain that already held a passkey, or a device marked before the name was
// kept) names none, until the next Face ID sign-in names it. A storage that refuses (private browsing, storage turned off, a
// server render) reads as not set: the worst it costs is the offer showing again.

const KEY = 'stefin-face-id'
const NAMED = '1:'

function read(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export const faceIdMarker = {
  isSet(): boolean {
    const value = read()
    return value === '1' || (value !== null && value.startsWith(NAMED) && value.length > NAMED.length)
  },
  /** The credential id of the passkey Face ID uses here, when this device knows it. */
  credentialId(): string | null {
    const value = read()
    return value !== null && value.startsWith(NAMED) && value.length > NAMED.length ? value.slice(NAMED.length) : null
  },
  set(credentialId?: string): void {
    try {
      localStorage.setItem(KEY, credentialId ? `${NAMED}${credentialId}` : '1')
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
