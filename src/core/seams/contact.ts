import { Vector3 } from 'three'
import type { HitPointInfo } from 'three-mesh-bvh'
import type { Vec3 } from '../math/vec3'
import type { FaceData } from '../mesh/faces'
import type { MeshModel } from '../mesh/model'
import type { BodyBvh } from './bodyBvh'

export const TOLERANCE_FRACTION = 0.002
export const MIN_TOLERANCE_MM = 0.05
// A real fit-up gap does not grow with the part: at 0.2 percent a 2 m frame would call bodies 4 mm apart touching.
export const MAX_TOLERANCE_MM = 1
const FLAT_DEG = 10
// How far beside the edge B must still have surface, in tolerances.
const OVERHANG_REACH = 2
// Samples along an edge looking for the stretch that touches: at least this many, this far apart at most, unless the
// edge is so long that 200 samples are spaced wider; that is still under the shortest seam, 1 percent of the part.
const MIN_STRETCH_SAMPLES = 5
const STRETCH_STEP_MM = 2
const MAX_STRETCH_STEPS = 200
const STRETCH_REFINE_STEPS = 10

export function contactTolerance(diagonal: number): number {
  return Math.max(Math.min(TOLERANCE_FRACTION * diagonal, MAX_TOLERANCE_MM), MIN_TOLERANCE_MM)
}

export interface ContactEdges {
  edgeIds: Uint32Array
  // Global triangle of the adjacent face that does not lie on the touched body.
  freeFace: Int32Array
  // Surface normal of the touched body at the edge midpoint, or a little way under the contact face where the midpoint
  // lies on an edge of that body; 3 per edge.
  touchedNormal: Float32Array
  touchedBody: Uint32Array
}

// The part of an edge that touches another body, where the rest of the edge is further off.
export interface ContactStretch {
  edge: number
  from: Vec3
  to: Vec3
  freeFace: number
  touchedNormal: Vec3
  touchedBody: number
}

export interface ContactResult extends ContactEdges {
  // Edges that pass every test but the overhang one: the touched body ends at the edge, flush with it. Not a fillet
  // on its own, but it can close a weld all around the end of a member.
  flush: ContactEdges
  stretches: ContactStretch[]
}

const NONE: ContactEdges = {
  edgeIds: new Uint32Array(0),
  freeFace: new Int32Array(0),
  touchedNormal: new Float32Array(0),
  touchedBody: new Uint32Array(0),
}

// The runs of an edge from p0 to p1 that test true, each at least minMm long, as fractions of the edge. The ends of a
// run are found between the samples by halving.
function touchingRuns(lengthMm: number, minMm: number, touches: (f: number) => boolean): Array<[number, number]> {
  const count = Math.max(MIN_STRETCH_SAMPLES, Math.ceil(lengthMm / Math.max(STRETCH_STEP_MM, lengthMm / MAX_STRETCH_STEPS)) + 1)
  const on = Array.from({ length: count }, (_, i) => touches(i / (count - 1)))
  const refine = (inside: number, outside: number) => {
    let [a, b] = [inside, outside]
    for (let i = 0; i < STRETCH_REFINE_STEPS; i++) {
      const m = (a + b) / 2
      if (touches(m)) a = m
      else b = m
    }
    return a
  }
  const runs: Array<[number, number]> = []
  for (let i = 0; i < count; i++) {
    if (!on[i]) continue
    const first = i
    while (i + 1 < count && on[i + 1]) i++
    const from = first === 0 ? 0 : refine(first / (count - 1), (first - 1) / (count - 1))
    const to = i === count - 1 ? 1 : refine(i / (count - 1), (i + 1) / (count - 1))
    if ((to - from) * lengthMm >= minMm) runs.push([from, to])
  }
  return runs
}

class EdgeList {
  edgeIds: number[] = []
  freeFace: number[] = []
  touchedNormal: number[] = []
  touchedBody: number[] = []

  push(edge: number, free: number, touched: number[], body: number) {
    this.edgeIds.push(edge)
    this.freeFace.push(free)
    this.touchedNormal.push(...touched)
    this.touchedBody.push(body)
  }

  build(): ContactEdges {
    return {
      edgeIds: Uint32Array.from(this.edgeIds),
      freeFace: Int32Array.from(this.freeFace),
      touchedNormal: Float32Array.from(this.touchedNormal),
      touchedBody: Uint32Array.from(this.touchedBody),
    }
  }
}

