import { cleanRecoveryInput } from '@/lib/vault/keys'

// The check that a recovery key was really put away: one of its eight groups,
// typed back while the key is hidden. Everything happens on the device; nothing
// of it is sent anywhere.

/** How the screen names each group, first to eighth. */
export const GROUP_ORDINALS = [
  'premier',
  'deuxième',
  'troisième',
  'quatrième',
  'cinquième',
  'sixième',
  'septième',
  'huitième',
] as const

/** Whether `typed` is the group at `index` of the key shown as `display`. */
export function groupMatches(display: string, index: number, typed: string): boolean {
  const group = display.split('-')[index]
  return group !== undefined && cleanRecoveryInput(typed) === group
}

/**
 * The group to ask for: any of the eight the first time, never the one asked
 * just before (a person who looked at the key again must find it again).
 */
export function nextGroup(previous: number | null, random: () => number = Math.random): number {
  const count = GROUP_ORDINALS.length
  if (previous === null) return Math.floor(random() * count)
  // One of the seven others, counted from the one after the previous.
  return (previous + 1 + Math.floor(random() * (count - 1))) % count
}
