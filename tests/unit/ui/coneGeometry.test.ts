import { describe, expect, it } from 'vitest'
import { length, sub } from '../../../src/core/math/vec3'
import { coneGeometry, nearestStation } from '../../../src/ui/viewport/coneGeometry'

describe('coneGeometry', () => {
  const cone = coneGeometry([10, 20, 30], [0, 0, 2], 30, 300)

  it('puts the apex at the torch tip', () => {
    expect(cone.apex).toEqual([10, 20, 30])
  })

  it('points the axis away from the torch, minus the unit tool z', () => {
    expect(cone.axis).toEqual([0, 0, -1])
    expect(cone.baseCentre).toEqual([10, 20, 30 - 300])
  })

  it('has a base radius of length times tan of the half angle', () => {
    expect(cone.baseRadius).toBeCloseTo(300 * Math.tan(Math.PI / 6), 9)
    expect(cone.lengthMm).toBe(300)
  })

  it('keeps the axis a unit vector for a tilted tool axis', () => {
    const tilted = coneGeometry([0, 0, 0], [3, 0, 4], 45, 60)
    expect(length(tilted.axis)).toBeCloseTo(1, 12)
    expect(length(sub(tilted.baseCentre, tilted.apex))).toBeCloseTo(60, 9)
    expect(tilted.baseRadius).toBeCloseTo(60, 9)
  })
})

describe('nearestStation', () => {
  const stations = [
    { s: 0, clearanceDeg: 45, nearClearanceDeg: 45 },
    { s: 20, clearanceDeg: 30, nearClearanceDeg: 40 },
    { s: 40, clearanceDeg: 10, nearClearanceDeg: 20 },
  ]

  it('takes the station closest to the scrub position', () => {
    expect(nearestStation(stations, 4)).toBe(stations[0])
    expect(nearestStation(stations, 12)).toBe(stations[1])
    expect(nearestStation(stations, 999)).toBe(stations[2])
  })

  it('gives null without stations', () => {
    expect(nearestStation([], 5)).toBeNull()
  })
})
