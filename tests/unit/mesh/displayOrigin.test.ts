import { describe, expect, it } from 'vitest'
import { displayOrigin, toLocalArray } from '../../../src/core/mesh/displayOrigin'

describe('displayOrigin', () => {
  it('is the origin for a part within 10 m of it, so nothing moves for ordinary files', () => {
    expect(displayOrigin(null)).toEqual([0, 0, 0])
    expect(displayOrigin({ min: [-9000, 0, 0], max: [200, 9999, 50] })).toEqual([0, 0, 0])
  })

  it('is the centre of the box rounded to the metre for a part far from the origin', () => {
    expect(displayOrigin({ min: [2_000_100, -50, 0], max: [2_000_300, 50, 90] })).toEqual([2_000_000, 0, 0])
    expect(displayOrigin({ min: [-15_400, 30_000, 7], max: [-15_000, 30_200, 9] })).toEqual([-15_000, 30_000, 0])
  })

  it('keeps sub-millimetre detail of a part 2 km out that float32 world coordinates would lose', () => {
    const origin = displayOrigin({ min: [2_000_000, 0, 0], max: [2_000_200, 100, 100] })
    const local = toLocalArray([2_000_100.004, 0.5, 1], origin)
    expect(local[0]).toBeCloseTo(100.004, 3)
    expect(Math.fround(2_000_100.004) - 2_000_100.004).not.toBeCloseTo(0, 3)
  })
})
