'use client'

import { useState } from 'react'
import { CHIP } from '@/components/setup/styles'
import { Switch } from '@/components/ui/Switch'
import type { ModelState } from '@/lib/app/use-model'
import { DEFAULT_SETTINGS } from '@/lib/model/documents'
import { saveSettings } from '@/lib/model/repository'
import type { Settings } from '@/lib/model/types'
import { SAVE_FAILED } from '@/lib/screens/words'
import { homeChoice } from '@/lib/screens/home-in-grid'
import {
  GRID_ALL,
  GRID_NOTE,
  GRID_ONLY_HOME,
  GRID_TITLE,
  GRID_WITHOUT_HOME,
  DISPLAY_EUROS,
  DISPLAY_PERCENT,
  DISPLAY_TITLE,
  HIDE_AMOUNTS,
  HIDE_AMOUNTS_NOTE,
  SETTINGS_UNREADABLE,
} from '@/lib/screens/settings-words'
import { AppearanceChoice } from './AppearanceChoice'
import { NOTE, SECTION, SECTION_TITLE, SENTENCE } from './styles'

type Ready = Extract<ModelState, { status: 'ready' }>

// « Affichage »: both choices live in the settings document, next to the budget. Each one is saved on its own
// from the document as read; the screen reloads afterwards, so « ••• » follows at once everywhere.
export function DisplaySection({ state }: { state: Ready }) {
  const { settings, unreadable } = state.model
  // The document as this screen knows it: a second touch builds on the first one, not on the stale model.
  const [known, setKnown] = useState<{ id?: string; value: Settings }>({
    id: settings?.id,
    value: settings?.value ?? DEFAULT_SETTINGS,
  })
  const current = known.value
  // « Ta grille » (docs/superpowers/specs/2026-11-12-grille-sans-chez-toi-design.md): only with something Chez toi.
  const choice = homeChoice(state.model)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)

  async function change(next: Partial<Pick<Settings, 'display' | 'hideAmounts'>> & { withoutHome?: boolean }) {
    setBusy(true)
    setSaid(null)
    // « Ta grille »: only ever written as true; absent counts everything, as before the setting.
    const { withoutHome, ...rest } = next
    const value: Settings = { ...current, ...rest }
    if (withoutHome === true) value.withoutHome = true
    if (withoutHome === false) delete value.withoutHome
    // The switch follows the touch at once; a failed save puts it back.
    setKnown({ id: known.id, value })
    try {
      const id = await saveSettings(state.client, state.dataKey, value, known.id)
      setKnown({ id, value })
      state.reload()
    } catch (error) {
      console.error(error)
      setKnown(known)
      setSaid(SAVE_FAILED)
    }
    setBusy(false)
  }

  return (
    <section aria-label={DISPLAY_TITLE} className={SECTION}>
      <h2 className={SECTION_TITLE}>{DISPLAY_TITLE}</h2>
      {/* Kept on this device, not in the vault: it works even when the settings cannot be read. */}
      <AppearanceChoice />
      {unreadable.settings > 0 ? (
        <p role="alert" className={SENTENCE}>
          {SETTINGS_UNREADABLE}
        </p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-2">
            {(
              [
                ['euros', DISPLAY_EUROS],
                ['percent', DISPLAY_PERCENT],
              ] as const
            ).map(([display, label]) => (
              <li key={display}>
                <button
                  type="button"
                  aria-pressed={current.display === display}
                  disabled={busy}
                  className={CHIP}
                  onClick={() => current.display !== display && void change({ display })}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex min-h-11 items-center justify-between gap-3 text-body text-ink">
            <span id="hide-amounts-label">{HIDE_AMOUNTS}</span>
            <Switch
              checked={current.hideAmounts}
              labelledBy="hide-amounts-label"
              disabled={busy}
              onToggle={() => void change({ hideAmounts: !current.hideAmounts })}
            />
          </div>
          <p className={NOTE}>{HIDE_AMOUNTS_NOTE}</p>
          {choice !== 'none' ? (
            <div className="flex flex-col gap-2">
              <p id="grid-choice-label" className="text-body text-ink">
                {GRID_TITLE}
              </p>
              <ul role="group" aria-labelledby="grid-choice-label" className="flex flex-wrap gap-2">
                <li>
                  <button
                    type="button"
                    aria-pressed={current.withoutHome !== true}
                    disabled={busy}
                    className={CHIP}
                    onClick={() => current.withoutHome === true && void change({ withoutHome: false })}
                  >
                    {GRID_ALL}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    aria-pressed={current.withoutHome === true}
                    // With nothing but Chez toi, leaving it out would leave nothing to show.
                    disabled={busy || choice === 'only-home'}
                    className={CHIP}
                    onClick={() => current.withoutHome !== true && void change({ withoutHome: true })}
                  >
                    {GRID_WITHOUT_HOME}
                  </button>
                </li>
              </ul>
              <p className={NOTE}>{choice === 'only-home' ? GRID_ONLY_HOME : GRID_NOTE}</p>
            </div>
          ) : null}
        </>
      )}
      {said ? (
        <p role="alert" className={SENTENCE}>
          {said}
        </p>
      ) : null}
    </section>
  )
}
