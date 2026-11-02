import { Matrix4, Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { angleBetweenQuat, fromBasis, normalizeQuat, rotate, slerp, type Quat } from '../../../src/core/math/quat'
import type { Vec3 } from '../../../src/core/math/vec3'
import { seededRandom } from '../helpers/random'

const S = Math.SQRT1_2

const near = (a: ArrayLike<number>, b: ArrayLike<number>, digits = 12) => {
  expect(a.length).toBe(b.length)
  for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i]!, digits)
}

const basisOf = (q: Quat): { x: Vec3; y: Vec3; z: Vec3 } => {
  const m = new Matrix4().makeRotationFromQuaternion(new Quaternion(...q))
  const e = m.elements
  return { x: [e[0]!, e[1]!, e[2]!], y: [e[4]!, e[5]!, e[6]!], z: [e[8]!, e[9]!, e[10]!] }
}

const randomQuat = (rand: () => number): Quat => {
  const q = new Quaternion(rand() - 0.5, rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize()
  return [q.x, q.y, q.z, q.w]
}

describe('fromBasis', () => {
  it('maps the identity frame to the identity quaternion', () => {
    near(fromBasis([1, 0, 0], [0, 1, 0], [0, 0, 1]), [0, 0, 0, 1])
  })

  it('reads the frame axes as matrix columns: a quarter turn about z', () => {
    near(fromBasis([0, 1, 0], [-1, 0, 0], [0, 0, 1]), [0, 0, S, S])
  })

  it('handles half turns about each axis, where the trace is negative', () => {
    near(fromBasis([1, 0, 0], [0, -1, 0], [0, 0, -1]), [1, 0, 0, 0])
    near(fromBasis([-1, 0, 0], [0, 1, 0], [0, 0, -1]), [0, 1, 0, 0])
    near(fromBasis([-1, 0, 0], [0, -1, 0], [0, 0, 1]), [0, 0, 1, 0])
  })

  it('agrees with three.js on 1000 seeded random rotations, unit length and w >= 0', () => {
    const rand = seededRandom(7)
    for (let i = 0; i < 1000; i++) {
      const source = randomQuat(rand)
      const { x, y, z } = basisOf(source)
      const q = fromBasis(x, y, z)
      expect(Math.hypot(...q)).toBeCloseTo(1, 12)
      expect(q[3]).toBeGreaterThanOrEqual(0)
      const sign = source[3] < 0 ? -1 : 1
      near(q, source.map((c) => c * sign), 9)
    }
  })
})

describe('normalizeQuat', () => {
  it('scales to unit length', () => {
    near(normalizeQuat([0, 0, 3, 4]), [0, 0, 0.6, 0.8])
  })

  it('turns the zero quaternion into the identity instead of NaN', () => {
    expect(normalizeQuat([0, 0, 0, 0])).toEqual([0, 0, 0, 1])
  })
})

describe('slerp', () => {
  const identity: Quat = [0, 0, 0, 1]
  const quarterZ: Quat = [0, 0, S, S]

  it('returns the end points at u = 0 and u = 1', () => {
    near(slerp(identity, quarterZ, 0), identity)
    near(slerp(identity, quarterZ, 1), quarterZ)
  })

  it('halves the angle at u = 0.5', () => {
    const half = slerp(identity, quarterZ, 0.5)
    const eighth = Math.PI / 8
    near(half, [0, 0, Math.sin(eighth), Math.cos(eighth)])
  })

  it('turns at a constant angular rate', () => {
    const angles = [0, 0.25, 0.5, 0.75, 1].map((u) => angleBetweenQuat(identity, slerp(identity, quarterZ, u)))
    near(angles, [0, 22.5, 45, 67.5, 90], 9)
  })

  it('takes the short way round when the second quaternion has the opposite sign', () => {
    const negated: Quat = [0, 0, -S, -S]
    const half = slerp(identity, negated, 0.5)
    near(half, [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)])
  })

  it('stays unit length with w >= 0 and does not produce NaN for identical inputs', () => {
    const same = slerp(quarterZ, quarterZ, 0.37)
    near(same, quarterZ)
    const rand = seededRandom(11)
    for (let i = 0; i < 200; i++) {
      const q = slerp(randomQuat(rand), randomQuat(rand), rand())
      expect(Math.hypot(...q)).toBeCloseTo(1, 12)
      expect(q[3]).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('angleBetweenQuat', () => {
  it('measures the rotation between two orientations in degrees, ignoring quaternion sign', () => {
    expect(angleBetweenQuat([0, 0, 0, 1], [0, 0, S, S])).toBeCloseTo(90, 9)
    expect(angleBetweenQuat([0, 0, S, S], [0, 0, -S, -S])).toBeCloseTo(0, 9)
  })

  it('is precise for tiny rotations where acos would lose digits', () => {
    const tiny = (Math.PI / 180) * 1e-7
    const q: Quat = [0, 0, Math.sin(tiny / 2), Math.cos(tiny / 2)]
    expect(angleBetweenQuat([0, 0, 0, 1], q)).toBeCloseTo(1e-7, 12)
  })
})

describe('rotate', () => {
  it('rotates a vector by the quaternion, matching three.js', () => {
    const rand = seededRandom(3)
    for (let i = 0; i < 100; i++) {
      const q = randomQuat(rand)
      const v: Vec3 = [rand() * 4 - 2, rand() * 4 - 2, rand() * 4 - 2]
      const expected = new Vector3(...v).applyQuaternion(new Quaternion(...q))
      near(rotate(q, v), [expected.x, expected.y, expected.z], 12)
    }
  })
})
