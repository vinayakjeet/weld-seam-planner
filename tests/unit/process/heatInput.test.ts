import { describe, expect, it } from 'vitest'
import {
  arcEnergyKJmm,
  heatInputCheck,
  heatInputKJmm,
  PROCESSES,
  thermalEfficiency,
} from '../../../src/core/process/heatInput'

describe('thermalEfficiency', () => {
  it('uses k 1.0 for SAW, 0.8 for GMAW and FCAW, 0.6 for GTAW', () => {
    expect(thermalEfficiency('SAW')).toBe(1.0)
    expect(thermalEfficiency('GMAW')).toBe(0.8)
    expect(thermalEfficiency('FCAW')).toBe(0.8)
    expect(thermalEfficiency('GTAW')).toBe(0.6)
  })

  it('lists the four processes', () => {
    expect([...PROCESSES]).toEqual(['GMAW', 'FCAW', 'GTAW', 'SAW'])
  })
})

describe('arc energy and heat input', () => {
  it('gives 0.836 kJ/mm of arc energy for 28 V, 270 A at 542.6 mm/min', () => {
    expect(arcEnergyKJmm(28, 270, 542.6)).toBeCloseTo(0.836, 2)
    expect(Math.abs(arcEnergyKJmm(28, 270, 542.6)! - 0.836)).toBeLessThan(0.002)
  })

  it('gives 0.669 kJ/mm of heat input for GMAW k 0.8', () => {
    expect(Math.abs(heatInputKJmm(0.8, 28, 270, 542.6)! - 0.669)).toBeLessThan(0.002)
  })

  it('returns null for zero or negative travel, negative inputs and NaN', () => {
    expect(arcEnergyKJmm(28, 270, 0)).toBeNull()
    expect(arcEnergyKJmm(28, 270, -5)).toBeNull()
    expect(arcEnergyKJmm(-1, 270, 500)).toBeNull()
    expect(heatInputKJmm(0.8, 28, Number.NaN, 500)).toBeNull()
    expect(heatInputKJmm(0.8, 28, 270, Infinity)).toBeNull()
  })
})

describe('heatInputCheck', () => {
  it('is ok at 0.67 kJ/mm on 12 mm', () => {
    expect(heatInputCheck(0.67, 12)).toEqual({ level: 'ok', reason: '' })
  })

  it('is amber above 2.5 and names the limit', () => {
    const c = heatInputCheck(2.6, 12)
    expect(c.level).toBe('amber')
    expect(c.reason).toContain('2.5 kJ/mm')
  })

  it('is red above 3.5', () => {
    const c = heatInputCheck(3.6, 12)
    expect(c.level).toBe('red')
    expect(c.reason).toContain('3.5 kJ/mm')
  })

  it('does not trip at the limits themselves', () => {
    expect(heatInputCheck(2.5, 12).level).toBe('ok')
    expect(heatInputCheck(3.5, 12).level).toBe('amber')
  })

  it('is amber for 0.3 kJ/mm on 8 mm (lack of fusion) but ok on 3 mm', () => {
    const low = heatInputCheck(0.3, 8)
    expect(low.level).toBe('amber')
    expect(low.reason).toContain('lack of fusion')
    expect(heatInputCheck(0.3, 3)).toEqual({ level: 'ok', reason: '' })
  })

  it('skips the low limit when the thickness is unknown', () => {
    expect(heatInputCheck(0.3, null).level).toBe('ok')
  })

  it('is red when the heat input cannot be worked out', () => {
    const c = heatInputCheck(null, 12)
    expect(c.level).toBe('red')
    expect(c.reason).toContain('cannot be worked out')
  })
})
