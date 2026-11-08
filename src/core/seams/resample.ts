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
// repeated first point; its closing segment is the last one and the output does not repeat the first sample. Vertices
// that turn by more than cornerDeg are kept as samples, each run between them spaced evenly on its own, so a path
// round a corner goes into it rather than across it.
export function resamplePolyline(points: Vec3[], closed: boolean, minSpacingMm = 2, cornerDeg = Infinity): Resampled {
  const segments = closed ? points.length : points.length - 1
  const cumulative = [0]
  for (let i = 0; i < segments; i++) {
    cumulative.push(cumulative[i]! + length(sub(points[(i + 1) % points.length]!, points[i]!)))
  }
  const total = cumulative[segments]!
  const spacing = Math.max(minSpacingMm, total / 200)

  const corners = cornerDeg < 180 ? cornerVertices(points, closed, cornerDeg) : []
  const arcs: number[] = []
  if (corners.length === 0) {
    let intervals = Math.max(1, Math.ceil(total / spacing - 1e-9))
    if (closed) intervals = Math.max(3, intervals)
    const step = total / intervals
    for (let k = 0; k < (closed ? intervals : intervals + 1); k++) arcs.push(!closed && k === intervals ? total : k * step)
  } else {
    const breaks = [...new Set([0, ...corners.map((v) => cumulative[v]!)])].sort((a, b) => a - b)
    breaks.forEach((from, i) => {
      const to = i + 1 < breaks.length ? breaks[i + 1]! : total
      const intervals = Math.max(1, Math.ceil((to - from) / spacing - 1e-9))
      for (let k = 0; k < intervals; k++) arcs.push(k === 0 ? from : from + ((to - from) * k) / intervals)
    })
    if (!closed) arcs.push(total)
  }

  const p: Vec3[] = []
  const s: number[] = []
  const segment: number[] = []
  let seg = 0
  arcs.forEach((arc, k) => {
    while (seg < segments - 1 && arc >= cumulative[seg + 1]!) seg++
    const a = points[seg]!
    const b = points[(seg + 1) % points.length]!
    const span = cumulative[seg + 1]! - cumulative[seg]!
    const t = span > 0 ? (arc - cumulative[seg]!) / span : 0
    if (k === 0 || arc === cumulative[seg]) p.push([...a])
    else if (!closed && k === arcs.length - 1) p.push([...b])
    else p.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t])
    s.push(arc)
    segment.push(seg)
  })
  return { p, s, segment, length: total }
}

// Vertices where the polyline turns by more than deg; never the ends of an open one.
function cornerVertices(points: Vec3[], closed: boolean, deg: number): number[] {
  const n = points.length
  const cosLimit = Math.cos((deg * Math.PI) / 180)
  const found: number[] = []
  for (let v = closed ? 0 : 1; v < (closed ? n : n - 1); v++) {
    const d1 = sub(points[v]!, points[(v - 1 + n) % n]!)
    const d2 = sub(points[(v + 1) % n]!, points[v]!)
    const l1 = length(d1)
    const l2 = length(d2)
    if (l1 === 0 || l2 === 0) continue
    if ((d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2]) / (l1 * l2) < cosLimit) found.push(v)
  }
  return found
}
