import { Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { buildMeshModel } from '../../../src/core/mesh/model'
import { buildBodyBvhs, buildWholeBvh, wholeBvhFor } from '../../../src/core/seams/bodyBvh'
import { computeFaceData } from '../../../src/core/mesh/faces'
import { contactTolerance, findContactEdges } from '../../../src/core/seams/contact'
import { DEFAULT_DETECT_SETTINGS, detectSeams } from '../../../src/core/seams/detect'
import { loadSampleModel } from '../helpers/models'
import { cubeTriangles, slicedTJoint, soupOf, steppedLap } from '../helpers/shapes'
import { shown } from '../helpers/state'

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

describe('buildWholeBvh', () => {
  it('indexes every triangle of a single body in order', () => {
    built.count = 0
    const single = model(cubeTriangles([0, 0, 0], [10, 10, 10]))
    const whole = buildWholeBvh(single)
    expect(built.count).toBe(1)
    expect(Array.from(whole.triangles)).toEqual([...Array(12).keys()])
    whole.max.forEach((v) => expect(v).toBeCloseTo(10, 4))
    expect(whole.bvh.closestPointToPoint(new Vector3(5, 5, 30))!.distance).toBeCloseTo(20)
  })
})

describe('detectSeams and the BVH of a single body', () => {
  it('builds one over the whole mesh for the thickness rays even when every free face is a wall', () => {
    built.count = 0
    detectSeams(loadSampleModel('t-joint-merged'), DEFAULT_DETECT_SETTINGS)
    expect(built.count).toBe(1)
  })

  it('shares that one BVH with the strip rule that needs the thickness behind a strip', () => {
    built.count = 0
    detectSeams(model(steppedLap()), DEFAULT_DETECT_SETTINGS)
    expect(built.count).toBe(1)
  })

  // The memory guard skipped the lap rule and the thickness rays above 300000 triangles, but the access check builds the
  // same BVH as soon as a seam is accepted, so it saved nothing.
  it('builds it for a single body of any size: a sliced T of 304012 triangles gets its plate thicknesses', () => {
    const big = model(slicedTJoint(19000))
    expect(big.mesh.triangleCount).toBe(304012)
    expect(big.bodies.count).toBe(1)
    built.count = 0
    const seams = shown(detectSeams(big, DEFAULT_DETECT_SETTINGS))
    expect(built.count).toBe(1)
    expect(seams).toHaveLength(2)
    for (const s of seams) expect(s.thicknessMm).toEqual([10, 10])
  }, 60_000)

  it('builds none when the caller hands one in, and none at all when it hands in null', () => {
    const lap = model(steppedLap())
    const whole = wholeBvhFor(lap)
    built.count = 0
    detectSeams(lap, DEFAULT_DETECT_SETTINGS, { wholeBvh: whole })
    expect(built.count).toBe(0)
    const seams = detectSeams(lap, DEFAULT_DETECT_SETTINGS, { wholeBvh: null })
    expect(built.count).toBe(0)
    for (const s of seams) expect(s.thicknessMm).toEqual([null, null])
  })
})
