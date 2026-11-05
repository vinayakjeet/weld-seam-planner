import { BufferAttribute, BufferGeometry, Vector3 } from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { describe, expect, it, vi } from 'vitest'
import type { Vec3 } from '../../../src/core/math/vec3'
import { DEFAULT_ARM, bendAngles, capsuleRadius, type ArmChain, type Port } from '../../../src/core/snake/arm'
import {
  PUSH_ITERATIONS,
  armContacts,
  linkLadder,
  proximityFromBvh,
  solveArm,
  type Proximity,
} from '../../../src/core/snake/collision'
import { AXIS_TOLERANCE_DEG, TIP_TOLERANCE_MM, fabrik } from '../../../src/core/snake/fabrik'
import { boxProximity, nearest, plane } from '../helpers/snake'

const RADIUS = capsuleRadius(DEFAULT_ARM)

function straightAlongX(z: number, links = 4): ArmChain {
  const joints: Vec3[] = [[0, 0, z], [0, 0, z]]
  for (let k = 1; k <= links; k++) joints.push([150 * k, 0, z])
  return { joints }
}

const portX = (diameterMm = 600): Port => ({ id: 'P1', position: [0, 0, 0], direction: [1, 0, 0], diameterMm })

describe('armContacts', () => {
  it('reports depth 1 along a capsule 49 mm from a plane and nothing at 51 mm', () => {
    const contacts = armContacts(straightAlongX(49), DEFAULT_ARM, plane)
    expect(contacts.length).toBeGreaterThan(0)
    for (const c of contacts) {
      expect(c.depthMm).toBeCloseTo(1, 9)
      expect(c.surface[2]).toBe(0)
    }
    expect(armContacts(straightAlongX(51), DEFAULT_ARM, plane)).toEqual([])
  })

  it('samples every link, both ends included, at most one radius apart, also after a zero length straight part', () => {
    const contacts = armContacts(straightAlongX(10), DEFAULT_ARM, plane)
    const first = contacts.filter((c) => c.link === 1)
    expect(first.map((c) => c.sample[0])).toEqual([0, 50, 100, 150])
    expect(new Set(contacts.filter((c) => c.link >= 1).map((c) => c.link))).toEqual(new Set([1, 2, 3, 4]))
  })

  // Link 1 runs x 0 to 150 with samples at 0, 50, 100 and 150. A knife edge 44 mm above x 25 is 50.6 mm from the
  // nearest sample but only 44 mm from the link.
  it('finds a sharp edge that comes inside the radius between two samples', () => {
    const edge: Vec3 = [25, 0, 44]
    const knife: Proximity = (p, maxMm) => {
      const d = Math.hypot(p[0] - edge[0], p[1] - edge[1], p[2] - edge[2])
      return d <= maxMm ? { point: edge, distanceMm: d } : null
    }
    expect(Math.hypot(25, 44)).toBeGreaterThan(RADIUS)
    const contacts = armContacts(straightAlongX(0), DEFAULT_ARM, knife)
    expect(contacts.length).toBeGreaterThan(0)
    const deepest = Math.max(...contacts.map((c) => c.depthMm))
    expect(deepest).toBeGreaterThan(RADIUS - 44 - 0.25)
    expect(deepest).toBeLessThanOrEqual(RADIUS - 44 + 1e-9)
    for (const c of contacts) expect(c.link).toBe(1)
  })

  it('misses nothing by more than a quarter of a millimetre along a link, wherever the edge sits', () => {
    for (let x = 0; x <= 600; x += 7.3) {
      const edge: Vec3 = [x, 0, RADIUS - 0.3]
      const knife: Proximity = (p, maxMm) => {
        const d = Math.hypot(p[0] - edge[0], p[1] - edge[1], p[2] - edge[2])
        return d <= maxMm ? { point: edge, distanceMm: d } : null
      }
      expect(armContacts(straightAlongX(0), DEFAULT_ARM, knife).length, `edge at x ${x}`).toBeGreaterThan(0)
    }
  })

  it('takes the radius from the argument when given: contact, not clearance', () => {
    expect(armContacts(straightAlongX(45), DEFAULT_ARM, plane, 40)).toEqual([])
    expect(armContacts(straightAlongX(45), DEFAULT_ARM, plane, 50).length).toBeGreaterThan(0)
  })
})

