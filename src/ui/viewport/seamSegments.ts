import type { SeamCandidate } from '../../core/seams/detect'
import type { SeamStatus } from '../../state/seamsSlice'

export type Rgb = readonly [number, number, number]

export interface SeamPalette {
  candidate: Rgb
  accepted: Rgb
  rejected: Rgb
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

export function seamSegmentPositions(seam: SeamCandidate): Float32Array {
  const out = new Float32Array(segmentCount(seam) * 6)
  writeSeam(seam, out, 0)
  return out
}

export function buildSeamSegments(
  seams: readonly SeamCandidate[],
  statusById: Readonly<Record<string, SeamStatus>>,
  palette: SeamPalette,
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
    const rgb = palette[statusById[seam.id] ?? 'candidate']
    for (let i = 0; i < count; i++) {
      colors.set(rgb, (segment + i) * 6)
      colors.set(rgb, (segment + i) * 6 + 3)
      segmentSeam[segment + i] = index
    }
    segment += count
  })
  return { positions, colors, segmentSeam }
}
