import { describe, expect, it } from 'vitest'
import {
  classOf,
  END_MARGIN_MM,
  FAR_RANGE_MM,
  poseClearance,
  raysPerRing,
  seamAccess,
  type Occluder,
} from '../../../src/core/access/clearance'
import type { Vec3 } from '../../../src/core/math/vec3'
import type { SeamPoint } from '../../../src/core/seams/frames'

const NONE = Infinity
// Axis out of the joint is +z for tool z = [0, 0, -1].
const TOOL_Z: Vec3 = [0, 0, -1]
const TCP: Vec3 = [0, 0, 0]

function counting(inner: Occluder): { occluded: Occluder; calls: () => number; ranges: Set<number> } {
  let n = 0
  const ranges = new Set<number>()
  return {
    occluded: (origin, dir, maxMm) => {
      n++
      ranges.add(maxMm)
      return inner(origin, dir, maxMm)
    },
    calls: () => n,
    ranges,
  }
}

// A plane through the ray origin's frame: distance along dir to the plane n.p = offset, or none when moving away.
function plane(normal: Vec3, offset: number): Occluder {
  return (o, d) => {
    const along = normal[0] * d[0] + normal[1] * d[1] + normal[2] * d[2]
    if (along <= 1e-9) return NONE
    const hit = (offset - (normal[0] * o[0] + normal[1] * o[1] + normal[2] * o[2])) / along
    return hit >= 0 ? hit : NONE
  }
}

const nearest = (...walls: Occluder[]): Occluder => (o, d, m) => {
  const hit = Math.min(...walls.map((w) => w(o, d, m)))
  return hit <= m ? hit : NONE
}

// A square tube along z with half-width w around the axis.
const tube = (w: number): Occluder =>
  nearest(plane([1, 0, 0], w), plane([-1, 0, 0], w), plane([0, 1, 0], w), plane([0, -1, 0], w))

describe('classOf', () => {
  it.each([
    [60, 60, 'standard'],
    [30, 45, 'standard'],
    [25, 25, 'slim'],
    [15, 15, 'slim'],
    [10, 45, 'snake'],
    [0, 10, 'snake'],
    [0, 5, 'blocked'],
    [5, 5, 'blocked'],
    [0, 0, 'blocked'],
  ])('far %i, near %i is %s', (far, near, expected) => {
    expect(classOf(far, near)).toBe(expected)
  })
})

describe('raysPerRing', () => {
  it.each([
    [0, 1],
    [5, 12],
    [30, 12],
    [35, 16],
    [60, 16],
  ])('ring %i has %i rays', (deg, n) => {
    expect(raysPerRing(deg)).toBe(n)
  })
})

describe('poseClearance', () => {
  it('a free pose is 60 and 60 after exactly 169 rays', () => {
    const c = counting(() => NONE)
    expect(poseClearance(TCP, TOOL_Z, c.occluded)).toEqual({ clearanceDeg: 60, nearClearanceDeg: 60 })
    expect(c.calls()).toBe(1 + 6 * 12 + 6 * 16)
  })

  it('rays more than 22 degrees off axis hit at 100 mm: far 20, near 60', () => {
    const cone: Occluder = (_o, d) => (Math.acos(Math.min(1, d[2])) * 180) / Math.PI > 22 ? 100 : NONE
    expect(poseClearance(TCP, TOOL_Z, cone)).toEqual({ clearanceDeg: 20, nearClearanceDeg: 60 })
  })

  it('a wall 100 mm along the axis blocks the far cone only and keeps casting for the near cone', () => {
    const c = counting(plane([0, 0, 1], 100))
    expect(poseClearance(TCP, TOOL_Z, c.occluded)).toEqual({ clearanceDeg: 0, nearClearanceDeg: 60 })
    expect(c.calls()).toBe(169)
  })

  it('a wall 30 mm along the axis blocks both after one ray', () => {
    const c = counting(plane([0, 0, 1], 30))
    expect(poseClearance(TCP, TOOL_Z, c.occluded)).toEqual({ clearanceDeg: 0, nearClearanceDeg: 0 })
    expect(c.calls()).toBe(1)
  })

  it.each([
    [5, 0],
    [6, 5],
    [11, 10],
  ])('a tube with half-width %i mm gives near %i (60 * sin(ring) must fit)', (w, near) => {
    // The ray origin sits 1 mm up the axis, as in production.
    expect(poseClearance(TCP, TOOL_Z, tube(w)).nearClearanceDeg).toBe(near)
  })

  it('always casts out to 300 mm and starts 1 mm up the axis', () => {
    const starts: Vec3[] = []
    const c = counting((o) => {
      starts.push(o)
      return NONE
    })
    poseClearance(TCP, TOOL_Z, c.occluded)
    expect([...c.ranges]).toEqual([FAR_RANGE_MM])
    expect(starts.every((o) => o[0] === 0 && o[1] === 0 && Math.abs(o[2] - 1) < 1e-9)).toBe(true)
  })
})

