import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../../../src/core/math/vec3'
import { resamplePolyline } from '../../../src/core/seams/resample'

describe('resamplePolyline', () => {
  it('samples a 200 mm line every 2 mm with exact endpoints', () => {
    const r = resamplePolyline([[0, 0, 0], [200, 0, 0]], false)
    expect(r.p).toHaveLength(101)
    expect(r.length).toBe(200)
    expect(r.p[0]).toEqual([0, 0, 0])
    expect(r.p[100]).toEqual([200, 0, 0])
    expect(r.s[1]).toBeCloseTo(2, 9)
    expect(r.p[1]![0]).toBeCloseTo(2, 9)
  })

  it('stretches the spacing to length / 200 on long lines', () => {
    const r = resamplePolyline([[0, 0, 0], [1000, 0, 0]], false)
    expect(r.p).toHaveLength(201)
    expect(r.s[1]).toBeCloseTo(5, 9)
  })

  it('returns just the two endpoints for a chain shorter than the spacing', () => {
    const r = resamplePolyline([[0, 0, 0], [1, 0, 0]], false)
    expect(r.p).toEqual([[0, 0, 0], [1, 0, 0]])
  })

  it('never exceeds the requested spacing when the length is not a multiple of it', () => {
    const r = resamplePolyline([[0, 0, 0], [201, 0, 0]], false)
    expect(r.p).toHaveLength(102)
    expect(r.s[1]!).toBeLessThanOrEqual(2)
  })

  it('follows bends and reports the source segment of every sample', () => {
    const r = resamplePolyline([[0, 0, 0], [10, 0, 0], [10, 10, 0]], false)
    expect(r.length).toBe(20)
    r.s.forEach((s, k) => {
      if (s < 10 - 1e-6) expect(r.segment[k]).toBe(0)
      if (s > 10 + 1e-6) expect(r.segment[k]).toBe(1)
    })
    expect(r.p[r.p.length - 1]).toEqual([10, 10, 0])
  })

  it('treats a ring as closed: no repeated first point and even spacing all the way round', () => {
    const n = 96
    const ring: Vec3[] = Array.from({ length: n }, (_, i) => {
      const a = (2 * Math.PI * i) / n
      return [25 * Math.cos(a), 25 * Math.sin(a), 0]
    })
    const r = resamplePolyline(ring, true)
    const step = r.s[1]! - r.s[0]!
    expect(r.p[0]).toEqual(ring[0])
    expect(r.p[r.p.length - 1]).not.toEqual(ring[0])
    expect(step).toBeLessThanOrEqual(2)
    expect(step * r.p.length).toBeCloseTo(r.length, 9)
  })

  it('reports for every sample the segment its arc length falls in, including the closing one', () => {
    const ring: Vec3[] = [[0, 0, 0], [30, 0, 0], [30, 20, 0], [0, 20, 0]]
    const r = resamplePolyline(ring, true)
    const bounds = [0, 30, 50, 80, 100]
    expect(r.length).toBe(100)
    r.s.forEach((s, k) => {
      const seg = r.segment[k]!
      expect(s).toBeGreaterThanOrEqual(bounds[seg]! - 1e-9)
      expect(s).toBeLessThanOrEqual(bounds[seg + 1]! + 1e-9)
    })
    expect(r.segment[r.p.length - 1]).toBe(3)
  })
})

describe('resamplePolyline with pinned corners', () => {
  const square: Vec3[] = [[0, 0, 0], [25.4, 0, 0], [25.4, 25.4, 0], [0, 25.4, 0]]

  it('keeps every vertex that turns more than the given angle as a sample, sides evenly spaced on their own', () => {
    const r = resamplePolyline(square, true, 2, 40)
    for (const corner of square) expect(r.p.some((p) => p.every((x, c) => x === corner[c]))).toBe(true)
    expect(r.length).toBeCloseTo(101.6, 9)
    for (const side of [0, 1, 2, 3]) expect(r.s.some((s) => Math.abs(s - 25.4 * side) < 1e-9), String(side)).toBe(true)
    const gaps = r.s.map((s, i) => (i + 1 < r.s.length ? r.s[i + 1]! : r.length) - s)
    for (const gap of gaps) {
      expect(gap).toBeGreaterThan(0)
      expect(gap).toBeLessThanOrEqual(2 + 1e-9)
    }
  })

  it('puts each corner sample on the side that leaves it', () => {
    const r = resamplePolyline(square, true, 2, 40)
    const at = (arc: number) => r.segment[r.s.findIndex((s) => Math.abs(s - arc) < 1e-9)]
    expect([0, 1, 2, 3].map((side) => at(25.4 * side))).toEqual([0, 1, 2, 3])
  })

  it('leaves a polyline without such a turn exactly as before', () => {
    const arc: Vec3[] = Array.from({ length: 9 }, (_, i) => [100 * Math.cos(i / 10), 100 * Math.sin(i / 10), 0])
    expect(resamplePolyline(arc, false, 2, 40)).toEqual(resamplePolyline(arc, false))
    expect(resamplePolyline(square, true, 2, 120)).toEqual(resamplePolyline(square, true))
  })

  it('pins an inside vertex of an open polyline but never needs to pin its ends', () => {
    const l: Vec3[] = [[0, 0, 0], [10.3, 0, 0], [10.3, 7.1, 0]]
    const r = resamplePolyline(l, false, 2, 40)
    expect(r.p[0]).toEqual([0, 0, 0])
    expect(r.p[r.p.length - 1]).toEqual([10.3, 7.1, 0])
    expect(r.s.some((s) => Math.abs(s - 10.3) < 1e-6)).toBe(true)
  })
})

