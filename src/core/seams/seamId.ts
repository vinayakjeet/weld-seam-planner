import type { Vec3 } from '../math/vec3'
import type { SeamPoint } from './frames'

// Positions are quantised to 0.1 mm. The length is quantised to 1 mm: it is a difference of the seam's end points, so
// it moves by the noise of two vertices while a centre moves by a fraction of it. Measured on the 11 samples with 0.02 mm
// of noise on every vertex (2600 seam comparisons, loops started elsewhere, part moved far away): 0 id changes with the
// length at 1 mm, 3 with it at 0.1 mm. The tube frame added later has inside corners 0.03 mm from a step (its wall is
// 3.18 mm): 2 of its hidden seams changed id in 545 comparisons over the 12 samples, no visible one.
const POSITION_STEP_MM = 0.1
const LENGTH_STEP_MM = 1

interface Identifiable {
  source: string
  closed: boolean
  lengthMm: number
  points: Pick<SeamPoint, 'p'>[]
}

// The centre of the seam's polyline, each segment weighted by its length. It does not depend on where a loop starts
// or which way a seam runs, which the first, middle and last point did.
export function seamCentre(points: Pick<SeamPoint, 'p'>[], closed: boolean): Vec3 {
  const sum: Vec3 = [0, 0, 0]
  let total = 0
  const segments = closed ? points.length : points.length - 1
  for (let i = 0; i < segments; i++) {
    const a = points[i]!.p
    const b = points[(i + 1) % points.length]!.p
    const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    total += length
    for (let c = 0; c < 3; c++) sum[c]! += (length * (a[c]! + b[c]!)) / 2
  }
  if (total === 0) {
    const first = points[0]?.p ?? [0, 0, 0]
    return [first[0], first[1], first[2]]
  }
  return [sum[0]! / total, sum[1]! / total, sum[2]! / total]
}

// Stable across runs, settings that leave the seam unchanged, the part's position (the centre is taken from the part's
// box corner, which `origin` is), the start of a loop and the direction of a seam. Quantising cannot make a step
// vanish: a value within the noise of a step still flips it, so this is stable for noise well under the step and
// otherwise only likely to be (tests/unit/seams/seamIdStability.test.ts measures it on every sample).
export function seamId(seam: Identifiable, origin: Vec3): string {
  const centre = seamCentre(seam.points, seam.closed)
  const key = [
    seam.closed ? 'c' : 'o',
    ...centre.map((x, c) => Math.round((x - origin[c]!) / POSITION_STEP_MM)),
    Math.round(seam.lengthMm / LENGTH_STEP_MM),
  ].join(',')
  return `${seam.source}-${fnv1a(key)}`
}

// The id of version 1 saved plans: the start, middle and end point and the length, each to 0.1 mm, in world
// coordinates. Kept only to find the new id of a seam a stored plan names.
export function legacySeamId(seam: Identifiable): string {
  const { points } = seam
  const pick = points.length === 0 ? [] : [points[0]!, points[points.length >> 1]!, points[points.length - 1]!]
  const key = [...pick.flatMap(({ p }) => p), seam.lengthMm].map((x) => Math.round(x * 10)).join(',')
  return `${seam.source}-${fnv1a(key)}`
}

function fnv1a(key: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
