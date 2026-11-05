import { describe, expect, it } from 'vitest'
import { cross, dot, length, sub, type Vec3 } from '../../../src/core/math/vec3'
import { computeFaceData } from '../../../src/core/mesh/faces'
import { buildMeshModel, type MeshModel } from '../../../src/core/mesh/model'
import { buildSnapContext, snapPoint, snapPolyline, type DrawClick } from '../../../src/core/seams/draw'
import type { SeamCandidate } from '../../../src/core/seams/detect'
import { isManualError, type ManualError } from '../../../src/core/seams/manual'
import { loadSampleModel } from '../helpers/models'
import { cubeTriangles, soupOf } from '../helpers/shapes'

function setup(model: MeshModel) {
  const faces = computeFaceData(model.mesh)
  const context = buildSnapContext(model, faces)
  const click = (p: Vec3): DrawClick => ({ p })
  return { context, click }
}

function ok(result: SeamCandidate | ManualError): SeamCandidate {
  if (isManualError(result)) throw new Error(`expected a seam, got ${result.what} ${result.why}`)
  return result
}

function expectReadable(result: SeamCandidate | ManualError): ManualError {
  expect(isManualError(result)).toBe(true)
  const error = result as ManualError
  for (const part of [error.what, error.why, error.next]) expect(part.trim().length).toBeGreaterThan(0)
  return error
}

const cube = (size: number[]) => buildMeshModel(soupOf(cubeTriangles([0, 0, 0], size)), 1)

describe('snapPolyline on a T-joint', () => {
  const { context, click } = setup(loadSampleModel('t-joint-merged'))

  it('snaps three clicks near the web edge to the crease and gives one seam of about 200 mm with real normals', () => {
    const clicks = [[-99.5, 5.3, 10.2], [0, 4.7, 10.4], [99.5, 5.2, 9.8]].map((p) => click(p as Vec3))
    const seam = ok(snapPolyline(clicks, context, 3))
    expect(seam.lengthMm).toBeGreaterThan(198.5)
    expect(seam.lengthMm).toBeLessThan(200)
    expect(seam.source).toBe('manual')
    expect(seam.closed).toBe(false)
    expect(seam.confidence).toBe(1)
    expect(seam.approximateNormals).toBeFalsy()
    expect(seam.openingAngleDeg).toBeCloseTo(90, 3)
    for (const { p, t, n1, n2 } of seam.points) {
      expect(p[1]).toBeCloseTo(5, 6)
      expect(p[2]).toBeCloseTo(10, 6)
      expect(Math.abs(dot(n1, n2))).toBeLessThan(1e-6)
      expect(length(sub(cross(n1, n2), t))).toBeLessThan(1e-6)
    }
  })

  it('keeps the clicks where they are on open plate surface and marks the normals approximate', () => {
    const clicks = [click([-80, -40, 10]), click([80, -30, 10])]
    const seam = ok(snapPolyline(clicks, context, 3))
    expect(seam.approximateNormals).toBe(true)
    expect(seam.lengthMm).toBeCloseTo(Math.hypot(160, 10), 1)
    for (const { p, n1, n2 } of seam.points) {
      expect(p[2]).toBeCloseTo(10, 6)
      expect(length(sub(n1, [0, 0, 1]))).toBeLessThan(1e-9)
      expect(length(sub(n2, [0, 0, 1]))).toBeLessThan(1e-9)
    }
  })

  it('gives the same seam when the clicks name no triangle, because the viewport cannot tell the model triangle', () => {
    const points: Vec3[] = [[-80, -40, 10], [80, -30, 10]]
    const named = ok(snapPolyline(points.map(click), context, 3))
    const unnamed = ok(snapPolyline(points.map((p) => ({ p })), context, 3))
    expect(unnamed.points).toEqual(named.points)
    expect(unnamed.approximateNormals).toBe(true)
    for (const { n1, n2 } of unnamed.points) {
      expect(Number.isFinite(n1[0] + n1[1] + n1[2] + n2[0] + n2[1] + n2[2])).toBe(true)
    }
  })

  it('does not snap at all when the snap radius is zero', () => {
    const seam = ok(snapPolyline([click([-99.5, 5.3, 10.2]), click([99.5, 5.2, 9.8])], context, 0))
    expect(seam.approximateNormals).toBe(true)
  })

  it('needs two clicks, and clicks that are not apart', () => {
    expectReadable(snapPolyline([click([0, 0, 10])], context, 3))
    expectReadable(snapPolyline([], context, 3))
    expect(expectReadable(snapPolyline([click([0, -30, 10]), click([0, -30, 10])], context, 3)).why).toMatch(/click|apart|length/i)
  })
})

