import { Matrix4, Quaternion } from 'three'
import { describe, expect, it } from 'vitest'
import { angleBetweenQuat, rotate, type Quat } from '../../../src/core/math/quat'
import { cross, dot, length, normalize, sub, type Vec3 } from '../../../src/core/math/vec3'
import { pointsFromPolyline, type SeamPoint } from '../../../src/core/seams/frames'
import {
  DEFAULT_TORCH,
  bisector,
  frameToQuaternion,
  poseAt,
  torchFrame,
  torchPoses,
  type TorchParams,
} from '../../../src/core/torch/frames'
import { seededRandom } from '../helpers/random'

const R2D = 180 / Math.PI
const S = Math.SQRT1_2

const torch = (over: Partial<TorchParams> = {}): TorchParams => ({ ...DEFAULT_TORCH, ...over })
const angleToPlate = (z: Vec3, n: Vec3) => Math.asin(-dot(z, n)) * R2D
const close = (a: ArrayLike<number>, b: ArrayLike<number>, digits = 9) => {
  for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i]!, digits)
}

const horizontalT: SeamPoint = { s: 0, p: [0, 0, 0], t: [1, 0, 0], n1: [0, 1, 0], n2: [0, 0, 1] }

type Frame = { x: Vec3; y: Vec3; z: Vec3 }
function expectOrthonormal({ x, y, z }: Frame, tol = 1e-9) {
  for (const v of [x, y, z]) expect(Math.abs(length(v) - 1)).toBeLessThan(tol)
  expect(Math.abs(dot(x, y))).toBeLessThan(tol)
  expect(Math.abs(dot(y, z))).toBeLessThan(tol)
  expect(Math.abs(dot(z, x))).toBeLessThan(tol)
  expect(Math.abs(dot(cross(x, y), z) - 1)).toBeLessThan(tol)
}

function expectFinite(frame: Frame, q: Quat) {
  for (const c of [...frame.x, ...frame.y, ...frame.z, ...q]) expect(Number.isFinite(c)).toBe(true)
}

function basisOf(q: Quat): Frame {
  const e = new Matrix4().makeRotationFromQuaternion(new Quaternion(...q)).elements
  return { x: [e[0]!, e[1]!, e[2]!], y: [e[4]!, e[5]!, e[6]!], z: [e[8]!, e[9]!, e[10]!] }
}

describe('DEFAULT_TORCH', () => {
  it('has no work or travel angle, blends corners over 10 mm and approaches from 50 mm', () => {
    expect(DEFAULT_TORCH).toEqual({ workAngleDeg: 0, travelAngleDeg: 0, cornerBlendMm: 10, approachMm: 50 })
  })
})

describe('bisector', () => {
  it('is the normalised sum of the two plate normals', () => {
    close(bisector([0, 1, 0], [0, 0, 1]), [0, S, S], 12)
  })

  it('is the zero vector for opposite normals, which torchFrame treats as degenerate', () => {
    expect(bisector([0, 0, 1], [0, 0, -1])).toEqual([0, 0, 0])
  })
})

