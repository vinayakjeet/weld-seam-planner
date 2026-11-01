import type { EdgeMap } from '../mesh/edgeMap'

// vertices[i] to vertices[i + 1] is edges[i], an index into the edge list given to chainEdges.
// A closed chain repeats its first vertex at the end.
export interface Chain {
  vertices: number[]
  edges: number[]
  closed: boolean
}

// Vertex positions are float32, so a turn angle is only known to about this much.
const TURN_TOLERANCE_DEG = 1e-3

export function edgeEnds(edges: EdgeMap, edgeIds: Uint32Array): Uint32Array {
  const ends = new Uint32Array(edgeIds.length * 2)
  edgeIds.forEach((id, i) => {
    ends[i * 2] = edges.edgeA[id]!
    ends[i * 2 + 1] = edges.edgeB[id]!
  })
  return ends
}

// ends[2i] and ends[2i + 1] are the vertices of edge i. A chain runs through every vertex that has exactly two edges
// and turns by no more than turnBreakDeg, and stops at junctions, dead ends and sharper turns. Chains start at their
// lower end vertex (a loop starts at its lowest vertex and heads toward the lower neighbour) so ids stay stable.
export function chainEdges(positions: Float32Array, ends: Uint32Array, turnBreakDeg: number): Chain[] {
  const edgeCount = ends.length / 2
  const vertexCount = positions.length / 3

  const first = new Uint32Array(vertexCount + 1)
  for (const v of ends) first[v + 1]!++
  for (let v = 0; v < vertexCount; v++) first[v + 1]! += first[v]!
  const fill = first.slice(0, vertexCount)
  const incident = new Uint32Array(ends.length)
  for (let e = 0; e < edgeCount; e++) {
    incident[fill[ends[e * 2]!]!++] = e
    incident[fill[ends[e * 2 + 1]!]!++] = e
  }

  const degree = (v: number) => first[v + 1]! - first[v]!
  const other = (e: number, v: number) => (ends[e * 2] === v ? ends[e * 2 + 1]! : ends[e * 2]!)
  const turnDeg = (v: number, e1: number, e2: number): number => {
    const a = other(e1, v) * 3
    const b = other(e2, v) * 3
    const c = v * 3
    const d1 = [positions[c]! - positions[a]!, positions[c + 1]! - positions[a + 1]!, positions[c + 2]! - positions[a + 2]!]
    const d2 = [positions[b]! - positions[c]!, positions[b + 1]! - positions[c + 1]!, positions[b + 2]! - positions[c + 2]!]
    const cos = (d1[0]! * d2[0]! + d1[1]! * d2[1]! + d1[2]! * d2[2]!) / (Math.hypot(...d1) * Math.hypot(...d2))
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
  }

  const through = new Uint8Array(vertexCount)
  for (let v = 0; v < vertexCount; v++) {
    if (degree(v) !== 2) continue
    const e1 = incident[first[v]!]!
    const e2 = incident[first[v]! + 1]!
    if (turnDeg(v, e1, e2) <= turnBreakDeg + TURN_TOLERANCE_DEG) through[v] = 1
  }

  const nextEdge = (v: number, from: number) => {
    const e1 = incident[first[v]!]!
    return e1 === from ? incident[first[v]! + 1]! : e1
  }

  const visited = new Uint8Array(edgeCount)
  const chains: Chain[] = []

  for (let start = 0; start < vertexCount; start++) {
    if (degree(start) === 0 || through[start]) continue
    for (let i = first[start]!; i < first[start + 1]!; i++) {
      let e = incident[i]!
      if (visited[e]) continue
      const vertices = [start]
      const edges: number[] = []
      let v = start
      for (;;) {
        visited[e] = 1
        edges.push(e)
        v = other(e, v)
        vertices.push(v)
        if (!through[v]) break
        e = nextEdge(v, e)
        if (visited[e]) break
      }
      chains.push(orient({ vertices, edges, closed: v === start }))
    }
  }

  // What is left has no terminal vertex: pure loops of through vertices.
  for (let e0 = 0; e0 < edgeCount; e0++) {
    if (visited[e0]) continue
    const ring = [ends[e0 * 2]!]
    const ringEdges: number[] = []
    let v = ring[0]!
    let e = e0
    do {
      visited[e] = 1
      ringEdges.push(e)
      v = other(e, v)
      if (v !== ring[0]) ring.push(v)
      e = nextEdge(v, e)
    } while (v !== ring[0])
    chains.push(orientLoop(ring, ringEdges))
  }

  return chains
}

function reversed(chain: Chain): Chain {
  return { ...chain, vertices: [...chain.vertices].reverse(), edges: [...chain.edges].reverse() }
}

function orient(chain: Chain): Chain {
  const { vertices } = chain
  const a = vertices[0]!
  const b = vertices[vertices.length - 1]!
  if (a > b) return reversed(chain)
  if (a === b && vertices[1]! > vertices[vertices.length - 2]!) return reversed(chain)
  return chain
}

function orientLoop(ring: number[], ringEdges: number[]): Chain {
  const n = ring.length
  const m = ring.indexOf(Math.min(...ring))
  let vertices = [...ring.slice(m), ...ring.slice(0, m)]
  let edges = [...ringEdges.slice(m), ...ringEdges.slice(0, m)]
  if (vertices[1]! > vertices[n - 1]!) {
    vertices = [vertices[0]!, ...vertices.slice(1).reverse()]
    edges = [...edges].reverse()
  }
  return { vertices: [...vertices, vertices[0]!], edges, closed: true }
}
