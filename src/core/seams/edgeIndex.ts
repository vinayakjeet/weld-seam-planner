import { add, dot, length, scale, sub, type Vec3 } from '../math/vec3'
import type { MeshModel } from '../mesh/model'

// An edge whose box covers more cells than this is kept in a short list checked on every query instead.
const MAX_CELLS_PER_EDGE = 64

// A uniform grid over a list of mesh edges, for the nearest edge to a click without a pass over all of them. The cell
// side is the mean edge length, so a typical edge sits in a few cells.
export interface EdgeIndex {
  model: MeshModel
  cellMm: number
  cells: Map<string, number[]>
  long: number[]
}

export function buildEdgeIndex(model: MeshModel, edges: Uint32Array): EdgeIndex {
  const { positions } = model.mesh
  const end = (v: number, c: number) => positions[v * 3 + c]!
  let total = 0
  for (const e of edges) {
    const a = model.edges.edgeA[e]!
    const b = model.edges.edgeB[e]!
    total += Math.hypot(end(a, 0) - end(b, 0), end(a, 1) - end(b, 1), end(a, 2) - end(b, 2))
  }
  const cellMm = Math.max(edges.length > 0 ? total / edges.length : 1, 1e-6 * model.bounds.diagonal, 1e-9)
  const cells = new Map<string, number[]>()
  const long: number[] = []
  for (const e of edges) {
    const a = model.edges.edgeA[e]!
    const b = model.edges.edgeB[e]!
    const lo = [0, 1, 2].map((c) => Math.floor(Math.min(end(a, c), end(b, c)) / cellMm))
    const hi = [0, 1, 2].map((c) => Math.floor(Math.max(end(a, c), end(b, c)) / cellMm))
    if ((hi[0]! - lo[0]! + 1) * (hi[1]! - lo[1]! + 1) * (hi[2]! - lo[2]! + 1) > MAX_CELLS_PER_EDGE) {
      long.push(e)
      continue
    }
    for (let i = lo[0]!; i <= hi[0]!; i++) {
      for (let j = lo[1]!; j <= hi[1]!; j++) {
        for (let k = lo[2]!; k <= hi[2]!; k++) {
          const id = `${i},${j},${k}`
          const list = cells.get(id)
          if (list) list.push(e)
          else cells.set(id, [e])
        }
      }
    }
  }
  return { model, cellMm, cells, long }
}

// The nearest point on an indexed edge within radius of p, with its edge, or null. On equal distance the edge with the
// higher id wins, which is what a scan of the list in order gives.
export function nearestEdge(index: EdgeIndex, p: Vec3, radius: number): { point: Vec3; edge: number } | null {
  const { model, cellMm, cells, long } = index
  const { positions } = model.mesh
  const vertex = (v: number): Vec3 => [positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!]
  let best: { point: Vec3; edge: number } | null = null
  let bestDistance = radius
  const seen = new Set<number>()
  const consider = (e: number) => {
    if (seen.has(e)) return
    seen.add(e)
    const a = vertex(model.edges.edgeA[e]!)
    const ab = sub(vertex(model.edges.edgeB[e]!), a)
    const u = Math.min(1, Math.max(0, dot(sub(p, a), ab) / dot(ab, ab)))
    const point = add(a, scale(ab, u))
    const distance = length(sub(p, point))
    if (distance < bestDistance || (distance === bestDistance && (best === null || e > best.edge))) {
      bestDistance = distance
      best = { point, edge: e }
    }
  }
  for (const e of long) consider(e)
  const lo = p.map((x) => Math.floor((x - radius) / cellMm))
  const hi = p.map((x) => Math.floor((x + radius) / cellMm))
  for (let i = lo[0]!; i <= hi[0]!; i++) {
    for (let j = lo[1]!; j <= hi[1]!; j++) {
      for (let k = lo[2]!; k <= hi[2]!; k++) for (const e of cells.get(`${i},${j},${k}`) ?? []) consider(e)
    }
  }
  return best
}
