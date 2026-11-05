import { describe, expect, it } from 'vitest'
import { cross, dot, length, normalize, sub, type Vec3 } from '../../../src/core/math/vec3'
import { pointsFromPolyline } from '../../../src/core/seams/frames'
import { smoothVertices } from '../../../src/core/seams/smooth'

const ring = (radius: number, count: number): Vec3[] =>
  Array.from({ length: count }, (_, k) => {
    const a = (2 * Math.PI * k) / count
    return [radius * Math.cos(a), radius * Math.sin(a), 0]
  })

// Plate normal up and wall normal outward at the middle of each facet of the ring.
const ringNormals = (count: number) => (segment: number): [Vec3, Vec3] => {
  const a = (2 * Math.PI * (segment + 0.5)) / count
  return [[0, 0, 1], [Math.cos(a), Math.sin(a), 0]]
}

const angleDeg = (a: Vec3, b: Vec3) => (Math.acos(Math.max(-1, Math.min(1, dot(normalize(a), normalize(b))))) * 180) / Math.PI

describe('smoothVertices', () => {
  it('marks every vertex of a finely tessellated ring as part of a curve', () => {
    expect(smoothVertices(ring(50, 64), true).every(Boolean)).toBe(true)
  })

  it('pins the ends of an open chain, an isolated kink and every turn of 20 degrees or more', () => {
    const kink: Vec3[] = [[0, 0, 0], [100, 0, 0], [200, 100 * Math.tan((10 * Math.PI) / 180), 0]]
    expect(smoothVertices(kink, false)).toEqual([false, false, false])
    expect(smoothVertices(ring(50, 12), true).some(Boolean)).toBe(false)
  })

  it('leaves a straight run unmarked', () => {
    expect(smoothVertices([[0, 0, 0], [10, 0, 0], [20, 0, 0], [30, 0, 0]], false)).toEqual([false, false, false, false])
  })
})

