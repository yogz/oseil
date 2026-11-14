'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { FIND_HREF, findShortcutWanted, isMac, markFromInside } from './find-entry'

// ⌘K on a Mac, Ctrl+K elsewhere: « Trouver » from any screen of the application, a case being typed
// in included, except the update, the first launch and « Trouver » itself (find-entry.ts). Mounted once,
// in the frame of the application.
export function useFindShortcut() {
  const path = usePathname() ?? '/'
  const router = useRouter()
  useEffect(() => {
    const mac = isMac(navigator.platform)
    function onKey(event: KeyboardEvent) {
      if (!findShortcutWanted(event, path, mac)) return
      // The browser's own Ctrl+K (its search bar) does not also open.
      event.preventDefault()
      markFromInside()
      router.push(FIND_HREF)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [path, router])
}
