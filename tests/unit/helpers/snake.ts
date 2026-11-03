import { rotate } from '../../../src/core/math/quat'
import { length, sub, type Vec3 } from '../../../src/core/math/vec3'
import { occluderFromBvh } from '../../../src/core/access/occluder'
import { seamAccess } from '../../../src/core/access/clearance'
import { buildWholeBvh } from '../../../src/core/seams/bodyBvh'
import { DEFAULT_DETECT_SETTINGS, detectSeams, type SeamCandidate } from '../../../src/core/seams/detect'
import type { Port } from '../../../src/core/snake/arm'
import { proximityFromBvh, type Proximity } from '../../../src/core/snake/collision'
import { DEFAULT_TORCH, torchPoses, type TorchPose } from '../../../src/core/torch/frames'
import { loadSampleModel } from './models'
import { shown } from './state'

// The manhole centre of tank-with-manhole, looking straight down into the tank.
export const P1: Port = { id: 'P1', position: [400, 500, 1000], direction: [0, 0, -1], diameterMm: 600 }

export interface TankFixture {
  seams: SeamCandidate[]
  // The seams the arm has to reach: class snake by the access check.
  snake: SeamCandidate[]
  near: ReturnType<typeof proximityFromBvh>
}

let cached: TankFixture | null = null

export function tank(): TankFixture {
  if (cached) return cached
  const model = loadSampleModel('tank-with-manhole')
  const seams = shown(detectSeams(model, { creaseAngleDeg: DEFAULT_DETECT_SETTINGS.creaseAngleDeg }))
  const whole = buildWholeBvh(model).bvh
  const occluded = occluderFromBvh(whole)
  const snake = seams.filter((seam) => seamAccess(seam, occluded).access.class === 'snake')
  cached = { seams, snake, near: proximityFromBvh(whole) }
  return cached
}

export const seamMid = (seam: SeamCandidate): Vec3 => seam.points[seam.points.length >> 1]!.p

export function posesOf(seam: SeamCandidate): TorchPose[] {
  return torchPoses(seam.points, seam.closed, DEFAULT_TORCH)
}

export const toolZOf = (pose: TorchPose): Vec3 => rotate(pose.q, [0, 0, 1])

// Closest point on the surface of a solid axis aligned box, or null beyond maxMm.
export function boxProximity(min: Vec3, max: Vec3): Proximity {
  return (p, maxMm) => {
    const clamped = p.map((v, c) => Math.min(Math.max(v, min[c]!), max[c]!)) as Vec3
    let point = clamped
    if (clamped.every((v, c) => v === p[c])) {
      // Inside: the nearest face.
      let best = Infinity
      for (let c = 0; c < 3; c++) {
        for (const face of [min[c]!, max[c]!]) {
          const d = Math.abs(p[c]! - face)
          if (d < best) {
            best = d
            point = [...p] as Vec3
            point[c] = face
          }
        }
      }
    }
    const distanceMm = length(sub(p, point))
    return distanceMm <= maxMm ? { point, distanceMm } : null
  }
}

export const nearest = (...proximities: Proximity[]): Proximity => (p, maxMm) => {
  let best: ReturnType<Proximity> = null
  for (const near of proximities) {
    const hit = near(p, maxMm)
    if (hit && (!best || hit.distanceMm < best.distanceMm)) best = hit
  }
  return best
}

export const plane: Proximity = (p, maxMm) => (Math.abs(p[2]) <= maxMm ? { point: [p[0], p[1], 0], distanceMm: Math.abs(p[2]) } : null)
