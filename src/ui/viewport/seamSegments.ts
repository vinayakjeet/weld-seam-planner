import type { AccessClass } from '../../core/access/clearance'
import type { Vec3 } from '../../core/math/vec3'
import type { SeamCandidate } from '../../core/seams/detect'
import type { SeamStatus } from '../../state/seamsSlice'

export type Rgb = readonly [number, number, number]

export interface SeamPalette {
  candidate: Rgb
  accepted: Rgb
  rejected: Rgb
  access: Record<AccessClass, Rgb>
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

export function seamSegmentPositions(seam: SeamCandidate): Float32Array {
  const out = new Float32Array(segmentCount(seam) * 6)
  writeSeam(seam, out, 0)
  return out
}

export function buildSeamSegments(
  seams: readonly SeamCandidate[],
  statusById: Readonly<Record<string, SeamStatus>>,
  palette: SeamPalette,
  // Given when the lines are coloured by access: a seam with a class takes the colour of the class, the rest keep their status colour.
  accessClass?: (seam: SeamCandidate) => AccessClass | null,
): SeamSegments {
  let total = 0
  for (const seam of seams) total += segmentCount(seam)
  const positions = new Float32Array(total * 6)
  const colors = new Float32Array(total * 6)
  const segmentSeam = new Uint32Array(total)
  let segment = 0
  seams.forEach((seam, index) => {
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
