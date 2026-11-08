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

  it('scores a straight 90 degree seam between two bodies at 0.8 or more, however short it is against the part', () => {
    // One side of a 1 in tube end on a go-kart frame 1700 mm across, between thin faces.
    const side = { lengthMm: 25.4, openingDeg: 90, medianAdjacentAreaMm2: 0, diagonal: 1700 }
    expect(confidence({ ...side, wholeJoint: true })).toBeGreaterThanOrEqual(0.8)
    expect(confidence(side)).toBeLessThan(0.5)
  })

  it('scores a seam between two bodies at least as high as a crease of the same shape', () => {
    for (const lengthMm of [10, 25.4, 200, 2000]) {
      for (const openingDeg of [45, 70, 90, 120]) {
        for (const medianAdjacentAreaMm2 of [0, 30, 3000]) {
          const shape = { lengthMm, openingDeg, medianAdjacentAreaMm2, diagonal: 1700 }
          expect(confidence({ ...shape, wholeJoint: true })).toBeGreaterThanOrEqual(confidence(shape))
        }
      }
    }
  })

  it('still keeps a seam between two bodies under 0.70 when its opening is far from 90 degrees', () => {
    expect(confidence({ ...base, openingDeg: 135, wholeJoint: true })).toBeLessThan(0.7)
  })

  it('stays between 0 and 1 for extreme inputs', () => {
    const huge = confidence({ lengthMm: 1e6, openingDeg: 90, medianAdjacentAreaMm2: 1e12, diagonal: 250 })
    const awful = confidence({ lengthMm: 0, openingDeg: 5, medianAdjacentAreaMm2: 0, diagonal: 250 })
    expect(huge).toBeLessThanOrEqual(1)
    expect(awful).toBe(0)
  })
})
