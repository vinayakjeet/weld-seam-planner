import { length, sub, type Vec3 } from '../math/vec3'

export interface Resampled {
  p: Vec3[]
  // Arc length of each sample from the first point, in mm.
  s: number[]
  // Index of the polyline segment each sample lies on; segment i runs from points[i] to points[i + 1].
  segment: number[]
  length: number
}

// Even spacing of max(minSpacingMm, length / 200) or finer, endpoints exact. A closed polyline is given without a
// repeated first point; its closing segment is the last one and the output does not repeat the first sample.
export function resamplePolyline(points: Vec3[], closed: boolean, minSpacingMm = 2): Resampled {
  const segments = closed ? points.length : points.length - 1
  const cumulative = [0]
  for (let i = 0; i < segments; i++) {
    cumulative.push(cumulative[i]! + length(sub(points[(i + 1) % points.length]!, points[i]!)))
  }
  const total = cumulative[segments]!

  const spacing = Math.max(minSpacingMm, total / 200)
  let intervals = Math.max(1, Math.ceil(total / spacing - 1e-9))
  if (closed) intervals = Math.max(3, intervals)
  const step = total / intervals
  const count = closed ? intervals : intervals + 1

  const p: Vec3[] = []
  const s: number[] = []
  const segment: number[] = []
  let seg = 0
  for (let k = 0; k < count; k++) {
    const arc = !closed && k === intervals ? total : k * step
    while (seg < segments - 1 && arc >= cumulative[seg + 1]!) seg++
    const a = points[seg]!
    const b = points[(seg + 1) % points.length]!
    const span = cumulative[seg + 1]! - cumulative[seg]!
    const t = span > 0 ? (arc - cumulative[seg]!) / span : 0
    if (k === 0) p.push([...a])
    else if (!closed && k === intervals) p.push([...b])
    else p.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t])
    s.push(arc)
    segment.push(seg)
  }
  return { p, s, segment, length: total }
}
