import { describe, expect, it } from 'vitest'
import { computeFaceData } from '../../../src/core/mesh/faces'
import { buildMeshModel, type MeshModel } from '../../../src/core/mesh/model'
import { buildBodyBvhs } from '../../../src/core/seams/bodyBvh'
import { contactTolerance, findContactEdges } from '../../../src/core/seams/contact'
import { Vector3 } from 'three'
import { loadSampleModel, transformSoup } from '../helpers/models'
import { boxTube, cubeTriangles, soupOf } from '../helpers/shapes'

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

  // Edge to edge the blocks share only a line: no face lies on the other body. Taken on the normals alone, both bodies
  // read the line, and on a turned part both described the same of its two corners.
  it('finds no edge where two blocks touch only along a line, however the part is turned', () => {
    const lower = cubeTriangles([0, 0, 0], [50, 60, 10])
    const upper = cubeTriangles([50.01, 0, 10.03], [50, 60, 10])
    expect(contactOf(lower, upper).found).toHaveLength(0)
    const turned = transformSoup(soupOf([...lower, ...upper]), { rotate: { axis: [3, -1, 2], angleDeg: 37 } })
    const model = buildMeshModel(turned, 1)
    expect(model.bodies.count).toBe(2)
    expect(findContactEdges(model, computeFaceData(model.mesh), buildBodyBvhs(model), CREASE_DEG).edgeIds).toHaveLength(0)
  })
})

// A real fit-up gap does not grow with the part: the tolerance is capped at 1 mm, so a large frame keeps it too.
describe('findContactEdges on a part over 500 mm across', () => {
  const longPlate = cubeTriangles([-1000, -60, 0], [2000, 120, 10])
  const liftedWeb = (lift: number) => cubeTriangles([-100, -5, 10 + lift], [200, 10, 80])

  it('finds a web 0.9 mm off the plate, a fit-up gap', () => {
    expect(contactOf(longPlate, liftedWeb(0.9)).found.length).toBeGreaterThan(0)
  })

  // The land beside an edge still scales with the part: at least 0.2 percent of the diagonal, 4 mm here.
  it('finds a web with 5 mm of land each side, and treats one with 2 mm as flush', () => {
    const rail = cubeTriangles([-1000, -15, 0], [2000, 30, 10])
    const wide = cubeTriangles([-100, -10, 10], [200, 20, 80])
    expect(contactOf(rail, wide).found.filter((e) => Math.abs(e.length - 200) < 1e-3)).toHaveLength(2)
    const wider = cubeTriangles([-100, -13, 10], [200, 26, 80])
    expect(contactOf(rail, wider).found.filter((e) => Math.abs(e.length - 200) < 1e-3)).toHaveLength(0)
  })

  it('finds no edge across a 3.3 mm gap, which 0.2 percent of this part would have counted as touching', () => {
    const { found, tolerance } = contactOf(longPlate, liftedWeb(3.3))
    expect(tolerance).toBe(1)
    expect(found).toHaveLength(0)
  })
})

describe('flush contact edges', () => {
  const flushOf = (...solids: number[][][]) => {
    const model = buildMeshModel(soupOf(solids.flat()), 1)
    const found = findContactEdges(model, computeFaceData(model.mesh), buildBodyBvhs(model), CREASE_DEG)
    const lengths = (ids: Uint32Array) =>
      Array.from(ids, (id) => {
        const [a, b] = [model.edges.edgeA[id]! * 3, model.edges.edgeB[id]! * 3]
        const p = model.mesh.positions
        return Math.round(Math.hypot(p[a]! - p[b]!, p[a + 1]! - p[b + 1]!, p[a + 2]! - p[b + 2]!) * 100) / 100
      }).sort((x, y) => x - y)
    return { contact: lengths(found.edgeIds), flush: lengths(found.flush.edgeIds), touched: Array.from(found.flush.touchedNormal) }
  }

  it('reports the flush ends of a web on a plate apart from the contact edges', () => {
    const { contact, flush } = flushOf(plate, webAt(-100, 100))
    expect(contact).toEqual([200, 200])
    expect(flush).toEqual([10, 10])
  })

  // A 1 in tube butting the side of another: its end is as tall as the other tube, so the top and bottom sides of the
  // end lie on the far edges of the touched face. The closest face there could be the top of the other tube.
  it('reads the side face, not the top, as the touched surface of the flush sides of a tube end butting a tube', () => {
    const rail = boxTube(25.4, 25.4, 3.18, 600, (u, v, w) => [w, u, v])
    const rung = boxTube(25.4, 25.4, 3.18, 249.2, (u, v, w) => [287.3 + u, 25.4 + w, v])
    const { contact, flush, touched } = flushOf(rail, rung)
    expect(contact).toEqual([19.04, 19.04, 19.04, 19.04, 25.4, 25.4])
    expect(flush).toEqual([25.4, 25.4])
    for (let k = 0; k < touched.length; k += 3) expect(touched.slice(k, k + 3)).toEqual([0, 1, 0])
  })
})

describe('findContactEdges on a hollow part', () => {
  const model = loadSampleModel('tank-with-manhole')
  const faces = computeFaceData(model.mesh)
  const bvhs = buildBodyBvhs(model)
  const edges = findContactEdges(model, faces, bvhs, CREASE_DEG)
  const tolerance = contactTolerance(model.bounds.diagonal)
  const p = model.mesh.positions
  const ends = (k: number) => {
    const id = edges.edgeIds[k]!
    const a = model.edges.edgeA[id]! * 3
    const b = model.edges.edgeB[id]! * 3
    return [
      [p[a]!, p[a + 1]!, p[a + 2]!],
      [p[b]!, p[b + 1]!, p[b + 2]!],
    ] as const
  }

  it('returns an edge only when both ends lie within the tolerance of the touched body', () => {
    expect(edges.edgeIds.length).toBeGreaterThan(0)
    const hit = { point: new Vector3(), distance: 0, faceIndex: 0 }
    for (let k = 0; k < edges.edgeIds.length; k++) {
      const target = bvhs[edges.touchedBody[k]!]!
      for (const [x, y, z] of ends(k)) {
        const found = target.bvh.closestPointToPoint(new Vector3(x, y, z), hit)
        expect(found, `edge ${k}`).not.toBeNull()
        expect(found!.distance, `edge ${k}`).toBeLessThanOrEqual(tolerance)
      }
    }
  })

  // The coaming sits 2 mm outside the hole rim. Its inner edge and the rim are not fillets: the overhang probe steps
  // into the hole, where there is no surface, so only a range check on the hit keeps them out.
  it('finds no edge on the manhole rim or the coaming inner edge', () => {
    for (let k = 0; k < edges.edgeIds.length; k++) {
      const [a, b] = ends(k)
      const radius = Math.hypot((a[0] + b[0]) / 2 - 400, (a[1] + b[1]) / 2 - 500)
      const onRoof = Math.abs(a[2] - 1000) < 1e-3
      expect(onRoof && radius < 305, `edge ${k} at radius ${radius.toFixed(1)}`).toBe(false)
    }
  })

  it('finds no edge on a stiffener top or end', () => {
    for (let k = 0; k < edges.edgeIds.length; k++) {
      const [a, b] = ends(k)
      const level = Math.abs(a[2] - b[2]) < 1e-3
      expect(level, `edge ${k} is vertical`).toBe(true)
      for (const z of [408, 338]) expect(Math.abs(a[2] - z), `edge ${k} at z ${z}`).toBeGreaterThan(1e-3)
    }
  })
})