describe('proximityFromBvh', () => {
  // One leaf holds both triangles. The thin diagonal one has a box around the query point but its surface is 70 mm away.
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([0, 0, 0, 200, 200, 0, 200, 200, 1, 0, 400, 0, 1, 400, 0, 0, 401, 0]), 3),
  )
  const bvh = new MeshBVH(geometry)
  const query: Vec3 = [150, 50, 0]

  it('returns the point and distance of a hit inside the range', () => {
    const hit = proximityFromBvh(bvh)([100, 98, 0], 10)
    expect(hit).not.toBeNull()
    expect(hit!.distanceMm).toBeCloseTo(Math.SQRT2, 3)
    expect(hit!.point[0]).toBeCloseTo(99, 3)
  })

  it('returns null when the triangle in the same leaf is farther than the range', () => {
    const raw = bvh.closestPointToPoint(new Vector3(...query), undefined, 0, 10)
    expect(raw === null || raw.distance > 10, 'three-mesh-bvh returns a hit beyond max here').toBe(true)
    expect(proximityFromBvh(bvh)(query, 10)).toBeNull()
  })
})

describe('linkLadder', () => {
  it('starts one link below the count that spans the wrist distance and goes up by two, within 1 and the arm', () => {
    const goal = { wrist: [1300, 0, 0] as Vec3, toolZ: [1, 0, 0] as Vec3 }
    expect(linkLadder(portX(), goal, DEFAULT_ARM)).toEqual([8, 9, 10, 11])
    const far = { wrist: [3500, 0, 0] as Vec3, toolZ: [1, 0, 0] as Vec3 }
    expect(linkLadder(portX(), far, DEFAULT_ARM)).toEqual([23, 24])
    const here = { wrist: [0, 0, 0] as Vec3, toolZ: [1, 0, 0] as Vec3 }
    expect(linkLadder(portX(), here, DEFAULT_ARM)).toEqual([1, 2, 3])
  })

  // The straight part makes up the difference, so a wrist a hair past a whole number of links is a straight reach with
  // one link fewer, not a 5 link chain folded into 600 mm.
  it('offers the exact fit for a wrist just past a whole number of links', () => {
    const goal = { wrist: [600.3, 0, 0] as Vec3, toolZ: [1, 0, 0] as Vec3 }
    expect(linkLadder(portX(), goal, DEFAULT_ARM)).toContain(4)
    expect(solveArm(portX(), goal, DEFAULT_ARM, () => null).ok).toBe(true)
  })
})

