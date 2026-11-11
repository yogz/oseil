'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import {
  STOP_REMINDER_BUTTON,
  STOP_REMINDER_DONE,
  STOP_REMINDER_DONE_NOTE,
  STOP_REMINDER_FAILED,
} from '@/lib/screens/words'

const SENTENCE = 'text-body leading-relaxed text-ink'

// The button of the unsubscribe page. Nothing is sent before the touch: mail filters open the links of an
// e-mail ahead of the person, and must not switch the reminder off for them.
//
// `token` is the one of the link, already checked as a uuid by the page, or null when the link has none
// that could be one. Then nothing is sent, and the confirmation is the same: the page never tells whether
// an account exists (`stop_reminder` itself answers the same whatever the token).
export function StopReminder({ token }: { token: string | null }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle')

  async function stop() {
    setState('busy')
    try {
      if (token !== null) {
        const { error } = await createBrowserSupabase().rpc('stop_reminder', { token })
        if (error) throw error
      }
      setState('done')
    } catch (error) {
      console.error(error)
      setState('failed')
    }
  }

  if (state === 'done') {
    return (
      <div className="mt-8 flex flex-col gap-2">
        <p role="status" className={SENTENCE}>
          {STOP_REMINDER_DONE}
        </p>
        <p className="text-body leading-relaxed text-ink-soft">{STOP_REMINDER_DONE_NOTE}</p>
      </div>
    )
  }

  return (
    <div className="mt-8 flex flex-col gap-4">
      <Button disabled={state === 'busy'} onClick={() => void stop()}>
        {STOP_REMINDER_BUTTON}
      </Button>
      {state === 'failed' ? (
        <p role="alert" className={SENTENCE}>
          {STOP_REMINDER_FAILED}
        </p>
      ) : null}
    </div>
  )
}
