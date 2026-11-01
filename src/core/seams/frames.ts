import { cross, dot, normalize, sub, type Vec3 } from '../math/vec3'
import type { FaceData } from '../mesh/faces'
import type { MeshModel } from '../mesh/model'
import type { Chain } from './chain'
import { resamplePolyline } from './resample'

export interface SeamPoint {
  // Arc length from the start of the seam, in mm.
  s: number
  p: Vec3
  // Unit tangent along the chain direction.
  t: Vec3
  // Unit normals of the two plates meeting at the seam, ordered so that n1 x n2 points along t.
  n1: Vec3
  n2: Vec3
}

// chain.edges index into edgeIds, the crease list the chain was built from.
export function buildSeamPoints(
  chain: Chain,
  edgeIds: Uint32Array,
  model: MeshModel,
  faces: FaceData,
): { points: SeamPoint[]; lengthMm: number } {
  const { positions } = model.mesh
  const ring = chain.closed ? chain.vertices.slice(0, -1) : chain.vertices
  const polyline = ring.map((v): Vec3 => [positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!])
  const resampled = resamplePolyline(polyline, chain.closed)

  const normalOf = (face: number): Vec3 => [faces.normals[face * 3]!, faces.normals[face * 3 + 1]!, faces.normals[face * 3 + 2]!]

  const points = resampled.p.map((p, k): SeamPoint => {
    const segment = resampled.segment[k]!
    const t = normalize(sub(polyline[(segment + 1) % polyline.length]!, polyline[segment]!))
    const edge = edgeIds[chain.edges[segment]!]!
    let n1 = normalOf(model.edges.faceA[edge]!)
    let n2 = normalOf(model.edges.faceB[edge]!)
    if (dot(cross(n1, n2), t) < 0) [n1, n2] = [n2, n1]
    return { s: resampled.s[k]!, p, t, n1, n2 }
  })
  return { points, lengthMm: resampled.length }
}
