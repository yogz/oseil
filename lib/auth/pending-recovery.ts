// The recovery key, between the sign-in that made it (the vault's creation, or
// the renewal of a key never confirmed) and the screen that shows it. It is held in this module's memory and nowhere else: not in
// the address, not in any browser storage. A reload empties it, and the screen
// then sends the person on to the home screen — the key is shown once, or not
// at all.
//
// Only the browser ever writes it. On the server this module is shared by
// every request, so it refuses to hold anything there.

let pending: { display: string; renewed: boolean } | null = null

// `renewed`: the key replaces one that was shown earlier and never confirmed.
export function setPendingRecovery(display: string, renewed = false): void {
  if (typeof window === 'undefined') return
  pending = { display, renewed }
}

export function readPendingRecovery(): { display: string; renewed: boolean } | null {
  if (typeof window === 'undefined') return null
  return pending
}

export function clearPendingRecovery(): void {
  pending = null
}
