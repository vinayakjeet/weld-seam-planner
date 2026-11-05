import type { Vec3 } from '../math/vec3'
import type { FaceData } from './faces'
import type { MeshModel } from './model'

// Above this many segments the outline is not drawn: it would cost more to draw than it adds.
export const MAX_FEATURE_SEGMENTS = 500_000

// The part's outline for the eye: every edge where two faces meet at thresholdDeg or more, every boundary edge and
// every non-manifold edge, as the 6 floats per segment a line set takes, relative to the display origin. An empty
// array when there are more than MAX_FEATURE_SEGMENTS.
export function featureEdgePositions(model: MeshModel, faces: FaceData, thresholdDeg: number, origin: Vec3): Float32Array {
  const { edges, mesh } = model
  const { normals } = faces
  const { positions } = mesh
  const cosLimit = Math.cos((thresholdDeg * Math.PI) / 180)
  const chosen: number[] = []
  for (let e = 0; e < edges.edgeCount; e++) {
    if (edges.useCount[e] === 2) {
      const a = edges.faceA[e]! * 3
      const b = edges.faceB[e]! * 3
      if (normals[a]! * normals[b]! + normals[a + 1]! * normals[b + 1]! + normals[a + 2]! * normals[b + 2]! > cosLimit) continue
    }
    chosen.push(e)
    if (chosen.length > MAX_FEATURE_SEGMENTS) return new Float32Array(0)
  }
  const out = new Float32Array(chosen.length * 6)
  chosen.forEach((e, k) => {
    for (const [end, v] of [[0, edges.edgeA[e]!], [1, edges.edgeB[e]!]] as const) {
      for (let c = 0; c < 3; c++) out[k * 6 + end * 3 + c] = positions[v * 3 + c]! - origin[c]!
    }
  })
  return out
}
