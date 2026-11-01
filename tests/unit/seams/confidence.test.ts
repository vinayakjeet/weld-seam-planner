import { describe, expect, it } from 'vitest'
import { confidence } from '../../../src/core/seams/confidence'

const base = { lengthMm: 200, openingDeg: 90, medianAdjacentAreaMm2: 5500, diagonal: 250 }

describe('confidence', () => {
  it('scores a long clean 90 degree seam between big faces at 1', () => {
    expect(confidence(base)).toBeCloseTo(1, 12)
  })

  it('weights length 0.4, angle 0.4 and face area 0.2', () => {
    const half = confidence({ lengthMm: 12.5, openingDeg: 112.5, medianAdjacentAreaMm2: 31.25, diagonal: 250 })
    expect(half).toBeCloseTo(0.5, 12)
  })

  it('scores a short seam at 135 degrees between sliver faces under 0.4', () => {
    const weak = confidence({ lengthMm: 20, openingDeg: 135, medianAdjacentAreaMm2: 1, diagonal: 250 })
    expect(weak).toBeLessThan(0.4)
  })

  it('treats angles equally far from 90 on either side the same', () => {
    expect(confidence({ ...base, openingDeg: 67.5 })).toBeCloseTo(confidence({ ...base, openingDeg: 112.5 }), 12)
  })

  it('stays between 0 and 1 for extreme inputs', () => {
    const huge = confidence({ lengthMm: 1e6, openingDeg: 90, medianAdjacentAreaMm2: 1e12, diagonal: 250 })
    const awful = confidence({ lengthMm: 0, openingDeg: 5, medianAdjacentAreaMm2: 0, diagonal: 250 })
    expect(huge).toBeLessThanOrEqual(1)
    expect(awful).toBe(0)
  })
})
