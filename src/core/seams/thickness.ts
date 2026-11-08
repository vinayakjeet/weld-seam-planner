import { Box3, DoubleSide, Ray, Vector3 } from 'three'
import type { MeshBVH } from 'three-mesh-bvh'
import { add, cross, dot, normalize, scale, sub, type Vec3 } from '../math/vec3'
import type { PlateThickness } from '../process/filletRules'
import { cornerFaces, MIN_PLATE_MM, thicknessBehind } from './classify'
import type { SeamPoint } from './frames'

// Distance from a point on a plate surface, along direction, through the material to where it leaves. Infinity on a miss.
export type RayProbe = (origin: Vec3, direction: Vec3) => number

const SAMPLE_FRACTIONS = [0.25, 0.5, 0.75]

// Dividing by a power of ten gives the nearest double to the decimal value, so 6.01 stays 6.01.
export const roundDecimals = (value: number, decimals: number): number => Math.round(value * 10 ** decimals) / 10 ** decimals

// The nearest hit over all the given BVHs, one per body or one for the whole mesh.
export function probeFromBvhs(bvhs: MeshBVH[]): RayProbe {
  return (origin, direction) => {
    const back = scale(direction, -1)
    let nearest = Infinity
    for (const bvh of bvhs) nearest = Math.min(nearest, thicknessBehind(bvh, origin, back))
    return nearest
  }
}

const RAY = new Ray()
const BOX = new Box3()
const SIZE = new Vector3()

// The nearest surface along a ray over all the BVHs, and whether the ray enters material there (its outward normal
// faces the ray). The ray starts a hair along, past any surface it starts on.
function nearestSurface(bvhs: MeshBVH[], origin: Vec3, dir: Vec3): { distance: number; entering: boolean } | null {
  let best: { distance: number; entering: boolean } | null = null
  for (const bvh of bvhs) {
    const nudge = Math.max(1e-6, 1e-4 * bvh.getBoundingBox(BOX).getSize(SIZE).length())
    RAY.origin.set(origin[0] + dir[0] * nudge, origin[1] + dir[1] * nudge, origin[2] + dir[2] * nudge)
    RAY.direction.set(dir[0], dir[1], dir[2])
    const hit = bvh.raycastFirst(RAY, DoubleSide)
    if (!hit || (best && hit.distance + nudge >= best.distance)) continue
    const n = hit.face?.normal
    best = { distance: hit.distance + nudge, entering: n ? n.x * dir[0] + n.y * dir[1] + n.z * dir[2] < 0 : false }
  }
  return best
}

// The material round the middle of a plate reading is wider than this share of the reading in every direction across
// the ray. Narrower, and the ray has run along a plate instead of through it: in from the cut end of a wall, or down a
// bar. Measured on a go-kart frame: 8.85 mm along a 3.18 mm wall is 36 percent, a true 3.17 mm wall 1 mm from a tube end
// has 1.5 mm beside it, 47 percent.
const MIN_WIDTH_SHARE = 0.4

