import { describe, expect, it } from 'vitest'
import { add, cross, length, normalize, rotateAbout, scale, sub, type Vec3 } from '../../../src/core/math/vec3'
import { DEFAULT_ARM, bendAngles, type ArmChain, type ArmParams, type Port } from '../../../src/core/snake/arm'
import { AXIS_TOLERANCE_DEG, TIP_TOLERANCE_MM, fabrik, type FabrikResult } from '../../../src/core/snake/fabrik'
import { seededRandom } from '../helpers/random'

const port = (direction: Vec3 = [0, 0, -1], position: Vec3 = [0, 0, 0]): Port => ({
  id: 'P1',
  position,
  direction,
  diameterMm: 600,
})

const goalOf = (wrist: Vec3, toolZ: Vec3) => ({ wrist, toolZ: normalize(toolZ) })

// A chain built by forward kinematics from random bends inside 90 percent of the limit: its wrist and last link give a
// goal the arm can reach by construction, which a hand-picked wrist and tool z cannot promise at an 18 degree limit.
function reachableGoal(random: () => number, p: Port, arm: ArmParams, links: number) {
  const axis = normalize(p.direction)
  let u: Vec3 = axis
  let tip: Vec3 = add(p.position, scale(axis, random() * arm.insertionMm))
  for (let k = 0; k < links; k++) {
    const r: Vec3 = [random() - 0.5, random() - 0.5, random() - 0.5]
    const dir = normalize(sub(r, scale(u, r[0] * u[0] + r[1] * u[1] + r[2] * u[2])))
    u = normalize(rotateAbout(u, cross(u, dir), random() * 0.9 * arm.maxBendDeg))
    tip = add(tip, scale(u, arm.linkLengthMm))
  }
  return { wrist: tip, toolZ: u }
}

function allFinite(result: FabrikResult): boolean {
  const numbers = [result.tipErrorMm, result.axisErrorDeg, result.passes]
  if (result.chain) for (const joint of result.chain.joints) numbers.push(...joint)
  return numbers.every(Number.isFinite)
}

function checkChain(chain: ArmChain, p: Port, arm: ArmParams) {
  const axis = normalize(p.direction)
  for (const bend of bendAngles(chain, axis)) expect(bend).toBeLessThanOrEqual(arm.maxBendDeg + 1e-6)
  for (let k = 1; k < chain.joints.length - 1; k++) {
    expect(Math.abs(length(sub(chain.joints[k + 1]!, chain.joints[k]!)) - arm.linkLengthMm)).toBeLessThan(1e-6)
  }
  const straight = sub(chain.joints[1]!, chain.joints[0]!)
  const depth = length(straight)
  expect(depth).toBeGreaterThanOrEqual(-1e-9)
  expect(depth).toBeLessThanOrEqual(arm.insertionMm + 1e-6)
  if (depth > 1e-9) {
    const along = normalize(straight)
    expect(Math.abs(along[0] - axis[0]) + Math.abs(along[1] - axis[1]) + Math.abs(along[2] - axis[2])).toBeLessThan(1e-9)
  }
  expect(length(sub(chain.joints[0]!, p.position))).toBe(0)
}

describe('fabrik in free space', () => {
  it('reaches a wrist 1082 mm away with a 45 degree tool within 2 mm and 3 degrees', () => {
    const result = fabrik(port(), goalOf([600, 0, -900], [0.707, 0, -0.707]), DEFAULT_ARM, 8)
    expect(result.ok).toBe(true)
    expect(result.tipErrorMm).toBeLessThan(TIP_TOLERANCE_MM)
    expect(result.axisErrorDeg).toBeLessThan(AXIS_TOLERANCE_DEG)
    expect(result.chain).not.toBeNull()
    checkChain(result.chain!, port(), DEFAULT_ARM)
    console.log(`fabrik 8 links: ${result.passes} passes, tip ${result.tipErrorMm.toFixed(3)} mm, axis ${result.axisErrorDeg.toFixed(3)} deg`)
  })

  it('keeps every limit on 30 seeded reachable goals and never produces a non-finite number', () => {
    const random = seededRandom(7)
    let ok = 0
    let worstTip = 0
    let worstAxis = 0
    let worstBend = 0
    let passes = 0
    const started = performance.now()
    for (let i = 0; i < 30; i++) {
      const links = 6 + Math.floor(random() * 19)
      const goal = reachableGoal(random, port(), DEFAULT_ARM, links)
      const result = fabrik(port(), goal, DEFAULT_ARM, links)
      expect(allFinite(result), `goal ${i}`).toBe(true)
      if (result.chain) for (const bend of bendAngles(result.chain, [0, 0, -1])) expect(bend).toBeLessThanOrEqual(DEFAULT_ARM.maxBendDeg + 1e-6)
      if (!result.ok) continue
      ok++
      passes += result.passes
      worstTip = Math.max(worstTip, result.tipErrorMm)
      worstAxis = Math.max(worstAxis, result.axisErrorDeg)
      checkChain(result.chain, port(), DEFAULT_ARM)
      worstBend = Math.max(worstBend, ...bendAngles(result.chain, [0, 0, -1]))
    }
    const ms = performance.now() - started
    console.log(`fabrik seeded: ${ok}/30 ok, mean passes ${(passes / Math.max(ok, 1)).toFixed(1)}, worst tip ${worstTip.toFixed(3)} mm, axis ${worstAxis.toFixed(3)} deg, bend ${worstBend.toFixed(3)} deg, ${ms.toFixed(0)} ms`)
    expect(ok).toBeGreaterThanOrEqual(27)
    expect(worstTip).toBeLessThan(TIP_TOLERANCE_MM)
    expect(worstAxis).toBeLessThan(AXIS_TOLERANCE_DEG)
  })

  it('works along an oblique port axis too', () => {
    const p = port(normalize([1, 0, -1]), [100, 50, 0])
    const random = seededRandom(11)
    for (let i = 0; i < 5; i++) {
      const goal = reachableGoal(random, p, DEFAULT_ARM, 10)
      const result = fabrik(p, goal, DEFAULT_ARM, 10)
      expect(result.ok, `goal ${i}`).toBe(true)
      if (result.ok) checkChain(result.chain, p, DEFAULT_ARM)
    }
  })
})

