import { describe, expect, it } from 'vitest'
import { cross, dot, length, type Vec3 } from '../../../src/core/math/vec3'
import { computeFaceData } from '../../../src/core/mesh/faces'
import type { MeshModel } from '../../../src/core/mesh/model'
import { chainEdges, edgeEnds, type Chain } from '../../../src/core/seams/chain'
import { extractCreaseEdges } from '../../../src/core/seams/crease'
import { buildSeamPoints } from '../../../src/core/seams/frames'
import { loadSampleModel } from '../helpers/models'

function pipeline(model: MeshModel) {
  const faces = computeFaceData(model.mesh)
  const { edgeIds } = extractCreaseEdges(model, faces, 30)
  const chains = chainEdges(model.mesh.positions, edgeEnds(model.edges, edgeIds), 40)
  return { faces, edgeIds, chains }
}

const reversed = (chain: Chain): Chain => ({
  ...chain,
  vertices: [...chain.vertices].reverse(),
  edges: [...chain.edges].reverse(),
})

describe('buildSeamPoints on a T-joint seam', () => {
  const model = loadSampleModel('t-joint-merged')
  const { faces, edgeIds, chains } = pipeline(model)
  const chain = chains[0]!
  const { points, lengthMm } = buildSeamPoints(chain, edgeIds, model, faces)

  it('runs from arc length 0 to the full 200 mm along the junction line', () => {
    expect(lengthMm).toBeCloseTo(200, 2)
    expect(points[0]!.s).toBe(0)
    expect(points[points.length - 1]!.s).toBeCloseTo(200, 2)
    for (const { p } of points) {
      expect(p[2]).toBeCloseTo(10, 3)
      expect(Math.abs(p[1])).toBeCloseTo(5, 3)
    }
  })

  it('gives every point a unit tangent along the line and two perpendicular plate normals', () => {
    for (const { t, n1, n2 } of points) {
      expect(length(t)).toBeCloseTo(1, 6)
      expect(Math.abs(t[0])).toBeCloseTo(1, 4)
      expect(Math.abs(dot(n1, n2))).toBeLessThan(1e-3)
      expect(Math.abs(dot(n1, t))).toBeLessThan(1e-3)
      expect(Math.abs(dot(n2, t))).toBeLessThan(1e-3)
    }
  })

  it('orders the normals so that n1 x n2 points along the tangent', () => {
    for (const { t, n1, n2 } of points) expect(dot(cross(n1, n2), t)).toBeGreaterThan(0.99)
  })

  it('keeps that ordering and flips the tangent when the chain runs the other way', () => {
    const back = buildSeamPoints(reversed(chain), edgeIds, model, faces).points
    expect(dot(back[0]!.t, points[0]!.t)).toBeCloseTo(-1, 6)
    for (const { t, n1, n2 } of back) expect(dot(cross(n1, n2), t)).toBeGreaterThan(0.99)
  })
})

describe('buildSeamPoints on the pipe loops', () => {
  const model = loadSampleModel('pipe-on-plate')
  const { faces, edgeIds, chains } = pipeline(model)

  it.each([25, 19])('follows the radius %i loop with a horizontal tangent and a vertical plus a radial normal', (radius) => {
    const chain = chains.find((c) => {
      const v = c.vertices[0]! * 3
      return Math.abs(Math.hypot(model.mesh.positions[v]!, model.mesh.positions[v + 1]!) - radius) < 0.1
    })!
    const { points } = buildSeamPoints(chain, edgeIds, model, faces)
    expect(points.length).toBeGreaterThan(50)
    for (const { p, t, n1, n2 } of points) {
      expect(Math.hypot(p[0], p[1])).toBeCloseTo(radius, 0)
      expect(t[2]).toBeCloseTo(0, 6)
      const radial: Vec3 = [p[0] / Math.hypot(p[0], p[1]), p[1] / Math.hypot(p[0], p[1]), 0]
      expect(Math.abs(dot(t, radial))).toBeLessThan(0.05)
      const [vertical, side] = Math.abs(n1[2]) > Math.abs(n2[2]) ? [n1, n2] : [n2, n1]
      expect(Math.abs(vertical[2])).toBeGreaterThan(0.999)
      expect(Math.abs(side[2])).toBeLessThan(0.01)
    }
  })
})
