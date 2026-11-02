import { angleBetweenQuat, fromBasis, rotate, slerp, type Quat } from '../math/quat'
import { add, cross, dot, length, normalize, rotateAbout, scale, sub, type Vec3 } from '../math/vec3'
import type { SeamPoint } from '../seams/frames'

export interface TorchParams {
  // psi: offset of the torch axis from the plate bisector, about the travel direction.
  workAngleDeg: number
  // alpha: tilt of the axis along travel, positive pushes.
  travelAngleDeg: number
  cornerBlendMm: number
  approachMm: number
}

export const DEFAULT_TORCH: TorchParams = { workAngleDeg: 0, travelAngleDeg: 0, cornerBlendMm: 10, approachMm: 50 }

export interface TorchFrame {
  x: Vec3
  y: Vec3
  z: Vec3
  // True when an input could not define the frame and a fallback axis was chosen instead.
  degenerate: boolean
}

export interface TorchPose {
  s: number
  p: Vec3
  q: Quat
  approach: Vec3
  retract: Vec3
}

const DEG = Math.PI / 180
const MIN_SUM = 1e-9
const MIN_PROJECTION = 1e-6
// Smaller frame changes between neighbouring samples are tessellation, not a corner.
const CORNER_MIN_DEG = 10

// The zero vector when the normals cancel.
export function bisector(n1: Vec3, n2: Vec3): Vec3 {
  const sum = add(n1, n2)
  return length(sum) < MIN_SUM ? [0, 0, 0] : normalize(sum)
}

function anyPerpendicular(v: Vec3): Vec3 {
  const [ax, ay, az] = [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])]
  const axis: Vec3 = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1]
  const c = normalize(cross(v, axis))
  return length(c) === 0 ? [1, 0, 0] : c
}

export function torchFrame(point: SeamPoint, params: TorchParams): TorchFrame {
  let degenerate = false
  const t = normalize(point.t)
  if (length(t) === 0) degenerate = true

  let b = bisector(point.n1, point.n2)
  if (length(b) === 0) {
    degenerate = true
    b = normalize(point.n1)
    if (length(b) === 0) b = normalize(point.n2)
    if (length(b) === 0) b = length(t) === 0 ? [0, 0, 1] : anyPerpendicular(t)
  }

  const a = rotateAbout(scale(b, -1), t, params.workAngleDeg)
  const alpha = params.travelAngleDeg * DEG
  let z = normalize(add(scale(a, Math.cos(alpha)), scale(t, Math.sin(alpha))))
  if (length(z) === 0) {
    degenerate = true
    z = a
  }

  let x = sub(t, scale(z, dot(t, z)))
  if (length(x) < MIN_PROJECTION) {
    degenerate = true
    x = anyPerpendicular(z)
  }
  x = normalize(x)
  x = normalize(sub(x, scale(z, dot(x, z))))
  return { x, y: cross(z, x), z, degenerate }
}

export function frameToQuaternion(frame: Pick<TorchFrame, 'x' | 'y' | 'z'>): Quat {
  return fromBasis(frame.x, frame.y, frame.z)
}

interface Corner {
  // Arc length of the polyline vertex the frame jumps at.
  at: number
  from: Quat
  to: Quat
  half: number
}

// Where the two straight pieces on either side of a jump meet, found as the closest approach of their lines and kept
// inside the gap between the two samples. Parallel pieces (the frame changed through the normals only) use the midpoint.
function jumpArc(before: SeamPoint, after: SeamPoint, gap: number): number {
  const r = sub(before.p, after.p)
  const b = dot(before.t, after.t)
  const d = dot(before.t, r)
  const e = dot(after.t, r)
  const denom = 1 - b * b
  const u = denom < 1e-9 ? gap / 2 : (b * e - d) / denom
  return before.s + Math.min(gap, Math.max(0, u))
}