function runsThrough(bvhs: MeshBVH[], start: Vec3, dir: Vec3, thicknessMm: number): boolean {
  const middle = add(start, scale(dir, thicknessMm / 2))
  const helper: Vec3 = Math.abs(dir[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const u = normalize(cross(dir, helper))
  const v = cross(dir, u)
  const across: Vec3[] = [u, v, normalize(add(u, v)), normalize(sub(u, v))]
  return across.every((w) => {
    const forth = nearestSurface(bvhs, middle, w)?.distance ?? Infinity
    const back = nearestSurface(bvhs, middle, scale(w, -1))?.distance ?? Infinity
    return forth + back >= MIN_WIDTH_SHARE * thicknessMm
  })
}

// The thickness of the plate a ray crosses, Infinity when the ray runs along a plate instead, since no reading along
// it is a thickness. Two bodies count as touching within the contact tolerance, so a ray started on one can begin in a
// gap above the plate of the other; when the first surface it meets, within maxGapMm, is one it enters, the plate is
// measured from there to the next surface of any body (a bore an exporter wrote as a body of its own included).
// Otherwise it is the distance to the first surface, as probeFromBvhs gives.
export function plateProbeFromBvhs(bvhs: MeshBVH[], maxGapMm: number): RayProbe {
  return (origin, direction) => {
    const first = nearestSurface(bvhs, origin, direction)
    if (!first) return Infinity
    if (!first.entering || first.distance > maxGapMm) return runsThrough(bvhs, origin, direction, first.distance) ? first.distance : Infinity
    const entry = add(origin, scale(direction, first.distance))
    const thickness = nearestSurface(bvhs, entry, direction)?.distance ?? Infinity
    return Number.isFinite(thickness) && runsThrough(bvhs, entry, direction, thickness) ? thickness : Infinity
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

// Thickness of the two plates at a seam, in the order of the seam's n1 and n2. Three samples at 25, 50 and 75 percent
// of the arc length; at each, a ray starts offsetMm along the face, perpendicular to the seam and away from the other
// plate, and runs through the plate along minus the face normal. Outside corners use cornerThickness.
export function seamThickness(points: SeamPoint[], probe: RayProbe, offsetMm = 1): PlateThickness {
  if (points.length === 0) return [null, null]
  const found: [number[], number[]] = [[], []]
  for (const { p, t, n1, n2 } of stationsOf(points)) {
    const faces: Array<[Vec3, Vec3]> = [[n1, n2], [n2, n1]]
    faces.forEach(([normal, other], k) => {
      let along = normalize(cross(t, normal))
      if (along[0] === 0 && along[1] === 0 && along[2] === 0) return
      const towardOther = dot(along, other)
      if (towardOther < 0) along = scale(along, -1)
      const origin: Vec3 = [p[0] + along[0] * offsetMm, p[1] + along[1] * offsetMm, p[2] + along[2] * offsetMm]
      const distance = probe(origin, scale(normal, -1))
      // Under the thinnest plate the ray met a sliver or an edge; unknown is the honest answer, and pre-flight warns of it.
      if (Number.isFinite(distance) && distance >= MIN_PLATE_MM) found[k]!.push(distance)
    })
  }
  const [a, b] = [median(found[0]), median(found[1])]
  return [a === null ? null : roundDecimals(a, 2), b === null ? null : roundDecimals(b, 2)]
}

// Between two samples whose tangents differ by more than this a corner lies at the second one: a corner of a loop
// welded all round a member end (see resamplePolyline). A detected chain never turns this far.
const CORNER_COS = Math.cos((40 * Math.PI) / 180)

// The samples at 25, 50 and 75 percent, or on a seam with corners the middle of every side: near a corner a ray through
// one plate runs down the wall of the other, and off a side flush with the other member it meets nothing.
function stationsOf(points: SeamPoint[]): SeamPoint[] {
  const corners: number[] = []
  for (let i = 1; i < points.length; i++) if (dot(points[i - 1]!.t, points[i]!.t) < CORNER_COS) corners.push(i)
  if (corners.length === 0) return SAMPLE_FRACTIONS.map((f) => points[Math.round(f * (points.length - 1))]!)
  const stops = [0, ...corners, points.length]
  return stops.slice(1).map((to, k) => points[Math.floor((stops[k]! + to - 1) / 2)]!)
}

// Thickness of the two plates of an outside corner, in the order of n1 and n2. Next to the edge a ray behind either face
// runs through the other plate and reads its extent, so each plate is measured across the span of its own face, at
// 25, 50 and 75 percent of the arc length, and the median kept.
export function cornerThickness(points: SeamPoint[], probe: RayProbe, depthMm: number): PlateThickness {
  if (points.length === 0) return [null, null]
  const found: [number[], number[]] = [[], []]
  for (const fraction of SAMPLE_FRACTIONS) {
    const faces = cornerFaces(points[Math.round(fraction * (points.length - 1))]!, probe, depthMm)
    faces?.forEach(({ thicknessMm }, k) => {
      if (Number.isFinite(thicknessMm) && thicknessMm >= MIN_PLATE_MM) found[k as 0 | 1].push(thicknessMm)
    })
  }
  const [a, b] = [median(found[0]), median(found[1])]
  return [a === null ? null : roundDecimals(a, 2), b === null ? null : roundDecimals(b, 2)]
}
