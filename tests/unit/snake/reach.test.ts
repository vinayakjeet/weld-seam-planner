import { describe, expect, it } from 'vitest'
import { add, normalize, scale, type Vec3 } from '../../../src/core/math/vec3'
import { accessStations, seamLength } from '../../../src/core/access/clearance'
import { DEFAULT_ARM, type ArmParams, type Port } from '../../../src/core/snake/arm'
import { solveArm } from '../../../src/core/snake/collision'
import { approachGoal } from '../../../src/core/snake/ftl'
import { reachKey, seamReach, withReach } from '../../../src/core/snake/reach'
import type { SeamAccess } from '../../../src/core/job/schema'
import { pointsFromPolyline } from '../../../src/core/seams/frames'
import { DEFAULT_TORCH, poseAt, torchPoses } from '../../../src/core/torch/frames'
import { P1, boxProximity, nearest, plane, seamMid, tank, toolZOf } from '../helpers/snake'
import { straightSeam } from '../helpers/jobs'

// A seam lying on a plate with normal +z, torch leaning in from the -y side: tool z is (0, 1, -1) / sqrt 2.
const TOOL_Z = normalize([0, 1, -1] as Vec3)
const seamOn = (length: number) => straightSeam({ id: 's', from: [0, 0, 12], to: [length, 0, 12] })
const plate = plane

// A port on the line the straight arm takes to the approach wrist of the seam point at x = 0, opening toward the seam.
function portFor(id: string, x: number, backMm = 1500): Port {
  const wrist = add([x, 0, 12], scale(TOOL_Z, -300))
  return { id, position: add(wrist, scale(TOOL_Z, -backMm)), direction: TOOL_Z, diameterMm: 600 }
}

const finiteCoverage = (coverage: number) => Number.isFinite(coverage) && coverage >= 0 && coverage <= 1

