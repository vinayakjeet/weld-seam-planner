import { DoubleSide, Plane, Ray, Vector3 } from 'three'
import type { MeshBVH } from 'three-mesh-bvh'
import { add, cross, dot, length, normalize, scale, sub, type Vec3 } from '../math/vec3'
import { COMPACT_SHARE, loopSides, MEMBER_DEPTH_SHARE } from './allAround'
import { insideByParity } from './bodyBvh'
import type { SeamPoint } from './frames'
import { probeFromBvhs } from './thickness'

export interface LoopSeed {
  points: Array<Pick<SeamPoint, 'p' | 'n1' | 'n2'>>
  lengthMm: number
}

export interface MemberLoop {
  // On the surface the member stands on, without a repeated first point.
  polyline: Vec3[]
  // Normal of the member's wall along each segment of the polyline, and of the surface.
  walls: Vec3[]
  surface: Vec3
  // Areas of the wall triangles along the loop.
  areas: number[]
  // The seeds the loop runs along, as indices.
  uses: number[]
}

export interface MemberLoopOptions {
  // How far above the surface the member is cut: clear of a sliver gap under a tilted tube end, small against any wall.
  offsetMm: number
  turnBreakDeg: number
}

// Past this many times its longest side, a surface that a member with one crease stands on is that member running on.
const SURFACE_END_RATIO = 2
const SEED_NEAR_OFFSETS = 4
// A side whose wall lies this close to the surface is a sliver of the surface, not a wall.
const FLAT_COS = 0.95
const SAME_NORMAL_COS = 0.99
const COLLINEAR_COS = 1 - 1e-9

interface Slice {
  from: Vec3
  to: Vec3
  wall: Vec3
  area: number
}

// Where the edge a to b crosses a plane. The ends are taken in one order, so that the two triangles on an edge give
// the same point to the last bit and the cut chains by exact match.
function crossing(a: Vec3, da: number, b: Vec3, db: number): Vec3 {
  const swap = a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])))
  const [p, dp, q, dq] = swap ? [b, db, a, da] : [a, da, b, db]
  const f = dp / (dp - dq)
  return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f]
}

// The surface of a body cut by a plane. Each piece runs with the material on its left, seen from the normal's side, so
// the outline of a solid runs counter-clockwise and a hole clockwise.
function sliceBody(bvh: MeshBVH, origin: Vec3, normal: Vec3): Slice[] {
  const plane = new Plane(new Vector3(normal[0], normal[1], normal[2]), -dot(normal, origin))
  const slices: Slice[] = []
  bvh.shapecast({
    intersectsBounds: (box) => plane.intersectsBox(box),
    intersectsTriangle: (tri) => {
      const corners = [tri.a, tri.b, tri.c].map((v): Vec3 => [v.x, v.y, v.z])
      const heights = corners.map((c) => dot(normal, sub(c, origin)))
      const cuts: Vec3[] = []
      for (let k = 0; k < 3; k++) {
        const j = (k + 1) % 3
        if (heights[k]! >= 0 !== heights[j]! >= 0) cuts.push(crossing(corners[k]!, heights[k]!, corners[j]!, heights[j]!))
      }
      if (cuts.length !== 2) return false
      const raw = cross(sub(corners[1]!, corners[0]!), sub(corners[2]!, corners[0]!))
      const wall = normalize(raw)
      const [a, b] = dot(sub(cuts[1]!, cuts[0]!), cross(normal, wall)) >= 0 ? [cuts[0]!, cuts[1]!] : [cuts[1]!, cuts[0]!]
      slices.push({ from: a, to: b, wall, area: length(raw) / 2 })
      return false
    },
  })
  return slices
}

const keyOf = (p: Vec3) => `${p[0]},${p[1]},${p[2]}`

function segmentDistance(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a)
  const span = dot(ab, ab)
  const f = span === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / span))
  return length(sub(p, add(a, scale(ab, f))))
}

