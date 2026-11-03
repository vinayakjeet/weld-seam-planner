import { BufferAttribute, BufferGeometry, Vector3 } from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { describe, expect, it, vi } from 'vitest'
import { length, sub, type Vec3 } from '../../../src/core/math/vec3'
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

const RADIUS = capsuleRadius(DEFAULT_ARM)

// Closest point on the surface of a solid axis aligned box, or null beyond maxMm.
function boxProximity(min: Vec3, max: Vec3): Proximity {
  return (p, maxMm) => {
    const clamped = p.map((v, c) => Math.min(Math.max(v, min[c]!), max[c]!)) as Vec3
    let point = clamped
    if (clamped.every((v, c) => v === p[c])) {
      // Inside: the nearest face.
      let best = Infinity
      for (let c = 0; c < 3; c++) {
        for (const face of [min[c]!, max[c]!]) {
          const d = Math.abs(p[c]! - face)
          if (d < best) {
            best = d
            point = [...p] as Vec3
            point[c] = face
          }
        }
      }
    }
    const distanceMm = length(sub(p, point))
    return distanceMm <= maxMm ? { point, distanceMm } : null
  }
}

const nearest = (...proximities: Proximity[]): Proximity => (p, maxMm) => {
  let best: ReturnType<Proximity> = null
  for (const near of proximities) {
    const hit = near(p, maxMm)
    if (hit && (!best || hit.distanceMm < best.distanceMm)) best = hit
  }
  return best
}

const plane: Proximity = (p, maxMm) => (Math.abs(p[2]) <= maxMm ? { point: [p[0], p[1], 0], distanceMm: Math.abs(p[2]) } : null)

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
  it('starts at the links that span the wrist distance and goes up by one, capped at the arm', () => {
    const goal = { wrist: [1300, 0, 0] as Vec3, toolZ: [1, 0, 0] as Vec3 }
    expect(linkLadder(portX(), goal, DEFAULT_ARM)).toEqual([9, 10, 11])
    const far = { wrist: [3500, 0, 0] as Vec3, toolZ: [1, 0, 0] as Vec3 }
    expect(linkLadder(portX(), far, DEFAULT_ARM)).toEqual([24])
    const here = { wrist: [0, 0, 0] as Vec3, toolZ: [1, 0, 0] as Vec3 }
    expect(linkLadder(portX(), here, DEFAULT_ARM)).toEqual([1, 2, 3])
  })
})

describe('solveArm', () => {
  const goal = { wrist: [1300, 0, 0] as Vec3, toolZ: [1, 0, 0] as Vec3 }
  // 60 mm tall: the 9 link chain has 50 mm of slack, which buckles about 160 mm, so a 100 mm wall plus the 50 mm radius
  // leaves 9 mm of room and the solver does not find it (debt.md).
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
