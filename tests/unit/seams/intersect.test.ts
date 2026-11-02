import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../../../src/core/math/vec3'
import { buildMeshModel } from '../../../src/core/mesh/model'
import { buildBodyBvhs } from '../../../src/core/seams/bodyBvh'
import { contactTolerance } from '../../../src/core/seams/contact'
import { chainSegments, findIntersectionSegments, type IntersectionSegment } from '../../../src/core/seams/intersect'
import { loadSampleModel } from '../helpers/models'
import { cubeTriangles, soupOf } from '../helpers/shapes'

function segmentsOf(...solids: number[][][]) {
  const model = buildMeshModel(soupOf(solids.flat()), 1)
  return { model, segments: findIntersectionSegments(model, buildBodyBvhs(model), contactTolerance(model.bounds.diagonal)) }
}

const totalLength = (segments: IntersectionSegment[]) =>
  segments.reduce((sum, s) => sum + Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1], s.p1[2] - s.p0[2]), 0)

describe('findIntersectionSegments', () => {
  // A 20 x 20 post sunk 5 mm into a 10 mm plate: its four faces cross the plate top along a 20 x 20 outline.
  const plate = cubeTriangles([-50, -50, 0], [100, 100, 10])
  const post = cubeTriangles([-10, -10, 5], [20, 20, 55])

  it('traces the outline where the post leaves the plate top', () => {
    const { segments } = segmentsOf(plate, post)
    expect(segments.length).toBeGreaterThan(0)
    expect(totalLength(segments)).toBeCloseTo(80, 2)
    for (const { p0, p1 } of segments) {
      for (const p of [p0, p1]) {
        expect(p[2]).toBeCloseTo(10, 4)
        expect(Math.max(Math.abs(p[0]), Math.abs(p[1]))).toBeCloseTo(10, 4)
      }
    }
  })

  it('reports outward normals: the plate top and the post face pointing away from the post axis', () => {
    const { segments } = segmentsOf(plate, post)
    for (const { p0, p1, nA, nB } of segments) {
      nA.forEach((v, c) => expect(v).toBeCloseTo([0, 0, 1][c]!, 6))
      const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
      expect(Math.abs(nB[2])).toBeLessThan(1e-6)
      expect(nB[0] * mid[0]! + nB[1] * mid[1]!).toBeGreaterThan(0)
    }
  })

  it('records the area of both triangles', () => {
    const { segments } = segmentsOf(plate, post)
    for (const { areaA, areaB } of segments) {
      expect(areaA).toBeGreaterThan(0)
      expect(areaB).toBeGreaterThan(0)
    }
  })

  it('finds nothing for bodies that only touch face to face', () => {
    expect(segmentsOf(plate, cubeTriangles([-10, -10, 10], [20, 20, 50])).segments).toHaveLength(0)
    for (const id of ['t-joint-assembly', 'double-bottom-cell']) {
      const model = loadSampleModel(id)
      expect(findIntersectionSegments(model, buildBodyBvhs(model), contactTolerance(model.bounds.diagonal)), id).toHaveLength(0)
    }
  })

  it('ignores a penetration shallower than the tolerance', () => {
    const { segments } = segmentsOf(plate, cubeTriangles([-10, -10, 9.9], [20, 20, 50]))
    expect(segments).toHaveLength(0)
  })

  it('finds nothing for a single body and builds no pairs', () => {
    const model = buildMeshModel(soupOf(plate), 1)
    expect(findIntersectionSegments(model, buildBodyBvhs(model), 1)).toEqual([])
  })
})

describe('chainSegments', () => {
  const seg = (a: Vec3, b: Vec3, tag = 0): IntersectionSegment => ({
    p0: a,
    p1: b,
    nA: [0, 0, 1],
    nB: [tag, 1 - tag, 0],
    areaA: 4,
    areaB: 6,
  })
  const ring = (n: number, radius: number): Vec3[] =>
    Array.from({ length: n }, (_, k): Vec3 => [radius * Math.cos((2 * Math.PI * k) / n), radius * Math.sin((2 * Math.PI * k) / n), 0])

  it('closes a shuffled, noisy, mixed direction ring into one closed polyline', () => {
    const points = ring(24, 20)
    const segments = points.map((p, k) => {
      const q = points[(k + 1) % points.length]!
      const wobble = (v: Vec3): Vec3 => [v[0] + 1e-5 * ((k % 3) - 1), v[1] - 1e-5 * ((k % 2) - 0.5), v[2]]
      return k % 2 === 0 ? seg(wobble(p), q, k % 2) : seg(q, wobble(p), k % 2)
    })
    const shuffled = [...segments].sort((a, b) => Math.sin(a.p0[0] * 7 + a.p0[1]) - Math.sin(b.p0[0] * 7 + b.p0[1]))
    const lines = chainSegments(shuffled, 0.01)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.closed).toBe(true)
    expect(lines[0]!.points).toHaveLength(24)
    expect(lines[0]!.normals).toHaveLength(24)
    expect(lines[0]!.areas.length).toBeGreaterThanOrEqual(24)
  })

  it('keeps a straight run of segments as one open polyline whatever the segment direction', () => {
    const segments = [seg([20, 0, 0], [30, 0, 0]), seg([10, 0, 0], [0, 0, 0]), seg([10, 0, 0], [20, 0, 0])]
    const lines = chainSegments(segments, 0.01)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.closed).toBe(false)
    expect(lines[0]!.points).toHaveLength(4)
    expect(lines[0]!.normals).toHaveLength(3)
  })

  it('breaks a loop at 90 degree corners like any other chain', () => {
    const corners: Vec3[] = [[0, 0, 0], [20, 0, 0], [20, 20, 0], [0, 20, 0]]
    const segments = corners.map((p, k) => seg(p, corners[(k + 1) % 4]!))
    const lines = chainSegments(segments, 0.01)
    expect(lines).toHaveLength(4)
    expect(lines.every((l) => !l.closed)).toBe(true)
  })

  it('welds endpoints closer than the weld distance and not those farther apart', () => {
    expect(chainSegments([seg([0, 0, 0], [10, 0, 0]), seg([10.004, 0, 0], [20, 0, 0])], 0.01)).toHaveLength(1)
    expect(chainSegments([seg([0, 0, 0], [10, 0, 0]), seg([10.05, 0, 0], [20, 0, 0])], 0.01)).toHaveLength(2)
  })

  it('collapses duplicate segments and skips zero length ones', () => {
    const lines = chainSegments([seg([0, 0, 0], [10, 0, 0]), seg([10, 0, 0], [0, 0, 0]), seg([5, 0, 0], [5.0001, 0, 0])], 0.01)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.normals).toHaveLength(1)
  })
})
