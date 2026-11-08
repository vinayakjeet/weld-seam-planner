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

// A rectangular hollow section, open at both ends as cut from stock: outer width by height in profile u and v from
// (0, 0), a wall all round, from depth w 0 to length. place maps (u, v, w) to x, y, z.
export function boxTube(width: number, height: number, wall: number, length: number, place: (u: number, v: number, w: number) => number[]): Tri[] {
  const outer: Array<[number, number]> = [[0, 0], [width, 0], [width, height], [0, height]]
  const inner: Array<[number, number]> = [[wall, wall], [width - wall, wall], [width - wall, height - wall], [wall, height - wall]]
  const at = ([u, v]: [number, number], w: number) => place(u, v, w)
  const quad = (a: number[], b: number[], c: number[], d: number[]) => [[...a, ...b, ...c], [...a, ...c, ...d]]
  const tris: Tri[] = []
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    tris.push(...quad(at(outer[i]!, 0), at(outer[j]!, 0), at(outer[j]!, length), at(outer[i]!, length)))
    tris.push(...quad(at(inner[j]!, 0), at(inner[i]!, 0), at(inner[i]!, length), at(inner[j]!, length)))
    tris.push(...quad(at(outer[j]!, 0), at(outer[i]!, 0), at(inner[i]!, 0), at(inner[j]!, 0)))
    tris.push(...quad(at(outer[i]!, length), at(outer[j]!, length), at(inner[j]!, length), at(inner[i]!, length)))
  }
  return tris
}

// A U channel 60 wide and 40 tall with 6 mm walls, open on top (profile in y and z, extruded along x).
export const channel = (length = 600) =>
  extrude(
    [[0, 0], [60, 0], [60, 40], [54, 40], [54, 6], [6, 6], [6, 40], [0, 40]],
    [[0, 1, 4], [0, 4, 5], [1, 2, 3], [1, 3, 4], [0, 5, 6], [0, 6, 7]],
    length,
    (y, z, x) => [x, y, z],
  )

// The T-joint (a 100 x 10 plate, a 10 x 80 web, 200 mm long along x) cut into thin slices along its length, so that a
// single body has as many triangles as a large scan: 16 per slice and 12 for the two end caps.
export function slicedTJoint(slices: number): Tri[] {
  const profile: Array<[number, number]> = [[-50, 0], [50, 0], [50, 10], [5, 10], [5, 90], [-5, 90], [-5, 10], [-50, 10]]
  const caps: Array<[number, number, number]> = [[0, 1, 2], [0, 2, 3], [0, 3, 6], [0, 6, 7], [3, 4, 5], [3, 5, 6]]
  const at = (i: number, x: number) => [x, profile[i]![0], profile[i]![1]]
  const tris: Tri[] = []
  for (const x of [0, 200]) for (const [a, b, c] of caps) tris.push([...at(a, x), ...at(b, x), ...at(c, x)])
  for (let k = 0; k < slices; k++) {
    const [x0, x1] = [(200 * k) / slices, (200 * (k + 1)) / slices]
    profile.forEach((_, i) => {
      const j = (i + 1) % profile.length
      tris.push([...at(i, x0), ...at(j, x0), ...at(j, x1)], [...at(i, x0), ...at(j, x1), ...at(i, x1)])
    })
  }
  return tris
}
