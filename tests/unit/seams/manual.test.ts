import { describe, expect, it } from 'vitest'
import { cross, length, sub, type Vec3 } from '../../../src/core/math/vec3'
import type { SeamCandidate } from '../../../src/core/seams/detect'
import { pointsFromPolyline } from '../../../src/core/seams/frames'
import { isManualError, mergeSeams, reverseSeam, splitSeam, trimSeam, type ManualError } from '../../../src/core/seams/manual'
import { seam } from '../helpers/state'

const along = (polyline: Vec3[], closed = false, id = 's1', walls: [Vec3, Vec3][] = [[[0, 1, 0], [0, 0, 1]]]): SeamCandidate => {
  const { points, lengthMm } = pointsFromPolyline(polyline, closed, (segment) => walls[segment % walls.length]!)
  return seam(id, 0.8, lengthMm, { points, closed, jointType: 'fillet', openingAngleDeg: 90 })
}

const line = (from: number, to: number, id = 's1') => along([[from, 0, 0], [to, 0, 0]], false, id)

function ok<T>(result: T | ManualError): T {
  if (isManualError(result)) throw new Error(`expected a result, got ${result.what}`)
  return result
}

function expectReadable(result: unknown): ManualError {
  expect(isManualError(result)).toBe(true)
  const error = result as ManualError
  for (const part of [error.what, error.why, error.next]) expect(part.trim().length).toBeGreaterThan(0)
  return error
}

function expectConsistent(seam: SeamCandidate) {
  const { points } = seam
  expect(points[0]!.s).toBeCloseTo(0, 9)
  for (let i = 1; i < points.length; i++) expect(points[i]!.s).toBeGreaterThan(points[i - 1]!.s)
  for (const { t, n1, n2 } of points) {
    expect(length(sub(cross(n1, n2), t))).toBeLessThan(1e-9)
    expect(length(t)).toBeCloseTo(1, 9)
  }
}

describe('reverseSeam', () => {
  const original = line(0, 200)

  it('returns the original within 1e-9 after two reversals', () => {
    const twice = reverseSeam(reverseSeam(original))
    expect(twice.id).toBe(original.id)
    expect(twice.lengthMm).toBeCloseTo(original.lengthMm, 9)
    expect(twice.points).toHaveLength(original.points.length)
    twice.points.forEach((pt, i) => {
      const was = original.points[i]!
      expect(pt.s).toBeCloseTo(was.s, 9)
      for (const key of ['p', 't', 'n1', 'n2'] as const) {
        for (let c = 0; c < 3; c++) expect(pt[key][c]).toBeCloseTo(was[key][c]!, 9)
      }
    })
  })

  it('runs the other way with swapped normals, so n1 x n2 still points along the new tangent', () => {
    const flipped = reverseSeam(original)
    expect(flipped.source).toBe('manual')
    expect(flipped.id).not.toBe(original.id)
    expect(flipped.points[0]!.p).toEqual(original.points[original.points.length - 1]!.p)
    expect(flipped.points[0]!.t[0]).toBe(-1)
    expect(Math.abs(flipped.points[0]!.t[1]) + Math.abs(flipped.points[0]!.t[2])).toBe(0)
    expect(flipped.points[0]!.n1).toEqual(original.points[0]!.n2)
    expect(flipped.points[flipped.points.length - 1]!.s).toBeCloseTo(flipped.lengthMm, 9)
    expectConsistent(flipped)
  })

  it('keeps the first point first on a closed loop and restores it after two reversals', () => {
    const square = along([[0, 0, 0], [40, 0, 0], [40, 40, 0], [0, 40, 0]], true, 'loop', [
      [[0, 0, 1], [0, -1, 0]],
      [[0, 0, 1], [1, 0, 0]],
      [[0, 0, 1], [0, 1, 0]],
      [[0, 0, 1], [-1, 0, 0]],
    ])
    const flipped = reverseSeam(square)
    expect(flipped.points[0]!.p).toEqual(square.points[0]!.p)
    expect(flipped.points[1]!.p).toEqual(square.points[square.points.length - 1]!.p)
    expect(flipped.closed).toBe(true)
    expect(flipped.lengthMm).toBeCloseTo(160, 9)
    expectConsistent(flipped)
    const twice = reverseSeam(flipped)
    twice.points.forEach((pt, i) => {
      expect(pt.s).toBeCloseTo(square.points[i]!.s, 9)
      expect(pt.p[0]).toBeCloseTo(square.points[i]!.p[0], 9)
      expect(pt.p[1]).toBeCloseTo(square.points[i]!.p[1], 9)
    })
  })
})

