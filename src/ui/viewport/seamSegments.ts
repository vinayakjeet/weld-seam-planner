import type { AccessClass } from '../../core/access/clearance'
import { seamLength } from '../../core/access/clearance'
import type { Vec3 } from '../../core/math/vec3'
import type { SeamCandidate } from '../../core/seams/detect'
import type { SeamPoint } from '../../core/seams/frames'
import type { SeamStatus } from '../../state/seamsSlice'

export type Rgb = readonly [number, number, number]

export interface SeamPalette {
  candidate: Rgb
  accepted: Rgb
  rejected: Rgb
  access: Record<AccessClass, Rgb>
  reach: { ok: Rgb; miss: Rgb }
}

// positions and colors hold 6 floats per segment (start then end), the layout LineSegmentsGeometry expects.
// segmentSeam[k] is the index into the seams array of segment k.
export interface SeamSegments {
  positions: Float32Array
  colors: Float32Array
  segmentSeam: Uint32Array
}

function segmentCount(seam: SeamCandidate): number {
  const n = seam.points.length
  if (n < 2) return 0
  return seam.closed ? n : n - 1
}

function writeSeam(seam: SeamCandidate, out: Float32Array, offset: number): void {
  const n = seam.points.length
  const count = segmentCount(seam)
  for (let i = 0; i < count; i++) {
    const a = seam.points[i]!.p
    const b = seam.points[(i + 1) % n]!.p
    out.set(a, offset + i * 6)
    out.set(b, offset + i * 6 + 3)
  }
}

// The segments of an open polyline that is not a seam (the line being drawn).
export function polylineSegmentPositions(points: readonly Vec3[]): Float32Array {
  const out = new Float32Array(Math.max(0, points.length - 1) * 6)
  for (let i = 0; i + 1 < points.length; i++) {
    out.set(points[i]!, i * 6)
    out.set(points[i + 1]!, i * 6 + 3)
  }
  return out
}

// The segments of every listed seam whose id is in the set, as one array; null when none is.
export function positionsOfSeams(seams: readonly SeamCandidate[], ids: ReadonlySet<string>): Float32Array | null {
  const parts = seams.filter((seam) => ids.has(seam.id)).map(seamSegmentPositions)
  if (parts.length === 0) return null
  const all = new Float32Array(parts.reduce((n, part) => n + part.length, 0))
  let at = 0
  for (const part of parts) {
    all.set(part, at)
    at += part.length
  }
  return all
}

export function seamSegmentPositions(seam: SeamCandidate): Float32Array {
  const out = new Float32Array(segmentCount(seam) * 6)
  writeSeam(seam, out, 0)
  return out
}

const EPS = 1e-9

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

// The seam split at the ends of the unreachable stretches into polylines that are reached and polylines that are not.
// The cuts are exact: a point lies at every end. In a closed loop a first and last piece of the same kind are one
// polyline running across s = L, so the loop has no cut where its start is.
export function reachSpans(points: SeamPoint[], closed: boolean, unreachable: ReadonlyArray<readonly [number, number]>): { reached: Vec3[][]; missed: Vec3[][] } {
  if (points.length === 0) return { reached: [], missed: [] }
  const total = seamLength(points, closed)
  const chain: Array<{ s: number; p: Vec3 }> = points.map((point) => ({ s: point.s, p: point.p }))
  if (closed) chain.push({ s: total, p: points[0]!.p })
  const at = (s: number): Vec3 => {
    for (let i = 1; i < chain.length; i++) {
      const a = chain[i - 1]!
      const b = chain[i]!
      if (s <= b.s + EPS) return b.s - a.s < EPS ? b.p : lerp(a.p, b.p, (s - a.s) / (b.s - a.s))
    }
    return chain[chain.length - 1]!.p
  }
  const piece = (from: number, to: number): Vec3[] => [
    at(from),
    ...chain.filter((c) => c.s > from + EPS && c.s < to - EPS).map((c) => c.p),
    at(to),
  ]

  const pieces: Array<{ miss: boolean; line: Vec3[] }> = []
  let cursor = 0
  const add = (from: number, to: number, miss: boolean) => {
    if (to - from > EPS) pieces.push({ miss, line: piece(from, to) })
  }
  for (const [lo, hi] of [...unreachable].sort((a, b) => a[0] - b[0])) {
    const from = Math.min(total, Math.max(cursor, lo))
    const to = Math.min(total, hi)
    if (to <= from + EPS) continue
    add(cursor, from, false)
    add(from, to, true)
    cursor = to
  }
  add(cursor, total, false)

  const first = pieces[0]
  const last = pieces[pieces.length - 1]
  if (closed && pieces.length > 1 && first && last && first.miss === last.miss) {
    last.line = [...last.line, ...first.line.slice(1)]
    pieces.shift()
  }
  return {
    reached: pieces.filter((p) => !p.miss).map((p) => p.line),
    missed: pieces.filter((p) => p.miss).map((p) => p.line),
  }
}

export function buildSeamSegments(
  seams: readonly SeamCandidate[],
  statusById: Readonly<Record<string, SeamStatus>>,
  palette: SeamPalette,
  // Given when the lines are coloured by access: a seam with a class takes the colour of the class, the rest keep their status colour.
  accessClass?: (seam: SeamCandidate) => AccessClass | null,
  // Given in the Access step: a seam with a current reach is drawn in reached and missed spans, one with null as usual.
  unreachableOf?: (seam: SeamCandidate) => ReadonlyArray<readonly [number, number]> | null,
): SeamSegments {
  const spansOf = new Map<number, { line: Vec3[]; miss: boolean }[]>()
  seams.forEach((seam, index) => {
    const unreachable = unreachableOf?.(seam)
    if (!unreachable || seam.points.length < 2) return
    const { reached, missed } = reachSpans(seam.points, seam.closed, unreachable)
    spansOf.set(index, [...reached.map((line) => ({ line, miss: false })), ...missed.map((line) => ({ line, miss: true }))])
  })
  const countOf = (seam: SeamCandidate, index: number) => {
    const spans = spansOf.get(index)
    return spans ? spans.reduce((n, span) => n + Math.max(0, span.line.length - 1), 0) : segmentCount(seam)
  }
  let total = 0
  seams.forEach((seam, index) => {
    total += countOf(seam, index)
  })
  const positions = new Float32Array(total * 6)
  const colors = new Float32Array(total * 6)
  const segmentSeam = new Uint32Array(total)
  let segment = 0
  seams.forEach((seam, index) => {
    const spans = spansOf.get(index)
    if (spans) {
      for (const { line, miss } of spans) {
        const rgb = miss ? palette.reach.miss : palette.reach.ok
        for (let i = 0; i + 1 < line.length; i++, segment++) {
          positions.set(line[i]!, segment * 6)
          positions.set(line[i + 1]!, segment * 6 + 3)
          colors.set(rgb, segment * 6)
          colors.set(rgb, segment * 6 + 3)
          segmentSeam[segment] = index
        }
      }
      return
    }
    const count = segmentCount(seam)
    writeSeam(seam, positions, segment * 6)
    const cls = accessClass?.(seam) ?? null
    const rgb = cls === null ? palette[statusById[seam.id] ?? 'candidate'] : palette.access[cls]
    for (let i = 0; i < count; i++) {
      colors.set(rgb, (segment + i) * 6)
      colors.set(rgb, (segment + i) * 6 + 3)
      segmentSeam[segment + i] = index
    }
    segment += count
  })
  return { positions, colors, segmentSeam }
}