describe('pointsFromPolyline with smoothing', () => {
  const radius = 50
  const count = 64
  const smooth = pointsFromPolyline(ring(radius, count), true, ringNormals(count), { smooth: true })
  const faceted = pointsFromPolyline(ring(radius, count), true, ringNormals(count))

  it('follows the circle the facets were cut from: length and every sample', () => {
    expect(faceted.lengthMm / (2 * Math.PI * radius) - 1).toBeLessThan(-3e-4)
    expect(Math.abs(smooth.lengthMm / (2 * Math.PI * radius) - 1)).toBeLessThan(2e-5)
    for (const { p } of smooth.points) expect(Math.abs(Math.hypot(p[0], p[1]) - radius)).toBeLessThan(0.002)
  })

  it('hands the samples on the facets to the rays, since the curve sits outside the mesh by up to the facet sag', () => {
    expect(faceted.surface).toBeUndefined()
    expect(smooth.surface).toEqual(faceted.points)
    const sag = radius * (1 - Math.cos(Math.PI / count))
    expect(Math.max(...smooth.points.map(({ p }) => Math.hypot(p[0], p[1]))) - Math.min(...faceted.points.map(({ p }) => Math.hypot(p[0], p[1])))).toBeGreaterThan(0.9 * sag)
  })

  it('turns the tangent smoothly instead of by one facet angle at each vertex', () => {
    const turns = (points: typeof smooth.points) => points.map((q, k) => angleDeg(q.t, points[(k + 1) % points.length]!.t))
    expect(Math.max(...turns(faceted.points))).toBeGreaterThan(5)
    const spacingDeg = (smooth.lengthMm / smooth.points.length / radius) * (180 / Math.PI)
    expect(Math.max(...turns(smooth.points))).toBeLessThan(1.2 * spacingDeg)
  })

  it('keeps the tangent along the circle and the wall normal pointing out from its centre', () => {
    for (const { p, t, n1, n2 } of smooth.points) {
      const radial = normalize([p[0], p[1], 0])
      expect(Math.abs(dot(t, radial))).toBeLessThan(1e-3)
      const wall = Math.abs(n1[2]) > 0.5 ? n2 : n1
      expect(angleDeg(wall, radial)).toBeLessThan(0.1)
      expect(Math.abs(dot(n1, t))).toBeLessThan(1e-9)
      expect(Math.abs(dot(n2, t))).toBeLessThan(1e-9)
      expect(dot(cross(n1, n2), t)).toBeGreaterThan(0)
    }
  })

  it('merges a vertex in the middle of each facet before it fits the curve, as an intersection loop has', () => {
    const corners = ring(radius, count)
    const halves = corners.flatMap((p, k): Vec3[] => {
      const q = corners[(k + 1) % count]!
      return [p, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, 0]]
    })
    const halfNormals = (segment: number) => ringNormals(count)(segment >> 1)
    const merged = pointsFromPolyline(halves, true, halfNormals, { smooth: true })
    expect(Math.abs(merged.lengthMm / (2 * Math.PI * radius) - 1)).toBeLessThan(2e-5)
    for (const { p, n1, n2 } of merged.points) {
      expect(Math.abs(Math.hypot(p[0], p[1]) - radius)).toBeLessThan(0.002)
      const wall = Math.abs(n1[2]) > 0.5 ? n2 : n1
      expect(angleDeg(wall, normalize([p[0], p[1], 0]))).toBeLessThan(0.1)
    }
  })

  it('starts a loop where its first vertex was, even when that vertex is merged away', () => {
    const corners = ring(radius, count)
    const halves = corners.flatMap((p, k): Vec3[] => {
      const q = corners[(k + 1) % count]!
      return [[(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, 0], q]
    })
    const halfNormals = (segment: number): [Vec3, Vec3] => ringNormals(count)(((segment + 1) >> 1) % count)
    const loop = pointsFromPolyline(halves, true, halfNormals, { smooth: true })
    const sag = radius * (1 - Math.cos(Math.PI / count))
    expect(length(sub(loop.points[0]!.p, halves[0]!))).toBeLessThan(1.1 * sag)
    expect(loop.points[0]!.s).toBe(0)
    expect(Math.abs(loop.lengthMm / (2 * Math.PI * radius) - 1)).toBeLessThan(2e-5)
    for (const { p } of loop.points) expect(Math.abs(Math.hypot(p[0], p[1]) - radius)).toBeLessThan(0.002)
  })

  it('gives the same points as without smoothing on a polyline whose only turn is a corner', () => {
    const kink: Vec3[] = [[0, 0, 0], [100, 0, 0], [200, 100 * Math.tan((10 * Math.PI) / 180), 0]]
    const normals = (): [Vec3, Vec3] => [[0, 0, 1], [0, -1, 0]]
    expect(pointsFromPolyline(kink, false, normals, { smooth: true })).toEqual(pointsFromPolyline(kink, false, normals))
  })

  it('keeps the straight run of a line that ends in an arc on the line', () => {
    const arc = Array.from({ length: 17 }, (_, k): Vec3 => {
      const a = (Math.PI / 2) * (k / 16)
      return [100 + 20 * Math.sin(a), 20 - 20 * Math.cos(a), 0]
    })
    const line: Vec3[] = [[0, 0, 0], [50, 0, 0], ...arc]
    const { points } = pointsFromPolyline(line, false, () => [[0, 0, 1], [0, -1, 0]], { smooth: true })
    for (const { p } of points.filter((q) => q.p[0] <= 100)) expect(p[1]).toBeCloseTo(0, 9)
    for (const { p } of points.filter((q) => q.p[0] > 100)) expect(Math.abs(Math.hypot(p[0] - 100, p[1] - 20) - 20)).toBeLessThan(0.03)
    expect(length(sub(points[points.length - 1]!.p, [120, 20, 0]))).toBeLessThan(1e-9)
  })
})
