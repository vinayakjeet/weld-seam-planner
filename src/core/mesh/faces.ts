import type { IndexedMesh } from './weld'

export interface FaceData {
  normals: Float32Array
  areas: Float32Array
  centroids: Float32Array
}

// Normals come from winding order, never from the normals stored in the STL file.
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
  return { normals, areas, centroids }
}
