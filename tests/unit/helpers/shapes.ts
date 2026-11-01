import type { Tri } from './stl'

// Outward facing unit-cube quads, counter-clockwise seen from outside.
const QUADS: number[][][] = [
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
  [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
]

export function cubeTriangles(min: number[], size: number[]): Tri[] {
  const at = (p: number[]) => [0, 1, 2].map((c) => min[c]! + p[c]! * size[c]!)
  return QUADS.flatMap(([a, b, c, d]) => [
    [...at(a!), ...at(b!), ...at(c!)],
    [...at(a!), ...at(c!), ...at(d!)],
  ])
}

export function soupOf(tris: Tri[]): Float32Array {
  return Float32Array.from(tris.flat())
}
