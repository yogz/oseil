'use client'

import { useEffect, useRef } from 'react'

// « Trouver » leads to a section by its anchor (`/reglages#compte`). The vault's wait is drawn before the
// sections, so the browser finds nothing to go to on arrival: once `ready`, the page goes there itself,
// once, and only for one of its own `anchors`.
export function useScrollToAnchor(ready: boolean, anchors: readonly string[]) {
  const done = useRef(false)
  useEffect(() => {
    if (!ready || done.current) return
    done.current = true
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (!anchors.includes(id)) return
    document.getElementById(id)?.scrollIntoView()
  }, [ready, anchors])
}