describe('torchFrame on a horizontal T-joint', () => {
  it('points the torch exactly 45 degrees from both plates at psi = 0', () => {
    const f = torchFrame(horizontalT, DEFAULT_TORCH)
    expect(f.degenerate).toBe(false)
    close(f.z, [0, -S, -S], 12)
    close(f.x, [1, 0, 0], 12)
    close(f.y, [0, -S, S], 12)
    expect(angleToPlate(f.z, [0, 1, 0])).toBeCloseTo(45, 9)
    expect(angleToPlate(f.z, [0, 0, 1])).toBeCloseTo(45, 9)
    expectOrthonormal(f)
  })

  it('gives 55 degrees to plate 1 and 35 to plate 2 at psi = -10, and the reverse at +10', () => {
    const minus = torchFrame(horizontalT, torch({ workAngleDeg: -10 }))
    expect(angleToPlate(minus.z, [0, 1, 0])).toBeCloseTo(55, 9)
    expect(angleToPlate(minus.z, [0, 0, 1])).toBeCloseTo(35, 9)
    const plus = torchFrame(horizontalT, torch({ workAngleDeg: 10 }))
    expect(angleToPlate(plus.z, [0, 1, 0])).toBeCloseTo(35, 9)
    expect(angleToPlate(plus.z, [0, 0, 1])).toBeCloseTo(55, 9)
  })

  it('tilts the axis toward travel by alpha = +10 (push) and away from it at -10 (drag)', () => {
    const base = torchFrame(horizontalT, DEFAULT_TORCH)
    const push = torchFrame(horizontalT, torch({ travelAngleDeg: 10 }))
    expect(dot(push.z, horizontalT.t)).toBeCloseTo(Math.sin(10 / R2D), 12)
    expect(Math.acos(dot(push.z, base.z)) * R2D).toBeCloseTo(10, 9)
    const drag = torchFrame(horizontalT, torch({ travelAngleDeg: -10 }))
    expect(dot(drag.z, horizontalT.t)).toBeCloseTo(-Math.sin(10 / R2D), 12)
    expectOrthonormal(push)
  })

  it('keeps x along travel by dropping the component of t along the axis', () => {
    const f = torchFrame(horizontalT, torch({ travelAngleDeg: 20 }))
    expect(dot(f.x, f.z)).toBeCloseTo(0, 12)
    expect(dot(f.x, horizontalT.t)).toBeGreaterThan(0.9)
  })
})

describe('torchFrame and frameToQuaternion on 1000 seeded random inputs', () => {
  const rand = seededRandom(42)
  const randomUnit = (): Vec3 => {
    for (;;) {
      const v: Vec3 = [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1]
      if (length(v) > 0.1) return normalize(v)
    }
  }

  it('is orthonormal with determinant +1, and the quaternion is unit, w >= 0 and reproduces the matrix', () => {
    for (let i = 0; i < 1000; i++) {
      const point: SeamPoint = { s: 0, p: [0, 0, 0], t: randomUnit(), n1: randomUnit(), n2: randomUnit() }
      const params = torch({ workAngleDeg: rand() * 120 - 60, travelAngleDeg: rand() * 120 - 60 })
      const frame = torchFrame(point, params)
      expect(frame.degenerate).toBe(false)
      expectOrthonormal(frame)

      const q = frameToQuaternion(frame)
      expect(Math.abs(Math.hypot(...q) - 1)).toBeLessThan(1e-9)
      expect(q[3]).toBeGreaterThanOrEqual(0)
      const back = basisOf(q)
      close(back.x, frame.x)
      close(back.y, frame.y)
      close(back.z, frame.z)
    }
  })
})

describe('torchFrame on degenerate input', () => {
  const cases: Array<[string, SeamPoint]> = [
    ['opposite plate normals', { s: 0, p: [0, 0, 0], t: [1, 0, 0], n1: [0, 0, 1], n2: [0, 0, -1] }],
    ['a zero length tangent', { s: 0, p: [0, 0, 0], t: [0, 0, 0], n1: [0, 1, 0], n2: [0, 0, 1] }],
    ['a tangent parallel to the bisector', { s: 0, p: [0, 0, 0], t: [0, S, S], n1: [0, 1, 0], n2: [0, 0, 1] }],
    ['all-zero normals', { s: 0, p: [0, 0, 0], t: [1, 0, 0], n1: [0, 0, 0], n2: [0, 0, 0] }],
  ]

  it.each(cases)('stays finite, orthonormal and flagged for %s', (_name, point) => {
    for (const params of [DEFAULT_TORCH, torch({ workAngleDeg: 12, travelAngleDeg: 8 })]) {
      const frame = torchFrame(point, params)
      const q = frameToQuaternion(frame)
      expect(frame.degenerate).toBe(true)
      expectFinite(frame, q)
      expectOrthonormal(frame)
      expect(q[3]).toBeGreaterThanOrEqual(0)
    }
  })

  it('keeps the axis along minus the bisector when only the tangent is missing', () => {
    const f = torchFrame({ s: 0, p: [0, 0, 0], t: [0, 0, 0], n1: [0, 1, 0], n2: [0, 0, 1] }, DEFAULT_TORCH)
    close(f.z, [0, -S, -S], 12)
  })
})

