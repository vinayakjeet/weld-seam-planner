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

// A box whose six faces are each a k x k grid of quads: 12 k^2 triangles, still one closed body.
export function gridBoxTriangles(size: number[], k: number): Tri[] {
  const tris: Tri[] = []
  for (const [a, b, , d] of QUADS) {
    const at = (i: number, j: number) =>
      [0, 1, 2].map((ax) => (a![ax]! + (b![ax]! - a![ax]!) * (i / k) + (d![ax]! - a![ax]!) * (j / k)) * size[ax]!)
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        tris.push([...at(i, j), ...at(i + 1, j), ...at(i + 1, j + 1)], [...at(i, j), ...at(i + 1, j + 1), ...at(i, j + 1)])
      }
    }
  }
  return tris
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

// A 100 x 60 x 10 plate lapped by another 100 mm long over 40 mm, as one body (profile in x and z, extruded along y).
// The plate thicknesses, the plate length and the overlap can be changed; the depth stays 60.
export const steppedLap = ({ lower = 10, upper = 10, length = 100, overlap = 40 } = {}) => {
  const start = length - overlap
  const end = start + length
  return extrude(
    [[0, 0], [length, 0], [length, lower], [end, lower], [end, lower + upper], [start, lower + upper], [start, lower], [0, lower]],
    [[0, 1, 6], [0, 6, 7], [1, 2, 6], [5, 6, 2], [5, 2, 3], [5, 3, 4]],
    60,
    (x, z, y) => [x, y, z],
  )
}

// Two 10 mm plates 100 mm long joined end on end into an L as one body, 60 mm deep (profile in x and z, extruded
// along y). The heel at x 0, z 0 is the outside corner of the joint; the inside corner at x 10, z 10 is its fillet.
export const mergedL = (depth = 60) =>
  extrude(
    [[0, 0], [100, 0], [100, 10], [10, 10], [10, 100], [0, 100]],
    [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 5]],
    depth,
    (x, z, y) => [x, y, z],
  )

// A 10 mm web 80 mm tall on a 100 x 100 x 10 plate as two closed solids that an exporter fused: the plate's top face is
// cut along the foot of the web, so the two long foot edges and the two short ones at the ends each carry four faces.
// Winding comes from the extrusion, so it is not consistent.
export const fusedSolidT = () => [
  ...extrude([[-50, 0], [50, 0], [50, 10], [5, 10], [-5, 10], [-50, 10]], [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 5]], 100, (y, z, x) => [x, y, z]),
  ...extrude([[-5, 10], [5, 10], [5, 90], [-5, 90]], [[0, 1, 2], [0, 2, 3]], 100, (y, z, x) => [x, y, z]),
]

// A 10 mm web 80 mm tall on a 10 mm plate that reaches only 8 mm past the web on each side (profile in y and z).
export const narrowFlangeT = () =>
  extrude(
    [[0, 0], [26, 0], [26, 10], [18, 10], [18, 90], [8, 90], [8, 10], [0, 10]],
    [[0, 1, 2], [0, 2, 3], [0, 3, 6], [0, 6, 7], [3, 4, 5], [3, 5, 6]],
    100,
    (y, z, x) => [x, y, z],
  )
