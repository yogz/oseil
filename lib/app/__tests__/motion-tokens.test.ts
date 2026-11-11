import { expect, test } from 'vitest'
import { parseDuration } from '@/lib/app/motion-tokens'

// The bug of 10 November 2026: Chrome gives « .15s » back for --motion-short, written 150ms; read as
// 0.15 ms, a chapter unfolded and the message faded in no time at all.
test('a duration reads the same in milliseconds and in seconds', () => {
  expect(parseDuration('150ms')).toBe(150)
  expect(parseDuration(' .15s')).toBe(150)
  expect(parseDuration('0.35s')).toBe(350)
  expect(parseDuration('1200ms')).toBe(1200)
  expect(parseDuration('1.2s')).toBe(1200)
})

test('nothing readable is no motion', () => {
  expect(parseDuration('')).toBe(0)
  expect(parseDuration('auto')).toBe(0)
})
