import { describe, expect, it } from 'vitest'
import {
  ARM_BOUNDS,
  DEFAULT_ARM,
  bendAngles,
  capsuleRadius,
  clampArm,
  wristTarget,
  type ArmChain,
} from '../../../src/core/snake/arm'
import type { Vec3 } from '../../../src/core/math/vec3'

// A chain along +x from the origin with the given joint-to-joint turns (deg, about z) after the straight part.
function chainWithTurns(straight: number, turns: number[], linkLength = 150): ArmChain {
  const joints: Vec3[] = [
    [0, 0, 0],
    [straight, 0, 0],
  ]
  let heading = 0
  for (const turn of turns) {
    heading += (turn * Math.PI) / 180
    const last = joints[joints.length - 1]!
    joints.push([last[0] + linkLength * Math.cos(heading), last[1] + linkLength * Math.sin(heading), last[2]])
  }
  return { joints }
}

describe('DEFAULT_ARM and ARM_BOUNDS', () => {
  it('holds the spec defaults', () => {
    expect(DEFAULT_ARM).toEqual({
      links: 24,
      linkLengthMm: 150,
      diameterMm: 80,
      maxBendDeg: 18,
      torchLengthMm: 250,
      insertionMm: 500,
      clearanceMm: 10,
    })
  })

  it('keeps every default inside its bounds', () => {
    for (const key of Object.keys(DEFAULT_ARM) as Array<keyof typeof DEFAULT_ARM>) {
      expect(DEFAULT_ARM[key], key).toBeGreaterThanOrEqual(ARM_BOUNDS[key].min)
      expect(DEFAULT_ARM[key], key).toBeLessThanOrEqual(ARM_BOUNDS[key].max)
    }
  })
})

describe('wristTarget and capsuleRadius', () => {
  it('moves the TCP back along the tool z by the torch length', () => {
    expect(wristTarget([100, 200, 300], [0, 0, -1], DEFAULT_ARM)).toEqual([100, 200, 550])
    const w = wristTarget([0, 0, 0], [0.6, 0, 0.8], { ...DEFAULT_ARM, torchLengthMm: 100 })
    expect(w[0]).toBeCloseTo(-60, 9)
    expect(w[2]).toBeCloseTo(-80, 9)
  })

  it('adds the clearance to the link radius', () => {
    expect(capsuleRadius(DEFAULT_ARM)).toBe(50)
    expect(capsuleRadius({ ...DEFAULT_ARM, diameterMm: 60, clearanceMm: 0 })).toBe(30)
  })
})

describe('clampArm', () => {
  it('rounds links, clamps to bounds and takes the default for a non-finite field', () => {
    const arm = clampArm({ links: 7.6, maxBendDeg: 90, diameterMm: NaN })
    expect([arm.links, arm.maxBendDeg, arm.diameterMm]).toEqual([8, 45, 80])
  })

  it('returns the defaults for an empty patch and clamps from below too', () => {
    expect(clampArm({})).toEqual(DEFAULT_ARM)
    const low = clampArm({ links: -3, linkLengthMm: 1, insertionMm: -5, clearanceMm: -1, torchLengthMm: Infinity })
    expect(low).toMatchObject({ links: 2, linkLengthMm: 50, insertionMm: 0, clearanceMm: 0, torchLengthMm: 250 })
  })
})

describe('bendAngles', () => {
  it('is all zero for a straight chain', () => {
    expect(bendAngles(chainWithTurns(300, [0, 0, 0, 0]), [1, 0, 0])).toEqual([0, 0, 0, 0])
  })

  it('reports an 18 degree kink at the joint where it happens', () => {
    const angles = bendAngles(chainWithTurns(300, [0, 0, 18, 0]), [1, 0, 0])
    expect(angles).toHaveLength(4)
    expect(angles[2]).toBeCloseTo(18, 9)
    for (const k of [0, 1, 3]) expect(angles[k]).toBeCloseTo(0, 9)
  })

  it('measures the first link against the port axis, also when the straight part has no length', () => {
    const angles = bendAngles(chainWithTurns(0, [18, 0]), [1, 0, 0])
    expect(angles[0]).toBeCloseTo(18, 9)
    expect(angles[1]).toBeCloseTo(0, 9)
  })

  it('returns zeros for a chain with coincident joints instead of NaN', () => {
    const angles = bendAngles({ joints: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]] }, [1, 0, 0])
    expect(angles).toEqual([0, 0])
  })
})