describe('torchPoses on a straight seam', () => {
  const polyline: Vec3[] = [[0, 0, 0], [100, 0, 0]]
  const { points } = pointsFromPolyline(polyline, false, () => [[0, 1, 0], [0, 0, 1]])

  it('returns one pose per point with the same arc length and position', () => {
    const poses = torchPoses(points, false, DEFAULT_TORCH)
    expect(poses).toHaveLength(points.length)
    poses.forEach((pose, i) => {
      expect(pose.s).toBe(points[i]!.s)
      expect(pose.p).toEqual(points[i]!.p)
      expect(Math.hypot(...pose.q)).toBeCloseTo(1, 12)
    })
  })

  it('puts approach and retract at p minus z times 50 mm', () => {
    const poses = torchPoses(points, false, DEFAULT_TORCH)
    poses.forEach((pose, i) => {
      const { z } = torchFrame(points[i]!, DEFAULT_TORCH)
      const expected: Vec3 = [pose.p[0] - z[0] * 50, pose.p[1] - z[1] * 50, pose.p[2] - z[2] * 50]
      close(pose.approach, expected, 9)
      close(pose.retract, expected, 9)
    })
  })

  it('uses the configured approach distance', () => {
    const [pose] = torchPoses(points, false, torch({ approachMm: 30 }))
    expect(length(sub(pose!.p, pose!.approach))).toBeCloseTo(30, 9)
  })

  it('returns nothing for an empty seam', () => {
    expect(torchPoses([], false, DEFAULT_TORCH)).toEqual([])
  })
})

