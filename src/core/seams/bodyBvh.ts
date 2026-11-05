import { Box3, BufferAttribute, BufferGeometry, DoubleSide, Ray, Vector3 } from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import type { Vec3 } from '../math/vec3'
import type { MeshModel } from '../mesh/model'

export interface BodyBvh {
  bvh: MeshBVH
  // Global triangle id for each triangle of this body, so a BVH face index maps back to the whole mesh.
  triangles: Uint32Array
  min: Vec3
  max: Vec3
}

// One BVH per body, indexed like model.bodies. A single body has nothing to touch or cross, so it builds nothing.
export function buildBodyBvhs(model: MeshModel): BodyBvh[] {
  const { count, triangleBody } = model.bodies
  if (count < 2) return []

  const sizes = new Uint32Array(count)
  for (let t = 0; t < triangleBody.length; t++) sizes[triangleBody[t]!]!++
  const lists = Array.from(sizes, (n) => new Uint32Array(n))
  const filled = new Uint32Array(count)
  for (let t = 0; t < triangleBody.length; t++) {
    const body = triangleBody[t]!
    lists[body]![filled[body]!++] = t
  }

  return lists.map((triangles) => indexTriangles(model, triangles))
}

// One BVH over the whole mesh: the rays of detection on a single-body part, and access, reach and drawing on any part.
// Built only on demand, never for detection of contact or intersection.
export function buildWholeBvh(model: MeshModel): BodyBvh {
  return indexTriangles(model, Uint32Array.from({ length: model.mesh.triangleCount }, (_, t) => t))
}

// The whole-mesh BVH for a single-body part, or null for a multi-body part, which has body BVHs.
export function wholeBvhFor(model: MeshModel): BodyBvh | null {
  return model.bodies.count > 1 ? null : buildWholeBvh(model)
}

export interface SharedWhole {
  // The model with its positions and indices moved into shared memory (same values).
  model: MeshModel
  whole: BodyBvh
}

// The whole-mesh BVH built over copies of the model's arrays that live in SharedArrayBuffers, so the page can use the
// same positions, indices and tree for picking while the worker uses them for rays. Indirect, so the index keeps the
// triangle order of the model and a hit's face index is a triangle of the model.
export function buildSharedWholeBvh(model: MeshModel, onProgress?: (fraction: number) => void): SharedWhole {
  const positions = new Float32Array(new SharedArrayBuffer(model.mesh.positions.byteLength))
  positions.set(model.mesh.positions)
  const indices = new Uint32Array(new SharedArrayBuffer(model.mesh.indices.byteLength))
  indices.set(model.mesh.indices)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  const bvh = new MeshBVH(geometry, { indirect: true, useSharedArrayBuffer: true, onProgress })
  const triangles = Uint32Array.from({ length: model.mesh.triangleCount }, (_, t) => t)
  return { model: { ...model, mesh: { ...model.mesh, positions, indices } }, whole: bodyBvhOf(bvh, triangles) }
}

function bodyBvhOf(bvh: MeshBVH, triangles: Uint32Array): BodyBvh {
  const box = bvh.getBoundingBox(new Box3())
  return { bvh, triangles, min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] }
}

function indexTriangles(model: MeshModel, triangles: Uint32Array): BodyBvh {
  const { positions, indices } = model.mesh
  const index = new Uint32Array(triangles.length * 3)
  triangles.forEach((t, k) => index.set(indices.subarray(t * 3, t * 3 + 3), k * 3))
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(new BufferAttribute(index, 1))
  // Indirect keeps the index in triangle order, which the triangles map relies on.
  return bodyBvhOf(new MeshBVH(geometry, { indirect: true }), triangles)
}

// Not along any axis or any likely face, so the ray does not run along a plate or through an edge.
const PARITY_RAY = new Ray(undefined, new Vector3(0.5373, 0.2961, 0.7899).normalize())

// Inside a union of closed solids a ray crosses the surface an odd number of times on its way out. Coincident faces
// of fused solids are two crossings, one per solid, so the count does not depend on winding.
export function insideByParity(bvh: MeshBVH, p: Vec3): boolean {
  PARITY_RAY.origin.set(p[0], p[1], p[2])
  return bvh.raycast(PARITY_RAY, DoubleSide).length % 2 === 1
}
