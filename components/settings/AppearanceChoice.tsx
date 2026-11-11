'use client'

import { useState } from 'react'
import { CHIP } from '@/components/setup/styles'
import { applyTheme, readTheme, type ThemeChoice } from '@/lib/app/theme'
import { APPEARANCE, APPEARANCE_DARK, APPEARANCE_LIGHT, APPEARANCE_SYSTEM } from '@/lib/screens/settings-words'

const CHOICES: ReadonlyArray<readonly [ThemeChoice, string]> = [
  ['dark', APPEARANCE_DARK],
  ['light', APPEARANCE_LIGHT],
  ['system', APPEARANCE_SYSTEM],
]

// « Apparence », in « Affichage »: kept on this device only (lib/app/theme.ts), and the page changes
// at the touch, with nothing to save and nothing sent.
export function AppearanceChoice() {
  const [current, setCurrent] = useState<ThemeChoice>(readTheme)

  return (
    <div role="group" aria-labelledby="appearance-label" className="flex flex-col gap-2">
      <span id="appearance-label" className="text-body text-ink">
        {APPEARANCE}
      </span>
      <ul className="flex flex-wrap gap-2">
        {CHOICES.map(([choice, label]) => (
          <li key={choice}>
            <button
              type="button"
              aria-pressed={current === choice}
              className={CHIP}
              onClick={() => {
                applyTheme(choice)
                setCurrent(choice)
              }}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