// The closed outline of the cut that passes nearest to a point, or null when it does not close.
function outlineAt(slices: Slice[], near: Vec3, reachMm: number): Slice[] | null {
  let start: Slice | null = null
  let best = reachMm
  for (const slice of slices) {
    const d = segmentDistance(near, slice.from, slice.to)
    if (d <= best) [best, start] = [d, slice]
  }
  if (!start) return null
  const next = new Map<string, Slice>()
  for (const slice of slices) next.set(keyOf(slice.from), slice)
  const end = keyOf(start.from)
  const outline: Slice[] = [start]
  for (let cur = start; keyOf(cur.to) !== end; outline.push(cur)) {
    const following = next.get(keyOf(cur.to))
    if (!following || outline.length > slices.length) return null
    cur = following
  }
  return outline
}

// Long straight sides come out of the cut in as many pieces as they cross triangles.
function mergeCollinear(outline: Slice[]): Slice[] {
  const solid = outline.filter((s) => length(sub(s.to, s.from)) > 0)
  const merged: Slice[] = []
  for (const slice of solid) {
    const last = merged[merged.length - 1]
    if (last && dot(normalize(sub(last.to, last.from)), normalize(sub(slice.to, slice.from))) > COLLINEAR_COS) last.to = slice.to
    else merged.push({ ...slice })
  }
  const [first, last] = [merged[0], merged[merged.length - 1]]
  if (first && last && first !== last && dot(normalize(sub(last.to, last.from)), normalize(sub(first.to, first.from))) > COLLINEAR_COS) {
    first.from = last.from
    merged.pop()
  }
  return merged
}

function signedArea(ring: Vec3[], normal: Vec3): number {
  let sum = 0
  ring.forEach((p, i) => {
    sum += dot(cross(sub(p, ring[0]!), sub(ring[(i + 1) % ring.length]!, ring[0]!)), normal)
  })
  return sum / 2
}

interface Candidate extends MemberLoop {
  real: number
  surfaceEnd: number
}

