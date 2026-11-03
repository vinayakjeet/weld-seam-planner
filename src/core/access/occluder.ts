import { DoubleSide, Ray } from 'three'
import type { MeshBVH } from 'three-mesh-bvh'
import type { Occluder } from './clearance'

// Double sided because the winding of an unsigned or repaired body cannot be trusted for a visibility test.
export function occluderFromBvh(bvh: MeshBVH): Occluder {
  const ray = new Ray()
  return (origin, dir, maxMm) => {
    ray.origin.set(origin[0], origin[1], origin[2])
    ray.direction.set(dir[0], dir[1], dir[2])
    const hit = bvh.raycastFirst(ray, DoubleSide, 0, maxMm)
    return hit ? hit.distance : Infinity
  }
}
