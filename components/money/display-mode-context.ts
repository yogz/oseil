'use client'

// The euros / percent mode of a screen, as the figures read it. Apart from its provider
// (DisplayMode.tsx), which saves the choice in the settings: a figure only needs to know the mode
// and how to flip it, and so a screen that saves nothing (the example) can give it its own.

import { createContext, useContext } from 'react'
import type { Settings } from '@/lib/model/types'

export type DisplayMode = Settings['display']
export type DisplayModeValue = { mode: DisplayMode; toggle: () => void }

export const DisplayModeContext = createContext<DisplayModeValue | null>(null)

// What the toast says once every figure has flipped.
export const DISPLAY_MODE_MESSAGES: Record<DisplayMode, string> = {
  percent: 'Chiffres en % partout · touche pour revenir en €',
  euros: 'Chiffres en euros partout',
}

export function useDisplayMode(): DisplayModeValue {
  const value = useContext(DisplayModeContext)
  if (!value) throw new Error('useDisplayMode must be used inside DisplayModeProvider')
  return value
}
