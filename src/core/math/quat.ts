import type { Vec3 } from './vec3'

// [x, y, z, w]. Everything this module returns is unit length with w >= 0.
export type Quat = [number, number, number, number]

const RAD_TO_DEG = 180 / Math.PI

export function normalizeQuat(q: Quat): Quat {
  const n = Math.hypot(q[0], q[1], q[2], q[3])
  return n === 0 ? [0, 0, 0, 1] : [q[0] / n, q[1] / n, q[2] / n, q[3] / n]
}

const canonical = (q: Quat): Quat => {
  const n = normalizeQuat(q)
  return n[3] < 0 ? [-n[0], -n[1], -n[2], -n[3]] : n
}

const dot4 = (a: Quat, b: Quat) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]

// The frame axes are the columns of the rotation matrix.
export function fromBasis(x: Vec3, y: Vec3, z: Vec3): Quat {
  const m00 = x[0], m10 = x[1], m20 = x[2]
  const m01 = y[0], m11 = y[1], m21 = y[2]
  const m02 = z[0], m12 = z[1], m22 = z[2]
  const trace = m00 + m11 + m22
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1)
    return canonical([(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s])
  }
  if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22)
    return canonical([0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s])
  }
  if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22)
    return canonical([(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s])
  }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11)
  return canonical([(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s])
}

// Great circle distance between two unit quaternions, 0 to pi/2 once signs are aligned; half the rotation between the
// orientations. atan2 keeps precision for tiny angles where acos would not.
function arcRad(a: Quat, b: Quat): number {
  const sign = dot4(a, b) < 0 ? -1 : 1
  const diff = Math.hypot(a[0] - sign * b[0], a[1] - sign * b[1], a[2] - sign * b[2], a[3] - sign * b[3])
  const sum = Math.hypot(a[0] + sign * b[0], a[1] + sign * b[1], a[2] + sign * b[2], a[3] + sign * b[3])
  return 2 * Math.atan2(diff, sum)
}

// Rotation that takes one orientation to the other, in degrees, 0 to 180.
export function angleBetweenQuat(a: Quat, b: Quat): number {
  return 2 * arcRad(a, b) * RAD_TO_DEG
}

// Shortest path: q and -q are the same rotation, so b is flipped when that is closer.
export function slerp(a: Quat, b: Quat, u: number): Quat {
  const sign = dot4(a, b) < 0 ? -1 : 1
  const omega = arcRad(a, b)
  const sinOmega = Math.sin(omega)
  // Nearly identical orientations: the sine ratio is 0/0, a straight blend is exact enough.
  const wa = omega < 1e-9 ? 1 - u : Math.sin((1 - u) * omega) / sinOmega
  const wb = omega < 1e-9 ? u : Math.sin(u * omega) / sinOmega
  return canonical([
    wa * a[0] + wb * sign * b[0],
    wa * a[1] + wb * sign * b[1],
    wa * a[2] + wb * sign * b[2],
    wa * a[3] + wb * sign * b[3],
  ])
}

export function rotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q
  const tx = 2 * (y * v[2] - z * v[1])
  const ty = 2 * (z * v[0] - x * v[2])
  const tz = 2 * (x * v[1] - y * v[0])
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ]
}
