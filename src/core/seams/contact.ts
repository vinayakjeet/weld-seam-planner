import { Vector3 } from 'three'
import type { HitPointInfo } from 'three-mesh-bvh'
import type { FaceData } from '../mesh/faces'
import type { MeshModel } from '../mesh/model'
import type { BodyBvh } from './bodyBvh'

const TOLERANCE_FRACTION = 0.002
const MIN_TOLERANCE_MM = 0.05
const FLAT_DEG = 10
// How far beside the edge B must still have surface, in tolerances.
const OVERHANG_REACH = 2

export function contactTolerance(diagonal: number): number {
  return Math.max(TOLERANCE_FRACTION * diagonal, MIN_TOLERANCE_MM)
}

export interface ContactEdges {
  edgeIds: Uint32Array
  // Global triangle of the adjacent face that does not lie on the touched body.
  freeFace: Int32Array
  // Surface normal of the touched body at the edge midpoint, 3 per edge.
  touchedNormal: Float32Array
  touchedBody: Uint32Array
}

const EMPTY: ContactEdges = {
  edgeIds: new Uint32Array(0),
  freeFace: new Int32Array(0),
  touchedNormal: new Float32Array(0),
  touchedBody: new Uint32Array(0),
}

// Convex crease edges of one body that lie on another body, with one adjacent face flat on it. An edge whose
// touched body ends at the edge (flush or overhanging) is not a fillet and is dropped, see the overhang test below.
export function findContactEdges(model: MeshModel, faces: FaceData, bvhs: BodyBvh[], creaseAngleDeg: number): ContactEdges {
  if (bvhs.length < 2) return EMPTY
  const { edges, mesh, bounds, bodies } = model
  const { positions } = mesh
  const { normals, centroids } = faces
  const tolerance = contactTolerance(bounds.diagonal)
  const cosCrease = Math.cos((creaseAngleDeg * Math.PI) / 180)
  const cosFlat = Math.cos(((180 - FLAT_DEG) * Math.PI) / 180)
  const epsilon = 1e-6 * bounds.diagonal

  const edgeIds: number[] = []
  const freeFace: number[] = []
  const touchedNormal: number[] = []
  const touchedBody: number[] = []

  const hit: HitPointInfo = { point: new Vector3(), distance: 0, faceIndex: 0 }
  const probe = new Vector3()
  const onSurface = new Vector3()

  for (let e = 0; e < edges.edgeCount; e++) {
    if (edges.useCount[e] !== 2) continue
    const fa = edges.faceA[e]!
    const fb = edges.faceB[e]!
    const nA = [normals[fa * 3]!, normals[fa * 3 + 1]!, normals[fa * 3 + 2]!]
    const nB = [normals[fb * 3]!, normals[fb * 3 + 1]!, normals[fb * 3 + 2]!]
    if (nA[0]! * nB[0]! + nA[1]! * nB[1]! + nA[2]! * nB[2]! > cosCrease) continue

    const a = edges.edgeA[e]! * 3
    const b = edges.edgeB[e]! * 3
    const p0 = [positions[a]!, positions[a + 1]!, positions[a + 2]!]
    const p1 = [positions[b]!, positions[b + 1]!, positions[b + 2]!]
    const mid = [0, 1, 2].map((c) => (p0[c]! + p1[c]!) / 2)
    const outward = [0, 1, 2].reduce((sum, c) => sum + (centroids[fb * 3 + c]! - mid[c]!) * nA[c]!, 0)
    if (outward >= -epsilon) continue

    const owner = bodies.triangleBody[fa]!
    for (let body = 0; body < bvhs.length; body++) {
      if (body === owner) continue
      const target = bvhs[body]!
      if (
        [0, 1, 2].some(
          (c) => Math.min(p0[c]!, p1[c]!) - tolerance > target.max[c]! || Math.max(p0[c]!, p1[c]!) + tolerance < target.min[c]!,
        )
      ) {
        continue
      }

      // closestPointToPoint can return a triangle farther than the range when it shares a leaf with one inside it, so
      // the distance is checked here. On a hollow part the leaf holds walls hundreds of mm away.
      const near = (p: number[]) => {
        const found = target.bvh.closestPointToPoint(probe.set(p[0]!, p[1]!, p[2]!), hit, 0, tolerance)
        return found !== null && found.distance <= tolerance
      }
      if (!near(p0) || !near(p1) || !near(mid)) continue

      const touchedFace = target.triangles[hit.faceIndex]! * 3
      const touched = [normals[touchedFace]!, normals[touchedFace + 1]!, normals[touchedFace + 2]!]
      onSurface.copy(hit.point)

      // The adjacent face most nearly antiparallel to the touched surface is the contact face.
      const alignment = (n: number[]) => n[0]! * touched[0]! + n[1]! * touched[1]! + n[2]! * touched[2]!
      const aligned = alignment(nA) <= alignment(nB) ? fa : fb
      if (Math.min(alignment(nA), alignment(nB)) > cosFlat) continue

      const dir = [(p1[0]! - p0[0]!), (p1[1]! - p0[1]!), (p1[2]! - p0[2]!)]
      const dirLength = Math.hypot(dir[0]!, dir[1]!, dir[2]!)
      const along = dir.map((x) => x / dirLength)
      const into = [0, 1, 2].map((c) => centroids[aligned * 3 + c]! - mid[c]!)
      const alongPart = into[0]! * along[0]! + into[1]! * along[1]! + into[2]! * along[2]!
      const away = [0, 1, 2].map((c) => -(into[c]! - alongPart * along[c]!))

      // The contact face has to lie on B, not only face it: a little way into the face, short of the far side of its
      // triangle, B must still be within tolerance. Blocks that touch edge to edge share only the line.
      const depth = Math.hypot(away[0]!, away[1]!, away[2]!)
      const inward = Math.min(OVERHANG_REACH * tolerance, 1.5 * depth) / depth
      if (!near(mid.map((x, c) => x - away[c]! * inward))) continue

      // Step from the edge across the touched surface, away from the contact face: if B ends there, this is a
      // flush or overhanging edge (a groove or corner weld), not a fillet.
      const offPlane = away[0]! * touched[0]! + away[1]! * touched[1]! + away[2]! * touched[2]!
      const step = [0, 1, 2].map((c) => away[c]! - offPlane * touched[c]!)
      const stepLength = Math.hypot(step[0]!, step[1]!, step[2]!)
      if (stepLength === 0) continue
      probe.set(
        onSurface.x + (step[0]! / stepLength) * OVERHANG_REACH * tolerance,
        onSurface.y + (step[1]! / stepLength) * OVERHANG_REACH * tolerance,
        onSurface.z + (step[2]! / stepLength) * OVERHANG_REACH * tolerance,
      )
      const beside = target.bvh.closestPointToPoint(probe, hit, 0, tolerance)
      if (beside === null || beside.distance > tolerance) continue

      edgeIds.push(e)
      freeFace.push(aligned === fa ? fb : fa)
      touchedNormal.push(...touched)
      touchedBody.push(body)
      break
    }
  }

  return {
    edgeIds: Uint32Array.from(edgeIds),
    freeFace: Int32Array.from(freeFace),
    touchedNormal: Float32Array.from(touchedNormal),
    touchedBody: Uint32Array.from(touchedBody),
  }
}
