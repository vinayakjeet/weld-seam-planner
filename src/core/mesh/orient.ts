import type { BodyLabels } from './bodies'
import { edgeKey, type EdgeMap } from './edgeMap'
import type { IndexedMesh } from './weld'

export interface Orientation {
  // Bodies where at least one triangle was reversed.
  reorientedBodies: number[]
  // Bodies whose inside could not be told from their outside: open, non-manifold or not orientable.
  unsignedBodies: number[]
  flippedTriangles: number
}

export interface OrientResult extends Orientation {
  indices: Uint32Array
}

// 1 when the triangle runs lo to hi along an edge, -1 when it runs hi to lo, 0 when it does not use the edge.
function runs(indices: Uint32Array, face: number, lo: number, hi: number): number {
  for (let k = 0; k < 3; k++) {
    const a = indices[face * 3 + k]!
    const b = indices[face * 3 + ((k + 1) % 3)]!
    if (a === lo && b === hi) return 1
    if (a === hi && b === lo) return -1
  }
  return 0
}

// Winding decides which side of a surface is outside, so a reversed or mixed body reads concave edges as convex.
// Per body: make neighbouring triangles agree (a shared edge must be walked in opposite directions), then, for a
// closed manifold body only, make the signed volume positive. Other bodies keep their relative winding repaired
// where possible but have no known sign. Flipping a triangle never changes the edge map, so it stays valid.
export function orientBodies(mesh: IndexedMesh, bodies: BodyLabels, edges: EdgeMap): OrientResult {
  const { indices, positions, triangleCount, vertexCount } = mesh
  const { triangleBody, count } = bodies

  const open = new Uint8Array(count)
  const nonManifold = new Uint8Array(count)
  const inconsistent = new Uint8Array(count)
  let anyInconsistent = false
  for (let e = 0; e < edges.edgeCount; e++) {
    const fa = edges.faceA[e]!
    const body = triangleBody[fa]!
    const uses = edges.useCount[e]!
    if (uses === 1) open[body] = 1
    else if (uses > 2) nonManifold[body] = 1
    else {
      const lo = edges.edgeA[e]!
      const hi = edges.edgeB[e]!
      if (runs(indices, fa, lo, hi) === runs(indices, edges.faceB[e]!, lo, hi)) {
        inconsistent[body] = 1
        anyInconsistent = true
      }
    }
  }

  const flip = new Uint8Array(triangleCount)
  const conflict = new Uint8Array(count)
  if (anyInconsistent) {
    // 0 unvisited, 1 keep, 2 flip, relative to the seed triangle of each connected piece.
    const state = new Uint8Array(triangleCount)
    const queue = new Uint32Array(triangleCount)
    for (let seed = 0; seed < triangleCount; seed++) {
      const body = triangleBody[seed]!
      if (!inconsistent[body] || state[seed] !== 0) continue
      state[seed] = 1
      let head = 0
      let tail = 0
      queue[tail++] = seed
      while (head < tail) {
        const g = queue[head++]!
        for (let k = 0; k < 3; k++) {
          const a = indices[g * 3 + k]!
          const b = indices[g * 3 + ((k + 1) % 3)]!
          const e = edges.keyToEdge.get(edgeKey(a, b, vertexCount))!
          if (edges.useCount[e] !== 2) continue
          const h = edges.faceA[e] === g ? edges.faceB[e]! : edges.faceA[e]!
          const lo = edges.edgeA[e]!
          const hi = edges.edgeB[e]!
          const walked = runs(indices, g, lo, hi) * (state[g] === 2 ? -1 : 1)
          const wanted = -walked * runs(indices, h, lo, hi) === 1 ? 1 : 2
          if (state[h] === 0) {
            state[h] = wanted
            queue[tail++] = h
          } else if (state[h] !== wanted) {
            conflict[body] = 1
          }
        }
      }
    }
    for (let f = 0; f < triangleCount; f++) {
      if (state[f] === 2 && !conflict[triangleBody[f]!]) flip[f] = 1
    }
  }

  const volume = new Float64Array(count)
  const magnitude = new Float64Array(count)
  const origin = new Float64Array(count * 3)
  const started = new Uint8Array(count)
  for (let f = 0; f < triangleCount; f++) {
    const body = triangleBody[f]!
    if (open[body] || nonManifold[body] || conflict[body]) continue
    const [a, b, c] = [0, 1, 2].map((k) => indices[f * 3 + k]! * 3) as [number, number, number]
    if (!started[body]) {
      started[body] = 1
      for (let k = 0; k < 3; k++) origin[body * 3 + k] = positions[a + k]!
    }
    const p = (v: number, k: number) => positions[v + k]! - origin[body * 3 + k]!
    const det =
      p(a, 0) * (p(b, 1) * p(c, 2) - p(b, 2) * p(c, 1)) -
      p(a, 1) * (p(b, 0) * p(c, 2) - p(b, 2) * p(c, 0)) +
      p(a, 2) * (p(b, 0) * p(c, 1) - p(b, 1) * p(c, 0))
    volume[body]! += (flip[f] ? -det : det) / 6
    magnitude[body]! += Math.abs(det) / 6
  }

  const unsignedBodies: number[] = []
  const reverseAll = new Uint8Array(count)
  for (let body = 0; body < count; body++) {
    const closed = !open[body] && !nonManifold[body] && !conflict[body]
    // A closed body whose volume nearly cancels has no inside to speak of.
    if (!closed || Math.abs(volume[body]!) <= 1e-6 * magnitude[body]!) unsignedBodies.push(body)
    else if (volume[body]! < 0) reverseAll[body] = 1
  }

  const reoriented = new Uint8Array(count)
  let flippedTriangles = 0
  let out = indices
  for (let f = 0; f < triangleCount; f++) {
    const body = triangleBody[f]!
    if ((flip[f] ?? 0) ^ (reverseAll[body] ?? 0)) {
      if (out === indices) out = indices.slice()
      const second = out[f * 3 + 1]!
      out[f * 3 + 1] = out[f * 3 + 2]!
      out[f * 3 + 2] = second
      reoriented[body] = 1
      flippedTriangles++
    }
  }
  return {
    indices: out,
    reorientedBodies: Array.from(reoriented.keys()).filter((b) => reoriented[b]),
    unsignedBodies,
    flippedTriangles,
  }
}
