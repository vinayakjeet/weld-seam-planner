import { add, dot, normalize, scale, sub, type Vec3 } from '../math/vec3'
import type { SeamPoint } from './frames'
import type { RayProbe } from './thickness'

// Free space closed off within this distance is the inside of a tube or a closed box, which no torch enters. A rule in
// wall thicknesses would miss the diagonal of a 1 in tube with a 1/8 in wall: 26.9 mm, 8.5 walls.
export const HOLLOW_SPAN_MM = 150

export interface HollowProbe {
  // Distance along a direction to the first surface of the seam's own body, Infinity when there is none.
  own: RayProbe
  // The same over every other body, or null when the part has no other body.
  others: RayProbe | null
}

export const HOLLOW_STATIONS = [0.25, 0.5, 0.75]
// Shares of the opening angle, clear of the two plates so that no ray runs along one.
const FAN = [0.1, 0.3, 0.5, 0.7, 0.9]
// Turns from straight across, along the touched surface; past 60 degrees a ray runs almost along the edge.
const SWEEP_DEG = [-60, -30, 0, 30, 60]

// Inside corners of a tube or a closed box: at three stations along the seam, every ray fanned across the opening, in
// the plane across the seam, meets the seam's own body first and within HOLLOW_SPAN_MM, and the seam is at least as
// long as the widest ray, so the space is a prism along the seam. A window in a frame is closed off in that plane too,
// but it is wider than its seam is long and open above and below.
export function creaseInHollow(points: SeamPoint[], lengthMm: number, probe: HollowProbe, offsetMm: number): boolean {
  if (points.length === 0) return false
  let widest = 0
  for (const fraction of HOLLOW_STATIONS) {
    const { p, n1, n2 } = points[Math.round(fraction * (points.length - 1))]!
    // Each plate runs away from the seam along the other plate's normal, less its own.
    const u1 = normalize(sub(n2, scale(n1, dot(n1, n2))))
    const u2 = normalize(sub(n1, scale(n2, dot(n1, n2))))
    const across = normalize(sub(u2, scale(u1, dot(u1, u2))))
    const opening = Math.acos(Math.max(-1, Math.min(1, dot(u1, u2))))
    const origin = add(p, scale(normalize(add(u1, u2)), offsetMm))
    for (const share of FAN) {
      const angle = share * opening
      const span = closedOffAt(origin, add(scale(u1, Math.cos(angle)), scale(across, Math.sin(angle))), probe)
      if (span === null) return false
      widest = Math.max(widest, span)
    }
  }
  return lengthMm >= widest
}

export interface ContactStation {
  p: Vec3
  t: Vec3
  // Normal of the member's free face beside the edge, and of the surface it stands on.
  free: Vec3
  touched: Vec3
}

// The bore of a hollow member where its end stands on another body: at each station, every ray fanned across the
// touched surface on the free side meets the member itself first and within HOLLOW_SPAN_MM, and the member's free face
// runs away from the touched surface at least as far as the widest ray (deepEnough), so the bore is deeper than wide.
export function contactInHollow(stations: ContactStation[], deepEnough: (widestMm: number) => boolean, probe: HollowProbe, offsetMm: number): boolean {
  if (stations.length === 0) return false
  let widest = 0
  for (const { p, t, free, touched } of stations) {
    const across = normalize(sub(free, scale(touched, dot(free, touched))))
    const along = normalize(sub(t, scale(touched, dot(t, touched))))
    const origin = add(p, scale(add(across, touched), offsetMm))
    for (const deg of SWEEP_DEG) {
      const angle = (deg * Math.PI) / 180
      const span = closedOffAt(origin, add(scale(across, Math.cos(angle)), scale(along, Math.sin(angle))), probe)
      if (span === null) return false
      widest = Math.max(widest, span)
    }
  }
  return deepEnough(widest)
}

// Distance to the own body along dir when it is met first and within the span, otherwise null.
function closedOffAt(origin: Vec3, dir: Vec3, probe: HollowProbe): number | null {
  const own = probe.own(origin, dir)
  if (!(own < HOLLOW_SPAN_MM)) return null
  if (probe.others && probe.others(origin, dir) < own) return null
  return own
}