describe('torchPoses at corners', () => {
  const walls = (segment: number): [Vec3, Vec3] => (segment === 0 ? [[0, 0, 1], [0, 1, 0]] : [[0, 0, 1], [-1, 0, 0]])
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

  it.each([50, 51])('turns by a constant rate over exactly 10 mm centred on a 90 degree corner at s = %d', (vertex) => {
    const { points } = pointsFromPolyline([[0, 0, 0], [vertex, 0, 0], [vertex, 50, 0]], false, walls)
    const poses = torchPoses(points, false, DEFAULT_TORCH)
    const qa = poses[0]!.q
    const qb = poses[poses.length - 1]!.q
    const theta = angleBetweenQuat(qa, qb)
    expect(theta).toBeGreaterThan(60)

    let previous = 0
    poses.forEach((pose, i) => {
      const fraction = clamp01((pose.s - (vertex - 5)) / 10)
      const turned = angleBetweenQuat(qa, pose.q)
      expect(turned).toBeCloseTo(theta * fraction, 6)
      expect(turned).toBeGreaterThanOrEqual(previous - 1e-9)
      previous = turned
      if (pose.s <= vertex - 5 || pose.s >= vertex + 5) {
        expect(pose.q).toEqual(frameToQuaternion(torchFrame(points[i]!, DEFAULT_TORCH)))
      }
    })

    const inside = poses.filter((pose) => pose.s >= vertex - 5 && pose.s <= vertex + 5)
    expect(inside.length).toBeGreaterThanOrEqual(5)
    for (let i = 0; i + 1 < inside.length; i++) {
      const rate = angleBetweenQuat(inside[i]!.q, inside[i + 1]!.q) / (inside[i + 1]!.s - inside[i]!.s)
      expect(Math.abs(rate / (theta / 10) - 1)).toBeLessThan(0.05)
    }
  })

  it('shrinks both windows to half the gap when two corners are closer than the blend length', () => {
    const polyline: Vec3[] = [[0, 0, 0], [20, 0, 0], [20, 4, 0], [40, 4, 0]]
    const { points } = pointsFromPolyline(polyline, false, (segment) => (segment === 1 ? [[0, 0, 1], [-1, 0, 0]] : [[0, 0, 1], [0, 1, 0]]))
    const poses = torchPoses(points, false, DEFAULT_TORCH)
    const at = (s: number) => poses.find((pose) => Math.abs(pose.s - s) < 1e-9)!
    const qa = at(0).q
    const qb = frameToQuaternion(torchFrame(points.find((pt) => Math.abs(pt.s - 22) < 1e-9)!, DEFAULT_TORCH))
    const theta = angleBetweenQuat(qa, qb)
    expect(angleBetweenQuat(qa, at(20).q)).toBeCloseTo(theta / 2, 6)
    expect(angleBetweenQuat(qb, at(22).q)).toBeCloseTo(0, 6)
    expect(angleBetweenQuat(qb, at(24).q)).toBeCloseTo(theta / 2, 6)
    expect(angleBetweenQuat(qa, at(40).q)).toBeCloseTo(0, 6)
  })

  it('keeps the first pose unblended when a corner sits closer to the start than half the blend', () => {
    const { points } = pointsFromPolyline([[0, 0, 0], [3, 0, 0], [3, 50, 0]], false, walls)
    const poses = torchPoses(points, false, DEFAULT_TORCH)
    close(poses[0]!.q, frameToQuaternion(torchFrame(points[0]!, DEFAULT_TORCH)), 12)
  })

  it('blends every corner of a closed loop, including the one at the wrap point', () => {
    const square: Vec3[] = [[0, 0, 0], [40, 0, 0], [40, 40, 0], [0, 40, 0]]
    const outward = (segment: number): [Vec3, Vec3] => [[0, 0, 1], ([[0, -1, 0], [1, 0, 0], [0, 1, 0], [-1, 0, 0]] as Vec3[])[segment]!]
    const { points } = pointsFromPolyline(square, true, outward)
    const poses = torchPoses(points, true, DEFAULT_TORCH)
    const count = poses.length

    const firstSegment = frameToQuaternion(torchFrame(points[1]!, DEFAULT_TORCH))
    const lastSegment = frameToQuaternion(torchFrame(points[count - 1]!, DEFAULT_TORCH))
    const theta = angleBetweenQuat(lastSegment, firstSegment)
    expect(theta).toBeGreaterThan(60)
    expect(poses[0]!.s).toBe(0)
    expect(angleBetweenQuat(firstSegment, poses[0]!.q)).toBeCloseTo(theta / 2, 6)

    let largest = 0
    for (let i = 0; i < count; i++) {
      largest = Math.max(largest, angleBetweenQuat(poses[i]!.q, poses[(i + 1) % count]!.q))
    }
    expect(largest).toBeLessThan(theta / 2)
  })
})

