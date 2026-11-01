export interface EdgeMap {
  vertexCount: number
  edgeCount: number
  keyToEdge: Map<number, number>
  // Per edge: its two vertices (edgeA < edgeB), the first two triangles using it (faceB is -1 on a boundary edge),
  // and how many triangles use it in total.
  edgeA: Uint32Array
  edgeB: Uint32Array
  faceA: Int32Array
  faceB: Int32Array
  useCount: Uint32Array
  stats: { boundary: number; manifold: number; nonManifold: number }
}

// Numeric key a * N + b with the lower vertex first; exact in a double while N * N stays under 2^53.
export function edgeKey(a: number, b: number, vertexCount: number): number {
  return a < b ? a * vertexCount + b : b * vertexCount + a
}

export function buildEdgeMap(indices: Uint32Array, vertexCount: number): EdgeMap {
  const faceTotal = indices.length / 3
  const slots = faceTotal * 3
  const keyToEdge = new Map<number, number>()
  const edgeA = new Uint32Array(slots)
  const edgeB = new Uint32Array(slots)
  const faceA = new Int32Array(slots)
  const faceB = new Int32Array(slots).fill(-1)
  const useCount = new Uint32Array(slots)
  let edgeCount = 0

  for (let f = 0; f < faceTotal; f++) {
    for (let k = 0; k < 3; k++) {
      const a = indices[f * 3 + k]!
      const b = indices[f * 3 + ((k + 1) % 3)]!
      const key = edgeKey(a, b, vertexCount)
      let e = keyToEdge.get(key)
      if (e === undefined) {
        e = edgeCount++
        keyToEdge.set(key, e)
        edgeA[e] = Math.min(a, b)
        edgeB[e] = Math.max(a, b)
        faceA[e] = f
      } else if (useCount[e] === 1) {
        faceB[e] = f
      }
      useCount[e]!++
    }
  }

  const stats = { boundary: 0, manifold: 0, nonManifold: 0 }
  for (let e = 0; e < edgeCount; e++) {
    const uses = useCount[e]!
    if (uses === 1) stats.boundary++
    else if (uses === 2) stats.manifold++
    else stats.nonManifold++
  }

  return {
    vertexCount,
    edgeCount,
    keyToEdge,
    edgeA: edgeA.slice(0, edgeCount),
    edgeB: edgeB.slice(0, edgeCount),
    faceA: faceA.slice(0, edgeCount),
    faceB: faceB.slice(0, edgeCount),
    useCount: useCount.slice(0, edgeCount),
    stats,
  }
}
