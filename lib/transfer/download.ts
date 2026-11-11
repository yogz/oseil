// How long the object URL lives after the click: Safari reads it a moment later, so it is not revoked at once.
export const REVOKE_DELAY_MS = 60_000

// Hands a file to the browser's own download: a temporary link, clicked, then removed.
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}
