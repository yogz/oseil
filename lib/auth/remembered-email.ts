// « L’adresse retenue » (Nicolas, 12 November 2026): the address of the last successful sign-in on
// this device, by password or by Face ID, so that the sign-in page shows it already filled in. It
// lives in this device's storage and nowhere else: this module never sends it, it only fills the
// field, which the person then sends as before. It is forgotten on a deliberate « Se déconnecter »
// (components/account/SignOutFrame.tsx) and when the account is deleted (finishDeletion), and kept
// when the vault closes by itself (lib/app/idle-lock.ts): the person comes back to it. A storage that
// refuses (private browsing, a server render) reads as nothing: an empty field, as before.

const KEY = 'oseil-adresse'

export const rememberedEmail = {
  read(): string | null {
    try {
      const value = localStorage.getItem(KEY)
      return value ? value : null
    } catch {
      return null
    }
  },
  set(email: string): void {
    const value = email.trim()
    if (!value) return
    try {
      localStorage.setItem(KEY, value)
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
