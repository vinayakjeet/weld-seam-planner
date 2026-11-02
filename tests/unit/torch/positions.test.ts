import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../../../src/core/math/vec3'
import { DEFAULT_DETECT_SETTINGS, detectSeams } from '../../../src/core/seams/detect'
import { pointsFromPolyline, type SeamPoint } from '../../../src/core/seams/frames'
import {
  DEFAULT_GRAVITY,
  classifyPosition,
  faceRotationDeg,
  inclinationDeg,
  seamPosition,
} from '../../../src/core/torch/positions'
import { loadSampleModel } from '../helpers/models'
import { shown } from '../helpers/state'

const S = Math.SQRT1_2
const UP: Vec3 = [0, 0, 1]

// A straight seam of length 100 along `from` to `to` between plates with the given free-space normals.
const line = (from: Vec3, to: Vec3, n1: Vec3, n2: Vec3): SeamPoint[] => pointsFromPolyline([from, to], false, () => [n1, n2]).points

const detect = (id: string) => shown(detectSeams(loadSampleModel(id), { creaseAngleDeg: DEFAULT_DETECT_SETTINGS.creaseAngleDeg }))

describe('inclinationDeg', () => {
  it('is the slope of the seam from horizontal, whichever way it runs', () => {
    expect(inclinationDeg([1, 0, 0], UP)).toBeCloseTo(0, 12)
    expect(inclinationDeg([0, 0, 1], UP)).toBeCloseTo(90, 12)
    expect(inclinationDeg([0, 0, -1], UP)).toBeCloseTo(90, 12)
    const slope: Vec3 = [Math.cos(Math.PI / 6), 0, Math.sin(Math.PI / 6)]
    expect(inclinationDeg(slope, UP)).toBeCloseTo(30, 9)
    expect(inclinationDeg([-slope[0], 0, -slope[2]], UP)).toBeCloseTo(30, 9)
  })
})

describe('faceRotationDeg', () => {
  it('is 135 on the +y side and 225 on the -y side of a horizontal T, travelling along +x', () => {
    expect(faceRotationDeg([1, 0, 0], [0, S, S], UP)).toBeCloseTo(135, 9)
    expect(faceRotationDeg([1, 0, 0], [0, -S, S], UP)).toBeCloseTo(225, 9)
  })

  it('is 180 with the face straight up and 0 with it straight down', () => {
    expect(faceRotationDeg([1, 0, 0], [0, 0, 1], UP)).toBeCloseTo(180, 9)
    expect(faceRotationDeg([1, 0, 0], [0, 0, -1], UP)).toBeCloseTo(0, 9)
  })

  it('turns the other way when the travel direction is reversed', () => {
    expect(faceRotationDeg([-1, 0, 0], [0, S, S], UP)).toBeCloseTo(225, 9)
  })

  it('is 0 and finite when the seam runs along gravity or the face points along the seam', () => {
    expect(faceRotationDeg([0, 0, 1], [S, S, 0], UP)).toBe(0)
    expect(faceRotationDeg([1, 0, 0], [1, 0, 0], UP)).toBe(0)
  })
})

describe('classifyPosition', () => {
  const cases: Array<[number, number, boolean, string, string]> = [
    [0, 180, true, 'PA', '1F'],
    [0, 150, true, 'PA', '1F'],
    [0, 210, true, 'PA', '1F'],
    [14.99, 180, true, 'PA', '1F'],
    [0, 149.99, true, 'PB', '2F'],
    [0, 125, true, 'PB', '2F'],
    [0, 210.01, true, 'PB', '2F'],
    [0, 234.99, true, 'PB', '2F'],
    [0, 124.99, true, 'PD', '4F'],
    [0, 235, true, 'PD', '4F'],
    [0, 0, true, 'PD', '4F'],
    [0, 359.99, true, 'PD', '4F'],
    [79.99, 0, true, 'PD', '4F'],
    [15, 180, true, 'PF', '3F'],
    [15, 180, false, 'PG', '3F'],
    [15, 125, true, 'PF', '3F'],
    [45, 234.99, false, 'PG', '3F'],
    [79.99, 180, true, 'PF', '3F'],
    [15, 124.99, true, 'PD', '4F'],
    [15, 235, true, 'PD', '4F'],
    [80, 0, true, 'PF', '3F'],
    [80, 300, false, 'PG', '3F'],
    [90, 123, true, 'PF', '3F'],
    [90, 359, false, 'PG', '3F'],
  ]

  it.each(cases)('inclination %f with rotation %f (climbing %s) is %s (%s)', (inclination, rotation, climbing, iso, aws) => {
    expect(classifyPosition(inclination, rotation, climbing)).toEqual({ iso, aws })
  })
})

