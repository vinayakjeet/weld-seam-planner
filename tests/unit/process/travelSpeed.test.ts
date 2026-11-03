import { describe, expect, it } from 'vitest'
import {
  depositedLegMm,
  depositionTravelMmMin,
  travelSpeedCheck,
} from '../../../src/core/process/travelSpeed'

const spray = { wireDiameterMm: 1.2, wireFeedMpm: 10 }

describe('depositionTravelMmMin', () => {
  it('gives 542.6 mm/min (9.04 mm/s) for 1.2 mm wire at 10 m/min and a 6 mm leg', () => {
    const v = depositionTravelMmMin({ ...spray, legMm: 6 })!
    expect(Math.abs(v - 542.6)).toBeLessThan(0.5)
    expect(Math.abs(v / 60 - 9.04)).toBeLessThan(0.01)
  })

  it('travels slower for a bigger leg and faster with a lower efficiency loss', () => {
    const six = depositionTravelMmMin({ ...spray, legMm: 6 })!
    expect(depositionTravelMmMin({ ...spray, legMm: 8 })!).toBeLessThan(six)
    expect(depositionTravelMmMin({ ...spray, legMm: 6, efficiency: 1 })!).toBeGreaterThan(six)
  })

  it('returns null for zero leg, zero diameter, zero feed and NaN', () => {
    expect(depositionTravelMmMin({ ...spray, legMm: 0 })).toBeNull()
    expect(depositionTravelMmMin({ wireDiameterMm: 0, wireFeedMpm: 10, legMm: 6 })).toBeNull()
    expect(depositionTravelMmMin({ wireDiameterMm: 1.2, wireFeedMpm: 0, legMm: 6 })).toBeNull()
    expect(depositionTravelMmMin({ ...spray, legMm: Number.NaN })).toBeNull()
  })
})

describe('depositedLegMm', () => {
  it('inverts the travel formula', () => {
    const z = depositedLegMm({ ...spray, travelMmMin: 542.6 })!
    expect(Math.abs(z - 6)).toBeLessThan(0.01)
  })

  it('round trips any leg', () => {
    const v = depositionTravelMmMin({ ...spray, legMm: 4.5 })!
    expect(depositedLegMm({ ...spray, travelMmMin: v })!).toBeCloseTo(4.5, 9)
  })

  it('returns null for zero travel and NaN', () => {
    expect(depositedLegMm({ ...spray, travelMmMin: 0 })).toBeNull()
    expect(depositedLegMm({ ...spray, travelMmMin: Number.NaN })).toBeNull()
    expect(depositedLegMm({ wireDiameterMm: 0, wireFeedMpm: 10, travelMmMin: 500 })).toBeNull()
  })
})

describe('travelSpeedCheck', () => {
  it('is ok at 9.0 against 9.04', () => {
    expect(travelSpeedCheck(9.0, 9.04)).toEqual({ level: 'ok', reason: '' })
  })

  it('is amber at 13 against 9.04 and red at 14', () => {
    const amber = travelSpeedCheck(13, 9.04)
    expect(amber.level).toBe('amber')
    expect(amber.reason).toContain('9.0 mm/s')
    expect(travelSpeedCheck(14, 9.04).level).toBe('red')
  })

  it('switches at 25 and 50 percent off the suggestion', () => {
    expect(travelSpeedCheck(7.6, 10).level).toBe('ok')
    expect(travelSpeedCheck(7.4, 10).level).toBe('amber')
    expect(travelSpeedCheck(5.1, 10).level).toBe('amber')
    expect(travelSpeedCheck(4.9, 10).level).toBe('red')
    expect(travelSpeedCheck(12.4, 10).level).toBe('ok')
    expect(travelSpeedCheck(12.6, 10).level).toBe('amber')
    expect(travelSpeedCheck(14.9, 10).level).toBe('amber')
    expect(travelSpeedCheck(15.1, 10).level).toBe('red')
  })

  it('is ok when there is no suggestion', () => {
    expect(travelSpeedCheck(9, null)).toEqual({ level: 'ok', reason: '' })
  })
})
