import { cross, dot, length, normalize, sub, type Vec3 } from '../math/vec3'

// A turn this sharp is a corner of the seam, never a facet of a curve.
const CORNER_DEG = 20
// Below this a vertex is straight.
const STRAIGHT_DEG = 0.01
// Neighbouring vertices of a tessellated curve turn the same way by about the same angle.
const SIMILAR_RATIO = 2
const SAME_SENSE_COS = 0.5

// Facets of one curve have chords of about the same length; a long chord next to short ones is a straight run.
const CHORD_RATIO = 3

interface Turn {
  deg: number
  axis: Vec3
  chordRatio: number
}

function turnsOf(points: Vec3[], closed: boolean): Array<Turn | null> {
  const n = points.length
  return points.map((b, v): Turn | null => {
    if ((!closed && (v === 0 || v === n - 1)) || n < 3) return null
    const d1 = sub(b, points[(v - 1 + n) % n]!)
    const d2 = sub(points[(v + 1) % n]!, b)
    const l1 = length(d1)
    const l2 = length(d2)
    if (l1 === 0 || l2 === 0) return null
    const cos = Math.max(-1, Math.min(1, dot(d1, d2) / (l1 * l2)))
    return { deg: (Math.acos(cos) * 180) / Math.PI, axis: normalize(cross(d1, d2)), chordRatio: Math.max(l1, l2) / Math.min(l1, l2) }
  })
}

// The vertices that shape a polyline: the ends of an open one and every vertex that turns. A vertex in the middle of
// a straight run (an intersection loop has one on each facet, where the facet's diagonal crosses) is left out, so a
// curve is fitted through the facet corners alone.
export function turningVertices(points: Vec3[], closed: boolean): number[] {
  const n = points.length
  return turnsOf(points, closed).flatMap((turn, v) => ((!closed && (v === 0 || v === n - 1)) || (turn && turn.deg >= STRAIGHT_DEG) ? [v] : []))
}

// Which vertices of a polyline lie on a tessellated curve. A vertex does when it turns by less than 20 degrees, its two
// chords are within a factor of 3 in length, and every neighbour that is not an open end turns the same way by
// between half and twice as much. Ends of an open polyline, straight vertices, corners, a lone kink between straight
// runs and the vertex where a straight run meets an arc are pinned and keep their sharp turn.
export function smoothVertices(points: Vec3[], closed: boolean): boolean[] {
  const n = points.length
  const isEnd = (v: number) => !closed && (v === 0 || v === n - 1)
  const turns = turnsOf(points, closed)
  const similar = (a: Turn, b: Turn | null) =>
    b !== null && b.deg >= a.deg / SIMILAR_RATIO && b.deg <= a.deg * SIMILAR_RATIO && dot(a.axis, b.axis) > SAME_SENSE_COS
  return turns.map((turn, v) => {
    if (!turn || turn.deg < STRAIGHT_DEG || turn.deg >= CORNER_DEG || turn.chordRatio > CHORD_RATIO) return false
    const neighbours = [v - 1, v + 1].map((k) => (k + n) % n).filter((k) => !isEnd(k))
    return neighbours.length > 0 && neighbours.every((k) => similar(turn, turns[k]!))
  })
}

// One polyline segment as a cubic Hermite curve. A segment between two pinned vertices is its straight chord.
export interface CurveSegment {
  p0: Vec3
  p1: Vec3
  m0: Vec3
  m1: Vec3
  straight: boolean
}

// Each segment runs from its start vertex to the next. At a curve vertex the tangent is the direction from the vertex
// before to the vertex after, which is the circle's tangent on an evenly tessellated arc; at a pinned vertex it is the
// segment's own chord, so the curve leaves a corner or a straight run without bulging. Tangents are as long as the chord.
export function curveSegments(points: Vec3[], closed: boolean, smooth: boolean[]): CurveSegment[] {
  const n = points.length
  const count = closed ? n : n - 1
  const tangentAt = (v: number): Vec3 => normalize(sub(points[(v + 1) % n]!, points[(v - 1 + n) % n]!))
  return Array.from({ length: count }, (_, i) => {
    const j = (i + 1) % n
    const p0 = points[i]!
    const p1 = points[j]!
    const chord = sub(p1, p0)
    const span = length(chord)
    const along = (v: number): Vec3 => {
      const t = tangentAt(v)
      return [t[0] * span, t[1] * span, t[2] * span]
    }
    return { p0, p1, m0: smooth[i] ? along(i) : chord, m1: smooth[j] ? along(j) : chord, straight: !smooth[i] && !smooth[j] }
  })
}

export function pointOnSegment({ p0, p1, m0, m1 }: CurveSegment, u: number): Vec3 {
  const u2 = u * u
  const u3 = u2 * u
  const h00 = 2 * u3 - 3 * u2 + 1
  const h10 = u3 - 2 * u2 + u
  const h01 = -2 * u3 + 3 * u2
  const h11 = u3 - u2
  return [0, 1, 2].map((c) => h00 * p0[c]! + h10 * m0[c]! + h01 * p1[c]! + h11 * m1[c]!) as Vec3
}

export function tangentOnSegment({ p0, p1, m0, m1 }: CurveSegment, u: number): Vec3 {
  const u2 = u * u
  const d00 = 6 * u2 - 6 * u
  const d10 = 3 * u2 - 4 * u + 1
  const d01 = -6 * u2 + 6 * u
  const d11 = 3 * u2 - 2 * u
  return normalize([0, 1, 2].map((c) => d00 * p0[c]! + d10 * m0[c]! + d01 * p1[c]! + d11 * m1[c]!) as Vec3)
}
