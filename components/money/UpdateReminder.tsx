'use client'

import Link from 'next/link'
import { useCallback, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { reminderDismissal } from '@/lib/app/update-reminder'
import { formatDayMonth } from '@/lib/format'
import type { IsoDate } from '@/lib/model/types'
import { lastUpdateOf, monthsSince, reminderDue } from '@/lib/update/reminder'
import {
  REMINDER_LATER,
  REMINDER_RESUME,
  REMINDER_SENTENCE,
  REMINDER_TITLE,
  REMINDER_UPDATE,
} from '@/lib/screens/words'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const WHITE_PILL = `inline-flex min-h-13 items-center justify-center rounded-full bg-ink px-6 text-body font-semibold text-ground ${FOCUS}`
const LATER = `inline-flex min-h-11 items-center px-2 text-body text-ink-soft underline decoration-rule-strong underline-offset-4 ${FOCUS}`

type Snapshots = readonly { value: { takenOn: IsoDate }; createdAt?: string }[]
type Reminder = { months: number; date: string }

// What the sheet says, or null when it is not due (or was set aside today on this device). Mon argent
// also reads it to keep the square hint quiet under the sheet.
export function reminderOf(snapshots: Snapshots, today: IsoDate): Reminder | null {
  const last = lastUpdateOf(snapshots)
  // Due by the save day, but the age is told from the statement date, the one the sentence shows.
  if (!last || !reminderDue(last.day, today, reminderDismissal.read())) return null
  return { months: monthsSince(last.takenOn, today), date: formatDayMonth(last.takenOn, today) }
}

// The reminder of an update after three months without one (planche A, Nicolas, 11 November 2026):
// a sheet rising from the bottom over the screen it leaves dimmed. « Plus tard », Escape or a touch
// on the dimmed screen set it aside until the next day.
// Mon argent shows it only on a ready board where an update is possible, never in the example.
export function UpdateReminder({
  snapshots,
  today,
  pending,
}: {
  snapshots: Snapshots
  today: IsoDate
  // An update already under way: the pill resumes it.
  pending: boolean
}) {
  // Decided once, when Mon argent shows the board.
  const [reminder, setReminder] = useState(() => reminderOf(snapshots, today))
  const later = useCallback(() => {
    reminderDismissal.write(today)
    setReminder(null)
  }, [today])

  if (!reminder) return null
  return (
    <Sheet open onClose={later} title={REMINDER_TITLE(reminder.months)} text={REMINDER_SENTENCE(reminder.date)}>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/mise-a-jour" className={WHITE_PILL}>
          {pending ? REMINDER_RESUME : REMINDER_UPDATE}
        </Link>
        <button type="button" onClick={later} className={LATER}>
          {REMINDER_LATER}
        </button>
      </div>
    </Sheet>
  )
}
