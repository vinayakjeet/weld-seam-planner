import { describe, expect, it } from 'vitest'
import { computeFaceData } from '../../../src/core/mesh/faces'
import { buildMeshModel, type MeshModel } from '../../../src/core/mesh/model'
import { buildBodyBvhs } from '../../../src/core/seams/bodyBvh'
import { contactTolerance, findContactEdges } from '../../../src/core/seams/contact'
import { cubeTriangles, soupOf } from '../helpers/shapes'

const CREASE_DEG = 30

function contactOf(...solids: number[][][]) {
  const model: MeshModel = buildMeshModel(soupOf(solids.flat()), 1)
  const faces = computeFaceData(model.mesh)
  const edges = findContactEdges(model, faces, buildBodyBvhs(model), CREASE_DEG)
  const found = Array.from(edges.edgeIds, (id, k) => {
    const a = model.edges.edgeA[id]! * 3
    const b = model.edges.edgeB[id]! * 3
    const p = model.mesh.positions
    const mid = [0, 1, 2].map((c) => (p[a + c]! + p[b + c]!) / 2)
    const length = Math.hypot(p[a]! - p[b]!, p[a + 1]! - p[b + 1]!, p[a + 2]! - p[b + 2]!)
    const free = edges.freeFace[k]! * 3
    return {
      length,
      mid,
      touched: Array.from(edges.touchedNormal.slice(k * 3, k * 3 + 3)),
      freeNormal: [faces.normals[free]!, faces.normals[free + 1]!, faces.normals[free + 2]!],
      touchedBody: edges.touchedBody[k]!,
    }
  })
  return { found, tolerance: contactTolerance(model.bounds.diagonal) }
}

const plate = cubeTriangles([-100, -60, 0], [200, 120, 10])
const webAt = (x0: number, x1: number, lift = 0) => cubeTriangles([x0, -5, 10 + lift], [x1 - x0, 10, 80])

// Tilts a solid about the line y = pivotY, z = pivotZ (parallel to x) by deg degrees.
function tiltAboutX(tris: number[][], pivotY: number, pivotZ: number, deg: number): number[][] {
  const cos = Math.cos((deg * Math.PI) / 180)
  const sin = Math.sin((deg * Math.PI) / 180)
  return tris.map((tri) =>
    tri.map((value, i) => {
      if (i % 3 === 0) return value
      const y = tri[i - (i % 3) + 1]! - pivotY
      const z = tri[i - (i % 3) + 2]! - pivotZ
      return i % 3 === 1 ? pivotY + y * cos - z * sin : pivotZ + y * sin + z * cos
    }),
  )
}

describe('findContactEdges', () => {
  it('finds the two web edges on the plate and rejects the flush ends', () => {
    const { found } = contactOf(plate, webAt(-100, 100))
    expect(found).toHaveLength(2)
    for (const edge of found) {
      expect(edge.length).toBeCloseTo(200, 3)
      expect(edge.mid[2]).toBeCloseTo(10, 4)
      expect(Math.abs(edge.mid[1]!)).toBeCloseTo(5, 4)
      expect(edge.touched).toEqual([0, 0, 1])
      expect(edge.touchedBody).toBe(0)
      expect(edge.freeNormal).toEqual([0, Math.sign(edge.mid[1]!), 0])
    }
    expect(found.map((e) => Math.sign(e.mid[1]!)).sort()).toEqual([-1, 1])
  })

  it('keeps the web end edges when the plate extends past them', () => {
    const { found } = contactOf(plate, webAt(-80, 80))
    expect(found).toHaveLength(4)
    expect(found.filter((e) => Math.abs(e.length - 10) < 1e-3)).toHaveLength(2)
    expect(found.filter((e) => Math.abs(e.length - 160) < 1e-3)).toHaveLength(2)
  })

  it('finds a web lifted by half the tolerance and not one lifted by twice the tolerance', () => {
    const base = contactOf(plate, webAt(-100, 100))
    expect(contactOf(plate, webAt(-100, 100, 0.5 * base.tolerance)).found).toHaveLength(2)
    expect(contactOf(plate, webAt(-100, 100, 2 * base.tolerance)).found).toHaveLength(0)
  })

  // On exact contact the end edge sits on the plate boundary and the closest face is ambiguous. A small lift makes the
  // plate top the closest face, so only the overhang rule can reject the flush ends.
  it('rejects flush web ends by the overhang rule when the web is slightly lifted', () => {
    const { found, tolerance } = contactOf(plate, webAt(-100, 100, 0.25))
    expect(tolerance).toBeGreaterThan(0.25)
    expect(found).toHaveLength(2)
    for (const edge of found) expect(edge.length).toBeCloseTo(200, 3)
  })

  it('accepts a contact face tilted 8 degrees and rejects 15 degrees', () => {
    const tilted = (deg: number) => tiltAboutX(webAt(-100, 100), -5, 10, deg)
    const eight = contactOf(plate, tilted(8))
    expect(eight.found).toHaveLength(1)
    expect(eight.found[0]!.mid[1]).toBeCloseTo(-5, 4)
    expect(contactOf(plate, tilted(15)).found).toHaveLength(0)
  })

  it('finds both ends of a lap joint, one from each plate', () => {
    const lower = cubeTriangles([0, 0, 0], [100, 60, 10])
    const upper = cubeTriangles([60, 0, 10], [100, 60, 10])
    const { found } = contactOf(lower, upper)
    expect(found).toHaveLength(2)
    expect(found.map((e) => e.length)).toEqual([expect.closeTo(60, 3), expect.closeTo(60, 3)])
    expect(found.map((e) => Math.round(e.mid[0]!)).sort((a, b) => a - b)).toEqual([60, 100])
    expect(found.map((e) => e.touchedBody).sort()).toEqual([0, 1])
  })

  it('finds nothing for two separated bodies', () => {
    expect(contactOf(plate, cubeTriangles([-100, -5, 40], [200, 10, 80])).found).toHaveLength(0)
  })
})