describe('splitSeam', () => {
  const original = line(0, 200)

  it('splits a 200 mm seam at 80 into 80 and 120 mm seams that share one point', () => {
    const [a, b] = ok(splitSeam(original, 80))
    expect(a.lengthMm).toBeCloseTo(80, 9)
    expect(b.lengthMm).toBeCloseTo(120, 9)
    expect(a.points[a.points.length - 1]!.p).toEqual(b.points[0]!.p)
    expect(b.points[0]!.s).toBe(0)
    expect(a.id).toBe('s1/a')
    expect(b.id).toBe('s1/b')
    expect([a.label, b.label]).toEqual(['S1a', 'S1b'])
    for (const child of [a, b]) {
      expect(child.source).toBe('manual')
      expect(child.closed).toBe(false)
      expect(child.confidence).toBe(original.confidence)
      expect(child.jointType).toBe('fillet')
      expectConsistent(child)
    }
    expect(a.points.length + b.points.length).toBe(original.points.length + 1)
  })

  it('interpolates the cut when it falls between two samples', () => {
    const [a, b] = ok(splitSeam(original, 81.3))
    expect(a.lengthMm).toBeCloseTo(81.3, 9)
    expect(b.lengthMm).toBeCloseTo(118.7, 9)
    expect(a.points[a.points.length - 1]!.p[0]).toBeCloseTo(81.3, 9)
    expect(b.points[0]!.p[0]).toBeCloseTo(81.3, 9)
  })

  it('takes the frame of the nearer side when the cut falls across a corner', () => {
    const corner = along([[0, 0, 0], [49.5, 0, 0], [49.5, 50, 0]], false, 'l', [
      [[0, 0, 1], [0, 1, 0]],
      [[0, 0, 1], [-1, 0, 0]],
    ])
    const [a, b] = ok(splitSeam(corner, 49.1))
    for (const pt of [a.points[a.points.length - 1]!, b.points[0]!]) {
      expect(length(pt.t)).toBeCloseTo(1, 9)
      expect(Math.max(...pt.t.map(Math.abs))).toBeCloseTo(1, 9)
    }
    expectConsistent(a)
    expectConsistent(b)
  })

  it('refuses to split within 2 mm of either end', () => {
    expect(isManualError(splitSeam(original, 1.9))).toBe(true)
    expect(isManualError(splitSeam(original, 198.1))).toBe(true)
    expect(isManualError(splitSeam(original, -5))).toBe(true)
    expect(isManualError(splitSeam(original, 2))).toBe(false)
    expect(expectReadable(splitSeam(original, 1))).toMatchObject({ what: expect.stringContaining('S1') })
  })

  it('refuses to split a closed loop', () => {
    const loop = along([[0, 0, 0], [40, 0, 0], [40, 40, 0], [0, 40, 0]], true)
    expectReadable(splitSeam(loop, 20))
  })
})

describe('mergeSeams', () => {
  it('joins a seam to the one that continues it, summing the lengths without repeating the shared point', () => {
    const merged = ok(mergeSeams(line(0, 100, 'a'), line(100, 200, 'b'), 1))
    expect(merged.id).toBe('a+b')
    expect(merged.label).toBe('A+B')
    expect(merged.lengthMm).toBeCloseTo(200, 9)
    expect(merged.closed).toBe(false)
    expect(merged.points).toHaveLength(line(0, 100).points.length + line(100, 200).points.length - 1)
    expect(merged.points[merged.points.length - 1]!.p[0]).toBeCloseTo(200, 9)
    expectConsistent(merged)
  })

  it.each([
    ['second runs against the first', 0, 100, 200, 100],
    ['both start at the shared end', 100, 200, 100, 0],
    ['second ends where the first starts', 100, 200, 0, 100],
  ])('reverses what is needed when the %s', (_name, aFrom, aTo, bFrom, bTo) => {
    const merged = ok(mergeSeams(line(aFrom, aTo, 'a'), line(bFrom, bTo, 'b'), 1))
    expect(merged.lengthMm).toBeCloseTo(200, 9)
    const xs = merged.points.map((pt) => pt.p[0])
    expect(Math.min(...xs)).toBeCloseTo(0, 9)
    expect(Math.max(...xs)).toBeCloseTo(200, 9)
    expectConsistent(merged)
  })

  it('bridges a small gap and counts it in the length', () => {
    const merged = ok(mergeSeams(line(0, 100, 'a'), line(100.5, 200, 'b'), 1))
    expect(merged.lengthMm).toBeCloseTo(200, 9)
    const bridge = merged.points.find((pt) => Math.abs(pt.p[0] - 100) < 1e-9)!
    expect(bridge).toBeDefined()
  })

  it('closes the loop when the ends also meet on the other side', () => {
    const walls = (face: [Vec3, Vec3][]) => face
    const a = along([[0, 0, 0], [40, 0, 0], [40, 40, 0]], false, 'a', walls([[[0, 0, 1], [0, -1, 0]], [[0, 0, 1], [1, 0, 0]]]))
    const b = along([[40, 40, 0], [0, 40, 0], [0, 0, 0]], false, 'b', walls([[[0, 0, 1], [0, 1, 0]], [[0, 0, 1], [-1, 0, 0]]]))
    const merged = ok(mergeSeams(a, b, 1))
    expect(merged.closed).toBe(true)
    expect(merged.lengthMm).toBeCloseTo(160, 9)
    const first = merged.points[0]!.p
    const last = merged.points[merged.points.length - 1]!.p
    expect(length(sub(first, last))).toBeGreaterThan(1)
  })

  it('combines the attributes of the two seams', () => {
    const a = { ...line(0, 100, 'a'), confidence: 0.9, concavity: 'known' as const }
    const b = { ...line(100, 200, 'b'), confidence: 0.4, concavity: 'unknown' as const }
    const merged = ok(mergeSeams(a, b, 1))
    expect(merged.confidence).toBe(0.4)
    expect(merged.concavity).toBe('unknown')
    expect(merged.openingAngleDeg).toBeCloseTo(90, 9)
  })

  it('stays approximate when either seam was drawn across open surface', () => {
    const drawn = { ...line(100, 200, 'b'), approximateNormals: true }
    expect(ok(mergeSeams(line(0, 100, 'a'), drawn, 1)).approximateNormals).toBe(true)
    expect(ok(mergeSeams(line(0, 100, 'a'), line(100, 200, 'b'), 1)).approximateNormals).toBeUndefined()
  })

  it('refuses seams that are far apart, saying how far', () => {
    const error = expectReadable(mergeSeams(line(0, 100, 'a'), line(120, 200, 'b'), 1))
    expect(error.why).toContain('20.0 mm')
  })

  it('refuses a closed loop', () => {
    const loop = along([[0, 0, 0], [40, 0, 0], [40, 40, 0], [0, 40, 0]], true, 'loop')
    expectReadable(mergeSeams(loop, line(0, 100, 'b'), 1))
    expectReadable(mergeSeams(line(0, 100, 'b'), loop, 1))
  })
})

