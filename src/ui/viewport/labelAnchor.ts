import type { Vec3 } from '../../core/math/vec3'

// Where a seam's sequence label sits: off the surface, into the open side of the joint (between its two plate normals).
// Off the surface, the label can be tested for being hidden by the part, and the two fillets of a T-joint, which are a
// web's thickness apart, get labels on the two sides of the web instead of one on top of the other.
export function labelAnchor(point: { p: Vec3; n1: Vec3; n2: Vec3 }, lift: number): Vec3 {
  const sum: Vec3 = [point.n1[0] + point.n2[0], point.n1[1] + point.n2[1], point.n1[2] + point.n2[2]]
  const length = Math.hypot(...sum)
  const dir = length > 1e-6 ? sum.map((v) => v / length) : point.n1
  return [point.p[0] + dir[0]! * lift, point.p[1] + dir[1]! * lift, point.p[2] + dir[2]! * lift]
}

// The lift: 1.5 percent of the part diagonal, between 3 and 40 mm.
export function labelLift(bbox: { min: Vec3; max: Vec3 }): number {
  const diagonal = Math.hypot(bbox.max[0] - bbox.min[0], bbox.max[1] - bbox.min[1], bbox.max[2] - bbox.min[2])
  return Math.min(40, Math.max(3, diagonal * 0.015))
}

// Under the x-ray button in the Sequence step, while the part hides some labels: otherwise a part whose seams are all
// inside it would show no numbers at all and look broken.
export function hiddenLabelsText(hidden: number): string | null {
  if (hidden <= 0) return null
  return hidden === 1 ? '1 sequence label is behind the part. X-ray (X) shows it.' : `${hidden} sequence labels are behind the part. X-ray (X) shows them.`
}
