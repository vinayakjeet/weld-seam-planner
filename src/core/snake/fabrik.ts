import { add, cross, dot, length, normalize, rotateAbout, scale, sub, type Vec3 } from '../math/vec3'
import { angleBetweenDeg, type ArmChain, type ArmParams, type Port } from './arm'

export const TIP_TOLERANCE_MM = 2
export const AXIS_TOLERANCE_DEG = 3
export const FABRIK_PASSES = 50
// A pass counts as an improvement only if it lowers the best tip error by more than this.
const STALL_MM = 0.01
// A run is dropped after this many passes without a new best tip error.
const STALE_PASSES = 4
// Curved starts tried from cold: the plain arc first, then seeded variations.
export const COLD_STARTS = 3
// Damped least squares steps tried on a chain FABRIK could not finish.
const POLISH_ITERATIONS = 40
// The finish runs only when FABRIK ended this close to the goal, in link lengths, and stops once it gains under 1 percent
// of its cost over a few steps.
const POLISH_REACH_LINKS = 1

export interface WristGoal {
  wrist: Vec3
  // Unit tool z: the last link lies along it, so the torch continues the arm.
  toolZ: Vec3
}

export type FabrikFailure = 'beyond-length' | 'no-convergence' | 'bad-input'

// Without a chain (beyond-length, bad-input) the errors are 0, except beyond-length which reports how far the wrist is
// past the arm's reach in tipErrorMm.
export type FabrikResult =
  | { ok: true; chain: ArmChain; tipErrorMm: number; axisErrorDeg: number; passes: number }
  | { ok: false; reason: FabrikFailure; chain: ArmChain | null; tipErrorMm: number; axisErrorDeg: number; passes: number }

const finite = (v: Vec3): boolean => v.every(Number.isFinite)

// A zero-length vector takes the fallback direction, so nothing becomes NaN.
function unit(v: Vec3, fallback: Vec3): Vec3 {
  const n = normalize(v)
  return length(n) === 0 ? fallback : n
}