// Convex crease edges of one body that lie on another body, with one adjacent face flat on it. An edge whose
// touched body ends at the edge (flush or overhanging) is not a fillet; it is returned apart, see the overhang test.
// An edge of at least minStretchMm with only part of its length on the other body gives the runs of at least that length
// that lie within the tolerance and pass the same tests, as stretches: the end of a tube standing proud of what it meets.
export function findContactEdges(model: MeshModel, faces: FaceData, bvhs: BodyBvh[], creaseAngleDeg: number, minStretchMm = Infinity): ContactResult {
  if (bvhs.length < 2) return { ...NONE, flush: NONE, stretches: [] }
  const { edges, mesh, bounds, bodies } = model
  const { positions } = mesh
  const { normals, centroids } = faces
  const tolerance = contactTolerance(bounds.diagonal)
  // The surface beside an edge has to take a fillet, which the cap on the gap must not shrink: the 2 mm land between the
  // coaming of the tank and its manhole is no place for one. A step of twice this distance, with the surface within
  // this distance of where it lands, asks for a land of at least this much.
  const landMm = Math.max(TOLERANCE_FRACTION * bounds.diagonal, MIN_TOLERANCE_MM)
  const cosCrease = Math.cos((creaseAngleDeg * Math.PI) / 180)
  const cosFlat = Math.cos(((180 - FLAT_DEG) * Math.PI) / 180)
  const epsilon = 1e-6 * bounds.diagonal

  const found = new EdgeList()
  const flush = new EdgeList()
  const stretches: ContactStretch[] = []

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
    let flushOn: { body: number; free: number; touched: number[] } | null = null
    let fillet = false
    const edgeStretches: ContactStretch[] = []
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
      const normalOfHit = () => {
        const touchedFace = target.triangles[hit.faceIndex]! * 3
        return [normals[touchedFace]!, normals[touchedFace + 1]!, normals[touchedFace + 2]!]
      }
      const alignment = (n: readonly number[], touched: number[]) => n[0]! * touched[0]! + n[1]! * touched[1]! + n[2]! * touched[2]!
      const dir = [(p1[0]! - p0[0]!), (p1[1]! - p0[1]!), (p1[2]! - p0[2]!)]
      const dirLength = Math.hypot(dir[0]!, dir[1]!, dir[2]!)
      const along = dir.map((x) => x / dirLength)

      // Whether a place on the edge, known to lie on B, is a fillet or flush with B, or neither.
      const readAt = (at: number[]): { flush: boolean; free: number; touched: number[] } | null => {
        near(at)
        onSurface.copy(hit.point)
        // A little way into a face, short of the far side of its triangle, and the direction from there back away from it.
        const intoFace = (face: number) => {
          const into = [0, 1, 2].map((c) => centroids[face * 3 + c]! - at[c]!)
          const alongPart = into[0]! * along[0]! + into[1]! * along[1]! + into[2]! * along[2]!
          const away = [0, 1, 2].map((c) => -(into[c]! - alongPart * along[c]!))
          const depth = Math.hypot(away[0]!, away[1]!, away[2]!)
          const inward = Math.min(OVERHANG_REACH * tolerance, 1.5 * depth) / depth
          return { away, point: at.map((x, c) => x - away[c]! * inward) }
        }

        // The adjacent face most nearly antiparallel to the touched surface is the contact face. It has to lie on B, not
        // only face it: a little way into the face B must still be within tolerance. Blocks that touch edge to edge share
        // only the line.
        let contactFace: { face: number; touched: number[]; away: number[] } | null = null
        const midTouched = normalOfHit()
        const best = alignment(nA, midTouched) <= alignment(nB, midTouched) ? fa : fb
        if (Math.min(alignment(nA, midTouched), alignment(nB, midTouched)) <= cosFlat) {
          const { away, point } = intoFace(best)
          if (near(point)) contactFace = { face: best, touched: midTouched, away }
        } else {
          // Where the edge lies on an edge of B, as the flush side of a tube end butting a tube of the same size does, the
          // surface nearest its midpoint can be the wrong face of B. Inside each face it is one face.
          let closest = cosFlat
          for (const [face, n] of [[fa, nA], [fb, nB]] as const) {
            const { away, point } = intoFace(face)
            if (!near(point)) continue
            const touched = normalOfHit()
            if (alignment(n, touched) > closest) continue
            closest = alignment(n, touched)
            contactFace = { face, touched, away }
          }
        }
        if (!contactFace) return null
        const { face: aligned, touched, away } = contactFace

        // Step from the edge across the touched surface, away from the contact face: if B ends there, this is a
        // flush or overhanging edge (a groove or corner weld), not a fillet.
        const offPlane = away[0]! * touched[0]! + away[1]! * touched[1]! + away[2]! * touched[2]!
        const step = [0, 1, 2].map((c) => away[c]! - offPlane * touched[c]!)
        const stepLength = Math.hypot(step[0]!, step[1]!, step[2]!)
        if (stepLength === 0) return null
        probe.set(
          onSurface.x + (step[0]! / stepLength) * OVERHANG_REACH * landMm,
          onSurface.y + (step[1]! / stepLength) * OVERHANG_REACH * landMm,
          onSurface.z + (step[2]! / stepLength) * OVERHANG_REACH * landMm,
        )
        const beside = target.bvh.closestPointToPoint(probe, hit, 0, landMm)
        return { flush: beside === null || beside.distance > landMm, free: aligned === fa ? fb : fa, touched }
      }

      if (!near(p0) || !near(p1) || !near(mid)) {
        if (dirLength < minStretchMm) continue
        const pointAt = (f: number) => p0.map((x, c) => x + dir[c]! * f)
        for (const [from, to] of touchingRuns(dirLength, minStretchMm, (f) => near(pointAt(f)))) {
          const read = readAt(pointAt((from + to) / 2))
          if (!read || read.flush) continue
          const [start, end] = [pointAt(from), pointAt(to)]
          edgeStretches.push({
            edge: e,
            from: [start[0]!, start[1]!, start[2]!],
            to: [end[0]!, end[1]!, end[2]!],
            freeFace: read.free,
            touchedNormal: [read.touched[0]!, read.touched[1]!, read.touched[2]!],
            touchedBody: body,
          })
        }
        continue
      }
      const read = readAt(mid)
      if (!read) continue
      if (read.flush) {
        flushOn ??= { body, free: read.free, touched: read.touched }
        continue
      }

      found.push(e, read.free, read.touched, body)
      fillet = true
      break
    }
    if (!fillet && flushOn) flush.push(e, flushOn.free, flushOn.touched, flushOn.body)
    if (!fillet) stretches.push(...edgeStretches)
  }

  return { ...found.build(), flush: flush.build(), stretches }
}
