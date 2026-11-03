import { describe, expect, it } from 'vitest'
import { occluderFromBvh } from '../../../src/core/access/occluder'
import { buildMeshModel } from '../../../src/core/mesh/model'
import { buildWholeBvh } from '../../../src/core/seams/bodyBvh'
import { cubeTriangles, soupOf } from '../helpers/shapes'

// A 50 mm cube from the origin.
const occluded = occluderFromBvh(buildWholeBvh(buildMeshModel(soupOf(cubeTriangles([0, 0, 0], [50, 50, 50])), 1)).bvh)

describe('occluderFromBvh', () => {
  it('returns the distance to a face inside the range', () => {
    expect(occluded([-100, 25, 25], [1, 0, 0], 300)).toBeCloseTo(100, 6)
  })

  it('returns Infinity when the face is beyond the range', () => {
    expect(occluded([-100, 25, 25], [1, 0, 0], 60)).toBe(Infinity)
  })

  it('returns Infinity when the ray misses', () => {
    expect(occluded([-100, 80, 25], [1, 0, 0], 300)).toBe(Infinity)
  })

  it('hits a face from behind, so winding does not matter', () => {
    expect(occluded([25, 25, 25], [0, 0, 1], 300)).toBeCloseTo(25, 6)
  })
})
