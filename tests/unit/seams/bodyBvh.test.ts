import { Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { buildMeshModel } from '../../../src/core/mesh/model'
import { buildBodyBvhs } from '../../../src/core/seams/bodyBvh'
import { computeFaceData } from '../../../src/core/mesh/faces'
import { contactTolerance, findContactEdges } from '../../../src/core/seams/contact'
import { cubeTriangles, soupOf } from '../helpers/shapes'

const built = vi.hoisted(() => ({ count: 0 }))

vi.mock('three-mesh-bvh', async (importOriginal) => {
  const original = await importOriginal<typeof import('three-mesh-bvh')>()
  class CountingBvh extends original.MeshBVH {
    constructor(...args: ConstructorParameters<typeof original.MeshBVH>) {
      super(...args)
      built.count++
    }
  }
  return { ...original, MeshBVH: CountingBvh }
})

const model = (...solids: number[][][]) => buildMeshModel(soupOf(solids.flat()), 1)

describe('buildBodyBvhs', () => {
  it('builds nothing for a single body', () => {
    built.count = 0
    const single = model(cubeTriangles([0, 0, 0], [10, 10, 10]))
    expect(buildBodyBvhs(single)).toEqual([])
    expect(built.count).toBe(0)
  })

  it('builds one BVH per body with its triangles and bounding box', () => {
    built.count = 0
    const two = model(cubeTriangles([0, 0, 0], [10, 10, 10]), cubeTriangles([20, 0, 0], [5, 6, 7]))
    const bvhs = buildBodyBvhs(two)
    expect(built.count).toBe(2)
    expect(bvhs).toHaveLength(2)
    expect(Array.from(bvhs[0]!.triangles)).toEqual([...Array(12).keys()])
    expect(Array.from(bvhs[1]!.triangles)).toEqual([...Array(12).keys()].map((i) => i + 12))
    // The BVH pads its bounds by about one float32 step, so compare with a tolerance.
    bvhs[1]!.min.forEach((v, c) => expect(v).toBeCloseTo([20, 0, 0][c]!, 4))
    bvhs[1]!.max.forEach((v, c) => expect(v).toBeCloseTo([25, 6, 7][c]!, 4))
  })

  it('maps a BVH face index back to a global triangle of the same body', () => {
    const two = model(cubeTriangles([0, 0, 0], [10, 10, 10]), cubeTriangles([20, 0, 0], [10, 10, 10]))
    const second = buildBodyBvhs(two)[1]!
    const hit = second.bvh.closestPointToPoint(new Vector3(25, 5, 30))!
    expect(hit.distance).toBeCloseTo(20)
    expect(two.bodies.triangleBody[second.triangles[hit.faceIndex]!]).toBe(1)
    const faces = computeFaceData(two.mesh)
    const g = second.triangles[hit.faceIndex]! * 3
    expect([faces.normals[g], faces.normals[g + 1], faces.normals[g + 2]]).toEqual([0, 0, 1])
  })
})

describe('findContactEdges on one body', () => {
  it('returns no edges and constructs no BVH', () => {
    built.count = 0
    const single = model(cubeTriangles([0, 0, 0], [10, 10, 10]))
    const edges = findContactEdges(single, computeFaceData(single.mesh), buildBodyBvhs(single), 30)
    expect(edges.edgeIds).toHaveLength(0)
    expect(built.count).toBe(0)
  })
})

describe('contactTolerance', () => {
  it('is 0.2% of the diagonal', () => {
    expect(contactTolerance(951.5)).toBeCloseTo(1.903, 4)
  })

  it('never drops below 0.05 mm', () => {
    expect(contactTolerance(10)).toBe(0.05)
  })
})
