import { BufferAttribute, BufferGeometry, Mesh } from 'three'
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh'
import type { DisplayData } from '../../worker/geometry.api'

// Registered once for every Mesh, so any mesh whose geometry has a boundsTree ray casts through it.
Mesh.prototype.raycast = acceleratedRaycast

// The arrays are used in place and the BVH is restored over them (setIndex: false because the worker already
// stored the triangles in BVH order), so nothing is rebuilt or copied on the main thread.
export function buildDisplayGeometry(display: DisplayData): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(display.positions, 3))
  geometry.setIndex(new BufferAttribute(display.indices, 1))
  geometry.boundsTree = MeshBVH.deserialize(display.bvh, geometry, { setIndex: false })
  geometry.computeBoundingSphere()
  return geometry
}
