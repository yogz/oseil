import { beforeEach, describe, expect, test } from 'vitest'
import { cushionArrival, recoverArrival, updateEcho } from '../arrival'

describe('a motion that plays once per page load', () => {
  beforeEach(() => {
    cushionArrival.reset()
    recoverArrival.reset()
  })

  test('is due until it has been shown, then not again', () => {
    expect(cushionArrival.due()).toBe(true)
    cushionArrival.shown()
    expect(cushionArrival.due()).toBe(false)
  })

  test('each motion keeps its own turn', () => {
    cushionArrival.shown()
    expect(recoverArrival.due()).toBe(true)
  })
})

describe('the echo of an update', () => {
  beforeEach(() => updateEcho.reset())

  test('is not due before an update asks for it', () => {
    expect(updateEcho.due()).toBe(false)
  })

  test('asked by the save, it is due once, then consumed', () => {
    updateEcho.ask()
    expect(updateEcho.due()).toBe(true)
    updateEcho.done()
    expect(updateEcho.due()).toBe(false)
  })
})
