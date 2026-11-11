'use client'

// The euros / percent switch of a whole screen. Touching any figure flips every
// figure, says so in a short toast, and remembers the choice in the settings
// document. Saving never blocks the flip: if it fails, the mode stays changed
// for the visit and the toast says the choice was not kept.

import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Toast } from '@/components/ui/Toast'
import { fadeChange } from '@/lib/app/fade-change'
import type { ModelState } from '@/lib/app/use-model'
import { DEFAULT_SETTINGS } from '@/lib/model/documents'
import { saveSettings } from '@/lib/model/repository'
import { DISPLAY_MODE_MESSAGES as MESSAGES, DisplayModeContext, type DisplayMode as Mode } from './display-mode-context'

// Where the figures have always found it.
export { useDisplayMode } from './display-mode-context'
// Settings that cannot be read are never written: the choice lasts for this visit only, and that is said.
const FOR_THIS_VISIT: Record<Mode, string> = {
  percent: 'Chiffres en % pour cette visite (ton choix n’a pas pu être enregistré)',
  euros: 'Chiffres en euros pour cette visite',
}
const SAVE_FAILED = 'Ton choix n’a pas pu être enregistré.'

export function DisplayModeProvider({
  state,
  children,
}: {
  state: Extract<ModelState, { status: 'ready' }>
  children: ReactNode
}) {
  const { settings, unreadable } = state.model
  const [mode, setMode] = useState<Mode>((settings?.value ?? DEFAULT_SETTINGS).display)
  const [message, setMessage] = useState<string | null>(null)
  const clearMessage = useCallback(() => setMessage(null), [])

  // The settings document, as far as this screen knows it. Saves are chained so
  // that a second touch waits for the first to learn the document's id: the
  // database holds one settings document, a second insert would be refused.
  const current = useRef({ id: settings?.id, value: settings?.value ?? DEFAULT_SETTINGS })
  const queue = useRef<Promise<void>>(Promise.resolve())
  const next = useRef(mode)

  const toggle = useCallback(() => {
    const display: Mode = next.current === 'euros' ? 'percent' : 'euros'
    next.current = display
    fadeChange(() => setMode(display))
    // Unreadable settings: never write, the document may exist but not open.
    if (unreadable.settings > 0) {
      setMessage(FOR_THIS_VISIT[display])
      return
    }
    setMessage(MESSAGES[display])

    queue.current = queue.current.then(async () => {
      try {
        const value = { ...current.current.value, display }
        const id = await saveSettings(state.client, state.dataKey, value, current.current.id)
        current.current = { id, value }
      } catch {
        setMessage(SAVE_FAILED)
      }
    })
  }, [state.client, state.dataKey, unreadable.settings])

  return (
    <DisplayModeContext.Provider value={{ mode, toggle }}>
      {children}
      {message === null ? null : <Toast message={message} onDone={clearMessage} />}
    </DisplayModeContext.Provider>
  )
}
