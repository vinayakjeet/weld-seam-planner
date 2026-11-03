import { rotate } from '../../../src/core/math/quat'
import type { Vec3 } from '../../../src/core/math/vec3'
import { buildWholeBvh } from '../../../src/core/seams/bodyBvh'
import { DEFAULT_DETECT_SETTINGS, detectSeams, type SeamCandidate } from '../../../src/core/seams/detect'
import type { Port } from '../../../src/core/snake/arm'
import { proximityFromBvh } from '../../../src/core/snake/collision'
import { DEFAULT_TORCH, torchPoses, type TorchPose } from '../../../src/core/torch/frames'
import { loadSampleModel } from './models'
import { shown } from './state'

// The manhole centre of tank-with-manhole, looking straight down into the tank.
export const P1: Port = { id: 'P1', position: [400, 500, 1000], direction: [0, 0, -1], diameterMm: 600 }

export interface TankFixture {
  seams: SeamCandidate[]
  near: ReturnType<typeof proximityFromBvh>
}

let cached: TankFixture | null = null

export function tank(): TankFixture {
  if (cached) return cached
  const model = loadSampleModel('tank-with-manhole')
  const seams = shown(detectSeams(model, { creaseAngleDeg: DEFAULT_DETECT_SETTINGS.creaseAngleDeg }))
  cached = { seams, near: proximityFromBvh(buildWholeBvh(model).bvh) }
  return cached
}

export const seamMid = (seam: SeamCandidate): Vec3 => seam.points[seam.points.length >> 1]!.p

export function posesOf(seam: SeamCandidate): TorchPose[] {
  return torchPoses(seam.points, seam.closed, DEFAULT_TORCH)
}

export const toolZOf = (pose: TorchPose): Vec3 => rotate(pose.q, [0, 0, 1])
