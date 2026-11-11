import type { Cents } from '@/lib/model/types'

// \s covers the ordinary, no-break (U+00A0) and narrow no-break (U+202F) spaces.
const SPACES = /\s/g

export function parseEuros(text: string): Cents | null {
  // The euro sign is only accepted at the very end ("200 €", never "€200" or "1€500").
  const clean = text.replace(SPACES, '').replace(/€$/, '')
  const match = /^(-?)(\d+)(?:[.,](\d{1,2}))?$/.exec(clean)
  if (!match) return null
  const [, sign, whole, fraction = ''] = match
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) return null
  return sign ? -cents || 0 : cents
}

export function parseDecimal(text: string): number | null {
  const clean = text.replace(SPACES, '')
  if (!/^\d+(?:[.,]\d+)?$/.test(clean)) return null
  // "3.800" is most likely 3 800 written with a dot: ambiguous, so the person retypes it.
  if (/^[1-9]\d{0,2}\.\d{3}$/.test(clean)) return null
  const value = Number(clean.replace(',', '.'))
  return Number.isFinite(value) ? value : null
}
