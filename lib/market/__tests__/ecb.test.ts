import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { fetchRates, parseEcbDaily } from '../ecb'
import { MarketUnavailableError } from '../types'

const XML = readFileSync(join(__dirname, 'ecb-2026-11-06.xml'), 'utf8')
const EXPECTED = { on: '2026-11-06', perEuro: { USD: 1.1165, GBP: 0.83415, CHF: 0.9143 } }

describe('parseEcbDaily', () => {
  it('reads the fixture', () => {
    expect(parseEcbDaily(XML)).toEqual(EXPECTED)
  })

  it('reads double quotes too', () => {
    expect(parseEcbDaily(XML.replace(/'/g, '"').replace('version="1.0"', "version='1.0'"))).toEqual(EXPECTED)
  })

  it('gives null without a date', () => {
    expect(parseEcbDaily(XML.replace(/ time='[^']*'/, ''))).toBeNull()
  })

  it('gives null for a rate of 0 or a rate that is not a number', () => {
    expect(parseEcbDaily(XML.replace("rate='1.1165'", "rate='0'"))).toBeNull()
    expect(parseEcbDaily(XML.replace("rate='1.1165'", "rate='abc'"))).toBeNull()
  })

  it('gives null with no currency', () => {
    expect(parseEcbDaily("<Cube><Cube time='2026-11-06'></Cube></Cube>")).toBeNull()
  })
})

describe('fetchRates', () => {
  it('reads the answer', async () => {
    const fetcher = vi.fn(async () => new Response(XML)) as unknown as typeof fetch
    expect(await fetchRates(fetcher)).toEqual(EXPECTED)
  })

  it('rejects on a 503', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch
    const error = await fetchRates(fetcher).catch((e) => e)
    expect(error).toBeInstanceOf(MarketUnavailableError)
    expect(error).toMatchObject({ source: 'ecb', status: 503 })
  })
})