function findCorners(points: SeamPoint[], quats: Quat[], closed: boolean, total: number, halfBlend: number): Corner[] {
  if (halfBlend <= 0) return []
  const n = points.length
  const found: Array<Omit<Corner, 'half'>> = []
  for (let k = 0; k < (closed ? n : n - 1); k++) {
    const j = (k + 1) % n
    if (angleBetweenQuat(quats[k]!, quats[j]!) <= CORNER_MIN_DEG) continue
    const end = j === 0 ? total : points[j]!.s
    found.push({ at: jumpArc(points[k]!, points[j]!, end - points[k]!.s), from: quats[k]!, to: quats[j]! })
  }
  found.sort((a, b) => a.at - b.at)

  // Windows may not overlap: each corner gets at most half the distance to its neighbours, and at an open seam end
  // at most the whole distance to that end so the first and last pose stay unblended.
  return found.map((corner, i) => {
    const prev = i > 0 ? (corner.at - found[i - 1]!.at) / 2 : closed ? (corner.at - found[found.length - 1]!.at + total) / 2 : corner.at
    const next = i < found.length - 1 ? (found[i + 1]!.at - corner.at) / 2 : closed ? (found[0]!.at + total - corner.at) / 2 : total - corner.at
    return { ...corner, half: Math.min(halfBlend, prev, next) }
  })
}

function blendedAt(s: number, own: Quat, corners: Corner[], closed: boolean, total: number): Quat {
  for (const corner of corners) {
    let d = s - corner.at
    if (closed) d -= total * Math.round(d / total)
    if (Math.abs(d) < corner.half) return slerp(corner.from, corner.to, (d + corner.half) / (2 * corner.half))
  }
  return own
}

const loopLength = (poses: Array<{ s: number; p: Vec3 }>, closed: boolean): number => {
  const first = poses[0]!
  const last = poses[poses.length - 1]!
  return closed ? last.s + length(sub(last.p, first.p)) : last.s
}

export function torchPoses(points: SeamPoint[], closed: boolean, params: TorchParams): TorchPose[] {
  if (points.length === 0) return []
  const quats = points.map((point) => frameToQuaternion(torchFrame(point, params)))
  const total = loopLength(points, closed)
  const corners = findCorners(points, quats, closed, total, params.cornerBlendMm / 2)

  return points.map((point, k) => {
    const q = blendedAt(point.s, quats[k]!, corners, closed, total)
    const away = sub(point.p, scale(rotate(q, [0, 0, 1]), params.approachMm))
    return { s: point.s, p: [...point.p], q, approach: away, retract: [...away] }
  })
}

const lerp = (a: Vec3, b: Vec3, f: number): Vec3 => add(scale(a, 1 - f), scale(b, f))

export function poseAt(poses: TorchPose[], s: number, closed: boolean): TorchPose {
  if (poses.length === 0) {
    throw new Error('No torch poses to read: the seam has no points. Select a seam with at least one point, then try again.')
  }
  const first = poses[0]!
  const last = poses[poses.length - 1]!
  const total = loopLength(poses, closed)
  const arc = closed ? ((s % total) + total) % total : Math.min(Math.max(s, first.s), last.s)

  let lo = 0
  let hi = poses.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (poses[mid]!.s <= arc) lo = mid
    else hi = mid - 1
  }
  const a = poses[lo]!
  const wraps = lo === poses.length - 1
  const b = wraps ? (closed ? first : undefined) : poses[lo + 1]
  if (!b) return a
  const span = (wraps ? total : b.s) - a.s
  const f = span > 0 ? (arc - a.s) / span : 0
  if (f === 0) return a

  const q = slerp(a.q, b.q, f)
  const z = rotate(q, [0, 0, 1])
  const p = lerp(a.p, b.p, f)
  const approach = sub(p, scale(z, length(sub(a.p, a.approach))))
  const retract = sub(p, scale(z, length(sub(a.p, a.retract))))
  return { s: arc, p, q, approach, retract }
}
