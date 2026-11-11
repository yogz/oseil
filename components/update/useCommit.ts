'use client'

import { useEffect, useRef, type KeyboardEvent } from 'react'

// A box commits when it is left, on Enter, and when the page is hidden (the person
// switches to the bank's app without leaving the box: no blur fires).
export function useCommit(commit: () => void): {
  onBlur: () => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
} {
  const latest = useRef(commit)
  useEffect(() => {
    latest.current = commit
  })
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'hidden') latest.current()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])
  return {
    onBlur: () => latest.current(),
    onKeyDown: (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        latest.current()
      }
    },
  }
}