describe('solveArm', () => {
  const goal = { wrist: [1300, 0, 0] as Vec3, toolZ: [1, 0, 0] as Vec3 }
  // 60 mm tall: the 9 link chain has 50 mm of slack, which buckles about 160 mm.
  const wall = boxProximity([600, -10000, -10000], [610, 60, 10000])

  it('solves free space in one iteration', () => {
    const result = solveArm(portX(), goal, DEFAULT_ARM, () => null)
    expect(result.ok).toBe(true)
    expect(result.iterations).toBe(1)
  })

  it('bends around a wall that blocks the straight path', () => {
    const plain = fabrik(portX(), goal, DEFAULT_ARM, linkLadder(portX(), goal, DEFAULT_ARM)[0]!)
    expect(plain.chain).not.toBeNull()
    expect(armContacts(plain.chain!, DEFAULT_ARM, wall).length, 'the plain chain collides').toBeGreaterThan(0)

    const result = solveArm(portX(), goal, DEFAULT_ARM, wall)
    console.log(`wall: ok ${result.ok}, ${result.iterations} iterations, links ${result.chain ? result.chain.joints.length - 2 : 0}`)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(armContacts(result.chain, DEFAULT_ARM, wall, RADIUS)).toEqual([])
    for (const bend of bendAngles(result.chain, [1, 0, 0])) expect(bend).toBeLessThanOrEqual(DEFAULT_ARM.maxBendDeg + 1e-6)
    expect(result.tipErrorMm).toBeLessThan(TIP_TOLERANCE_MM)
    expect(result.axisErrorDeg).toBeLessThan(AXIS_TOLERANCE_DEG)
  })

  // The pushes bend the slack into an arch that peaks midway along the chord, so a wall away from the middle or taller
  // than the arch was cleared only by luck (a 100 mm wall at x 600 was, at x 605 it was not). A chain peaked over the
  // wall clears these; 100 mm walls near the port or the wrist are out of reach at 18 degrees per link.
  it.each([
    [400, 100],
    [605, 100],
    [605, 150],
    [800, 100],
  ])('goes over a wall at x %i that is %i mm tall by peaking the chain over it', (x, height) => {
    const tall = boxProximity([x, -10000, -10000], [x + 10, height, 10000])
    const result = solveArm(portX(), goal, DEFAULT_ARM, tall)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(armContacts(result.chain, DEFAULT_ARM, tall, RADIUS)).toEqual([])
    for (const bend of bendAngles(result.chain, [1, 0, 0])) expect(bend).toBeLessThanOrEqual(DEFAULT_ARM.maxBendDeg + 1e-6)
    expect(result.tipErrorMm).toBeLessThan(TIP_TOLERANCE_MM)
    expect(result.axisErrorDeg).toBeLessThan(AXIS_TOLERANCE_DEG)
  })

  it('fails with finite numbers when the wrist is inside a closed box', () => {
    const at: Vec3 = [1000, 0, 0]
    const walls = [
      boxProximity([790, -210, -210], [800, 210, 210]),
      boxProximity([1200, -210, -210], [1210, 210, 210]),
      boxProximity([790, -210, -210], [1210, -200, 210]),
      boxProximity([790, 200, -210], [1210, 210, 210]),
      boxProximity([790, -210, -210], [1210, 210, -200]),
      boxProximity([790, -210, 200], [1210, 210, 210]),
    ]
    const result = solveArm(portX(), { wrist: at, toolZ: [1, 0, 0] }, DEFAULT_ARM, nearest(...walls))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(['collision', 'no-convergence']).toContain(result.reason)
    expect(result.iterations).toBeLessThanOrEqual(3 * PUSH_ITERATIONS)
    if (result.chain) for (const joint of result.chain.joints) expect(joint.every(Number.isFinite)).toBe(true)
  })

  it('gives up a rung once the deepest contact has stopped shrinking', () => {
    const at: Vec3 = [1000, 0, 0]
    const walls = [
      boxProximity([790, -210, -210], [800, 210, 210]),
      boxProximity([1200, -210, -210], [1210, 210, 210]),
      boxProximity([790, -210, -210], [1210, -200, 210]),
      boxProximity([790, 200, -210], [1210, 210, 210]),
      boxProximity([790, -210, -210], [1210, 210, -200]),
      boxProximity([790, -210, 200], [1210, 210, 210]),
    ]
    const result = solveArm(portX(), { wrist: at, toolZ: [1, 0, 0] }, DEFAULT_ARM, nearest(...walls))
    expect(result.ok).toBe(false)
    // Three rungs of up to 30 rounds each would be 90; giving up after stale rounds keeps the whole ladder under one rung's cap.
    expect(result.iterations).toBeLessThanOrEqual(PUSH_ITERATIONS)
  })

  it('does not push a rung whose chain misses the goal by more than a link', () => {
    // Every sample ahead of the port is in contact, and the wrist behind the port cannot be reached by an arm that can
    // only bend 18 degrees per joint: pushing cannot help, so each rung of the ladder gets one round.
    const ahead: Proximity = (p) => (p[0] > 0 ? { point: [p[0], p[1] + 10, p[2]], distanceMm: 10 } : null)
    const behind = { wrist: [-300, 0, 0] as Vec3, toolZ: [1, 0, 0] as Vec3 }
    const rungs = linkLadder(portX(), behind, DEFAULT_ARM).length
    const result = solveArm(portX(), behind, DEFAULT_ARM, ahead)
    expect(result.ok).toBe(false)
    expect(result.iterations).toBeLessThanOrEqual(rungs)
  })

  it('rejects at once a wrist closer to the part than the capsule radius, with one query', () => {
    const spy = vi.fn(plane)
    const result = solveArm(portX(), { wrist: [800, 0, RADIUS - 5], toolZ: [1, 0, 0] }, DEFAULT_ARM, spy)
    expect(result).toMatchObject({ ok: false, reason: 'collision', chain: null, iterations: 0 })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('checks the port before any query', () => {
    const spy = vi.fn(() => null)
    const result = solveArm(portX(60), goal, DEFAULT_ARM, spy)
    expect(result).toMatchObject({ ok: false, reason: 'port-too-small', chain: null, iterations: 0 })
    expect(spy).not.toHaveBeenCalled()
  })

  it('passes beyond-length through without a chain', () => {
    const result = solveArm(portX(), { wrist: [5000, 0, 0], toolZ: [1, 0, 0] }, DEFAULT_ARM, () => null)
    expect(result).toMatchObject({ ok: false, reason: 'beyond-length', chain: null })
  })
})