function anyPerpendicular(v: Vec3): Vec3 {
  const helper: Vec3 = Math.abs(v[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  return normalize(cross(v, helper))
}

// dir turned toward prev until it is no more than maxDeg away from it.
function limitBend(prev: Vec3, dir: Vec3, maxDeg: number): Vec3 {
  if (angleBetweenDeg(prev, dir) <= maxDeg) return dir
  const axis = cross(prev, dir)
  const turnAxis = length(axis) < 1e-12 ? anyPerpendicular(prev) : axis
  return normalize(rotateAbout(prev, turnAxis, maxDeg))
}

interface CurveShape {
  // Depth of the straight part, then handle lengths relative to the length-matching scale, and a sideways nudge of
  // each handle (mm per unit of scale) in the plane across the port axis.
  depth: number
  startHandle: number
  endHandle: number
  startSide: Vec3
  endSide: Vec3
}

// A chain that follows a cubic Bezier from the end of the straight part to the wrist, leaving along the axis and
// arriving along the tool z. A common scale on both handles is found so the curve is about as long as the links, then
// joints are placed along it one link length apart. Different shapes give straight arcs, S bends and loops, which is
// what lets the passes below start near a solution the bend limits allow.
function curvedStart(port: Port, axis: Vec3, goal: WristGoal, toolZ: Vec3, L: number, n: number, shape: CurveShape): Vec3[] {
  const p0 = add(port.position, scale(axis, shape.depth))
  const p3 = goal.wrist
  const point = (t: number, m: number): Vec3 => {
    const p1 = add(add(p0, scale(axis, m * shape.startHandle)), scale(shape.startSide, m))
    const p2 = add(sub(p3, scale(toolZ, m * shape.endHandle)), scale(shape.endSide, m))
    const u = 1 - t
    return [0, 1, 2].map((c) => u * u * u * p0[c]! + 3 * u * u * t * p1[c]! + 3 * u * t * t * p2[c]! + t * t * t * p3[c]!) as Vec3
  }
  const curveLength = (m: number): number => {
    let total = 0
    let last = point(0, m)
    for (let i = 1; i <= 64; i++) {
      const q = point(i / 64, m)
      total += length(sub(q, last))
      last = q
    }
    return total
  }
  const target = n * L
  let lo = 0
  let hi = 4 * target
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (curveLength(mid) < target) lo = mid
    else hi = mid
  }
  const m = (lo + hi) / 2
  const dense = Array.from({ length: 513 }, (_, i) => point(i / 512, m))
  const joints: Vec3[] = [port.position, p0]
  let cursor = 0
  for (let k = 2; k <= n + 1; k++) {
    const from = joints[k - 1]!
    while (cursor < 512 && length(sub(dense[cursor]!, from)) < L) cursor++
    joints.push(add(from, scale(unit(sub(dense[cursor]!, from), axis), L)))
  }
  return joints
}

// Same inputs give the same starts: a small LCG seeded from nothing but the problem size.
function lcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

// Solves the n x n system a x = b by Gaussian elimination with partial pivoting; a singular system gives zeros.
function solveSmall(a: number[][], b: number[]): number[] {
  const size = b.length
  const m = a.map((row, i) => [...row, b[i]!])
  for (let col = 0; col < size; col++) {
    let pivot = col
    for (let r = col + 1; r < size; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r
    if (Math.abs(m[pivot]![col]!) < 1e-14) return new Array<number>(size).fill(0)
    ;[m[col], m[pivot]] = [m[pivot]!, m[col]!]
    for (let r = col + 1; r < size; r++) {
      const f = m[r]![col]! / m[col]![col]!
      for (let c = col; c <= size; c++) m[r]![c] = m[r]![c]! - f * m[col]![c]!
    }
  }
  const x = new Array<number>(size).fill(0)
  for (let r = size - 1; r >= 0; r--) {
    let sum = m[r]![size]!
    for (let c = r + 1; c < size; c++) sum -= m[r]![c]! * x[c]!
    x[r] = sum / m[r]![r]!
  }
  return x
}

// FABRIK's forward pass stalls where the bend cone binds: it settles on a chain that its own backward pass leaves
// unchanged but that is not the closest the arm can get. From such a chain this takes damped least squares steps on the
// bend angles (a 2 vector per joint in the plane across the previous link, plus the depth of the straight part), the
// residual being the tip error and the axis misalignment as a length. Every trial is projected back onto the bend
// cones and the depth range, so each accepted chain still obeys the limits, and link lengths hold by construction.
function polish(joints: Vec3[], port: Port, axis: Vec3, goal: WristGoal, toolZ: Vec3, arm: ArmParams, n: number): Vec3[] {
  const L = arm.linkLengthMm
  const maxRad = (arm.maxBendDeg * Math.PI) / 180
  const e1 = anyPerpendicular(axis)
  const e2 = cross(axis, e1)

  // Parallel transport of the in-plane basis (a, b) when the heading turns from u to next, by Rodrigues' formula.
  const turnBasis = (from: Vec3, to: Vec3, a: Vec3, b: Vec3): [Vec3, Vec3] => {
    const kx = from[1] * to[2] - from[2] * to[1]
    const ky = from[2] * to[0] - from[0] * to[2]
    const kz = from[0] * to[1] - from[1] * to[0]
    const sin = Math.hypot(kx, ky, kz)
    if (sin < 1e-15) return [a, b]
    const cos = from[0] * to[0] + from[1] * to[1] + from[2] * to[2]
    const nx = kx / sin
    const ny = ky / sin
    const nz = kz / sin
    const turn = (v: Vec3): Vec3 => {
      const along = (nx * v[0] + ny * v[1] + nz * v[2]) * (1 - cos)
      return [
        v[0] * cos + (ny * v[2] - nz * v[1]) * sin + nx * along,
        v[1] * cos + (nz * v[0] - nx * v[2]) * sin + ny * along,
        v[2] * cos + (nx * v[1] - ny * v[0]) * sin + nz * along,
      ]
    }
    return [turn(a), turn(b)]
  }

  // x = [depth, bx1, by1, bx2, by2, ...]; returns the link directions.
  const directions = (x: number[]): Vec3[] => {
    const out: Vec3[] = []
    let u = axis
    let a = e1
    let b = e2
    for (let k = 0; k < n; k++) {
      const bx = x[1 + 2 * k]!
      const by = x[2 + 2 * k]!
      const theta = Math.hypot(bx, by)
      let next = u
      if (theta >= 1e-12) {
        const c = Math.cos(theta)
        const f = Math.sin(theta) / theta
        next = [
          u[0] * c + (a[0] * bx + b[0] * by) * f,
          u[1] * c + (a[1] * bx + b[1] * by) * f,
          u[2] * c + (a[2] * bx + b[2] * by) * f,
        ]
        const norm = Math.hypot(next[0], next[1], next[2])
        next = [next[0] / norm, next[1] / norm, next[2] / norm]
        ;[a, b] = turnBasis(u, next, a, b)
      }
      out.push(next)
      u = next
    }
    return out
  }
  const residual = (x: number[]): number[] => {
    const u = directions(x)
    let tip = add(port.position, scale(axis, x[0]!))
    for (const v of u) tip = add(tip, scale(v, L))
    const e = sub(tip, goal.wrist)
    const o = scale(sub(u[n - 1]!, toolZ), L)
    return [e[0], e[1], e[2], o[0], o[1], o[2]]
  }
  const project = (x: number[]): number[] => {
    const out = [...x]
    out[0] = Math.min(Math.max(out[0]!, 0), arm.insertionMm)
    for (let k = 0; k < n; k++) {
      const theta = Math.hypot(out[1 + 2 * k]!, out[2 + 2 * k]!)
      if (theta > maxRad) {
        out[1 + 2 * k] = (out[1 + 2 * k]! * maxRad) / theta
        out[2 + 2 * k] = (out[2 + 2 * k]! * maxRad) / theta
      }
    }
    return out
  }
  const costOf = (r: number[]) => r.reduce((sum, v) => sum + v * v, 0)

  // Bend angles of the incoming chain.
  let x: number[] = [Math.min(length(sub(joints[1]!, port.position)), arm.insertionMm)]
  {
    let u = axis
    let a = e1
    let b = e2
    for (let k = 1; k <= n; k++) {
      const next = unit(sub(joints[k + 1]!, joints[k]!), u)
      const spin = cross(u, next)
      const theta = Math.atan2(length(spin), dot(u, next))
      const tangent = normalize(sub(next, scale(u, dot(next, u))))
      x.push(theta * dot(tangent, a), theta * dot(tangent, b))
      ;[a, b] = turnBasis(u, next, a, b)
      u = next
    }
    x = project(x)
  }

  const size = 2 * n + 1
  let r = residual(x)
  let cost = costOf(r)
  let damping = 1
  let slow = 0
  for (let iteration = 0; iteration < POLISH_ITERATIONS && slow < 4; iteration++) {
    if (length([r[0]!, r[1]!, r[2]!]) < TIP_TOLERANCE_MM / 2 && Math.hypot(r[3]!, r[4]!, r[5]!) / L < ((AXIS_TOLERANCE_DEG / 2) * Math.PI) / 180) break
    const jac: number[][] = Array.from({ length: 6 }, () => new Array<number>(size).fill(0))
    for (let j = 0; j < size; j++) {
      const h = j === 0 ? 1e-3 : 1e-6
      const bumped = [...x]
      bumped[j] = bumped[j]! + h
      const rb = residual(bumped)
      for (let i = 0; i < 6; i++) jac[i]![j] = (rb[i]! - r[i]!) / h
    }
    // A joint on its limit may slide along the cone edge or come back in, but not push out: drop the outward direction.
    const gradient = Array.from({ length: size }, (_, j) => jac.reduce((sum, row, i) => sum + row[j]! * r[i]!, 0))
    for (let k = 0; k < n; k++) {
      const bx = x[1 + 2 * k]!
      const by = x[2 + 2 * k]!
      const theta = Math.hypot(bx, by)
      if (theta < maxRad - 1e-9) continue
      const rx = bx / theta
      const ry = by / theta
      if (-(gradient[1 + 2 * k]! * rx + gradient[2 + 2 * k]! * ry) <= 0) continue
      for (const row of jac) {
        const radial = row[1 + 2 * k]! * rx + row[2 + 2 * k]! * ry
        row[1 + 2 * k] = row[1 + 2 * k]! - radial * rx
        row[2 + 2 * k] = row[2 + 2 * k]! - radial * ry
      }
    }
    if ((x[0]! <= 0 && gradient[0]! > 0) || (x[0]! >= arm.insertionMm && gradient[0]! < 0)) for (const row of jac) row[0] = 0
    const gram = jac.map((ri) => jac.map((rj) => ri.reduce((sum, v, c) => sum + v * rj[c]!, 0)))
    let accepted = false
    for (let attempt = 0; attempt < 6 && !accepted; attempt++) {
      const lambda = damping * damping * 1e-2 * (1 + gram[0]![0]! + gram[1]![1]! + gram[2]![2]!)
      const system = gram.map((row, i) => row.map((v, j) => v + (i === j ? lambda : 0)))
      const y = solveSmall(system, r.map((v) => -v))
      const step = new Array<number>(size).fill(0)
      for (let j = 0; j < size; j++) step[j] = jac.reduce((sum, row, i) => sum + row[j]! * y[i]!, 0)
      const trial = project(x.map((v, j) => v + step[j]!))
      const rt = residual(trial)
      const ct = costOf(rt)
      if (ct < cost) {
        slow = ct > 0.99 * cost ? slow + 1 : 0
        x = trial
        r = rt
        cost = ct
        damping = Math.max(damping * 0.5, 1e-3)
        accepted = true
      } else {
        damping *= 4
      }
    }
    if (!accepted) break
  }

  const u = directions(x)
  const out: Vec3[] = [port.position, add(port.position, scale(axis, x[0]!))]
  for (const v of u) out.push(add(out[out.length - 1]!, scale(v, L)))
  return out
}

function failure(reason: FabrikFailure, tipErrorMm = 0): FabrikResult {
  return { ok: false, reason, chain: null, tipErrorMm, axisErrorDeg: 0, passes: 0 }
}

// Constrained FABRIK for a chain of activeLinks links of equal length: port, a straight part on the port axis of depth
// 0 to insertionMm, then the links with a bend limit at every joint. The backward pass pins the wrist on the goal with
// the last link on the tool axis; the forward pass pins the port, then rebuilds each link from the previous one and
// turns it back onto the bend cone, so the returned chain always obeys the limits even when it misses the goal.
// With a start chain (the previous station) it refines that; from cold it tries up to COLD_STARTS curved chains, and a
// run that stalls close to the goal is finished by polish. passes counts the FABRIK passes of every run.
export function fabrik(port: Port, goal: WristGoal, arm: ArmParams, activeLinks: number, start?: ArmChain): FabrikResult {
  const axisLength = length(port.direction)
  if (
    !finite(port.position) ||
    !finite(port.direction) ||
    axisLength === 0 ||
    !finite(goal.wrist) ||
    !finite(goal.toolZ) ||
    length(goal.toolZ) === 0 ||
    !Number.isInteger(activeLinks) ||
    activeLinks < 1 ||
    activeLinks > arm.links
  ) {
    return failure('bad-input')
  }

  const axis = normalize(port.direction)
  const toolZ = normalize(goal.toolZ)
  const L = arm.linkLengthMm
  const n = activeLinks
  const reach = arm.links * L
  const distance = length(sub(goal.wrist, port.position))
  if (distance > reach) return failure('beyond-length', distance - reach)

  const budgetPerRun = FABRIK_PASSES
  // One run of backward and forward passes from a chain. Returns the best chain seen (lowest tip error), so a run that
  // wanders off at the end still reports where it came closest.
  const run = (initial: Vec3[]): FabrikResult => {
    let joints = initial
    let best: { joints: Vec3[]; tip: number; axis: number } | null = null
    let stale = 0
    let passes = 0
    while (passes < budgetPerRun) {
      passes++

      const back: Vec3[] = joints.map((j) => [...j] as Vec3)
      back[n + 1] = goal.wrist
      back[n] = sub(goal.wrist, scale(toolZ, L))
      for (let k = n - 1; k >= 1; k--) {
        const onward = unit(sub(back[k + 1]!, back[k + 2]!), scale(toolZ, -1))
        back[k] = add(back[k + 1]!, scale(unit(sub(joints[k]!, back[k + 1]!), onward), L))
      }

      const forward: Vec3[] = [port.position]
      const depth = Math.min(Math.max(dot(sub(back[1]!, port.position), axis), 0), arm.insertionMm)
      forward[1] = add(port.position, scale(axis, depth))
      let previous = axis
      for (let k = 2; k <= n + 1; k++) {
        const toward = unit(sub(back[k]!, forward[k - 1]!), previous)
        const direction = limitBend(previous, toward, arm.maxBendDeg)
        forward[k] = add(forward[k - 1]!, scale(direction, L))
        previous = direction
      }
      joints = forward

      const tip = length(sub(forward[n + 1]!, goal.wrist))
      const axisError = angleBetweenDeg(unit(sub(forward[n + 1]!, forward[n]!), axis), toolZ)
      if (tip < TIP_TOLERANCE_MM && axisError < AXIS_TOLERANCE_DEG) {
        return { ok: true, chain: { joints }, tipErrorMm: tip, axisErrorDeg: axisError, passes }
      }
      if (best === null || tip < best.tip - STALL_MM) {
        best = { joints, tip, axis: axisError }
        stale = 0
      } else if (++stale >= STALE_PASSES) {
        break
      }
    }
    const kept = best!
    if (kept.tip > POLISH_REACH_LINKS * L) {
      return { ok: false, reason: 'no-convergence', chain: { joints: kept.joints }, tipErrorMm: kept.tip, axisErrorDeg: kept.axis, passes }
    }
    const refined = polish(kept.joints, port, axis, goal, toolZ, arm, n)
    const tip = length(sub(refined[n + 1]!, goal.wrist))
    const axisError = angleBetweenDeg(unit(sub(refined[n + 1]!, refined[n]!), axis), toolZ)
    if (tip < TIP_TOLERANCE_MM && axisError < AXIS_TOLERANCE_DEG) {
      return { ok: true, chain: { joints: refined }, tipErrorMm: tip, axisErrorDeg: axisError, passes }
    }
    if (tip < kept.tip) return { ok: false, reason: 'no-convergence', chain: { joints: refined }, tipErrorMm: tip, axisErrorDeg: axisError, passes }
    return { ok: false, reason: 'no-convergence', chain: { joints: kept.joints }, tipErrorMm: kept.tip, axisErrorDeg: kept.axis, passes }
  }

  if (start && start.joints.length === n + 2 && start.joints.every(finite)) {
    return run(start.joints.map((j) => [...j] as Vec3))
  }

  const side = anyPerpendicular(axis)
  const side2 = cross(axis, side)
  const random = lcg(n * 7919 + 17)
  const shapeAt = (k: number): CurveShape => {
    if (k === 0) return { depth: 0, startHandle: 1, endHandle: 1, startSide: [0, 0, 0], endSide: [0, 0, 0] }
    if (k === 1) return { depth: arm.insertionMm / 2, startHandle: 1, endHandle: 1, startSide: [0, 0, 0], endSide: [0, 0, 0] }
    const nudge = (): Vec3 => {
      const angle = random() * 2 * Math.PI
      return scale(add(scale(side, Math.cos(angle)), scale(side2, Math.sin(angle))), random() * 0.8)
    }
    return {
      depth: random() * arm.insertionMm,
      startHandle: 0.2 + random() * 1.4,
      endHandle: 0.2 + random() * 1.4,
      startSide: nudge(),
      endSide: nudge(),
    }
  }

  let used = 0
  let closest: FabrikResult | null = null
  for (let k = 0; k < COLD_STARTS; k++) {
    const result = run(curvedStart(port, axis, goal, toolZ, L, n, shapeAt(k)))
    used += result.passes
    if (result.ok) return { ...result, passes: used }
    if (closest === null || result.tipErrorMm < closest.tipErrorMm) closest = result
  }
  return { ...closest!, passes: used }
}
