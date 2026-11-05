import { describe, expect, it } from 'vitest'
import { computeFaceData } from '../../../src/core/mesh/faces'
import type { IndexedMesh } from '../../../src/core/mesh/weld'
import { loadSampleModel } from '../helpers/models'

function oneTriangle(indices: number[]): IndexedMesh {
  return {
    positions: Float32Array.from([0, 0, 0, 4, 0, 0, 0, 3, 0]),
    indices: Uint32Array.from(indices),
    vertexCount: 3,
    triangleCount: 1,
  }
}

describe('computeFaceData', () => {
  it('computes normal, area and centroid of a right triangle', () => {
    const faces = computeFaceData(oneTriangle([0, 1, 2]))
    expect(Array.from(faces.normals)).toEqual([0, 0, 1])
    expect(faces.areas[0]).toBeCloseTo(6, 6)
    expect(faces.centroids[0]).toBeCloseTo(4 / 3, 6)
    expect(faces.centroids[1]).toBeCloseTo(1, 6)
    expect(faces.centroids[2]).toBe(0)
  })

  it('takes the normal from winding: reversing the order flips it', () => {
    const faces = computeFaceData(oneTriangle([0, 2, 1]))
    expect(Array.from(faces.normals)).toEqual([0, 0, -1])
    expect(faces.areas[0]).toBeCloseTo(6, 6)
  })

  // Divergence theorem: volume = sum(area * (n . centroid)) / 3 only comes out right when every
  // normal points outward and every area and centroid is correct.
  it.each([
    ['t-joint-merged', 400000],
    ['l-bracket-gussets', 175920],
    ['box-beam', 4992000],
  ])('recovers the known volume of %s from its faces', (id, volume) => {
    const { mesh } = loadSampleModel(id)
    const faces = computeFaceData(mesh)
    let sum = 0
    for (let f = 0; f < mesh.triangleCount; f++) {
      const n = faces.normals.subarray(f * 3, f * 3 + 3)
      const c = faces.centroids.subarray(f * 3, f * 3 + 3)
      sum += faces.areas[f]! * (n[0]! * c[0]! + n[1]! * c[1]! + n[2]! * c[2]!)
    }
    expect(sum / 3 / volume).toBeCloseTo(1, 5)
  })
})

describe('computeFaceData: needles', () => {
  // A flat square 0..10 split along its diagonal into two sound triangles, plus a needle on the bottom edge whose apex
  // sits 0.5 mm above the edge, almost straight up, so its own normal is nearly sideways.
  const mesh = (toleranceMm?: number): IndexedMesh => ({
    positions: Float32Array.from([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, 5, -0.01, 0.5]),
    indices: Uint32Array.from([0, 1, 2, 0, 2, 3, 1, 0, 4]),
    vertexCount: 5,
    triangleCount: 3,
    toleranceMm,
  })

  it('keeps the needle its own sideways normal when the mesh has no weld cell', () => {
    const { normals } = computeFaceData(mesh())
    expect(Math.abs(normals[8]!)).toBeLessThan(0.99)
  })

  it('gives the needle the normal of the triangle across its longest edge once the tolerance covers its height', () => {
    const { normals } = computeFaceData(mesh(1))
    expect(Array.from(normals.slice(6, 9))).toEqual(Array.from(normals.slice(0, 3)))
  })

  it('leaves sound triangles alone', () => {
    const plain = computeFaceData(mesh())
    const borrowed = computeFaceData(mesh(1))
    expect(Array.from(borrowed.normals.slice(0, 6))).toEqual(Array.from(plain.normals.slice(0, 6)))
  })
})

