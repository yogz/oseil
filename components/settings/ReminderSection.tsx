'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { Switch } from '@/components/ui/Switch'
import { SAVE_FAILED } from '@/lib/screens/words'
import {
  REMINDER_EMAIL,
  REMINDER_EMAIL_NOTE,
  REMINDER_SECTION_TITLE,
  REMINDER_UNREADABLE,
} from '@/lib/screens/settings-words'
import { NOTE, SECTION, SECTION_TITLE, SENTENCE } from './styles'
import { SETTINGS_ANCHORS } from '@/lib/screens/find-words'

// What the base answered: on, off, not yet known, or not readable.
type Known = boolean | 'reading' | 'unreadable'

// « Me le rappeler par e-mail »: read from the base, never assumed. Until the answer comes, no switch is
// shown, so a default « on » can never be read as the truth; a failed read says so instead of a state.
// The base holds only whether it is off (no figure): see the spec of the reminder, « Le stockage ».
export function ReminderSection({ client }: { client: SupabaseClient }) {
  const [enabled, setEnabled] = useState<Known>('reading')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const read = async () => {
      try {
        const { data, error } = await client.rpc('my_reminder_email')
        if (error) throw error
        if (typeof data !== 'boolean') throw new Error('my_reminder_email did not answer a boolean')
        if (!cancelled) setEnabled(data)
      } catch (error) {
        console.error(error)
        if (!cancelled) setEnabled('unreadable')
      }
    }
    void read()
    return () => {
      cancelled = true
    }
  }, [client])

  async function change(next: boolean) {
    const before = enabled
    setBusy(true)
    setSaid(null)
    // The switch follows the touch at once; a failed save puts it back.
    setEnabled(next)
    try {
      const { error } = await client.rpc('set_my_reminder_email', { enabled: next })
      if (error) throw error
    } catch (error) {
      console.error(error)
      setEnabled(before)
      setSaid(SAVE_FAILED)
    }
    setBusy(false)
  }

  return (
    <section id={SETTINGS_ANCHORS.reminder} aria-label={REMINDER_SECTION_TITLE} className={SECTION}>
      <h2 className={SECTION_TITLE}>{REMINDER_SECTION_TITLE}</h2>
      {enabled === 'unreadable' ? (
        <p role="alert" className={SENTENCE}>
          {REMINDER_UNREADABLE}
        </p>
      ) : (
        <>
          <div className="flex min-h-11 items-center justify-between gap-3 text-body text-ink">
            <span id="reminder-email-label">{REMINDER_EMAIL}</span>
            {typeof enabled === 'boolean' ? (
              <Switch
                checked={enabled}
                labelledBy="reminder-email-label"
                disabled={busy}
                onToggle={() => void change(!enabled)}
              />
            ) : null}
          </div>
          <p className={NOTE}>{REMINDER_EMAIL_NOTE}</p>
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