describe('snapPolyline across the feature edge graph', () => {
  it('follows the edges round a corner when the path is at most 3 times the straight distance', () => {
    const { context, click } = setup(cube([100, 100, 100]))
    const seam = ok(snapPolyline([click([50, 0.3, 99.7]), click([99.7, 0.3, 50])], context, 3))
    expect(seam.lengthMm).toBeCloseTo(100, 1)
    expect(seam.approximateNormals).toBeFalsy()
    expect(seam.points.some((pt) => length(sub(pt.p, [100, 0, 100])) < 1e-6)).toBe(true)
    for (const { p } of seam.points) expect(p[1]).toBeCloseTo(0, 6)
  })

  it('uses the straight segment on the surface when the edge path is more than 3 times longer', () => {
    const { context, click } = setup(cube([200, 4, 50]))
    const seam = ok(snapPolyline([click([100, 0.2, 49.8]), click([100, 3.8, 49.8])], context, 3))
    expect(seam.lengthMm).toBeCloseTo(4, 1)
    expect(seam.approximateNormals).toBe(true)
    for (const { p, n1 } of seam.points) {
      expect(p[2]).toBeCloseTo(50, 6)
      expect(length(sub(n1, [0, 0, 1]))).toBeLessThan(1e-9)
    }
  })

  it('snaps to a boundary edge of an open sheet, with approximate normals because only one face meets there', () => {
    const sheet = buildMeshModel(
      Float32Array.from([0, 0, 0, 100, 0, 0, 100, 100, 0, 0, 0, 0, 100, 100, 0, 0, 100, 0]),
      1,
    )
    const { context, click } = setup(sheet)
    const seam = ok(snapPolyline([click([20, 0.4, 0]), click([80, 0.3, 0])], context, 3))
    expect(seam.lengthMm).toBeCloseTo(60, 6)
    expect(seam.approximateNormals).toBe(true)
    for (const { p } of seam.points) expect(p[1]).toBeCloseTo(0, 6)
  })
})

describe('snapPoint', () => {
  const { context } = setup(loadSampleModel('t-joint-merged'))

  it('moves a point near the crease onto it', () => {
    const snapped = snapPoint(context, [-99.5, 5.3, 10.2], 3)
    expect(snapped).not.toBeNull()
    expect(length(sub(snapped!, [-99.5, 5.3, 10.2]))).toBeLessThanOrEqual(3)
  })

  it('gives the point the first click of a drawn seam snaps to', () => {
    const clicks: DrawClick[] = [[-99.5, 5.3, 10.2], [99.5, 5.2, 9.8]].map((p) => ({ p: p as Vec3 }))
    const seam = ok(snapPolyline(clicks, context, 3))
    expect(snapPoint(context, clicks[0]!.p, 3)).toEqual(seam.points[0]!.p)
  })

  it('gives null when no feature edge is in reach or the radius is zero', () => {
    expect(snapPoint(context, [0, 40, 30], 3)).toBeNull()
    expect(snapPoint(context, [-99.5, 5.3, 10.2], 0)).toBeNull()
  })
})

describe('snapPolyline with a radius carried by each click', () => {
  const { context } = setup(loadSampleModel('t-joint-merged'))
  const ends: Vec3[] = [[-99.5, 5.3, 10.2], [99.5, 5.2, 9.8]]

  it('snaps a click by its own radius and not by the call radius', () => {
    const own = ok(snapPolyline(ends.map((p) => ({ p, snapRadiusMm: 3 })), context, 0))
    const none = ok(snapPolyline(ends.map((p) => ({ p })), context, 0))
    expect(own.approximateNormals).toBeFalsy()
    expect(none.approximateNormals).toBe(true)
  })

  it('lets a click turn snapping off when the call radius would snap it', () => {
    const first = snapPoint(context, ends[0]!, 3)!
    const seam = ok(snapPolyline([{ p: ends[0]!, snapRadiusMm: 0 }, { p: ends[1]! }], context, 3))
    expect(seam.points[0]!.p).toEqual(ends[0])
    expect(seam.points[0]!.p).not.toEqual(first)
  })
})
