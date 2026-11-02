import { Box3, BufferAttribute, BufferGeometry } from 'three'
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
  const { positions, indices } = model.mesh

  const sizes = new Uint32Array(count)
  for (let t = 0; t < triangleBody.length; t++) sizes[triangleBody[t]!]!++
  const lists = Array.from(sizes, (n) => new Uint32Array(n))
  const filled = new Uint32Array(count)
  for (let t = 0; t < triangleBody.length; t++) {
    const body = triangleBody[t]!
    lists[body]![filled[body]!++] = t
  }

  return lists.map((triangles) => {
    const index = new Uint32Array(triangles.length * 3)
    triangles.forEach((t, k) => index.set(indices.subarray(t * 3, t * 3 + 3), k * 3))
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setIndex(new BufferAttribute(index, 1))
    // Indirect keeps the index in triangle order, which the triangles map above relies on.
    const bvh = new MeshBVH(geometry, { indirect: true })
    const box = bvh.getBoundingBox(new Box3())
    return { bvh, triangles, min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] }
  })
}
