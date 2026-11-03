import { describe, expect, it } from 'vitest'
import {
  effectiveLegMm,
  legLimits,
  maxLegAlongEdgeMm,
  minLegMm,
  MULTI_PASS_LEG_MM,
  throatMm,
} from '../../../src/core/process/filletRules'
import { WPS_PRESETS } from '../../../src/core/process/wps'

const byId = (id: string) => WPS_PRESETS.find((p) => p.id === id)!
const spray = byId('WPS-GMAW-SPRAY-FW6')
const shortCircuit = byId('WPS-GMAW-SC')
const gtaw = byId('WPS-GTAW')

describe('minLegMm', () => {
  it('follows the interval table (lo, hi]', () => {
    expect(minLegMm(3)).toBe(3)
    expect(minLegMm(6)).toBe(3)
    expect(minLegMm(6.01)).toBe(5)
    expect(minLegMm(12)).toBe(5)
    expect(minLegMm(12.01)).toBe(6)
    expect(minLegMm(20)).toBe(6)
    expect(minLegMm(20.01)).toBe(8)
  })
})

describe('edge limit, throat and multi pass', () => {
  it('limits the leg to t below 6 mm and t minus 1.6 from 6 mm', () => {
    expect(maxLegAlongEdgeMm(5)).toBe(5)
    expect(maxLegAlongEdgeMm(6)).toBeCloseTo(4.4, 9)
    expect(maxLegAlongEdgeMm(10)).toBeCloseTo(8.4, 9)
  })

  it('has a throat of 0.707 times the leg', () => {
    expect(throatMm(6)).toBeCloseTo(4.242, 9)
  })

  it('flags legs above 8 mm as multi pass', () => {
    expect(MULTI_PASS_LEG_MM).toBe(8)
  })
})

describe('legLimits', () => {
  it('gives a minimum but no maximum for a T fillet', () => {
    expect(legLimits('fillet', [10, 12])).toEqual({ minMm: 5, maxMm: null })
  })

  it('applies the edge limit of the thinner plate to lap joints', () => {
    const l = legLimits('lap', [10, 10])
    expect(l.minMm).toBe(5)
    expect(l.maxMm).toBeCloseTo(8.4, 9)
  })

  it('applies the edge limit to corner joints against the thinner known plate', () => {
    expect(legLimits('corner', [3, 10]).maxMm).toBe(3)
    expect(legLimits('corner', [null, 10]).maxMm).toBeCloseTo(8.4, 9)
  })

  it('uses the one known plate for the minimum', () => {
    expect(legLimits('fillet', [8, null]).minMm).toBe(5)
  })

  it('gives nothing when no thickness is known', () => {
    expect(legLimits('fillet', [null, null])).toEqual({ minMm: null, maxMm: null })
    expect(legLimits('lap', [null, null])).toEqual({ minMm: null, maxMm: null })
  })
})

describe('effectiveLegMm', () => {
  const base = { jointType: 'fillet' as const }

  it('keeps a set leg as it is', () => {
    expect(effectiveLegMm({ ...base, legMm: 7, procedure: spray, thickness: [10, 12] })).toEqual({ legMm: 7, source: 'set' })
  })

  it('uses the deposited leg of the procedure, rounded to 0.5 mm', () => {
    expect(effectiveLegMm({ ...base, legMm: null, procedure: spray, thickness: [10, 12] })).toEqual({ legMm: 6, source: 'procedure' })
  })

  it('clamps a deposited 4.0 mm leg up to the 5 mm minimum', () => {
    expect(effectiveLegMm({ ...base, legMm: null, procedure: shortCircuit, thickness: [10, 12] })).toEqual({ legMm: 5, source: 'procedure' })
  })

  it('clamps down to the edge limit on a thin lap', () => {
    expect(effectiveLegMm({ jointType: 'lap', legMm: null, procedure: shortCircuit, thickness: [3, 3] })).toEqual({ legMm: 3, source: 'procedure' })
  })

  it('falls back to the minimum leg without a procedure', () => {
    expect(effectiveLegMm({ ...base, legMm: null, procedure: null, thickness: [10, 12] })).toEqual({ legMm: 5, source: 'minimum' })
  })

  it('falls back to 6 mm when nothing is known', () => {
    expect(effectiveLegMm({ ...base, legMm: null, procedure: null, thickness: [null, null] })).toEqual({ legMm: 6, source: 'fallback' })
    expect(effectiveLegMm({ ...base, legMm: null, procedure: gtaw, thickness: [null, null] })).toEqual({ legMm: 6, source: 'fallback' })
  })

  it('uses the minimum for a procedure without wire feed', () => {
    expect(effectiveLegMm({ ...base, legMm: null, procedure: gtaw, thickness: [2, 2] })).toEqual({ legMm: 3, source: 'minimum' })
  })

  it('uses the deposited leg unclamped when thickness is unknown', () => {
    expect(effectiveLegMm({ ...base, legMm: null, procedure: spray, thickness: [null, null] })).toEqual({ legMm: 6, source: 'procedure' })
  })
})