describe('seamReach on an open plate', () => {
  const seam = seamOn(400)

  it('reaches a whole seam under a port, naming the port', () => {
    const reach = seamReach(seam, [portFor('P1', 200)], DEFAULT_ARM, plate)
    expect(reach.portId).toBe('P1')
    expect(reach.coverage).toBe(1)
    expect(reach.unreachable).toEqual([])
    expect(reach.stations.length).toBe(accessStations(400, false).length)
    expect(reach.stations.every((station) => station.ok && station.chain !== null)).toBe(true)
  })

  it('loses the stretch behind a wall, with the interval cut at station midpoints', () => {
    const wall = boxProximity([260, -3000, 100], [3000, 3000, 400])
    const reach = seamReach(seam, [portFor('P1', 130)], DEFAULT_ARM, nearest(plate, wall))
    expect(reach.unreachable).toHaveLength(1)
    const [from, to] = reach.unreachable[0]!
    expect(to).toBe(400)
    expect(from).toBeGreaterThan(140)
    expect(from).toBeLessThanOrEqual(260)
    expect(from % 10).toBe(0)
    expect(reach.coverage).toBeGreaterThan(0.35)
    expect(reach.coverage).toBeLessThan(0.65)
    expect(reach.coverage).toBeCloseTo(1 - (to - from) / 400, 9)
  })

  // 600, 900 and 1200 mm are whole numbers of 150 mm links, where the chain is fully stretched at the fewest links the
  // ladder offers. The seam is 240 mm long: with the tool along the port axis, 4 links bent 18 degrees at a joint can
  // shift the wrist sideways by only about 180 mm, so a 400 mm seam is out of reach at its ends at 600 mm.
  it.each([600, 900, 1200])('reaches every station when the port is %i mm from the wrist, an exact fit of the links', (backMm) => {
    const reach = seamReach(seamOn(240), [portFor('P1', 120, backMm)], DEFAULT_ARM, plate)
    expect(reach.unreachable).toEqual([])
    expect(reach.coverage).toBe(1)
  })

  it('takes the second port when only it sees the seam', () => {
    const far: Port = { id: 'P1', position: [200, -9000, 9000], direction: normalize([0, 1, -1] as Vec3), diameterMm: 600 }
    const reach = seamReach(seam, [far, portFor('P2', 200)], DEFAULT_ARM, plate)
    expect(reach.portId).toBe('P2')
    expect(reach.coverage).toBe(1)
  })

  it('keeps the first port when two reach equally', () => {
    const reach = seamReach(seam, [portFor('P1', 200), portFor('P2', 200, 1600)], DEFAULT_ARM, plate)
    expect(reach.portId).toBe('P1')
  })

  it('gives no port, no coverage and the whole seam when there are no ports', () => {
    const reach = seamReach(seam, [], DEFAULT_ARM, plate)
    expect(reach).toMatchObject({ portId: null, coverage: 0, unreachable: [[0, 400]], stations: [] })
  })

  it('has one station for an 8 mm seam', () => {
    const reach = seamReach(seamOn(8), [portFor('P1', 4)], DEFAULT_ARM, plate)
    expect(reach.stations).toHaveLength(1)
    expect(finiteCoverage(reach.coverage)).toBe(true)
  })

  it('puts no station at s = L on a closed loop', () => {
    const square: Vec3[] = [[0, 0, 12], [100, 0, 12], [100, 100, 12], [0, 100, 12]]
    const { points } = pointsFromPolyline(square, true, () => [[0, 0, 1], [0, -1, 0]])
    const loop = { points, closed: true }
    const total = seamLength(points, true)
    const reach = seamReach(loop, [portFor('P1', 50)], DEFAULT_ARM, plate)
    expect(reach.stations.length).toBe(accessStations(total, true).length)
    expect(reach.stations.every((station) => station.s < total - 1e-9)).toBe(true)
    expect(finiteCoverage(reach.coverage)).toBe(true)
    for (const [a, b] of reach.unreachable) expect(a <= b && b <= total).toBe(true)
  })

  it('keeps coverage finite and inside [0, 1] when nothing can be reached', () => {
    // A slab across the whole approach: the arm has to cross its top face to reach the seam inside it.
    const solid = boxProximity([-5000, -5000, 100], [5000, 5000, 400])
    const reach = seamReach(seam, [portFor('P1', 200)], DEFAULT_ARM, nearest(plate, solid))
    expect(finiteCoverage(reach.coverage)).toBe(true)
    expect(reach.coverage).toBe(0)
    expect(reach.unreachable).toEqual([[0, 400]])
  })

  // Warm starting costs about as many FABRIK passes as solving cold (a cold curved start converges in one pass in open
  // space), so passes are not what it buys: it finds stations that cold starts miss (on the tank 173 against 157).
  it('reaches at least the stations that solving every one of them cold reaches, past a pillar', () => {
    const port = portFor('P1', 200)
    const pillar = nearest(plate, boxProximity([170, -650, 250], [230, -420, 700]))
    const warm = seamReach(seam, [port], DEFAULT_ARM, pillar)

    const poses = torchPoses(seam.points, seam.closed, DEFAULT_TORCH)
    const grid = accessStations(400, false)
    const cold = grid.map(({ at }) => {
      const pose = poseAt(poses, at, false)
      return solveArm(port, approachGoal(pose.p, toolZOf(pose), DEFAULT_ARM, DEFAULT_TORCH.approachMm), DEFAULT_ARM, pillar).ok
    })
    expect(cold.some((ok) => ok)).toBe(true)
    warm.stations.forEach((station, i) => {
      if (cold[i]) expect(station.ok).toBe(true)
    })
  })
})

describe('withReach and reachKey', () => {
  const base: SeamAccess = { clearanceDeg: 0, nearClearanceDeg: 45, class: 'snake', portId: null, reachCoverage: null, unreachable: [] }
  const reach = { portId: 'P1', coverage: 2 / 3, unreachable: [[100, 200]] as Array<[number, number]>, stations: [] }

  it('writes the port, the rounded coverage and the intervals on a snake seam', () => {
    expect(withReach(base, reach)).toEqual({ ...base, portId: 'P1', reachCoverage: 0.667, unreachable: [[100, 200]] })
  })

  it.each(['standard', 'slim', 'blocked'] as const)('leaves a %s seam unchanged', (cls) => {
    const access = { ...base, class: cls }
    expect(withReach(access, reach)).toEqual(access)
  })

  it('gives the same key for the same inputs and a new key for any change', () => {
    const port: Port = { id: 'P1', position: [400, 500, 1000], direction: [0, 0, -1], diameterMm: 600 }
    const key = reachKey([port], DEFAULT_ARM)
    expect(reachKey([{ ...port }], { ...DEFAULT_ARM })).toBe(key)
    expect(reachKey([{ ...port, position: [401, 500, 1000] }], DEFAULT_ARM)).not.toBe(key)
    expect(reachKey([{ ...port, id: 'P2' }], DEFAULT_ARM)).not.toBe(key)
    expect(reachKey([{ ...port, direction: [0, 0.1, -0.995] }], DEFAULT_ARM)).not.toBe(key)
    expect(reachKey([{ ...port, diameterMm: 500 }], DEFAULT_ARM)).not.toBe(key)
    expect(reachKey([], DEFAULT_ARM)).not.toBe(key)
    for (const field of Object.keys(DEFAULT_ARM) as Array<keyof typeof DEFAULT_ARM>) {
      expect(reachKey([port], { ...DEFAULT_ARM, [field]: DEFAULT_ARM[field] + 1 })).not.toBe(key)
    }
  })
})