describe('trimSeam', () => {
  const original = line(0, 200)

  it('cuts 5 mm from the start and 3 mm from the end, interpolating the new end points', () => {
    const trimmed = ok(trimSeam(original, 5, 3))
    expect(trimmed.lengthMm).toBeCloseTo(192, 9)
    expect(trimmed.points[0]!.p[0]).toBeCloseTo(5, 9)
    expect(trimmed.points[trimmed.points.length - 1]!.p[0]).toBeCloseTo(197, 9)
    expect(trimmed.points[trimmed.points.length - 1]!.s).toBeCloseTo(192, 9)
    expect(trimmed.source).toBe('manual')
    expectConsistent(trimmed)
  })

  it('leaves the seam as it was when nothing is cut', () => {
    const same = ok(trimSeam(original, 0, 0))
    expect(same.lengthMm).toBeCloseTo(200, 9)
    expect(same.points).toHaveLength(original.points.length)
  })

  it('refuses to leave less than 1 mm, and accepts exactly 1 mm', () => {
    expectReadable(trimSeam(original, 100, 99.5))
    expect(ok(trimSeam(original, 100, 99)).lengthMm).toBeCloseTo(1, 9)
  })

  it('refuses a closed loop and negative amounts', () => {
    expectReadable(trimSeam(along([[0, 0, 0], [40, 0, 0], [40, 40, 0], [0, 40, 0]], true), 1, 1))
    expectReadable(trimSeam(original, -1, 0))
    expectReadable(trimSeam(original, Number.NaN, 0))
  })
})

describe('thickness through manual operations', () => {
  const plated = (id = 's1'): SeamCandidate => ({ ...line(0, 200, id), thicknessMm: [8, 12] })

  it('swaps the pair when reversing and restores it after two reversals', () => {
    const flipped = reverseSeam(plated())
    expect(flipped.thicknessMm).toEqual([12, 8])
    expect(flipped.points[0]!.n1).toEqual(plated().points[0]!.n2)
    expect(reverseSeam(flipped).thicknessMm).toEqual([8, 12])
  })

  it('swaps the pair of a closed loop as well', () => {
    const square = along([[0, 0, 0], [40, 0, 0], [40, 40, 0], [0, 40, 0]], true, 'loop', [
      [[0, 0, 1], [0, -1, 0]],
      [[0, 0, 1], [1, 0, 0]],
      [[0, 0, 1], [0, 1, 0]],
      [[0, 0, 1], [-1, 0, 0]],
    ])
    expect(reverseSeam({ ...square, thicknessMm: [6, 10] }).thicknessMm).toEqual([10, 6])
  })

  it('keeps the pair on both halves of a split and on a trim', () => {
    const [a, b] = ok(splitSeam(plated(), 80)) as [SeamCandidate, SeamCandidate]
    expect(a.thicknessMm).toEqual([8, 12])
    expect(b.thicknessMm).toEqual([8, 12])
    expect(ok(trimSeam(plated(), 10, 10)).thicknessMm).toEqual([8, 12])
  })

  it('keeps the first seam pair on a merge', () => {
    const first = { ...line(0, 100, 'a'), thicknessMm: [8, 12] as SeamCandidate['thicknessMm'] }
    const second = { ...line(100, 200, 'b'), thicknessMm: [6, 20] as SeamCandidate['thicknessMm'] }
    expect(ok(mergeSeams(first, second, 1)).thicknessMm).toEqual([8, 12])
  })
})
