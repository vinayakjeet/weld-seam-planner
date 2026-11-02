import { Line3, Matrix4, Vector3 } from 'three'
import type { ExtendedTriangle } from 'three-mesh-bvh'
import type { Vec3 } from '../math/vec3'
import type { MeshModel } from '../mesh/model'
import type { BodyBvh } from './bodyBvh'
import { chainEdges } from './chain'

// A segment where a triangle of one body crosses a triangle of another. nA and nB are the outward triangle normals
// of the lower and the higher numbered body, so their sum points into the free space beside the seam.
export interface IntersectionSegment {
  p0: Vec3
  p1: Vec3
  nA: Vec3
  nB: Vec3
  areaA: number
  areaB: number
}

// Shorter than this a segment is a numeric sliver, not a seam.
const MIN_SEGMENT_MM = 1e-6
const TURN_BREAK_DEG = 40

const toVec3 = (v: Vector3): Vec3 => [v.x, v.y, v.z]

// Range of signed distances of a triangle's corners to the plane through origin with the given normal.
function heightRange(tri: ExtendedTriangle, normal: Vector3, origin: Vector3): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const v of [tri.a, tri.b, tri.c]) {
    const d = (v.x - origin.x) * normal.x + (v.y - origin.y) * normal.y + (v.z - origin.z) * normal.z
    if (d < lo) lo = d
    if (d > hi) hi = d
  }
  return [lo, hi]
}

// Pairs of triangles that cross each other, with the line they share. Only a transversal crossing counts: each
// triangle must have corners on both sides of the other's plane by more than toleranceMm. Coplanar pairs and pairs
// that merely touch (bodies in contact) are contact seams, not intersections.
export function findIntersectionSegments(model: Pick<MeshModel, 'bodies'>, bvhs: BodyBvh[], toleranceMm: number): IntersectionSegment[] {
  if (model.bodies.count < 2 || bvhs.length < 2) return []
  const segments: IntersectionSegment[] = []
  const identity = new Matrix4()
  const line = new Line3()
  const normal1 = new Vector3()
  const normal2 = new Vector3()

  for (let i = 0; i < bvhs.length; i++) {
    for (let j = i + 1; j < bvhs.length; j++) {
      const a = bvhs[i]!
      const b = bvhs[j]!
      if ([0, 1, 2].some((c) => a.min[c]! - toleranceMm > b.max[c]! || a.max[c]! + toleranceMm < b.min[c]!)) continue

      a.bvh.bvhcast(b.bvh, identity, {
        intersectsTriangles: (t1, t2) => {
          t1.getNormal(normal1)
          t2.getNormal(normal2)
          const [lo1, hi1] = heightRange(t1, normal2, t2.a)
          if (lo1 >= -toleranceMm || hi1 <= toleranceMm) return false
          const [lo2, hi2] = heightRange(t2, normal1, t1.a)
          if (lo2 >= -toleranceMm || hi2 <= toleranceMm) return false
          // Coplanar pairs never get here, so the library never logs its coplanar warning.
          if (!t1.intersectsTriangle(t2, line) || line.distance() < MIN_SEGMENT_MM) return false
          segments.push({
            p0: toVec3(line.start),
            p1: toVec3(line.end),
            nA: toVec3(normal1),
            nB: toVec3(normal2),
            areaA: t1.getArea(),
            areaB: t2.getArea(),
          })
          // Returning true would stop the cast at the first hit.
          return false
        },
      })
    }
  }
  return segments
}

export interface Polyline {
  // A closed polyline does not repeat its first point.
  points: Vec3[]
  closed: boolean
  // Segment i runs from points[i] to points[i + 1]; the segment after the last point closes a closed polyline.
  normals: Array<[Vec3, Vec3]>
  // Areas of the triangles beside the polyline's segments, two per segment, for the confidence score.
  areas: number[]
}

// Welds segment endpoints that lie within weldMm of each other and chains the result with the same rules as mesh
// edges: runs through vertices of degree 2, breaks at junctions and at turns over 40 degrees, marks closed loops.
export function chainSegments(segments: IntersectionSegment[], weldMm: number): Polyline[] {
  const grid = new Map<string, number[]>()
  const vertices: Vec3[] = []
  const cell = (x: number) => Math.floor(x / weldMm)

  const vertexFor = (p: Vec3): number => {
    const [cx, cy, cz] = [cell(p[0]), cell(p[1]), cell(p[2])]
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const v of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
            const q = vertices[v]!
            if (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) <= weldMm) return v
          }
        }
      }
    }
    vertices.push(p)
    const key = `${cx},${cy},${cz}`
    grid.set(key, [...(grid.get(key) ?? []), vertices.length - 1])
    return vertices.length - 1
  }

  const kept: IntersectionSegment[] = []
  const ends: number[] = []
  const seen = new Set<string>()
  for (const segment of segments) {
    const a = vertexFor(segment.p0)
    const b = vertexFor(segment.p1)
    const key = a < b ? `${a},${b}` : `${b},${a}`
    if (a === b || seen.has(key)) continue
    seen.add(key)
    kept.push(segment)
    ends.push(a, b)
  }

  const positions = Float32Array.from(vertices.flat())
  return chainEdges(positions, Uint32Array.from(ends), TURN_BREAK_DEG).map((chain) => {
    const ring = chain.closed ? chain.vertices.slice(0, -1) : chain.vertices
    const used = chain.edges.map((e) => kept[e]!)
    return {
      points: ring.map((v): Vec3 => [positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!]),
      closed: chain.closed,
      normals: used.map((s): [Vec3, Vec3] => [s.nA, s.nB]),
      areas: used.flatMap((s) => [s.areaA, s.areaB]),
    }
  })
}
