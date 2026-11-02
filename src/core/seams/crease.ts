import type { FaceData } from '../mesh/faces'
import type { MeshModel } from '../mesh/model'

export interface CreaseEdges {
  edgeIds: Uint32Array
  dihedralDeg: Float32Array
  // 1 where the edge lies in a body with no known inside, so concave and convex edges could not be told apart.
  unknown: Uint8Array
}

export interface CreaseResult extends CreaseEdges {
  // Convex counterparts (outside corners), found in the same pass. Never holds an edge of an unsigned body.
  convex: CreaseEdges
}

// Concave manifold edges whose faces turn by at least creaseAngleDeg. Boundary and non-manifold edges are never
// returned. Concave means face B bends toward the side face A's normal points to: (cB - m) . nA > eps.
// In a body with no known sign (open, non-manifold, not orientable) concavity cannot be read from winding, so every
// edge that turns enough is returned, marked unknown.
export function extractCreaseEdges(model: MeshModel, faces: FaceData, creaseAngleDeg: number): CreaseResult {
  const { edges, mesh, bounds } = model
  const { normals, centroids } = faces
  const { positions } = mesh
  const cosThreshold = Math.cos((creaseAngleDeg * Math.PI) / 180)
  const epsilon = 1e-6 * bounds.diagonal

  const unsigned = new Uint8Array(model.bodies.count)
  for (const body of model.orientation.unsignedBodies) unsigned[body] = 1

  const edgeIds: number[] = []
  const dihedral: number[] = []
  const unknown: number[] = []
  const convexIds: number[] = []
  const convexDihedral: number[] = []
  for (let e = 0; e < edges.edgeCount; e++) {
    if (edges.useCount[e] !== 2) continue
    const fa = edges.faceA[e]! * 3
    const fb = edges.faceB[e]! * 3
    const cos = normals[fa]! * normals[fb]! + normals[fa + 1]! * normals[fb + 1]! + normals[fa + 2]! * normals[fb + 2]!
    if (cos > cosThreshold) continue

    const a = edges.edgeA[e]! * 3
    const b = edges.edgeB[e]! * 3
    const outward =
      (centroids[fb]! - (positions[a]! + positions[b]!) / 2) * normals[fa]! +
      (centroids[fb + 1]! - (positions[a + 1]! + positions[b + 1]!) / 2) * normals[fa + 1]! +
      (centroids[fb + 2]! - (positions[a + 2]! + positions[b + 2]!) / 2) * normals[fa + 2]!
    const noSign = unsigned[model.bodies.triangleBody[edges.faceA[e]!]!] === 1
    const degrees = (Math.acos(Math.max(-1, cos)) * 180) / Math.PI
    if (!noSign && outward <= epsilon) {
      if (outward < -epsilon) {
        convexIds.push(e)
        convexDihedral.push(degrees)
      }
      continue
    }

    edgeIds.push(e)
    dihedral.push(degrees)
    unknown.push(noSign ? 1 : 0)
  }
  return {
    edgeIds: Uint32Array.from(edgeIds),
    dihedralDeg: Float32Array.from(dihedral),
    unknown: Uint8Array.from(unknown),
    convex: {
      edgeIds: Uint32Array.from(convexIds),
      dihedralDeg: Float32Array.from(convexDihedral),
      unknown: new Uint8Array(convexIds.length),
    },
  }
}
