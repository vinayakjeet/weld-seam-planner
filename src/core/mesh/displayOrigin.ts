import type { Vec3 } from '../math/vec3'

// Within this distance of the file's origin a part is drawn in its own coordinates.
const NEAR_MM = 10_000
const ROUND_MM = 1000

// The point the viewport draws relative to. Buffers hold float32, which far from the origin loses the detail of a
// weld and makes the picture shimmer as the camera moves, so a part far out is drawn relative to the centre of its box
// (rounded to the metre) inside a group placed there; three.js composes that placement in float64.
export function displayOrigin(bbox: { min: Vec3; max: Vec3 } | null): Vec3 {
  if (!bbox) return [0, 0, 0]
  const far = [0, 1, 2].some((c) => Math.max(Math.abs(bbox.min[c]!), Math.abs(bbox.max[c]!)) > NEAR_MM)
  if (!far) return [0, 0, 0]
  return [0, 1, 2].map((c) => Math.round((bbox.min[c]! + bbox.max[c]!) / 2 / ROUND_MM) * ROUND_MM) as Vec3
}

export const toLocal = (p: Vec3, origin: Vec3): Vec3 => [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]]

// Flat x, y, z values in world coordinates (as numbers, before any float32 rounding) to a float32 array relative to the origin.
export function toLocalArray(values: ArrayLike<number>, origin: Vec3): Float32Array {
  const out = new Float32Array(values.length)
  for (let i = 0; i < values.length; i++) out[i] = values[i]! - origin[i % 3]!
  return out
}
