'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { DISPLAY_MODE_MESSAGES, DisplayModeContext, type DisplayMode } from '@/components/money/display-mode-context'
import { Toast } from '@/components/ui/Toast'
import { fadeChange } from '@/lib/app/fade-change'

// The euros / percent switch of the example: touching a figure flips every figure of the screen
// and says so, as in the site, but nothing is saved (spec of the landing, « Les liens à l’intérieur
// de l’exemple »). Each screen of the example starts in euros.
export function ExampleDisplayMode({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<DisplayMode>('euros')
  const [message, setMessage] = useState<string | null>(null)
  const clearMessage = useCallback(() => setMessage(null), [])
  const toggle = useCallback(() => {
    const next: DisplayMode = mode === 'euros' ? 'percent' : 'euros'
    fadeChange(() => setMode(next))
    setMessage(DISPLAY_MODE_MESSAGES[next])
  }, [mode])
  return (
    <DisplayModeContext.Provider value={{ mode, toggle }}>
      {children}
      {message === null ? null : <Toast message={message} onDone={clearMessage} />}
    </DisplayModeContext.Provider>
  )
}