// The loop round the member standing on the surface with normal `surface` at the middle of a seed, or null.
function candidateAt(bvh: MeshBVH, seeds: LoopSeed[], index: number, free: boolean[], surface: Vec3, options: MemberLoopOptions): Candidate | null {
  const { offsetMm: d, turnBreakDeg } = options
  const seed = seeds[index]!
  const at = seed.points[seed.points.length >> 1]!.p
  const lifted = add(at, scale(surface, d))
  const outline = outlineAt(sliceBody(bvh, lifted, surface), lifted, 5 * d)
  if (!outline) return null
  const sides = mergeCollinear(outline)
  if (sides.length < 3) return null
  if (sides.some((s) => Math.abs(dot(s.wall, surface)) > FLAT_COS)) return null
  const ring = sides.map((s) => sub(s.from, scale(surface, d)))
  // A hole in the cut is a pocket, such as the inside of a tank, not the outside of a member.
  if (signedArea(ring, surface) <= 0) return null
  const lengths = loopSides(ring, turnBreakDeg)
  const shortest = Math.min(...lengths)
  const longest = Math.max(...lengths)
  if (shortest < COMPACT_SHARE * longest) return null

  // Just under every side there must be material: the member stands on the surface all the way round.
  const below = (k: number): Vec3 => {
    const mid = scale(add(ring[k]!, ring[(k + 1) % ring.length]!), 0.5)
    const wall = sides[k]!.wall
    const inward = normalize(sub(scale(surface, dot(wall, surface)), wall))
    return add(mid, add(scale(inward, 2 * d), scale(surface, -d)))
  }
  if (!sides.every((_, k) => insideByParity(bvh, below(k)))) return null

  const tolerance = SEED_NEAR_OFFSETS * d
  const onRing = (p: Vec3) => ring.some((a, k) => segmentDistance(p, a, ring[(k + 1) % ring.length]!) <= tolerance)
  const uses = seeds.flatMap((other, k) => {
    if (!free[k]) return []
    const standsOn = other.points.some(({ n1, n2 }) => dot(n1, surface) > SAME_NORMAL_COS || dot(n2, surface) > SAME_NORMAL_COS)
    return standsOn && other.points.every(({ p }) => onRing(p)) ? [k] : []
  })
  if (!uses.includes(index)) return null
  const real = uses.reduce((sum, k) => sum + seeds[k]!.lengthMm, 0)
  const perimeter = lengths.reduce((x, y) => x + y, 0)

  let surfaceEnd = 0
  if (perimeter - real > tolerance) {
    // A flush side belongs to the end of a member only when the member runs away from the surface.
    const own = probeFromBvhs([bvh])
    const need = MEMBER_DEPTH_SHARE * shortest
    const runsAway = (k: number) => {
      const wall = sides[k]!.wall
      return own(add(below(k), scale(surface, 2 * d)), normalize(sub(surface, scale(wall, dot(wall, surface))))) >= need
    }
    if (!sides.every((_, k) => runsAway(k))) return null
    // A lone crease must show that the surface is a face, reaching past the crease: the end of the plate under a lap
    // is only an edge. Two creases on one surface have shown that already, however near its edge one of them lies.
    if (uses.length === 1) {
      const seedAt = seed.points[seed.points.length >> 1]!
      const wall = dot(seedAt.n1, surface) > SAME_NORMAL_COS ? seedAt.n2 : seedAt.n1
      const away = normalize(sub(wall, scale(surface, dot(wall, surface))))
      if (own(sub(seedAt.p, scale(surface, d)), away) < need) return null
    }
    const centre = scale(ring.reduce((sum, p) => add(sum, p), [0, 0, 0] as Vec3), 1 / ring.length)
    const ray = new Ray(new Vector3(centre[0], centre[1], centre[2]), new Vector3(-surface[0], -surface[1], -surface[2]))
    surfaceEnd = bvh.raycast(ray, DoubleSide).reduce((far, hit) => Math.max(far, hit.distance), 0)
    if (uses.length === 1 && surfaceEnd > SURFACE_END_RATIO * longest) return null
  }
  // On a slanted member the cut lies a little to one side of the joint; the ends of its creases are exact.
  const ends = uses.flatMap((k) => [seeds[k]!.points[0]!.p, seeds[k]!.points[seeds[k]!.points.length - 1]!.p])
  const polyline = ring.map((corner) => ends.find((end) => length(sub(end, corner)) <= tolerance) ?? corner)
  return { polyline, walls: sides.map((s) => s.wall), surface, areas: outline.map((s) => s.area), uses, real, surfaceEnd }
}

// Creases of one body that run round the end of a member standing on a surface of that same body, where the member and
// the surface were fused: a tube butting a tube. The outline comes from cutting the body just above the surface,
// because where the member is flush with what it meets there is no crease on that side, and often no mesh edge. The
// outline counts when it is the outside of a compact member with material under every side. With flush sides the
// member must also run away from the surface, and with one crease only the surface must reach past the crease and end
// soon below it, or the member runs on past the crease. A true mitre has no such surface and stays open. Each crease goes to one loop; where two readings fit (the four creases of two tubes
// crossing can pair either way) the one that uses more unclaimed crease wins, then the one whose surface ends sooner.
export function findMemberLoops(bvh: MeshBVH, seeds: LoopSeed[], options: MemberLoopOptions): MemberLoop[] {
  const free = seeds.map(() => true)
  const loops: MemberLoop[] = []
  seeds.forEach((seed, index) => {
    if (!free[index]) return
    const { n1, n2 } = seed.points[seed.points.length >> 1]!
    const candidates = [n1, n2].flatMap((surface) => candidateAt(bvh, seeds, index, free, surface, options) ?? [])
    candidates.sort((a, b) => b.real - a.real || a.surfaceEnd - b.surfaceEnd)
    const best = candidates[0]
    if (!best) return
    for (const k of best.uses) free[k] = false
    loops.push({ polyline: best.polyline, walls: best.walls, surface: best.surface, areas: best.areas, uses: best.uses })
  })
  return loops
}
