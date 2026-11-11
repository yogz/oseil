// The day the reminder of an update was set aside (« Plus tard ») on this device: dismissed, it does
// not come back before the next day (spec of the reminder, « Sur le site »). What is kept is a date
// in the browser's local storage, like the appearance: it says nothing about the person and never
// leaves the browser. A storage that refuses (private browsing) reads as nothing kept: the reminder
// shows, and « Plus tard » hides it for this visit only.

import type { IsoDate } from '@/lib/model/types'

export const REMINDER_DISMISSED_KEY = 'oseil-rappel-ecarte'

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export const reminderDismissal = {
  read(): IsoDate | null {
    try {
      const kept = localStorage.getItem(REMINDER_DISMISSED_KEY)
      return kept !== null && ISO_DAY.test(kept) ? kept : null
    } catch {
      return null
    }
  },
  write(today: IsoDate): void {
    try {
      localStorage.setItem(REMINDER_DISMISSED_KEY, today)
    } catch {
      // See above: hidden for this visit only.
    }
  },
}
