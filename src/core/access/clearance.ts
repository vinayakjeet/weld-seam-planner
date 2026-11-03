import { rotate } from '../math/quat'
import { cross, length, normalize, scale, sub, add, type Vec3 } from '../math/vec3'
import type { SeamAccess } from '../job/schema'
import type { SeamPoint } from '../seams/frames'
import { DEFAULT_TORCH, poseAt, torchPoses } from '../torch/frames'

export type AccessClass = 'standard' | 'slim' | 'snake' | 'blocked'

// Distance along dir to the first hit within maxMm, or Infinity when there is none.
export type Occluder = (origin: Vec3, dir: Vec3, maxMm: number) => number

export const FAR_RANGE_MM = 300
export const NEAR_RANGE_MM = 60
// A snake arm needs this much free cone out to NEAR_RANGE_MM for its nozzle and first link.
export const NEAR_MIN_DEG = 10
export const POSE_STEP_MM = 20
export const RING_STEP_DEG = 5
export const MAX_HALF_ANGLE_DEG = 60
export const START_OFFSET_MM = 1
// A pose needs NEAR_RANGE_MM * sin(NEAR_MIN_DEG) = 10.4 mm of room from a plate across the seam end, plus a little.
export const END_MARGIN_MM = 13

const STANDARD_DEG = 30
const SLIM_DEG = 15
const EPS = 1e-9

export function classOf(clearanceDeg: number, nearClearanceDeg: number): AccessClass {
  if (clearanceDeg >= STANDARD_DEG) return 'standard'
  if (clearanceDeg >= SLIM_DEG) return 'slim'
  return nearClearanceDeg >= NEAR_MIN_DEG ? 'snake' : 'blocked'
}

export function raysPerRing(deg: number): number {
  return deg === 0 ? 1 : deg <= 30 ? 12 : 16
}

export function poseClearance(
  tcp: Vec3,
  toolZ: Vec3,
  occluded: Occluder,
): { clearanceDeg: number; nearClearanceDeg: number } {
  const axis = normalize(scale(toolZ, -1))
  const helper: Vec3 = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const u = normalize(cross(axis, helper))
  const v = cross(axis, u)
  const origin = add(tcp, scale(axis, START_OFFSET_MM))

  let far = 0
  let near = 0
  let farDone = false
  let nearDone = false
  for (let deg = 0; deg <= MAX_HALF_ANGLE_DEG && !(farDone && nearDone); deg += RING_STEP_DEG) {
    const n = raysPerRing(deg)
    const theta = (deg * Math.PI) / 180
    let nearest = Infinity
    for (let r = 0; r < n && nearest > 0; r++) {
      const phi = (2 * Math.PI * r) / n
      const lateral = Math.sin(theta)
      const dir: Vec3 = [0, 1, 2].map(
        (c) => Math.cos(theta) * axis[c]! + lateral * (Math.cos(phi) * u[c]! + Math.sin(phi) * v[c]!),
      ) as Vec3
      nearest = Math.min(nearest, occluded(origin, dir, FAR_RANGE_MM))
      // Once something is inside the near range both cones are already cut at this ring.
      if (nearest <= NEAR_RANGE_MM) break
    }
    if (!farDone) {
      if (nearest > FAR_RANGE_MM) far = deg
      else farDone = true
    }
    if (!nearDone) {
      if (nearest > NEAR_RANGE_MM) near = deg
      else nearDone = true
    }
  }
  return { clearanceDeg: far, nearClearanceDeg: near }
}

export interface AccessStation {
  s: number
  clearanceDeg: number
  nearClearanceDeg: number
}

export interface AccessAnalysis {
  access: SeamAccess
  stations: AccessStation[]
}

function seamLength(points: SeamPoint[], closed: boolean): number {
  const last = points[points.length - 1]!
  return closed ? last.s + length(sub(last.p, points[0]!.p)) : last.s
}

interface Station {
  // Where along the seam the pose is taken, after pulling the ends in.
  at: number
  // The 20 mm grid position it stands for; intervals are cut from these.
  nominal: number
}

function stationsFor(lengthMm: number, closed: boolean): Station[] {
  const nominals: number[] = []
  for (let s = 0; s < lengthMm - EPS; s += POSE_STEP_MM) nominals.push(s)
  if (!closed) nominals.push(lengthMm)
  const margin = Math.min(END_MARGIN_MM, lengthMm / 2)
  const out: Station[] = []
  for (const nominal of nominals) {
    const at = closed ? nominal : Math.min(Math.max(nominal, margin), lengthMm - margin)
    if (out.length > 0 && Math.abs(out[out.length - 1]!.at - at) < EPS) continue
    out.push({ at, nominal })
  }
  return out
}

const EMPTY: SeamAccess = { clearanceDeg: null, nearClearanceDeg: null, class: null, portId: null, reachCoverage: null, unreachable: [] }

export function seamAccess(seam: { points: SeamPoint[]; closed: boolean }, occluded: Occluder): AccessAnalysis {
  const { points, closed } = seam
  if (points.length === 0) return { access: { ...EMPTY }, stations: [] }

  const lengthMm = seamLength(points, closed)
  const poses = torchPoses(points, closed, DEFAULT_TORCH)
  const planned = stationsFor(lengthMm, closed)
  const stations = planned.map(({ at }): AccessStation => {
    const pose = poseAt(poses, at, closed)
    const measured = poseClearance(pose.p, rotate(pose.q, [0, 0, 1]), occluded)
    return { s: at, ...measured }
  })

  const unreachable: Array<[number, number]> = []
  stations.forEach((station, i) => {
    if (classOf(station.clearanceDeg, station.nearClearanceDeg) !== 'blocked') return
    const lo = i === 0 ? 0 : (planned[i - 1]!.nominal + planned[i]!.nominal) / 2
    const hi = i === stations.length - 1 ? lengthMm : (planned[i]!.nominal + planned[i + 1]!.nominal) / 2
    const previous = unreachable[unreachable.length - 1]
    if (previous && lo <= previous[1] + EPS) previous[1] = hi
    else unreachable.push([lo, hi])
  })

  const clearanceDeg = Math.min(...stations.map((s) => s.clearanceDeg))
  const nearClearanceDeg = Math.min(...stations.map((s) => s.nearClearanceDeg))
  return {
    access: {
      clearanceDeg,
      nearClearanceDeg,
      class: classOf(clearanceDeg, nearClearanceDeg),
      portId: null,
      reachCoverage: null,
      unreachable,
    },
    stations,
  }
}
