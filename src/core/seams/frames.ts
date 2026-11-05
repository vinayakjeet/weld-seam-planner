import { cross, dot, length, normalize, sub, type Vec3 } from '../math/vec3'
import type { FaceData } from '../mesh/faces'
import type { MeshModel } from '../mesh/model'
import type { Chain } from './chain'
import { resamplePolyline } from './resample'
import { curveSegments, pointOnSegment, smoothVertices, tangentOnSegment, turningVertices, type CurveSegment } from './smooth'

export interface SeamPoint {
  // Arc length from the start of the seam, in mm.
  s: number
  p: Vec3
  // Unit tangent along the chain direction.
  t: Vec3
  // Unit normals of the two plates meeting at the seam, ordered so that n1 x n2 points along t.
  n1: Vec3
  n2: Vec3
}

// Plate normals for one polyline segment; their order does not matter, pointsFromPolyline orders them.
export type NormalsOf = (segment: number) => [Vec3, Vec3]

export interface PolylineOptions {
  // Follow the curve a tessellated polyline was cut from, keeping its corners (see smoothVertices).
  smooth?: boolean
}

export interface SeamPolyline {
  points: SeamPoint[]
  lengthMm: number
  // On a smoothed seam, the samples on the polyline itself. The curve runs up to the sag of a facet off the mesh, so
  // a ray cast from it would meet the facet it started beside; rays start from these instead.
  surface?: SeamPoint[]
}

// Sub-steps per curved segment when its length is measured for resampling.
const CURVE_STEPS = 8

// polyline is given without a repeated first point when closed. Segment i runs from polyline[i] to polyline[i + 1].
export function pointsFromPolyline(
  polyline: Vec3[],
  closed: boolean,
  normalsOf: NormalsOf,
  options: PolylineOptions = {},
): SeamPolyline {
  if (options.smooth) {
    const smoothed = smoothPoints(polyline, closed, normalsOf)
    if (smoothed) return { ...smoothed, surface: pointsFromPolyline(polyline, closed, normalsOf).points }
  }
  const resampled = resamplePolyline(polyline, closed)
  const points = resampled.p.map((p, k): SeamPoint => {
    const segment = resampled.segment[k]!
    const t = normalize(sub(polyline[(segment + 1) % polyline.length]!, polyline[segment]!))
    let [n1, n2] = normalsOf(segment)
    if (dot(cross(n1, n2), t) < 0) [n1, n2] = [n2, n1]
    return { s: resampled.s[k]!, p, t, n1, n2 }
  })
  return { points, lengthMm: resampled.length }
}

