import { describe, expect, it } from 'vitest'
import { add, cross, dot, length, normalize, rotateAbout, scale, sub, type Vec3 } from '../../../src/core/math/vec3'

describe('vec3', () => {
  it('adds, subtracts and scales componentwise', () => {
    expect(add([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9])
    expect(sub([4, 5, 6], [1, 2, 3])).toEqual([3, 3, 3])
    expect(scale([1, -2, 3], 2)).toEqual([2, -4, 6])
  })

  it('takes the dot product', () => {
    expect(dot([1, 2, 3], [4, -5, 6])).toBe(12)
  })

  it('follows the right hand rule for the cross product', () => {
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1])
    expect(cross([0, 1, 0], [1, 0, 0])).toEqual([0, 0, -1])
  })

  it('measures and normalises length', () => {
    expect(length([3, 0, 4])).toBe(5)
    expect(normalize([3, 0, 4])).toEqual([0.6, 0, 0.8])
  })

  it('normalises the zero vector to zero instead of NaN', () => {
    expect(normalize([0, 0, 0])).toEqual([0, 0, 0])
  })

  describe('rotateAbout', () => {
    const expectVec = (actual: Vec3, expected: Vec3) => {
      for (let i = 0; i < 3; i++) expect(actual[i]).toBeCloseTo(expected[i]!, 12)
    }

    it('turns counter clockwise about the axis by the right hand rule', () => {
      expectVec(rotateAbout([1, 0, 0], [0, 0, 1], 90), [0, 1, 0])
      expectVec(rotateAbout([0, 1, 0], [1, 0, 0], 90), [0, 0, 1])
      expectVec(rotateAbout([0, 0, 1], [0, 1, 0], 90), [1, 0, 0])
    })

    it('turns the other way for a negative angle', () => {
      expectVec(rotateAbout([1, 0, 0], [0, 0, 1], -90), [0, -1, 0])
    })

    it('accepts an axis that is not unit length and keeps vectors along the axis fixed', () => {
      expectVec(rotateAbout([1, 0, 0], [0, 0, 5], 90), [0, 1, 0])
      expectVec(rotateAbout([0, 0, 2], [0, 0, 1], 33), [0, 0, 2])
    })

    it('preserves length for an oblique axis', () => {
      const v: Vec3 = [1, -2, 3]
      expect(length(rotateAbout(v, [1, 1, 1], 70))).toBeCloseTo(length(v), 12)
    })

    it('returns the vector unchanged for a zero axis instead of NaN', () => {
      expect(rotateAbout([1, 2, 3], [0, 0, 0], 45)).toEqual([1, 2, 3])
    })
  })
})