describe('fabrik limits', () => {
  it('keeps the bend limit when it cannot converge', () => {
    const arm = { ...DEFAULT_ARM, maxBendDeg: 5 }
    const result = fabrik(port(), goalOf([800, 0, -400], [1, 0, 0]), arm, 12)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('no-convergence')
    expect(result.chain).not.toBeNull()
    for (const bend of bendAngles(result.chain!, [0, 0, -1])) expect(bend).toBeLessThanOrEqual(5 + 1e-6)
    expect(allFinite(result)).toBe(true)
  })

  it('fails with beyond-length and no chain when the wrist is farther than the arm is long', () => {
    const result = fabrik(port(), goalOf([0, 0, -3601], [0, 0, -1]), DEFAULT_ARM, 24)
    expect(result).toMatchObject({ ok: false, reason: 'beyond-length', chain: null, passes: 0 })
    expect(allFinite(result)).toBe(true)
    const reachable = fabrik(port(), goalOf([0, 0, -3000], [0, 0, -1]), DEFAULT_ARM, 24)
    expect(reachable.ok).toBe(true)
  })

  it('puts the end of the straight part on the port when the insertion stroke is zero', () => {
    const arm = { ...DEFAULT_ARM, insertionMm: 0 }
    const result = fabrik(port(), goalOf([300, 0, -800], [0.5, 0, -1]), arm, 10)
    expect(result.chain).not.toBeNull()
    expect(result.chain!.joints[1]).toEqual(result.chain!.joints[0])
    expect(allFinite(result)).toBe(true)
  })

  it('converges in fewer passes from the solution of a goal 20 mm away than from cold', () => {
    const goal = reachableGoal(seededRandom(5), port(), DEFAULT_ARM, 12)
    const first = fabrik(port(), goal, DEFAULT_ARM, 12)
    expect(first.ok).toBe(true)
    const next = { wrist: add(goal.wrist, [20, 0, 0] as Vec3), toolZ: goal.toolZ }
    const cold = fabrik(port(), next, DEFAULT_ARM, 12)
    const warm = fabrik(port(), next, DEFAULT_ARM, 12, first.chain!)
    expect(cold.ok).toBe(true)
    expect(warm.ok).toBe(true)
    console.log(`fabrik warm ${warm.passes} passes, cold ${cold.passes} passes`)
    expect(warm.passes).toBeLessThan(cold.passes)
  })
})

describe('fabrik degenerate input', () => {
  const goal = goalOf([0, 0, -600], [0, 0, -1])

  it('survives a wrist exactly at the port and a wrist behind it, without a non-finite number', () => {
    for (const wrist of [[0, 0, 0], [0, 0, 500], [1e-12, 0, 0]] as Vec3[]) {
      const result = fabrik(port(), goalOf(wrist, [0, 0, -1]), DEFAULT_ARM, 8)
      expect(allFinite(result), wrist.join()).toBe(true)
      expect(result.ok, wrist.join()).toBe(false)
      if (!result.ok) expect(result.reason, wrist.join()).toBe('no-convergence')
    }
  })

  it('rejects a zero or non-finite direction, a non-finite goal and a bad link count as bad-input', () => {
    const cases: Array<[string, FabrikResult]> = [
      ['zero direction', fabrik(port([0, 0, 0]), goal, DEFAULT_ARM, 8)],
      ['NaN direction', fabrik(port([NaN, 0, -1]), goal, DEFAULT_ARM, 8)],
      ['NaN wrist', fabrik(port(), goalOf([NaN, 0, -600], [0, 0, -1]), DEFAULT_ARM, 8)],
      ['infinite tool z', fabrik(port(), { wrist: [0, 0, -600], toolZ: [Infinity, 0, 0] }, DEFAULT_ARM, 8)],
      ['zero tool z', fabrik(port(), { wrist: [0, 0, -600], toolZ: [0, 0, 0] }, DEFAULT_ARM, 8)],
      ['0 active links', fabrik(port(), goal, DEFAULT_ARM, 0)],
      ['too many links', fabrik(port(), goal, DEFAULT_ARM, 25)],
    ]
    for (const [name, result] of cases) {
      expect(result, name).toMatchObject({ ok: false, reason: 'bad-input', chain: null })
      expect(allFinite(result), name).toBe(true)
    }
  })
})
