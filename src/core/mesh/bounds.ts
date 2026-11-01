import type { Vec3 } from '../math/vec3'

export interface Bounds {
  min: Vec3
  max: Vec3
  diagonal: number
  maxDimension: number
}

// positions is a flat x, y, z list, so it works on a triangle soup and on an indexed vertex array alike.
export function computeBounds(positions: Float32Array): Bounds {
  if (positions.length === 0) return { min: [0, 0, 0], max: [0, 0, 0], diagonal: 0, maxDimension: 0 }
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      const value = positions[i + c]!
      if (value < min[c]!) min[c] = value
      if (value > max[c]!) max[c] = value
    }
  }
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  return { min, max, diagonal: Math.hypot(size[0]!, size[1]!, size[2]!), maxDimension: Math.max(...size) }
}
