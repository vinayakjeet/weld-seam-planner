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

// Dense shell numbers per triangle, the shells being joined through edges with two faces.
function shellsOf(triangleCount: number, edges: EdgeMap): { shell: Uint32Array; shellCount: number } {
  const parent = Uint32Array.from({ length: triangleCount }, (_, f) => f)
  const find = (f: number): number => {
    while (parent[f] !== f) {
      parent[f] = parent[parent[f]!]!
      f = parent[f]!
    }
    return f
  }
  for (let e = 0; e < edges.edgeCount; e++) {
    if (edges.useCount[e] !== 2) continue
    const [a, b] = [find(edges.faceA[e]!), find(edges.faceB[e]!)]
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b)
  }
  const number = new Int32Array(triangleCount).fill(-1)
  const shell = new Uint32Array(triangleCount)
  let shellCount = 0
  for (let f = 0; f < triangleCount; f++) {
    const root = find(f)
    if (number[root] === -1) number[root] = shellCount++
    shell[f] = number[root]!
  }
  return { shell, shellCount }
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
// Per body: make neighbouring triangles agree (a shared edge must be walked in opposite directions), then make the
// signed volume of each shell positive. A shell is the triangles joined through edges with two faces. A body has a known
// sign when it has no open edge and every shell is closed by itself: two solids an exporter wrote with one edge in
// common give that edge four faces, two from each shell. Other bodies keep their relative winding repaired where
// possible but have no known sign. Flipping a triangle never changes the edge map, so it stays valid.
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

  const { shell, shellCount } = shellsOf(triangleCount, edges)
  // A shell is closed by itself when it uses each edge with more than two faces exactly twice.
  const shellCut = new Uint8Array(count)
  if (nonManifold.includes(1)) {
    const uses = new Map<number, number>()
    for (let f = 0; f < triangleCount; f++) {
      if (!nonManifold[triangleBody[f]!]) continue
      for (let k = 0; k < 3; k++) {
        const e = edges.keyToEdge.get(edgeKey(indices[f * 3 + k]!, indices[f * 3 + ((k + 1) % 3)]!, vertexCount))!
        if (edges.useCount[e]! <= 2) continue
        const key = e * shellCount + shell[f]!
        uses.set(key, (uses.get(key) ?? 0) + 1)
      }
    }
    for (const [key, n] of uses) if (n !== 2) shellCut[triangleBody[edges.faceA[Math.floor(key / shellCount)]!]!] = 1
  }

  const volume = new Float64Array(shellCount)
  const magnitude = new Float64Array(shellCount)
  const origin = new Float64Array(shellCount * 3)
  const started = new Uint8Array(shellCount)
  const shellBody = new Uint32Array(shellCount)
  for (let f = 0; f < triangleCount; f++) {
    const body = triangleBody[f]!
    const s = shell[f]!
    shellBody[s] = body
    if (open[body] || shellCut[body] || conflict[body]) continue
    const [a, b, c] = [0, 1, 2].map((k) => indices[f * 3 + k]! * 3) as [number, number, number]
    if (!started[s]) {
      started[s] = 1
      for (let k = 0; k < 3; k++) origin[s * 3 + k] = positions[a + k]!
    }
    const p = (v: number, k: number) => positions[v + k]! - origin[s * 3 + k]!
    const det =
      p(a, 0) * (p(b, 1) * p(c, 2) - p(b, 2) * p(c, 1)) -
      p(a, 1) * (p(b, 0) * p(c, 2) - p(b, 2) * p(c, 0)) +
      p(a, 2) * (p(b, 0) * p(c, 1) - p(b, 1) * p(c, 0))
    volume[s]! += (flip[f] ? -det : det) / 6
    magnitude[s]! += Math.abs(det) / 6
  }

  const unsigned = Uint8Array.from({ length: count }, (_, body) => (open[body] || shellCut[body] || conflict[body] ? 1 : 0))
  // A closed shell whose volume nearly cancels has no inside to speak of, and neither has its body.
  for (let s = 0; s < shellCount; s++) if (Math.abs(volume[s]!) <= 1e-6 * magnitude[s]!) unsigned[shellBody[s]!] = 1
  const unsignedBodies = Array.from(unsigned.keys()).filter((b) => unsigned[b])

  const reoriented = new Uint8Array(count)
  let flippedTriangles = 0
  let out = indices
  for (let f = 0; f < triangleCount; f++) {
    const body = triangleBody[f]!
    const reverseShell = !unsigned[body] && volume[shell[f]!]! < 0 ? 1 : 0
    if ((flip[f] ?? 0) ^ reverseShell) {
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
