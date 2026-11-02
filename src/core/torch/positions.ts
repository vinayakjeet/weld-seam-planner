import { cross, dot, length, normalize, scale, sub, type Vec3 } from '../math/vec3'
import type { SeamPoint } from '../seams/frames'
import { bisector } from './frames'

// Direction the world pulls things, in the part's frame. It need not be unit length.
export type Gravity = Vec3

export const DEFAULT_GRAVITY: Gravity = [0, 0, -1]

export type IsoPosition = 'PA' | 'PB' | 'PD' | 'PF' | 'PG'
export type AwsPosition = '1F' | '2F' | '3F' | '4F'

const RAD_TO_DEG = 180 / Math.PI
const MIN_PROJECTION = 1e-9
const SECOND_POSITION_SHARE = 0.1
const ISO_ORDER: IsoPosition[] = ['PA', 'PB', 'PF', 'PG', 'PD']
const AWS: Record<IsoPosition, AwsPosition> = { PA: '1F', PB: '2F', PF: '3F', PG: '3F', PD: '4F' }

// Unit vector pointing against gravity.
export function upFromGravity(gravity: Gravity): Vec3 {
  const n = length(gravity)
  if (!Number.isFinite(n) || n === 0) {
    throw new Error(
      `Gravity [${gravity.join(', ')}] is not a usable direction: it must be a finite vector that is not zero, so no welding position can be worked out. Enter the way a dropped bead would fall, for example 0, 0, -1.`,
    )
  }
  return scale(gravity, -1 / n)
}

// Slope of the seam from horizontal, 0 to 90 degrees. up is a unit vector.
export function inclinationDeg(t: Vec3, up: Vec3): number {
  return Math.asin(Math.min(1, Math.abs(dot(normalize(t), up)))) * RAD_TO_DEG
}

const perpendicularTo = (v: Vec3, t: Vec3): Vec3 => sub(v, scale(t, dot(v, t)))

// Angle about the travel direction from straight down to the face direction b, right handed, 0 to 360 degrees:
// 0 is the face down, 180 the face up. 0 when either direction runs along the seam and so has no side.
export function faceRotationDeg(t: Vec3, b: Vec3, up: Vec3): number {
  const axis = normalize(t)
  const down = perpendicularTo(scale(up, -1), axis)
  const face = perpendicularTo(b, axis)
  if (length(down) < MIN_PROJECTION || length(face) < MIN_PROJECTION) return 0
  const angle = Math.atan2(dot(axis, cross(down, face)), dot(down, face)) * RAD_TO_DEG
  return ((angle % 360) + 360) % 360
}

// Bands are lower-inclusive. The flat band is closed at both ends so that it is the same for either travel direction.
export function classifyPosition(
  inclination: number,
  rotation: number,
  climbing: boolean,
): { iso: IsoPosition; aws: AwsPosition } {
  const result = (iso: IsoPosition) => ({ iso, aws: AWS[iso] })
  const vertical = (): IsoPosition => (climbing ? 'PF' : 'PG')
  if (inclination >= 80) return result(vertical())

  const r = ((rotation % 360) + 360) % 360
  if (r < 125 || r >= 235) return result('PD')
  if (inclination >= 15) return result(vertical())
  return result(r >= 150 && r <= 210 ? 'PA' : 'PB')
}

// Each point stands for the arc half way to its neighbours.
function arcWeights(points: SeamPoint[]): number[] {
  const n = points.length
  const weights = points.map((_, k) => (points[Math.min(n - 1, k + 1)]!.s - points[Math.max(0, k - 1)]!.s) / 2)
  return weights.reduce((a, b) => a + b, 0) > 0 ? weights : weights.map(() => 1)
}

export interface SeamPosition {
  // ISO name of the position that covers most of the seam, with a plus when another covers at least 10 percent.
  code: string
  // Length weighted mean over the points in the dominant position.
  inclinationDeg: number
  // Circular mean over the points in the dominant position.
  rotationDeg: number
  // Fraction of the seam length in each position that occurs.
  shares: Record<string, number>
}

export function seamPosition(points: SeamPoint[], gravity: Gravity): SeamPosition {
  const up = upFromGravity(gravity)
  if (points.length === 0) {
    throw new Error('This seam has no points, so its welding position cannot be worked out. Select a seam that was detected or drawn, then try again.')
  }

  const weights = arcWeights(points)
  const readings = points.map((point) => {
    let b = bisector(point.n1, point.n2)
    if (length(b) === 0) b = normalize(point.n1)
    const inclination = inclinationDeg(point.t, up)
    const rotation = faceRotationDeg(point.t, b, up)
    return { inclination, rotation, iso: classifyPosition(inclination, rotation, dot(point.t, up) > 0).iso }
  })

  let total = 0
  const covered = new Map<IsoPosition, number>()
  readings.forEach((reading, k) => {
    total += weights[k]!
    covered.set(reading.iso, (covered.get(reading.iso) ?? 0) + weights[k]!)
  })

  const shares: Record<string, number> = {}
  for (const iso of ISO_ORDER) if (covered.has(iso)) shares[iso] = covered.get(iso)! / total
  const dominant = ISO_ORDER.filter((iso) => covered.has(iso)).reduce((a, b) => (covered.get(b)! > covered.get(a)! ? b : a))
  const secondary = ISO_ORDER.some((iso) => iso !== dominant && (shares[iso] ?? 0) >= SECOND_POSITION_SHARE - 1e-9)

  let weight = 0
  let inclination = 0
  let sin = 0
  let cos = 0
  readings.forEach((reading, k) => {
    if (reading.iso !== dominant) return
    weight += weights[k]!
    inclination += reading.inclination * weights[k]!
    sin += Math.sin(reading.rotation / RAD_TO_DEG) * weights[k]!
    cos += Math.cos(reading.rotation / RAD_TO_DEG) * weights[k]!
  })
  const first = readings.find((reading) => reading.iso === dominant)!
  const rotation = Math.hypot(sin, cos) < 1e-12 * weight ? first.rotation : (((Math.atan2(sin, cos) * RAD_TO_DEG) % 360) + 360) % 360

  return {
    code: secondary ? `${dominant}+` : dominant,
    inclinationDeg: inclination / weight,
    rotationDeg: rotation,
    shares,
  }
}
