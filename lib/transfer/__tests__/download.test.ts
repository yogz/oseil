// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { REVOKE_DELAY_MS, downloadBlob } from '../download'

beforeEach(() => {
  vi.useFakeTimers()
  URL.createObjectURL = vi.fn(() => 'blob:fake')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

test('clicks a temporary link named after the file, removes it, and revokes the URL only after the delay', () => {
  let attachedAtClick = false
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {})
  click.mockImplementation(() => {
    attachedAtClick = document.body.querySelector('a[download]') !== null
  })

  downloadBlob(new Blob(['x']), 'mes-chiffres-2026-11-09.xlsx')

  expect(click).toHaveBeenCalledTimes(1)
  const clicked = click.mock.contexts[0] as HTMLAnchorElement
  expect(attachedAtClick).toBe(true)
  expect(clicked.download).toBe('mes-chiffres-2026-11-09.xlsx')
  expect(clicked.href).toBe('blob:fake')
  expect(document.body.contains(clicked)).toBe(false)
  expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  vi.advanceTimersByTime(REVOKE_DELAY_MS - 1)
  expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake')
})