describe('seamPosition', () => {
  it('puts a horizontal T on its +y side in PB (2F) at inclination 0 and rotation 135', () => {
    const result = seamPosition(line([0, 0, 0], [100, 0, 0], [0, 1, 0], [0, 0, 1]), DEFAULT_GRAVITY)
    expect(result.code).toBe('PB')
    expect(result.inclinationDeg).toBeCloseTo(0, 9)
    expect(result.rotationDeg).toBeCloseTo(135, 6)
    expect(result.shares).toEqual({ PB: 1 })
  })

  it('puts the -y side of the same T in PB at rotation 225', () => {
    const result = seamPosition(line([0, 0, 0], [100, 0, 0], [0, 0, 1], [0, -1, 0]), DEFAULT_GRAVITY)
    expect(result.code).toBe('PB')
    expect(result.rotationDeg).toBeCloseTo(225, 6)
  })

  it('puts a flat fillet, bisector straight up, in PA (1F), and straight down in PD (4F)', () => {
    const flat = seamPosition(line([0, 0, 0], [100, 0, 0], [0, -S, S], [0, S, S]), DEFAULT_GRAVITY)
    expect(flat.code).toBe('PA')
    expect(flat.rotationDeg).toBeCloseTo(180, 6)
    const overhead = seamPosition(line([0, 0, 0], [100, 0, 0], [0, -S, -S], [0, S, -S]), DEFAULT_GRAVITY)
    expect(overhead.code).toBe('PD')
    expect(classifyPosition(overhead.inclinationDeg, overhead.rotationDeg, false).aws).toBe('4F')
  })

  it('calls a vertical seam PF going up and PG going down, both at inclination 90', () => {
    const up = seamPosition(line([0, 0, 0], [0, 0, 100], [1, 0, 0], [0, 1, 0]), DEFAULT_GRAVITY)
    const down = seamPosition(line([0, 0, 100], [0, 0, 0], [1, 0, 0], [0, 1, 0]), DEFAULT_GRAVITY)
    expect(up.code).toBe('PF')
    expect(down.code).toBe('PG')
    expect(up.inclinationDeg).toBeCloseTo(90, 9)
    expect(down.inclinationDeg).toBeCloseTo(90, 9)
    expect(Number.isFinite(up.rotationDeg)).toBe(true)
    expect(classifyPosition(up.inclinationDeg, up.rotationDeg, true).aws).toBe('3F')
    expect(classifyPosition(down.inclinationDeg, down.rotationDeg, false).aws).toBe('3F')
  })

  it('reads a sloped seam with the face up as vertical, climbing or descending by its direction', () => {
    const t: Vec3 = [S, 0, S]
    expect(inclinationDeg(t, UP)).toBeCloseTo(45, 9)
    const rotation = faceRotationDeg(t, UP, UP)
    expect(rotation).toBeCloseTo(180, 9)
    expect(classifyPosition(45, rotation, true).iso).toBe('PF')
    expect(classifyPosition(45, rotation, false).iso).toBe('PG')
  })

  it('follows a custom gravity: the same T is still PB when gravity points along -y and its face turns', () => {
    const points = line([0, 0, 0], [100, 0, 0], [0, 1, 0], [0, 0, 1])
    const result = seamPosition(points, [0, -1, 0])
    expect(result.code).toBe('PB')
    expect(result.rotationDeg).toBeCloseTo(225, 6)
    expect(seamPosition(points, [0, 0, -7]).rotationDeg).toBeCloseTo(135, 6)
  })

  it('gives the position by length and adds a plus when another position covers at least 10 percent', () => {
    // 11 points one mm apart: the first and last carry half a mm, the rest a full mm, 10 mm in all.
    const mixed = (flatAt: number[]): SeamPoint[] =>
      Array.from({ length: 11 }, (_, k): SeamPoint => {
        const flat = flatAt.includes(k)
        return {
          s: k,
          p: [k, 0, 0],
          t: [1, 0, 0],
          n1: flat ? [0, -S, S] : [0, 1, 0],
          n2: flat ? [0, S, S] : [0, 0, 1],
        }
      })

    const tenPercent = seamPosition(mixed([9]), DEFAULT_GRAVITY)
    expect(tenPercent.shares.PB).toBeCloseTo(0.9, 9)
    expect(tenPercent.shares.PA).toBeCloseTo(0.1, 9)
    expect(tenPercent.code).toBe('PB+')

    const fivePercent = seamPosition(mixed([10]), DEFAULT_GRAVITY)
    expect(fivePercent.shares.PA).toBeCloseTo(0.05, 9)
    expect(fivePercent.code).toBe('PB')

    const flatMajority = seamPosition(mixed([0, 1, 2, 3, 4, 5, 6]), DEFAULT_GRAVITY)
    expect(flatMajority.code).toBe('PA+')
    expect(Object.values(flatMajority.shares).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
  })

  it('weights by arc length, not by sample count', () => {
    const points: SeamPoint[] = [
      { s: 0, p: [0, 0, 0], t: [1, 0, 0], n1: [0, 1, 0], n2: [0, 0, 1] },
      { s: 90, p: [90, 0, 0], t: [1, 0, 0], n1: [0, 1, 0], n2: [0, 0, 1] },
      { s: 100, p: [100, 0, 0], t: [1, 0, 0], n1: [0, -S, S], n2: [0, S, S] },
    ]
    const result = seamPosition(points, DEFAULT_GRAVITY)
    expect(result.shares.PB).toBeCloseTo(0.95, 9)
    expect(result.shares.PA).toBeCloseTo(0.05, 9)
  })

  it('rejects zero and non finite gravity with what, why and what to do', () => {
    const points = line([0, 0, 0], [100, 0, 0], [0, 1, 0], [0, 0, 1])
    for (const bad of [[0, 0, 0], [Number.NaN, 0, -1], [0, Number.POSITIVE_INFINITY, 0]] as Vec3[]) {
      expect(() => seamPosition(points, bad)).toThrow(/gravity.*(zero|finite).*(set|use|enter)/i)
    }
  })

  it('stays finite with no NaN when the seam runs along gravity', () => {
    const result = seamPosition(line([0, 0, 0], [0, 0, 100], [1, 0, 0], [0, 1, 0]), [0, 0, -1])
    for (const v of [result.inclinationDeg, result.rotationDeg]) expect(Number.isFinite(v)).toBe(true)
    expect(faceRotationDeg([0, 0, 1], [S, S, 0], [0, 0, 1])).toBe(0)
  })

  it('says what is missing when the seam has no points', () => {
    expect(() => seamPosition([], DEFAULT_GRAVITY)).toThrow(/no points/i)
  })
})

describe('seamPosition on the samples', () => {
  it('puts the pipe-on-plate outer loop and bore loop in PB around their whole length', () => {
    const seams = detect('pipe-on-plate')
    expect(seams).toHaveLength(2)
    const [outer, bore] = [...seams].sort((a, b) => b.lengthMm - a.lengthMm)
    expect(outer!.lengthMm).toBeCloseTo(2 * Math.PI * 25, 0)
    for (const seam of [outer!, bore!]) {
      const result = seamPosition(seam.points, DEFAULT_GRAVITY)
      expect(result.code).toBe('PB')
      expect(Object.keys(result.shares)).toEqual(['PB'])
      expect(result.inclinationDeg).toBeCloseTo(0, 6)
    }
  })

  it('puts the four box-beam seams at the top flange, inside and outside, in PD and the bottom four in PB', () => {
    const seams = detect('box-beam')
    expect(seams).toHaveLength(8)
    const zs = seams.map((s) => s.points[0]!.p[2])
    const middle = (Math.min(...zs) + Math.max(...zs)) / 2
    const top = seams.filter((s) => s.points[0]!.p[2] > middle)
    const bottom = seams.filter((s) => s.points[0]!.p[2] <= middle)
    expect(top).toHaveLength(4)
    expect(bottom).toHaveLength(4)

    const ys = top.map((s) => Math.abs(s.points[0]!.p[1])).sort((a, b) => a - b)
    expect(ys[0]).toBeCloseTo(ys[1]!, 6)
    expect(ys[2]).toBeCloseTo(ys[3]!, 6)
    expect(ys[2]! - ys[0]!).toBeCloseTo(10, 6)

    for (const seam of top) expect(seamPosition(seam.points, DEFAULT_GRAVITY).code).toBe('PD')
    for (const seam of bottom) expect(seamPosition(seam.points, DEFAULT_GRAVITY).code).toBe('PB')
  })
})
