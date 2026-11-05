import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../../../src/core/math/vec3'
import { legacySeamId, seamCentre, seamId } from '../../../src/core/seams/seamId'

const pt = (x: number, y: number, z: number) => ({ p: [x, y, z] as Vec3 })

// A square loop 100 mm on a side, sampled every 25 mm, listed from the given sample (0 to 15).
function square(start: number, origin: Vec3 = [0, 0, 0]) {
  const corners: Array<[number, number, number, number]> = [[0, 0, 1, 0], [100, 0, 0, 1], [100, 100, -1, 0], [0, 100, 0, -1]]
  const ring: Vec3[] = corners.flatMap(([cx, cy, dx, dy]) => [0, 1, 2, 3].map((s): Vec3 => [cx + dx * 25 * s, cy + dy * 25 * s, 0]))
  const points = Array.from({ length: 16 }, (_, i) => ring[(i + start) % 16]!).map(([x, y, z]) => pt(x + origin[0], y + origin[1], z + origin[2]))
  return { source: 'intersection', closed: true, lengthMm: 400, points }
}

describe('seamCentre', () => {
  it('is the middle of a straight seam whichever end it starts from', () => {
    const points = [pt(0, 0, 0), pt(10, 0, 0), pt(40, 0, 0)]
    expect(seamCentre(points, false)).toEqual([20, 0, 0])
    expect(seamCentre([...points].reverse(), false)).toEqual([20, 0, 0])
  })

  it('weights each segment by its length, so spacing does not matter', () => {
    expect(seamCentre([pt(0, 0, 0), pt(1, 0, 0), pt(40, 0, 0)], false)).toEqual([20, 0, 0])
  })

  it('gives the centre of a loop from any start, counting the closing segment', () => {
    for (const start of [0, 3, 7, 11]) {
      const c = seamCentre(square(start).points, true)
      expect(c[0]).toBeCloseTo(50, 9)
      expect(c[1]).toBeCloseTo(50, 9)
    }
  })

  it('falls back to the one point of a seam of zero length', () => {
    expect(seamCentre([pt(3, 4, 5), pt(3, 4, 5)], false)).toEqual([3, 4, 5])
  })
})

describe('seamId', () => {
  const origin: Vec3 = [0, 0, 0]

  it('is the same for a loop started at any point', () => {
    const ids = new Set([0, 1, 5, 9, 15].map((start) => seamId(square(start), origin)))
    expect(ids.size).toBe(1)
  })

  it('is the same for a seam run in the other direction', () => {
    const seam = { source: 'crease', closed: false, lengthMm: 300, points: [pt(0, 0, 0), pt(100, 0, 0), pt(200, 50, 0), pt(300, 50, 0)] }
    expect(seamId({ ...seam, points: [...seam.points].reverse() }, origin)).toBe(seamId(seam, origin))
  })

  it('is the same when the part and the origin move together', () => {
    const far: Vec3 = [3.2e4, -4e4, 5e4]
    expect(seamId(square(3, far), far)).toBe(seamId(square(3), origin))
  })

  it('holds under noise far below one step and changes for a seam one step away', () => {
    const base = square(0)
    const nudged = { ...base, points: base.points.map(({ p }) => pt(p[0] + 0.004, p[1] - 0.003, p[2] + 0.002)) }
    expect(seamId(nudged, origin)).toBe(seamId(base, origin))
    const moved = { ...base, points: base.points.map(({ p }) => pt(p[0] + 0.2, p[1], p[2])) }
    expect(seamId(moved, origin)).not.toBe(seamId(base, origin))
  })

  it('tells seams of different length apart, and open from closed', () => {
    const base = square(0)
    expect(seamId({ ...base, lengthMm: 410 }, origin)).not.toBe(seamId(base, origin))
    expect(seamId({ ...base, closed: false }, origin)).not.toBe(seamId(base, origin))
  })

  it('starts with the source and holds eight hex digits', () => {
    expect(seamId(square(0), origin)).toMatch(/^intersection-[0-9a-f]{8}$/)
  })
})

describe('legacySeamId', () => {
  it('is the version 1 id, which moves with the start of a loop and with the part', () => {
    expect(legacySeamId(square(0))).toMatch(/^intersection-[0-9a-f]{8}$/)
    expect(legacySeamId(square(1))).not.toBe(legacySeamId(square(0)))
    expect(legacySeamId(square(0, [1000, 0, 0]))).not.toBe(legacySeamId(square(0)))
  })

  it('keeps the exact ids that version 1 plans were saved with (read off the T-joint before the change)', () => {
    const line = (y: number) => ({
      source: 'crease',
      closed: false,
      lengthMm: 200,
      points: [pt(-100, y, 10), pt(-99, y, 10), pt(0, y, 10), pt(99, y, 10), pt(100, y, 10)],
    })
    // The middle point of 101 samples is the one at x = 0; five points here put it in the same place.
    expect(legacySeamId(line(5))).toBe('crease-2ae63b16')
    expect(legacySeamId(line(-5))).toBe('crease-306a3f73')
  })
})