// Samples on the Hermite curve through the vertices that turn, or null when no vertex lies on a curve. The arc length
// comes from a dense polyline along the curve, and each sample is put back on the curve at the parameter its arc length
// gives. The plate normals are those of the polyline segment under the sample; across a curve vertex they blend
// linearly from one facet to the next (each facet's own normal at its middle, their mean at the vertex), then are made
// perpendicular to the tangent. At a pinned vertex they keep the facet's normals.
function smoothPoints(polyline: Vec3[], closed: boolean, normalsOf: NormalsOf): { points: SeamPoint[]; lengthMm: number } | null {
  const n = polyline.length
  const keep = turningVertices(polyline, closed)
  if (keep.length < (closed ? 3 : 2)) return null
  const shape = keep.map((v) => polyline[v]!)
  const curve = smoothVertices(shape, closed)
  if (!curve.some(Boolean)) return null
  const segments = curveSegments(shape, closed, curve)
  const count = closed ? n : n - 1
  // Polyline segments under curve segment r: from vertex keep[r] up to the next kept vertex.
  const firstOf = (r: number) => keep[r]!
  const endOf = (r: number) => (r + 1 < keep.length ? keep[r + 1]! : closed ? keep[0]! + n : n - 1)

  const ordered = Array.from({ length: count }, (_, i): [Vec3, Vec3] => {
    const [a, b] = normalsOf(i)
    return dot(cross(a, b), sub(polyline[(i + 1) % n]!, polyline[i]!)) < 0 ? [b, a] : [a, b]
  })
  const under = (r: number, u: number): number => {
    const from = polyline[firstOf(r)]!
    const chord = sub(polyline[endOf(r) % n]!, from)
    const span = dot(chord, chord)
    let i = firstOf(r)
    while (i + 1 < endOf(r) && span > 0 && dot(sub(polyline[(i + 1) % n]!, from), chord) / span <= u) i++
    return i % count
  }
  const plates = (r: number, u: number): [Vec3, Vec3] => {
    const own = ordered[under(r, u)]!
    const before = u < 0.5 && curve[r] ? ordered[(firstOf(r) - 1 + count) % count]! : null
    const after = u > 0.5 && curve[(r + 1) % keep.length] ? ordered[endOf(r) % count]! : null
    const other = before ?? after
    if (!other) return own
    const w = before ? 0.5 - u : u - 0.5
    return [0, 1].map((k) => own[k]!.map((x, c) => (1 - w) * x + w * other[k]![c]!) as Vec3) as [Vec3, Vec3]
  }
  const across = (normal: Vec3, t: Vec3, fallback: Vec3): Vec3 => {
    const off = dot(normal, t)
    const v = normalize([normal[0] - off * t[0], normal[1] - off * t[1], normal[2] - off * t[2]])
    return v[0] === 0 && v[1] === 0 && v[2] === 0 ? fallback : v
  }

  // A loop whose first vertex was merged away still starts there: at that vertex's place along the last segment.
  const last = segments.length - 1
  const startU = closed && keep[0] !== 0 ? fractionAlong(polyline[0]!, segments[last]!) : 0
  const dense: Vec3[] = []
  const where: Array<[number, number]> = []
  const walk = (r: number, from: number, to: number) => {
    const segment = segments[r]!
    const steps = segment.straight ? 1 : CURVE_STEPS
    if (from > 0) {
      dense.push(pointOnSegment(segment, from))
      where.push([r, from])
    }
    for (let k = 0; k < steps; k++) {
      const u = k / steps
      if (u < from || (u === from && from > 0) || u >= to) continue
      dense.push(k === 0 ? segment.p0 : pointOnSegment(segment, u))
      where.push([r, u])
    }
  }
  if (startU > 0) walk(last, startU, 1)
  segments.forEach((_, r) => walk(r, 0, r === last && startU > 0 ? startU : 1))
  if (!closed) {
    dense.push(segments[segments.length - 1]!.p1)
    where.push([segments.length - 1, 1])
  }

  const resampled = resamplePolyline(dense, closed)
  const points = resampled.p.map((q, k): SeamPoint => {
    const d = resampled.segment[k]!
    const [r, u0] = where[d]!
    const next = where[(d + 1) % where.length]!
    const u1 = next[0] === r && next[1] > u0 ? next[1] : r === last && u0 < startU ? startU : 1
    const from = dense[d]!
    const span = length(sub(dense[(d + 1) % dense.length]!, from))
    const u = u0 + (u1 - u0) * (span > 0 ? Math.min(1, length(sub(q, from)) / span) : 0)
    const segment = segments[r]!
    const p = u === 0 ? segment.p0 : u === 1 ? segment.p1 : pointOnSegment(segment, u)
    const t = tangentOnSegment(segment, u)
    const [a, b] = plates(r, u)
    const own = ordered[under(r, u)]!
    let n1 = across(a, t, own[0])
    let n2 = across(b, t, own[1])
    if (dot(cross(n1, n2), t) < 0) [n1, n2] = [n2, n1]
    return { s: resampled.s[k]!, p: [...p], t, n1, n2 }
  })
  return { points, lengthMm: resampled.length }
}

// Where q, a point on the chord of a segment, lies along it, from 0 at its start to 1 at its end.
function fractionAlong(q: Vec3, { p0, p1 }: CurveSegment): number {
  const chord = sub(p1, p0)
  const span = dot(chord, chord)
  return span > 0 ? Math.max(0, Math.min(1, dot(sub(q, p0), chord) / span)) : 0
}

// chain.edges index into edgeIds, the edge list the chain was built from. Without normalsOf the plate normals are
// the two faces beside each mesh edge.
export function buildSeamPoints(
  chain: Chain,
  edgeIds: Uint32Array,
  model: MeshModel,
  faces: FaceData,
  normalsOf?: NormalsOf,
  options: PolylineOptions = {},
): SeamPolyline {
  const { positions } = model.mesh
  const ring = chain.closed ? chain.vertices.slice(0, -1) : chain.vertices
  const polyline = ring.map((v): Vec3 => [positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!])

  const normalOf = (face: number): Vec3 => [faces.normals[face * 3]!, faces.normals[face * 3 + 1]!, faces.normals[face * 3 + 2]!]
  const fromFaces: NormalsOf = (segment) => {
    const edge = edgeIds[chain.edges[segment]!]!
    return [normalOf(model.edges.faceA[edge]!), normalOf(model.edges.faceB[edge]!)]
  }
  return pointsFromPolyline(polyline, chain.closed, normalsOf ?? fromFaces, options)
}
