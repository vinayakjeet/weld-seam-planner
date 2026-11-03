import { cross, dot, length, normalize, scale, sub, type Vec3 } from '../math/vec3'

export interface ArmParams {
  links: number
  linkLengthMm: number
  diameterMm: number
  maxBendDeg: number
  torchLengthMm: number
  // Longest straight part pushed in along the port axis; the solver picks the depth in [0, insertionMm].
  insertionMm: number
  // Added to the link radius when testing for collisions.
  clearanceMm: number
}

export const DEFAULT_ARM: ArmParams = {
  links: 24,
  linkLengthMm: 150,
  diameterMm: 80,
  maxBendDeg: 18,
  torchLengthMm: 250,
  insertionMm: 500,
  clearanceMm: 10,
}

export const ARM_BOUNDS: Record<keyof ArmParams, { min: number; max: number; step: number }> = {
  links: { min: 2, max: 60, step: 1 },
  linkLengthMm: { min: 50, max: 500, step: 10 },
  diameterMm: { min: 20, max: 200, step: 5 },
  maxBendDeg: { min: 1, max: 45, step: 1 },
  torchLengthMm: { min: 50, max: 600, step: 10 },
  insertionMm: { min: 0, max: 2000, step: 50 },
  clearanceMm: { min: 0, max: 50, step: 1 },
}

// A missing or non-finite field takes the default; the rest clamp to the bounds, and the link count is whole.
export function clampArm(arm: Partial<ArmParams>): ArmParams {
  const out = { ...DEFAULT_ARM }
  for (const key of Object.keys(DEFAULT_ARM) as Array<keyof ArmParams>) {
    const value = arm[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const { min, max } = ARM_BOUNDS[key]
    out[key] = Math.min(max, Math.max(min, key === 'links' ? Math.round(value) : value))
  }
  return out
}

export interface Port {
  id: string
  position: Vec3
  // Unit insertion axis, into the part.
  direction: Vec3
  diameterMm: number
}

// joints[0] is the port and joints[1] the end of the straight part on the port axis (the port itself when the depth is
// 0). Each later joint closes one active link, and the last joint is the wrist.
export interface ArmChain {
  joints: Vec3[]
}

// The wrist sits one torch length behind the TCP, on the tool z axis (which points from the torch into the joint).
export function wristTarget(tcp: Vec3, toolZ: Vec3, arm: ArmParams): Vec3 {
  return sub(tcp, scale(toolZ, arm.torchLengthMm))
}

export function capsuleRadius(arm: ArmParams): number {
  return arm.diameterMm / 2 + arm.clearanceMm
}

// atan2 of the cross and dot is exact for small angles, where acos loses digits.
export function angleBetweenDeg(a: Vec3, b: Vec3): number {
  return (Math.atan2(length(cross(a, b)), dot(a, b)) * 180) / Math.PI
}

// Degrees at each joint from joints[1] on: the first link against the port axis, then each link against the one
// before. A link with no length contributes 0 rather than NaN.
export function bendAngles(chain: ArmChain, axis: Vec3): number[] {
  const { joints } = chain
  const out: number[] = []
  let previous = normalize(axis)
  for (let k = 1; k < joints.length - 1; k++) {
    const direction = normalize(sub(joints[k + 1]!, joints[k]!))
    const degenerate = length(direction) === 0 || length(previous) === 0
    out.push(degenerate ? 0 : angleBetweenDeg(previous, direction))
    if (length(direction) !== 0) previous = direction
  }
  return out
}
