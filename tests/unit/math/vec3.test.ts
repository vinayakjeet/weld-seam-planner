import { describe, expect, it } from 'vitest'
import { add, cross, dot, length, normalize, scale, sub } from '../../../src/core/math/vec3'

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
})
