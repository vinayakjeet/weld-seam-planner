import { cross, dot, length, normalize, scale, sub, type Vec3 } from '../math/vec3'
import type { MeshModel } from '../mesh/model'

// One free-space wedge beside a non-manifold edge, bounded by two of the faces that share it.
export interface Wedge {
  edge: number
  // Order of this wedge among the accepted wedges of its edge, so wedges on one edge can be chained separately.
  rank: number
  // Face normals turned to point into the wedge, so their sum is the bisector.
  n1: Vec3
  n2: Vec3
  openingDeg: number
}

const MIN_OPENING_DEG = 45
const MAX_OPENING_DEG = 135
const TWO_PI = 2 * Math.PI
// How far into a wedge, along its bisector, the solid test looks: well inside the thinnest plate.
const PROBE_FRACTION = 1e-3

// Whether a point is inside the material of a body: true or false where the body has an inside, null where it has
// none (an open body) or it cannot be told.
export type SolidTest = (p: Vec3, body: number) => boolean | null

// An edge with three or more faces is often where an exporter fused two touching parts. Looking along the edge the
// faces fan out; each gap between neighbouring faces is a place a fillet could sit. Winding is not trusted on such
// an edge, so the normals are turned to face into the wedge. A wedge is kept when its opening angle is a fillet's
// (45 to 135 degrees), the faces still turn by at least the crease angle, and a point just inside it along its
// bisector is not in the material: fused closed solids leave wedges inside a web or a plate. Without a solid test,
// or where it cannot tell, every wedge is free space.
export function extractNonManifoldWedges(model: MeshModel, creaseAngleDeg: number, solid?: SolidTest): Wedge[] {
  const { edges, mesh } = model
  if (edges.stats.nonManifold === 0) return []
  const { positions, indices, triangleCount, vertexCount } = mesh

  const users = new Map<number, number[]>()
  for (let f = 0; f < triangleCount; f++) {
    for (let k = 0; k < 3; k++) {
      const a = indices[f * 3 + k]!
      const b = indices[f * 3 + ((k + 1) % 3)]!
      const e = edges.keyToEdge.get(a < b ? a * vertexCount + b : b * vertexCount + a)!
      if (edges.useCount[e]! > 2) {
        const list = users.get(e)
        if (list) list.push(f)
        else users.set(e, [f])
      }
    }
  }

  const point = (v: number): Vec3 => [positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!]
  const maxOpening = Math.min(MAX_OPENING_DEG, 180 - creaseAngleDeg)
  const step = PROBE_FRACTION * model.bounds.diagonal
  const wedges: Wedge[] = []

  for (const [edge, faces] of [...users].sort((x, y) => x[0] - y[0])) {
    const lo = edges.edgeA[edge]!
    const hi = edges.edgeB[edge]!
    const origin = point(lo)
    const axis = normalize(sub(point(hi), origin))

    // Direction from the edge into each face, perpendicular to the edge.
    const fan: Array<{ d: Vec3; angle: number }> = []
    for (const f of faces) {
      const opposite = [0, 1, 2].map((k) => indices[f * 3 + k]!).find((v) => v !== lo && v !== hi)
      if (opposite === undefined) continue
      const offset = sub(point(opposite), origin)
      const d = normalize(sub(offset, scale(axis, dot(offset, axis))))
      if (length(d) > 0) fan.push({ d, angle: 0 })
    }
    if (fan.length < 3) continue
    const reference = fan[0]!.d
    for (const item of fan) {
      const angle = Math.atan2(dot(cross(reference, item.d), axis), dot(reference, item.d))
      item.angle = angle < 0 ? angle + TWO_PI : angle
    }
    fan.sort((x, y) => x.angle - y.angle)

    let rank = 0
    for (let i = 0; i < fan.length; i++) {
      const from = fan[i]!
      const to = fan[(i + 1) % fan.length]!
      let gap = to.angle - from.angle
      if (i === fan.length - 1) gap += TWO_PI
      const openingDeg = (gap * 180) / Math.PI
      if (openingDeg < MIN_OPENING_DEG || openingDeg > maxOpening) continue
      if (solid) {
        const inward = normalize([from.d[0] + to.d[0], from.d[1] + to.d[1], from.d[2] + to.d[2]])
        const mid = scale([origin[0] + point(hi)[0], origin[1] + point(hi)[1], origin[2] + point(hi)[2]], 0.5)
        const inside: Vec3 = [mid[0] + inward[0] * step, mid[1] + inward[1] * step, mid[2] + inward[2] * step]
        if (solid(inside, model.bodies.triangleBody[faces[0]!]!) === true) continue
      }
      wedges.push({
        edge,
        rank: rank++,
        n1: cross(axis, from.d),
        n2: cross(to.d, axis),
        openingDeg,
      })
    }
  }
  return wedges
}

// Bodies with a boundary edge are open and have no inside.
export function openBodies(model: MeshModel): Uint8Array {
  const open = new Uint8Array(model.bodies.count)
  const { edges } = model
  for (let e = 0; e < edges.edgeCount; e++) if (edges.useCount[e] === 1) open[model.bodies.triangleBody[edges.faceA[e]!]!] = 1
  return open
}
