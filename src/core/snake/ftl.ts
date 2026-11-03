import { add, dot, length, normalize, scale, sub, type Vec3 } from '../math/vec3'
import { wristTarget, type ArmChain, type ArmParams, type Port } from './arm'
import { limitBend, type WristGoal } from './fabrik'

export const FTL_STEP_MM = 10
// Spacing of the sampled curve through the target's joints.
const CURVE_STEP_MM = 5

export interface InsertionFrame {
  // How far the tip has travelled past the port.
  tipS: number
  // From the port to the tip; the link that crosses the port is cut at it.
  joints: Vec3[]
}

// The wrist for a TCP held approachMm back along minus tool z, which is where the torch waits before the weld.
export function approachGoal(tcp: Vec3, toolZ: Vec3, arm: ArmParams, approachMm: number): WristGoal {
  return { wrist: wristTarget(sub(tcp, scale(toolZ, approachMm)), toolZ, arm), toolZ }
}

const distance = (a: Vec3, b: Vec3): number => length(sub(a, b))

// Centripetal Catmull-Rom between p1 and p2 (Barry and Goldman), t in [0, 1].
function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const knot = (a: Vec3, b: Vec3, previous: number) => previous + Math.max(Math.sqrt(distance(a, b)), 1e-6)
  const t0 = 0
  const t1 = knot(p0, p1, t0)
  const t2 = knot(p1, p2, t1)
  const t3 = knot(p2, p3, t2)
  const u = t1 + (t2 - t1) * t
  const mix = (a: Vec3, b: Vec3, ta: number, tb: number): Vec3 => {
    const f = (u - ta) / (tb - ta)
    return add(scale(a, 1 - f), scale(b, f))
  }
  const a1 = mix(p0, p1, t0, t1)
  const a2 = mix(p1, p2, t1, t2)
  const a3 = mix(p2, p3, t2, t3)
  return mix(mix(a1, a2, t0, t2), mix(a2, a3, t1, t3), t1, t2)
}

// Straight along the axis from links * L behind the port, through the straight part, then a curve through the
// target's link joints ending exactly at the wrist.
export function tipPath(port: Port, target: ArmChain, arm: ArmParams): Vec3[] {
  const axis = normalize(port.direction)
  const joints = target.joints
  const path: Vec3[] = [sub(port.position, scale(axis, arm.links * arm.linkLengthMm)), port.position]
  const through = joints.slice(1)
  const last = through[through.length - 1]
  if (last === undefined) return path

  const push = (p: Vec3) => {
    if (distance(path[path.length - 1]!, p) > 1e-9) path.push(p)
  }
  push(through[0]!)
  for (let k = 0; k < through.length - 1; k++) {
    const p1 = through[k]!
    const p2 = through[k + 1]!
    const p0 = k === 0 ? sub(p1, scale(axis, arm.linkLengthMm)) : through[k - 1]!
    const p3 = k + 2 < through.length ? through[k + 2]! : add(p2, sub(p2, p1))
    const steps = Math.max(1, Math.ceil(distance(p1, p2) / CURVE_STEP_MM))
    for (let i = 1; i < steps; i++) push(catmullRom(p0, p1, p2, p3, i / steps))
    push(p2)
  }
  return path
}

function arcLengths(path: Vec3[]): number[] {
  const out = [0]
  for (let i = 1; i < path.length; i++) out.push(out[i - 1]! + distance(path[i - 1]!, path[i]!))
  return out
}

function pointAt(path: Vec3[], arc: number[], u: number): { point: Vec3; segment: number } {
  let segment = 0
  while (segment < path.length - 2 && arc[segment + 1]! < u) segment++
  const a = path[segment]!
  const b = path[segment + 1]!
  const span = arc[segment + 1]! - arc[segment]!
  const f = span < 1e-12 ? 1 : Math.min(Math.max((u - arc[segment]!) / span, 0), 1)
  return { point: add(scale(a, 1 - f), scale(b, f)), segment }
}

// The point on the path behind `from` (which lies on `segment`) that is chord mm from it, or null when the path ends.
function chordBack(path: Vec3[], from: Vec3, segment: number, chord: number): { point: Vec3; segment: number } | null {
  let end = from
  for (let s = segment; s >= 0; s--) {
    const start = path[s]!
    if (distance(start, from) < chord) {
      end = start
      continue
    }
    // |start + t (end - start) - from| = chord: the end is inside the circle and the start on or outside it, so the one
    // crossing in [0, 1] is the smaller root.
    const d = sub(end, start)
    const w = sub(start, from)
    const a = dot(d, d)
    const b = 2 * dot(d, w)
    const c = dot(w, w) - chord * chord
    const root = a < 1e-18 ? 1 : (-b - Math.sqrt(Math.max(b * b - 4 * a * c, 0))) / (2 * a)
    const t = Math.min(Math.max(root, 0), 1)
    return { point: add(start, scale(d, t)), segment: s }
  }
  return null
}

function frameAt(path: Vec3[], arc: number[], u: number, port: Port, arm: ArmParams): Vec3[] {
  const axis = normalize(port.direction)
  const axial = (p: Vec3) => dot(sub(p, port.position), axis)
  const tip = pointAt(path, arc, u)
  if (axial(tip.point) <= 1e-9) return [port.position]

  // From the tip back by chord L until a joint falls behind the port; the link that crosses it is cut there.
  const back: Vec3[] = [tip.point]
  let current = tip
  for (;;) {
    const found = chordBack(path, current.point, current.segment, arm.linkLengthMm)
    const here = back[back.length - 1]!
    if (found === null || axial(found.point) < 0) {
      const behind = found ? found.point : path[0]!
      const a = axial(here)
      const f = a / Math.max(a - axial(behind), 1e-12)
      back.push(add(here, scale(sub(behind, here), f)))
      break
    }
    back.push(found.point)
    current = found
  }
  back.reverse()
  back[0] = port.position

  // Forward from the port, each link turned onto the cone of the one before when it bends too far, so the lengths and
  // limits stay exact and the slack lands in the tip.
  const joints: Vec3[] = [port.position]
  let previous = axis
  for (let k = 0; k < back.length - 1; k++) {
    const link = sub(back[k + 1]!, back[k]!)
    const span = length(link)
    if (span < 1e-9) continue
    const direction = limitBend(previous, normalize(link), arm.maxBendDeg)
    joints.push(add(joints[joints.length - 1]!, scale(direction, span)))
    previous = direction
  }
  return joints
}

// One frame per FTL_STEP_MM of tip travel and a final frame at the target: the arm enters along the tip path, each
// joint following the one ahead of it by chord length L.
export function insertion(port: Port, target: ArmChain, arm: ArmParams): InsertionFrame[] {
  const path = tipPath(port, target, arm)
  const arc = arcLengths(path)
  const portArc = arc[1]!
  const travel = arc[arc.length - 1]! - portArc

  const frames: InsertionFrame[] = []
  const at = (tipS: number) => frames.push({ tipS, joints: frameAt(path, arc, portArc + tipS, port, arm) })
  for (let tipS = 0; tipS < travel - 1e-9; tipS += FTL_STEP_MM) at(tipS)
  at(travel)
  return frames
}