// Points along +x with plate normals up (+z) and sideways (+y), so the bisector is (0, 1, 1) / sqrt 2.
function lineSeam(lengthMm: number): { points: SeamPoint[]; closed: false } {
  const points: SeamPoint[] = []
  for (let s = 0; s <= lengthMm + 1e-9; s += 5) points.push({ s, p: [s, 0, 0], t: [1, 0, 0], n1: [0, 0, 1], n2: [0, 1, 0] })
  if (points[points.length - 1]!.s < lengthMm) points.push({ s: lengthMm, p: [lengthMm, 0, 0], t: [1, 0, 0], n1: [0, 0, 1], n2: [0, 1, 0] })
  return { points, closed: false }
}

function loopSeam(radius: number, vertices: number): { points: SeamPoint[]; closed: true; lengthMm: number } {
  const chord = 2 * radius * Math.sin(Math.PI / vertices)
  const points: SeamPoint[] = []
  for (let k = 0; k < vertices; k++) {
    const a = (2 * Math.PI * k) / vertices
    const out: Vec3 = [Math.cos(a), Math.sin(a), 0]
    points.push({ s: k * chord, p: [radius * out[0], radius * out[1], 0], t: [-out[1], out[0], 0], n1: out, n2: [0, 0, 1] })
  }
  return { points, closed: true, lengthMm: vertices * chord }
}

describe('seamAccess', () => {
  it('a free seam is standard with no unreachable stretch', () => {
    const { access, stations } = seamAccess(lineSeam(120), () => NONE)
    expect(access).toEqual({ clearanceDeg: 60, nearClearanceDeg: 60, class: 'standard', portId: null, reachCoverage: null, unreachable: [] })
    expect(stations.length).toBeGreaterThan(2)
  })

  it('measures at 20 mm stations, the end stations pulled in by the margin', () => {
    expect(END_MARGIN_MM).toBe(13)
    const { stations } = seamAccess(lineSeam(120), () => NONE)
    expect(stations.map((s) => s.s)).toEqual([13, 20, 40, 60, 80, 100, 107])
  })

  it('reports blocked stations as an unreachable interval between neighbouring stations', () => {
    const blockedBand: Occluder = (o) => (o[0] >= 40 && o[0] <= 80 ? 1 : NONE)
    const { access } = seamAccess(lineSeam(120), blockedBand)
    expect(access.class).toBe('blocked')
    expect(access.clearanceDeg).toBe(0)
    expect(access.nearClearanceDeg).toBe(0)
    expect(access.unreachable).toEqual([[30, 90]])
  })

  it('clamps an interval to the seam ends', () => {
    expect(seamAccess(lineSeam(120), () => 1).access.unreachable).toEqual([[0, 120]])
  })

  it('a snake seam has no unreachable stretch', () => {
    const { access } = seamAccess(lineSeam(120), plane([0, 1, 1], 100))
    expect(access.class).toBe('snake')
    expect(access.unreachable).toEqual([])
  })

  it('takes the minimum over stations for the seam values', () => {
    const narrowAt60: Occluder = (o, d) => (Math.abs(o[0] - 60) < 1 && Math.acos(Math.min(1, d[2])) > 0 ? 100 : NONE)
    const { access, stations } = seamAccess(lineSeam(120), narrowAt60)
    expect(stations.find((s) => s.s === 60)).toMatchObject({ clearanceDeg: 0, nearClearanceDeg: 60 })
    expect(stations.filter((s) => s.s !== 60).every((s) => s.clearanceDeg === 60)).toBe(true)
    expect(access).toMatchObject({ clearanceDeg: 0, nearClearanceDeg: 60, class: 'snake' })
  })

  it('a seam shorter than twice the margin gets one station at its middle', () => {
    const { stations, access } = seamAccess(lineSeam(8), () => NONE)
    expect(stations.map((s) => s.s)).toEqual([4])
    expect(access.class).toBe('standard')
  })

  it('does not read blocked at a seam end only because a plate stands across it', () => {
    // A wall across the seam end at x = 0: a pose on the end would see it at once; the margin gives 13 mm of room.
    const endWall: Occluder = (o, d) => (d[0] < -1e-9 && o[0] >= 0 ? o[0] / -d[0] : NONE)
    const { access } = seamAccess(lineSeam(60), endWall)
    expect(access.class).toBe('snake')
    expect(access.nearClearanceDeg).toBe(10)
    expect(access.unreachable).toEqual([])
  })

  it('a closed loop has no station at s = L and no interval past L', () => {
    const loop = loopSeam(20, 25)
    const { stations, access } = seamAccess(loop, () => 1)
    expect(stations.map((s) => s.s)).toEqual([0, 20, 40, 60, 80, 100, 120])
    expect(Math.max(...stations.map((s) => s.s))).toBeLessThan(loop.lengthMm)
    expect(access.unreachable).toHaveLength(1)
    expect(access.unreachable[0]![0]).toBe(0)
    expect(access.unreachable[0]![1]).toBeCloseTo(loop.lengthMm, 9)
  })
})
