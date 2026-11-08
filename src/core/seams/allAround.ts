import { dot, length, sub, type Vec3 } from '../math/vec3'
import type { FaceData } from '../mesh/faces'
import type { MeshModel } from '../mesh/model'
import { chainEdges, edgeEnds, type Chain } from './chain'
import { patchWidth } from './classify'
import type { ContactEdges, ContactResult, ContactStretch } from './contact'

// A loop is the end of a compact member, such as a tube or a bar, when its shortest side is at least this share of its
// longest. The foot of a web or a stiffener, two long sides and two ends a plate thick, is not.
export const COMPACT_SHARE = 0.25
// A flush side belongs to the end of a member only when the member runs away from the surface it meets at least this
// share of the loop's narrowest side; a flat block lying flush with the edge of a plate does not.
export const MEMBER_DEPTH_SHARE = 0.5
// Chained this way every vertex that joins exactly two edges is passed through, however sharply the path turns there.
const ANY_TURN_DEG = 180

// The contact edges followed by the flush ones, in one list; entries from flushFrom on are flush.
export function withFlush(contact: ContactResult): { edges: ContactEdges; flushFrom: number; stretches: ContactStretch[] } {
  const { flush } = contact
  const join = <T extends Uint32Array | Int32Array | Float32Array>(a: T, b: T, make: (n: number) => T): T => {
    const out = make(a.length + b.length)
    out.set(a)
    out.set(b, a.length)
    return out
  }
  return {
    edges: {
      edgeIds: join(contact.edgeIds, flush.edgeIds, (n) => new Uint32Array(n)),
      freeFace: join(contact.freeFace, flush.freeFace, (n) => new Int32Array(n)),
      touchedNormal: join(contact.touchedNormal, flush.touchedNormal, (n) => new Float32Array(n)),
      touchedBody: join(contact.touchedBody, flush.touchedBody, (n) => new Uint32Array(n)),
    },
    flushFrom: contact.edgeIds.length,
    stretches: contact.stretches,
  }
}

// Closed loops of contact edges that run all round the end of one member where it meets another, to be welded as one
// seam: every vertex on the loop joins exactly two edges of that pair of bodies, at least one edge is a fillet, and the
// outline is compact. Its sides are the runs between turns sharper than turnBreakDeg. The other edges may be flush with
// the other member, as the top and bottom of a tube end butting a tube of the same size are, when the member runs away
// from that surface far enough to have an end. Chain edges index edges.
export function allAroundLoops(model: MeshModel, faces: FaceData, edges: ContactEdges, flushFrom: number, turnBreakDeg: number): Chain[] {
  const { positions } = model.mesh
  const pairs = new Map<string, number[]>()
  for (let k = 0; k < edges.edgeIds.length; k++) {
    const key = `${model.bodies.triangleBody[edges.freeFace[k]!]}:${edges.touchedBody[k]}`
    const pair = pairs.get(key)
    if (pair) pair.push(k)
    else pairs.set(key, [k])
  }
  const loops: Chain[] = []
  for (const pair of pairs.values()) {
    if (pair.length < 3) continue
    const ends = edgeEnds(model.edges, Uint32Array.from(pair, (k) => edges.edgeIds[k]!))
    for (const chain of chainEdges(positions, ends, ANY_TURN_DEG)) {
      if (!chain.closed) continue
      const ks = chain.edges.map((i) => pair[i]!)
      if (ks.every((k) => k >= flushFrom)) continue
      const ring = chain.vertices.slice(0, -1).map((v): Vec3 => [positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!])
      const sides = loopSides(ring, turnBreakDeg)
      const shortest = Math.min(...sides)
      if (shortest < COMPACT_SHARE * Math.max(...sides)) continue
      if (ks.some((k) => k >= flushFrom) && !ks.every((k) => memberDepth(model, faces, edges, k, MEMBER_DEPTH_SHARE * shortest))) continue
      loops.push({ vertices: chain.vertices, edges: ks, closed: true })
    }
  }
  return loops
}

// Whether the free face beside contact edge k runs at least needMm away from the edge.
function memberDepth(model: MeshModel, faces: FaceData, edges: ContactEdges, k: number, needMm: number): boolean {
  const { positions } = model.mesh
  const e = edges.edgeIds[k]!
  const a = model.edges.edgeA[e]! * 3
  const b = model.edges.edgeB[e]! * 3
  const d: Vec3 = [positions[b]! - positions[a]!, positions[b + 1]! - positions[a + 1]!, positions[b + 2]! - positions[a + 2]!]
  const span = Math.hypot(d[0], d[1], d[2])
  const mid: Vec3 = [(positions[a]! + positions[b]!) / 2, (positions[a + 1]! + positions[b + 1]!) / 2, (positions[a + 2]! + positions[b + 2]!) / 2]
  return patchWidth(model, faces, edges.freeFace[k]!, mid, [d[0] / span, d[1] / span, d[2] / span], needMm) >= needMm
}

// Lengths of the runs between turns sharper than turnBreakDeg, round a ring given without a repeated first point; one
// run when no vertex turns that far.
export function loopSides(ring: Vec3[], turnBreakDeg: number): number[] {
  const n = ring.length
  const at = (i: number) => ring[((i % n) + n) % n]!
  const step = (i: number) => length(sub(at(i + 1), at(i)))
  const turnDeg = (i: number) => {
    const d1 = sub(at(i), at(i - 1))
    const d2 = sub(at(i + 1), at(i))
    return (Math.acos(Math.max(-1, Math.min(1, dot(d1, d2) / (length(d1) * length(d2))))) * 180) / Math.PI
  }
  const corners = Array.from({ length: n }, (_, i) => i).filter((i) => turnDeg(i) > turnBreakDeg)
  if (corners.length === 0) return [Array.from({ length: n }, (_, i) => step(i)).reduce((x, y) => x + y, 0)]
  return corners.map((from, j) => {
    const to = j + 1 < corners.length ? corners[j + 1]! : corners[0]! + n
    let sum = 0
    for (let i = from; i < to; i++) sum += step(i)
    return sum
  })
}