// Measured coverage of the 20 snake seams of tank-with-manhole from P1: [defaults, bend limit 25 degrees], checked to
// 0.01. Five dropped by one station or so when the capsule check stopped missing edges between its samples (on
// crease-7839a953 the arm had passed 1.2 and 2.2 mm inside its radius at the top edge of the stiffener at x 1154).
// Four rose at bend 25 when a rung that ends in contact is retried from a chain peaked over the contact. With the exact
// Jacobian in the finish, crease-b6aa918f lost its station at s 420, reached before only after 17 rounds of push and refit. The id comes from the geometry of the seam; the comment gives where it is.
const TANK_COVERAGE: Record<string, [number, number]> = {
  'crease-80112024': [0, 0.227], // roof, x 800, y 992
  'crease-19ac1324': [0.417, 0.619], // floor, x 800, y 8
  'crease-5c584cf4': [0, 0.164], // roof, x 800, y 8
  'crease-f25ea394': [0.53, 0.619], // floor, x 800, y 992
  'crease-2a7b765a': [0, 0], // roof, x 8
  'crease-09ed1718': [0, 0.264], // x 8, y 8
  'crease-98aeacc8': [0, 0.264], // x 8, y 992
  'crease-aaeea8a5': [0, 0.894], // floor, x 1592
  'crease-b6aa918f': [0.264, 0.569], // x 1592, y 8
  'crease-144dd195': [0.894, 0.894], // roof, x 1592 (the plan expected 0)
  'crease-101ea032': [0.325, 0.894], // floor, x 8
  'crease-7839a953': [0.285, 0.569], // x 1592, y 992
  'contact-25d7ac43': [0, 0], // stiffener face x 1146
  'contact-6bc6a16b': [0, 0], // stiffener face x 754
  'contact-546fbaba': [0.208, 1], // stiffener face x 746
  'contact-0fad4c56': [0, 0], // stiffener face x 1154
  'contact-1d117650': [0, 0],
  'contact-7e0d5d6a': [0, 0],
  'contact-b2077f02': [0, 0],
  'contact-c3880018': [0, 0],
}
const ROOF_CREASES = ['crease-80112024', 'crease-5c584cf4', 'crease-2a7b765a', 'crease-144dd195']

describe('tank-with-manhole reach from P1', () => {
  const { snake, near } = tank()
  const coverages = (arm: ArmParams, port: Port = P1): Record<string, number> =>
    Object.fromEntries(snake.map((seam) => [seam.id, seamReach(seam, [port], arm, near).coverage]))

  it('has the 20 snake seams and a pin for each', () => {
    expect(snake.map((seam) => seam.id).sort()).toEqual(Object.keys(TANK_COVERAGE).sort())
  })

  it('matches the pinned coverage at the default arm and meets the plan expectations that hold', () => {
    const measured = coverages(DEFAULT_ARM)
    const rows = snake.map((seam) => `${seam.id} mid ${seamMid(seam).map(Math.round)} coverage ${measured[seam.id]!.toFixed(3)}`)
    console.log(`tank reach at defaults\n${rows.join('\n')}`)
    for (const [id, [pinned]] of Object.entries(TANK_COVERAGE)) expect(measured[id], id).toBeCloseTo(pinned, 2)
    expect(measured['contact-546fbaba']).toBeGreaterThan(0)
    // The plan expected all four roof creases at 0; the far end one is reached by an arm that dips 170 mm under the roof.
    expect(ROOF_CREASES.filter((id) => measured[id] === 0)).toHaveLength(3)
    expect(measured['crease-144dd195']).toBeGreaterThan(0.8)
    expect(Object.values(measured).some((c) => c > 0 && c < 1)).toBe(true)
  }, 120_000)

  it('matches the pinned coverage with the bend limit raised to 25 degrees', () => {
    const measured = coverages({ ...DEFAULT_ARM, maxBendDeg: 25 })
    for (const [id, [, pinned]] of Object.entries(TANK_COVERAGE)) expect(measured[id], id).toBeCloseTo(pinned, 2)
  }, 120_000)

  it('reaches nothing from a port on solid roof, without an exception', () => {
    const onRoof: Port = { id: 'P9', position: [1200, 500, 1000], direction: [0, 0, -1], diameterMm: 600 }
    for (const coverage of Object.values(coverages(DEFAULT_ARM, onRoof))) expect(coverage).toBe(0)
  }, 120_000)
})
