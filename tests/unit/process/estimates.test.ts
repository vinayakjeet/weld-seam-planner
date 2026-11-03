import { describe, expect, it } from 'vitest'
import { seamEstimates, WIRE_DENSITY_KG_MM3 } from '../../../src/core/process/estimates'

const spec = {
  lengthMm: 800,
  passes: 1,
  travelSpeedMmS: 9.0,
  wireDiameterMm: 1.2,
  wireFeedMpm: 10,
  gasFlowLpm: 15,
  preflowS: 0.3,
  postflowS: 1.0,
}

describe('seamEstimates', () => {
  it('reproduces the spec example', () => {
    const e = seamEstimates(spec)
    expect(Math.abs(e.arcTimeS - 88.9)).toBeLessThan(0.05)
    expect(Math.abs(e.wireKg - 0.131)).toBeLessThan(0.002)
    expect(Math.abs(e.gasL - 22.5)).toBeLessThan(0.05)
  })

  it('doubles arc time for two passes', () => {
    expect(seamEstimates({ ...spec, passes: 2 }).arcTimeS).toBeCloseTo(2 * seamEstimates(spec).arcTimeS, 9)
  })

  it('uses 7.85e-6 kg/mm3 for steel wire', () => {
    expect(WIRE_DENSITY_KG_MM3).toBe(7.85e-6)
  })

  it('gives 0 kg without wire feed and 0 L without gas', () => {
    expect(seamEstimates({ ...spec, wireFeedMpm: undefined }).wireKg).toBe(0)
    expect(seamEstimates({ ...spec, gasFlowLpm: undefined }).gasL).toBe(0)
  })

  it('stays finite when travel speed is not positive', () => {
    const e = seamEstimates({ ...spec, travelSpeedMmS: 0 })
    expect(Number.isFinite(e.arcTimeS)).toBe(true)
    expect(e.arcTimeS).toBe(0)
    expect(e.wireKg).toBe(0)
  })
})
