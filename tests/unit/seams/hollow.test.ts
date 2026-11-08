import { describe, expect, it } from 'vitest'
import { dot, type Vec3 } from '../../../src/core/math/vec3'
import { buildMeshModel } from '../../../src/core/mesh/model'
import { DEFAULT_DETECT_SETTINGS, detectSeams, type SeamCandidate } from '../../../src/core/seams/detect'
import type { SeamPoint } from '../../../src/core/seams/frames'
import { creaseInHollow, HOLLOW_SPAN_MM, type HollowProbe } from '../../../src/core/seams/hollow'
import type { Tri } from '../helpers/stl'
import { boxTube, channel, cubeTriangles, soupOf } from '../helpers/shapes'

const detectTris = (tris: Tri[]) => detectSeams(buildMeshModel(soupOf(tris), 1), DEFAULT_DETECT_SETTINGS)
const creases = (seams: SeamCandidate[]) => seams.filter((s) => s.source === 'crease' && s.jointType !== 'corner')

describe('creaseInHollow', () => {
  // A 90 degree inside corner along x between a plate facing +z and one facing +y.
  const corner: SeamPoint[] = Array.from({ length: 5 }, (_, i) => ({ s: i * 10, p: [i * 10, 0, 0], t: [1, 0, 0], n1: [0, 0, 1], n2: [0, 1, 0] }))
  const probe = (own: number, others: number | null = null): HollowProbe => ({ own: () => own, others: others === null ? null : () => others })

  it('calls a corner hollow when every ray meets its own body within the span and the seam is at least that long', () => {
    expect(creaseInHollow(corner, 40, probe(27), 0.05)).toBe(true)
    expect(creaseInHollow(corner, 40, probe(HOLLOW_SPAN_MM), 0.05)).toBe(false)
  })

  it('is not hollow when a ray runs past the span or leaves the part', () => {
    expect(creaseInHollow(corner, 1000, probe(HOLLOW_SPAN_MM + 1), 0.05)).toBe(false)
    expect(creaseInHollow(corner, 1000, probe(Infinity), 0.05)).toBe(false)
  })

  it('is not hollow when another body is met first', () => {
    expect(creaseInHollow(corner, 40, probe(27, 26), 0.05)).toBe(false)
    expect(creaseInHollow(corner, 40, probe(27, 28), 0.05)).toBe(true)
  })

  it('is not hollow when the seam is shorter than the widest ray: a window in a frame, not a prism', () => {
    expect(creaseInHollow(corner, 26, probe(27), 0.05)).toBe(false)
  })

  it('fans the rays across the opening between the two plates, in the plane across the seam, from just off the corner', () => {
    const rays: Array<{ origin: Vec3; dir: Vec3 }> = []
    const own = (origin: Vec3, dir: Vec3) => {
      rays.push({ origin, dir })
      return 20
    }
    creaseInHollow(corner, 40, { own, others: null }, 0.05)
    expect(rays.length).toBeGreaterThanOrEqual(9)
    for (const { origin, dir } of rays) {
      expect(dot(dir, [1, 0, 0])).toBeCloseTo(0, 12)
      expect(dot(dir, [0, 0, 1])).toBeGreaterThan(0.1)
      expect(dot(dir, [0, 1, 0])).toBeGreaterThan(0.1)
      expect(origin[1]).toBeGreaterThan(0)
      expect(origin[2]).toBeGreaterThan(0)
      expect(Math.hypot(origin[1], origin[2])).toBeCloseTo(0.05, 9)
    }
  })
})

describe('creases inside a hollow section', () => {
  it('hides the four inside corners of a long square tube as hollow', () => {
    const inside = creases(detectTris(boxTube(25.4, 25.4, 3.18, 600, (u, v, w) => [w, u, v])))
    expect(inside).toHaveLength(4)
    for (const seam of inside) {
      expect(seam.hidden).toBe('hollow')
      expect(seam.lengthMm).toBeCloseTo(600, 1)
    }
  })

  it('keeps the inside corners of a short wide frame: the window is open along the seam', () => {
    const inside = creases(detectTris(boxTube(200, 200, 50, 25.4, (u, v, w) => [u, v, w])))
    expect(inside).toHaveLength(4)
    for (const seam of inside) expect(seam.hidden).toBe(false)
  })

  it('keeps the inside corners of an open channel: the rays leave through the open side', () => {
    const inside = creases(detectTris(channel()))
    expect(inside).toHaveLength(2)
    for (const seam of inside) expect(seam.hidden).toBe(false)
  })

  it('keeps the inside corners of a channel closed by a separate lid: the lid is another body', () => {
    const inside = creases(detectTris([...channel(), ...cubeTriangles([-10, -10, 40], [620, 80, 6])]))
    expect(inside).toHaveLength(2)
    for (const seam of inside) expect(seam.hidden).toBe(false)
  })
})
