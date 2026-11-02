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

type Profile = Array<[number, number]>
type CapTriangles = Array<[number, number, number]>

// Extrudes a polygon profile into a closed solid. place maps (profile u, profile v, depth w) to x, y, z. The cap is
// triangulated by hand so that every cap edge is a polygon edge; winding is left to the importer's repair.
export function extrude(profile: Profile, cap: CapTriangles, depth: number, place: (u: number, v: number, w: number) => number[]): number[][] {
  const at = (i: number, w: number) => place(profile[i]![0], profile[i]![1], w)
  const tris: number[][] = []
  for (const w of [0, depth]) for (const [a, b, c] of cap) tris.push([...at(a, w), ...at(b, w), ...at(c, w)])
  profile.forEach((_, i) => {
    const j = (i + 1) % profile.length
    tris.push([...at(i, 0), ...at(j, 0), ...at(j, depth)], [...at(i, 0), ...at(j, depth), ...at(i, depth)])
  })
  return tris
}

// A 100 x 60 x 10 plate lapped by another over 40 mm, as one body (profile in x and z, extruded along y).
export const steppedLap = () =>
  extrude(
    [[0, 0], [100, 0], [100, 10], [160, 10], [160, 20], [60, 20], [60, 10], [0, 10]],
    [[0, 1, 6], [0, 6, 7], [1, 2, 6], [5, 6, 2], [5, 2, 3], [5, 3, 4]],
    60,
    (x, z, y) => [x, y, z],
  )

// A 10 mm web 80 mm tall on a 10 mm plate that reaches only 8 mm past the web on each side (profile in y and z).
export const narrowFlangeT = () =>
  extrude(
    [[0, 0], [26, 0], [26, 10], [18, 10], [18, 90], [8, 90], [8, 10], [0, 10]],
    [[0, 1, 2], [0, 2, 3], [0, 3, 6], [0, 6, 7], [3, 4, 5], [3, 5, 6]],
    100,
    (y, z, x) => [x, y, z],
  )
