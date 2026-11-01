import { describe, expect, it } from 'vitest'
import { computeBounds } from '../../../src/core/mesh/bounds'

describe('computeBounds', () => {
  it('finds the box, diagonal and largest dimension of a point list', () => {
    const bounds = computeBounds(Float32Array.from([-10, 0, 5, 20, 40, 5, 0, 10, 35]))
    expect(bounds.min).toEqual([-10, 0, 5])
    expect(bounds.max).toEqual([20, 40, 35])
    expect(bounds.diagonal).toBeCloseTo(Math.hypot(30, 40, 30), 9)
    expect(bounds.maxDimension).toBe(40)
  })

  it('returns a zero-size box for a single point', () => {
    const bounds = computeBounds(Float32Array.from([1, 2, 3]))
    expect(bounds.diagonal).toBe(0)
    expect(bounds.maxDimension).toBe(0)
  })
})
