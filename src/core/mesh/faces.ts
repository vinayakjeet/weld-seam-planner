import type { IndexedMesh } from './weld'

export interface FaceData {
  normals: Float32Array
  areas: Float32Array
  centroids: Float32Array
}

// Normals come from winding order, never from the normals stored in the STL file. A triangle whose height over its
// longest edge is within the weld tolerance (a needle along a neighbour's edge, such as the fan of a flat cap) has a
// normal that any vertex noise of that size turns anywhere, which reads as a crease; it takes the normal of the
// triangle across its longest edge instead, unless that one is a needle too.
export function computeFaceData(mesh: IndexedMesh): FaceData {
  const { positions, indices, triangleCount } = mesh
  const normals = new Float32Array(triangleCount * 3)
  const areas = new Float32Array(triangleCount)
  const centroids = new Float32Array(triangleCount * 3)

  for (let f = 0; f < triangleCount; f++) {
    const a = indices[f * 3]! * 3
    const b = indices[f * 3 + 1]! * 3
    const c = indices[f * 3 + 2]! * 3
    const ux = positions[b]! - positions[a]!
    const uy = positions[b + 1]! - positions[a + 1]!
    const uz = positions[b + 2]! - positions[a + 2]!
    const vx = positions[c]! - positions[a]!
    const vy = positions[c + 1]! - positions[a + 1]!
    const vz = positions[c + 2]! - positions[a + 2]!
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const double = Math.hypot(nx, ny, nz)
    if (double > 0) {
      normals[f * 3] = nx / double
      normals[f * 3 + 1] = ny / double
      normals[f * 3 + 2] = nz / double
    }
    areas[f] = double / 2
    for (let k = 0; k < 3; k++) {
      centroids[f * 3 + k] = (positions[a + k]! + positions[b + k]! + positions[c + k]!) / 3
    }
  }
  if (mesh.toleranceMm !== undefined && mesh.toleranceMm > 0) borrowNeedleNormals(mesh, mesh.toleranceMm, normals, areas)
  return { normals, areas, centroids }
}

function borrowNeedleNormals(mesh: IndexedMesh, toleranceMm: number, normals: Float32Array, areas: Float32Array): void {
  const { positions, indices, triangleCount, vertexCount } = mesh
  const edge = (f: number, i: number) => [indices[f * 3 + i]!, indices[f * 3 + ((i + 1) % 3)]!] as const
  const length = (a: number, b: number) =>
    Math.hypot(positions[a * 3]! - positions[b * 3]!, positions[a * 3 + 1]! - positions[b * 3 + 1]!, positions[a * 3 + 2]! - positions[b * 3 + 2]!)

  // Each needle with the index of its longest edge.
  const needles = new Map<number, number>()
  for (let f = 0; f < triangleCount; f++) {
    let longest = -1
    let at = 0
    for (let i = 0; i < 3; i++) {
      const [a, b] = edge(f, i)
      const l = length(a, b)
      if (l > longest) {
        longest = l
        at = i
      }
    }
    if (longest > 0 && (2 * areas[f]!) / longest <= toleranceMm) needles.set(f, at)
  }
  if (needles.size === 0) return

  const key = (a: number, b: number) => (a < b ? a * vertexCount + b : b * vertexCount + a)
  const wanted = new Map<number, number[]>()
  for (const [f, i] of needles) {
    const [a, b] = edge(f, i)
    wanted.set(key(a, b), [f])
  }
  for (let g = 0; g < triangleCount; g++) {
    for (let i = 0; i < 3; i++) {
      const [a, b] = edge(g, i)
      const list = wanted.get(key(a, b))
      if (list && list[0] !== g) list.push(g)
    }
  }
  const borrowed: Array<[number, number]> = []
  for (const list of wanted.values()) {
    // A boundary or non-manifold edge has no single neighbour to borrow from.
    if (list.length !== 2 || needles.has(list[1]!)) continue
    borrowed.push([list[0]!, list[1]!])
  }
  for (const [f, g] of borrowed) for (let k = 0; k < 3; k++) normals[f * 3 + k] = normals[g * 3 + k]!
}
