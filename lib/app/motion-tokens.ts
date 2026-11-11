// The motion vocabulary of globals.css (--motion-short, --motion-mid, --motion-long, --motion-enter,
// --motion-leave), read for an animation drawn by script. The browser may give a duration back in
// seconds (« .15s ») although it is written in milliseconds: both are understood.
export function parseDuration(value: string): number {
  const text = value.trim()
  const n = parseFloat(text)
  if (!Number.isFinite(n)) return 0
  return /\dms$/.test(text) || !/s$/.test(text) ? n : n * 1000
}

export function motionToken(name: '--motion-short' | '--motion-mid' | '--motion-long'): number
export function motionToken(name: '--motion-enter' | '--motion-leave'): string
export function motionToken(name: string): number | string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name)
  if (name === '--motion-enter' || name === '--motion-leave') return value.trim() || 'ease'
  return parseDuration(value)
}