describe('poseAt', () => {
  const line = pointsFromPolyline([[0, 0, 0], [100, 0, 0]], false, () => [[0, 1, 0], [0, 0, 1]])
  const openPoses = torchPoses(line.points, false, torch({ workAngleDeg: -10 }))
  const lastOpen = openPoses[openPoses.length - 1]!

  it('returns the first and last poses at s = 0 and s = length', () => {
    expect(poseAt(openPoses, 0, false)).toEqual(openPoses[0])
    expect(poseAt(openPoses, lastOpen.s, false)).toEqual(lastOpen)
  })

  it('clamps outside an open seam', () => {
    expect(poseAt(openPoses, -7, false)).toEqual(openPoses[0])
    expect(poseAt(openPoses, lastOpen.s + 7, false)).toEqual(lastOpen)
  })

  it('interpolates position linearly, orientation as a unit quaternion and keeps the approach distance', () => {
    const a = openPoses[10]!
    const b = openPoses[11]!
    const mid = poseAt(openPoses, (a.s + b.s) / 2, false)
    expect(mid.s).toBeCloseTo((a.s + b.s) / 2, 12)
    close(mid.p, [(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2, (a.p[2] + b.p[2]) / 2], 12)
    expect(Math.hypot(...mid.q)).toBeCloseTo(1, 12)
    expect(mid.q[3]).toBeGreaterThanOrEqual(0)
    expect(length(sub(mid.p, mid.approach))).toBeCloseTo(50, 9)
    close(mid.approach, sub(mid.p, rotate(mid.q, [0, 0, 1]).map((c) => c * 50) as Vec3), 9)
    close(mid.retract, mid.approach, 12)
  })

  it('interpolates halfway between two orientations along the shortest arc at a corner', () => {
    const walls = (segment: number): [Vec3, Vec3] => (segment === 0 ? [[0, 0, 1], [0, 1, 0]] : [[0, 0, 1], [-1, 0, 0]])
    const { points } = pointsFromPolyline([[0, 0, 0], [50, 0, 0], [50, 50, 0]], false, walls)
    const poses = torchPoses(points, false, DEFAULT_TORCH)
    const i = poses.findIndex((pose) => pose.s > 46)
    const a = poses[i - 1]!
    const b = poses[i]!
    const mid = poseAt(poses, (a.s + b.s) / 2, false)
    const total = angleBetweenQuat(a.q, b.q)
    expect(angleBetweenQuat(a.q, mid.q)).toBeCloseTo(total / 2, 6)
    expect(angleBetweenQuat(mid.q, b.q)).toBeCloseTo(total / 2, 6)
  })

  it('wraps around a closed loop', () => {
    const square: Vec3[] = [[0, 0, 0], [40, 0, 0], [40, 40, 0], [0, 40, 0]]
    const outward = (segment: number): [Vec3, Vec3] => [[0, 0, 1], ([[0, -1, 0], [1, 0, 0], [0, 1, 0], [-1, 0, 0]] as Vec3[])[segment]!]
    const poses = torchPoses(pointsFromPolyline(square, true, outward).points, true, DEFAULT_TORCH)
    const last = poses[poses.length - 1]!
    const loop = last.s + length(sub(last.p, poses[0]!.p))
    expect(loop).toBeCloseTo(160, 9)

    expect(poseAt(poses, 0, true)).toEqual(poses[0])
    expect(poseAt(poses, last.s, true)).toEqual(last)

    const gap = poseAt(poses, last.s + (loop - last.s) / 2, true)
    close(gap.p, [(last.p[0] + poses[0]!.p[0]) / 2, (last.p[1] + poses[0]!.p[1]) / 2, (last.p[2] + poses[0]!.p[2]) / 2], 9)
    expect(angleBetweenQuat(last.q, gap.q) + angleBetweenQuat(gap.q, poses[0]!.q)).toBeCloseTo(angleBetweenQuat(last.q, poses[0]!.q), 6)

    const wrapped = poseAt(poses, loop + 3, true)
    const direct = poseAt(poses, 3, true)
    close(wrapped.p, direct.p, 9)
    expect(angleBetweenQuat(wrapped.q, direct.q)).toBeCloseTo(0, 6)
    const before = poseAt(poses, -2, true)
    const equivalent = poseAt(poses, loop - 2, true)
    close(before.p, equivalent.p, 9)
    expect(angleBetweenQuat(before.q, equivalent.q)).toBeCloseTo(0, 6)
  })

  it('returns the only pose of a one point seam', () => {
    const only = torchPoses([horizontalT], false, DEFAULT_TORCH)
    expect(poseAt(only, 5, false)).toEqual(only[0])
  })

  it('says what is missing when there are no poses', () => {
    expect(() => poseAt([], 0, false)).toThrow(/no torch poses/i)
  })
})
