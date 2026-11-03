import { describe, expect, it } from 'vitest'
import { length, normalize, sub, type Vec3 } from '../../../src/core/math/vec3'
import { DEFAULT_ARM, angleBetweenDeg, wristTarget, type ArmChain, type ArmParams, type Port } from '../../../src/core/snake/arm'
import { armContacts, solveArm } from '../../../src/core/snake/collision'
import { fabrik } from '../../../src/core/snake/fabrik'
import { FTL_STEP_MM, approachGoal, insertion, tipPath, type InsertionFrame } from '../../../src/core/snake/ftl'
import { P1, posesOf, seamMid, tank, toolZOf } from '../helpers/snake'

const freePort: Port = { id: 'P1', position: [0, 0, 0], direction: [0, 0, -1], diameterMm: 600 }

function freeTarget(): ArmChain {
  const goal = { wrist: [600, 0, -900] as Vec3, toolZ: normalize([0.707, 0, -0.707]) }
  const result = fabrik(freePort, goal, DEFAULT_ARM, 8)
  expect(result.ok).toBe(true)
  return result.chain!
}

// Every link but the first (cut at the port) is a full link; the bend at a joint is the angle between the links around
// it, with the port axis as the link before the first.
function checkFrame(frame: InsertionFrame, port: Port, arm: ArmParams) {
  const { joints } = frame
  expect(length(sub(joints[0]!, port.position))).toBeLessThan(1e-9)
  let previous = normalize(port.direction)
  for (let k = 0; k < joints.length - 1; k++) {
    const link = sub(joints[k + 1]!, joints[k]!)
    if (k > 0) expect(Math.abs(length(link) - arm.linkLengthMm)).toBeLessThan(0.01)
    else expect(length(link)).toBeLessThanOrEqual(arm.linkLengthMm + 0.01)
    const direction = normalize(link)
    expect(angleBetweenDeg(previous, direction)).toBeLessThanOrEqual(arm.maxBendDeg + 0.01)
    previous = direction
  }
}

describe('approachGoal', () => {
  it('moves the tcp back along minus tool z before taking the wrist', () => {
    const toolZ = normalize([0, 0.6, -0.8])
    const tcp: Vec3 = [100, 200, 300]
    const goal = approachGoal(tcp, toolZ, DEFAULT_ARM, 50)
    const back = sub(tcp, [toolZ[0] * 50, toolZ[1] * 50, toolZ[2] * 50] as Vec3)
    expect(length(sub(goal.wrist, wristTarget(back, toolZ, DEFAULT_ARM)))).toBeLessThan(1e-9)
    expect(goal.toolZ).toEqual(toolZ)
  })
})

describe('insertion in free space', () => {
  const target = freeTarget()
  const frames = insertion(freePort, target, DEFAULT_ARM)

  it('starts at the port and grows the tip by 10 mm per frame', () => {
    expect(frames.length).toBeGreaterThan(10)
    expect(frames[0]!.tipS).toBe(0)
    expect(frames[0]!.joints.length).toBeLessThanOrEqual(2)
    for (let i = 1; i < frames.length - 1; i++) expect(frames[i]!.tipS - frames[i - 1]!.tipS).toBeCloseTo(FTL_STEP_MM, 9)
    expect(frames[frames.length - 1]!.tipS - frames[frames.length - 2]!.tipS).toBeLessThanOrEqual(FTL_STEP_MM + 1e-9)
  })

  it('keeps every link at its length and every bend inside the limit', () => {
    for (const frame of frames) checkFrame(frame, freePort, DEFAULT_ARM)
  })

  it('ends on the target chain within 1 mm', () => {
    const last = frames[frames.length - 1]!.joints
    const wanted = target.joints.slice(1)
    const have = last.slice(last.length - wanted.length)
    wanted.forEach((joint, k) => expect(length(sub(have[k]!, joint))).toBeLessThan(1))
  })

  it('tipPath starts behind the port on the axis and ends at the wrist', () => {
    const path = tipPath(freePort, target, DEFAULT_ARM)
    const first = path[0]!
    expect(first[0]).toBeCloseTo(0, 9)
    expect(first[2]).toBeCloseTo(DEFAULT_ARM.links * DEFAULT_ARM.linkLengthMm, 6)
    expect(length(sub(path[path.length - 1]!, target.joints[target.joints.length - 1]!))).toBeLessThan(1e-6)
  })
})

describe('insertion degenerate cases', () => {
  it('gives straight frames for a wrist on the axis', () => {
    const wrist: Vec3 = [0, 0, -1200]
    const result = fabrik(freePort, { wrist, toolZ: [0, 0, -1] }, DEFAULT_ARM, 8)
    const frames = insertion(freePort, result.chain!, DEFAULT_ARM)
    for (const frame of frames) {
      checkFrame(frame, freePort, DEFAULT_ARM)
      for (const joint of frame.joints) expect(Math.hypot(joint[0], joint[1])).toBeLessThan(1e-6)
    }
  })

  it('gives one frame for a target equal to the port', () => {
    const frames = insertion(freePort, { joints: [freePort.position, freePort.position] }, DEFAULT_ARM)
    expect(frames).toHaveLength(1)
    expect(frames[0]!.tipS).toBe(0)
  })
})

// The pinned station of the seam at x 746, the manhole side face of the stiffener at x 750.
const STATION_S = 630.72

describe('insertion in the tank', () => {
  const { seams, near } = tank()
  const seam = seams.find((s) => Math.abs(seamMid(s)[0] - 746) < 2 && Math.abs(s.lengthMm - 864) < 3)!

  it('has a seam at x 746', () => {
    expect(seam).toBeDefined()
  })

  it('pins the middle reachable station of the x 746 seam at default settings', () => {
    const poses = posesOf(seam)
    const reachable: number[] = []
    let start: ArmChain | undefined
    for (const pose of poses) {
      const goal = approachGoal(pose.p, toolZOf(pose), DEFAULT_ARM, 50)
      const solved = solveArm(P1, goal, DEFAULT_ARM, near, start)
      if (solved.ok) {
        reachable.push(pose.s)
        start = solved.chain
      } else start = undefined
    }
    console.log(`x 746 seam: ${reachable.length} of ${poses.length} stations reachable`)
    expect(reachable.length).toBeGreaterThan(0)
    expect(reachable[reachable.length >> 1]).toBeCloseTo(STATION_S, 6)
  })

  it('inserts to the pinned station with no contact, exact lengths and legal bends', () => {
    const pose = posesOf(seam).find((p) => Math.abs(p.s - STATION_S) < 1e-6)!
    const goal = approachGoal(pose.p, toolZOf(pose), DEFAULT_ARM, 50)
    const solved = solveArm(P1, goal, DEFAULT_ARM, near)
    expect(solved.ok).toBe(true)
    const frames = insertion(P1, solved.chain!, DEFAULT_ARM)
    expect(frames.length).toBeGreaterThan(5)
    for (const frame of frames) {
      checkFrame(frame, P1, DEFAULT_ARM)
      expect(armContacts({ joints: frame.joints }, DEFAULT_ARM, near, DEFAULT_ARM.diameterMm / 2)).toEqual([])
    }
  })
})
