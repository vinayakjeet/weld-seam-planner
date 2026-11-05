import { add, length, scale, sub, type Vec3 } from '../../core/math/vec3'

// The torch the arm carries: from the wrist on along the last link for the torch length, as the reach solves it (the
// last link lies along tool z). Null when the chain has no last link to follow.
export function armTorch(joints: Vec3[], torchLengthMm: number): { from: Vec3; to: Vec3 } | null {
  if (joints.length < 2) return null
  const wrist = joints[joints.length - 1]!
  const last = sub(wrist, joints[joints.length - 2]!)
  const span = length(last)
  if (span < 1e-9) return null
  return { from: wrist, to: add(wrist, scale(last, torchLengthMm / span)) }
}
