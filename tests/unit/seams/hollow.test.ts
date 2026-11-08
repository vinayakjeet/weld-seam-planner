import { describe, expect, it } from 'vitest'
import { dot, type Vec3 } from '../../../src/core/math/vec3'
import { buildMeshModel } from '../../../src/core/mesh/model'
import { DEFAULT_DETECT_SETTINGS, detectSeams, type SeamCandidate } from '../../../src/core/seams/detect'
import type { SeamPoint } from '../../../src/core/seams/frames'
import { contactInHollow, creaseInHollow, HOLLOW_SPAN_MM, type ContactStation } from '../../../src/core/seams/hollow'
import type { RayProbe } from '../../../src/core/seams/thickness'
import type { Tri } from '../helpers/stl'
import { boxTube, channel, cubeTriangles, soupOf } from '../helpers/shapes'

const detectTris = (tris: Tri[]) => detectSeams(buildMeshModel(soupOf(tris), 1), DEFAULT_DETECT_SETTINGS)
const creases = (seams: SeamCandidate[]) => seams.filter((s) => s.source === 'crease' && s.jointType !== 'corner')

describe('creaseInHollow', () => {
  // A 90 degree inside corner along x between a plate facing +z and one facing +y.
  const corner: SeamPoint[] = Array.from({ length: 5 }, (_, i) => ({ s: i * 10, p: [i * 10, 0, 0], t: [1, 0, 0], n1: [0, 0, 1], n2: [0, 1, 0] }))
  const probe = (own: number): RayProbe => () => own

  it('calls a corner hollow when every ray meets its own body within the span and the seam is at least that long', () => {
    expect(creaseInHollow(corner, 40, probe(27), 0.05)).toBe(true)
    expect(creaseInHollow(corner, 40, probe(HOLLOW_SPAN_MM), 0.05)).toBe(false)
  })

  it('is not hollow when a ray runs past the span or leaves the part', () => {
    expect(creaseInHollow(corner, 1000, probe(HOLLOW_SPAN_MM + 1), 0.05)).toBe(false)
    expect(creaseInHollow(corner, 1000, probe(Infinity), 0.05)).toBe(false)
  })

  // Straight across a 19 mm bore from its corner, and 26.9 mm to the far corner.
  const bore: RayProbe = (_, dir) => 19.04 / Math.max(dir[1], dir[2])

  it('is hollow when the seam is at least as long as the narrowest ray across: a stub as long as its bore is wide', () => {
    expect(creaseInHollow(corner, 25.4, bore, 0.05)).toBe(true)
    expect(creaseInHollow(corner, 19, bore, 0.05)).toBe(false)
  })

  it('is not hollow when the seam is shorter than the narrowest ray: a window in a frame, not a prism', () => {
    expect(creaseInHollow(corner, 26, probe(27), 0.05)).toBe(false)
  })

  it('fans the rays across the opening between the two plates, in the plane across the seam, from just off the corner', () => {
    const rays: Array<{ origin: Vec3; dir: Vec3 }> = []
    const own = (origin: Vec3, dir: Vec3) => {
      rays.push({ origin, dir })
      return 20
    }
    creaseInHollow(corner, 40, own, 0.05)
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

  // The bar is another body, but the tube still closes the space round it: no torch gets in.
  it('hides the inside corners of a tube with a bar through its bore', () => {
    const tube = boxTube(25.4, 25.4, 3.18, 600, (u, v, w) => [w, u, v])
    const bar = cubeTriangles([-50, 7.7, 7.7], [700, 10, 10])
    const inside = creases(detectTris([...tube, ...bar]))
    expect(inside).toHaveLength(4)
    for (const seam of inside) expect(seam.hidden).toBe('hollow')
  })

  it('hides the inside corners of a stub as long as its bore is wide', () => {
    const inside = creases(detectTris(boxTube(25.4, 25.4, 3.18, 25.4, (u, v, w) => [w, u, v])))
    expect(inside).toHaveLength(4)
    for (const seam of inside) expect(seam.hidden).toBe('hollow')
  })

  it('keeps the inside corners of a channel closed by a separate lid: the channel itself is open', () => {
    const inside = creases(detectTris([...channel(), ...cubeTriangles([-10, -10, 40], [620, 80, 6])]))
    expect(inside).toHaveLength(2)
    for (const seam of inside) expect(seam.hidden).toBe(false)
  })
})

describe('contactInHollow', () => {
  // The inside edge of a tube wall along x, standing on a surface facing +z: the wall's free face faces +y.
  const stations: ContactStation[] = [{ p: [0, 0, 0], t: [1, 0, 0], free: [0, 1, 0], touched: [0, 0, 1] }]
  const probe = (own: number): RayProbe => () => own
  const deep = () => true

  it('calls the inside of a member end hollow when every ray meets the member within the span and its bore is deep enough', () => {
    expect(contactInHollow(stations, deep, probe(27), 0.05)).toBe(true)
    expect(contactInHollow(stations, (widest) => widest <= 20, probe(27), 0.05)).toBe(false)
  })

  it('is not hollow when a ray runs past the span or leaves the part', () => {
    expect(contactInHollow(stations, deep, probe(HOLLOW_SPAN_MM + 1), 0.05)).toBe(false)
    expect(contactInHollow(stations, deep, probe(Infinity), 0.05)).toBe(false)
  })

  it('fans the rays across the touched surface on the free side, from just off the edge', () => {
    const rays: Array<{ origin: Vec3; dir: Vec3 }> = []
    const own = (origin: Vec3, dir: Vec3) => {
      rays.push({ origin, dir })
      return 20
    }
    contactInHollow(stations, deep, own, 0.05)
    expect(rays.length).toBeGreaterThanOrEqual(5)
    for (const { origin, dir } of rays) {
      expect(dot(dir, [0, 0, 1])).toBeCloseTo(0, 12)
      expect(dot(dir, [0, 1, 0])).toBeGreaterThan(0.4)
      expect(origin[1]).toBeCloseTo(0.05, 9)
      expect(origin[2]).toBeCloseTo(0.05, 9)
    }
    expect(rays.some(({ dir }) => dir[0] > 0.5) && rays.some(({ dir }) => dir[0] < -0.5)).toBe(true)
  })
})

describe('contact seams inside the end of a hollow member', () => {
  const plate = cubeTriangles([-100, -100, 0], [200, 200, 10])
  const standing = (height: number) => boxTube(25.4, 25.4, 3.18, height, (u, v, w) => [u - 12.7, v - 12.7, 10 + w])
  const contact = (seams: SeamCandidate[]) => seams.filter((s) => s.source === 'contact')

  const loop = (seams: SeamCandidate[], lengthMm: number) => seams.filter((s) => s.closed && Math.abs(s.lengthMm - lengthMm) < 0.05)

  it('hides the loop round the bore of an open tube end standing on a plate and keeps the loop round its outside', () => {
    const seams = contact(detectTris([...plate, ...standing(300)]))
    expect(seams).toHaveLength(2)
    expect(loop(seams, 76.16).map((s) => s.hidden)).toEqual(['hollow'])
    expect(loop(seams, 101.6).map((s) => s.hidden)).toEqual([false])
  })

  it('keeps the loop round the bore of a stub shallower than its bore is wide: the torch reaches in from the open end', () => {
    const seams = contact(detectTris([...plate, ...standing(15)]))
    expect(loop(seams, 76.16).map((s) => s.hidden)).toEqual([false])
  })
})
