export type Vec3 = [number, number, number]

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]

export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])

export function normalize(a: Vec3): Vec3 {
  const n = length(a)
  return n === 0 ? [0, 0, 0] : [a[0] / n, a[1] / n, a[2] / n]
}

// Right-handed rotation of v about axis by deg degrees. The axis need not be unit length; a zero axis leaves v unchanged.
export function rotateAbout(v: Vec3, axis: Vec3, deg: number): Vec3 {
  const k = normalize(axis)
  if (k[0] === 0 && k[1] === 0 && k[2] === 0) return v
  const rad = (deg * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  const kxv = cross(k, v)
  const along = dot(k, v) * (1 - c)
  return [
    v[0] * c + kxv[0] * s + k[0] * along,
    v[1] * c + kxv[1] * s + k[1] * along,
    v[2] * c + kxv[2] * s + k[2] * along,
  ]
}
