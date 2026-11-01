import { computeBounds } from './bounds'

export interface IndexedMesh {
  positions: Float32Array
  indices: Uint32Array
  vertexCount: number
  triangleCount: number
}

const WELD_TOLERANCE = 1e-5
// A cell index is at most 1 / WELD_TOLERANCE = 100000 < 2^17, so three of them pack exactly into a double.
const CELLS = 2 ** 17

// Welds vertices that fall in the same grid cell of size 1e-5 x the bounding box diagonal, and drops triangles
// that collapse or are thinner than that tolerance. Cells are measured from the bbox minimum so parts far from
// the origin weld the same way as parts at it.
export function weldVertices(soup: Float32Array): { mesh: IndexedMesh; droppedDegenerate: number } {
  const bounds = computeBounds(soup)
  const tolerance = bounds.diagonal > 0 ? WELD_TOLERANCE * bounds.diagonal : 1
  const [minX, minY, minZ] = bounds.min

  const triangleTotal = soup.length / 9
  const ids = new Map<number, number>()
  const positions = new Float32Array(soup.length)
  const indices = new Uint32Array(triangleTotal * 3)
  const keys = [0, 0, 0]
  let vertexCount = 0
  let kept = 0

  for (let t = 0; t < triangleTotal; t++) {
    const o = t * 9
    for (let v = 0; v < 3; v++) {
      const qx = Math.round((soup[o + v * 3]! - minX) / tolerance)
      const qy = Math.round((soup[o + v * 3 + 1]! - minY) / tolerance)
      const qz = Math.round((soup[o + v * 3 + 2]! - minZ) / tolerance)
      keys[v] = (qx * CELLS + qy) * CELLS + qz
    }
    if (keys[0] === keys[1] || keys[1] === keys[2] || keys[0] === keys[2] || isSliver(soup, o, tolerance)) continue

    for (let v = 0; v < 3; v++) {
      let id = ids.get(keys[v]!)
      if (id === undefined) {
        id = vertexCount++
        ids.set(keys[v]!, id)
        positions.set(soup.subarray(o + v * 3, o + v * 3 + 3), id * 3)
      }
      indices[kept * 3 + v] = id
    }
    kept++
  }

  return {
    mesh: {
      positions: positions.slice(0, vertexCount * 3),
      indices: indices.slice(0, kept * 3),
      vertexCount,
      triangleCount: kept,
    },
    droppedDegenerate: triangleTotal - kept,
  }
}

// Height over the longest edge: collinear points and needles both come out at or below the tolerance.
function isSliver(soup: Float32Array, o: number, tolerance: number): boolean {
  const ux = soup[o + 3]! - soup[o]!
  const uy = soup[o + 4]! - soup[o + 1]!
  const uz = soup[o + 5]! - soup[o + 2]!
  const vx = soup[o + 6]! - soup[o]!
  const vy = soup[o + 7]! - soup[o + 1]!
  const vz = soup[o + 8]! - soup[o + 2]!
  const double = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
  const longest = Math.max(Math.hypot(ux, uy, uz), Math.hypot(vx, vy, vz), Math.hypot(vx - ux, vy - uy, vz - uz))
  return longest === 0 || double / longest <= tolerance
}
