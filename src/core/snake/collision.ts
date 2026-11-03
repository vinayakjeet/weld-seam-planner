import { Vector3 } from 'three'
import type { HitPointInfo, MeshBVH } from 'three-mesh-bvh'
import { add, cross, dot, length, normalize, scale, sub, type Vec3 } from '../math/vec3'
import { capsuleRadius, type ArmChain, type ArmParams, type Port } from './arm'
import { fabrik, type FabrikFailure, type WristGoal } from './fabrik'

// Nearest surface point within maxMm of p, or null when nothing is that close.
export type Proximity = (p: Vec3, maxMm: number) => { point: Vec3; distanceMm: number } | null

// three-mesh-bvh scores every triangle of a leaf it opens, so closestPointToPoint can return a hit farther than the
// range it was given (on a hollow part, a wall hundreds of mm away). The distance is checked here.
export function proximityFromBvh(bvh: MeshBVH): Proximity {
  const probe = new Vector3()
  const hit: HitPointInfo = { point: new Vector3(), distance: 0, faceIndex: 0 }
  return (p, maxMm) => {
    const found = bvh.closestPointToPoint(probe.set(p[0], p[1], p[2]), hit, 0, maxMm)
    if (found === null || found.distance > maxMm) return null
    return { point: [found.point.x, found.point.y, found.point.z], distanceMm: found.distance }
  }
}

export interface Contact {
  // 0 is the straight part, link k >= 1 runs from joints[k] to joints[k + 1].
  link: number
  sample: Vec3
  surface: Vec3
  depthMm: number
}

// Samples along every link, both ends included and at most one radius apart. A surface between two samples can come
// closer than the radius, by up to 6.7 mm at the default 50 mm (see debt.md).
export function armContacts(chain: ArmChain, arm: ArmParams, near: Proximity, radiusMm: number = capsuleRadius(arm)): Contact[] {
  const out: Contact[] = []
  const { joints } = chain
  for (let link = 0; link < joints.length - 1; link++) {
    const from = joints[link]!
    const to = joints[link + 1]!
    const span = length(sub(to, from))
    const steps = span < 1e-9 ? 0 : Math.ceil(span / radiusMm)
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps
      const sample: Vec3 = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t]
      const hit = near(sample, radiusMm)
      if (hit && hit.distanceMm < radiusMm) out.push({ link, sample, surface: hit.point, depthMm: radiusMm - hit.distanceMm })
    }
  }
  return out
}

export const PUSH_ITERATIONS = 30
// A rung is dropped after this many rounds in a row in which the deepest contact did not shrink by half a millimetre.
export const PUSH_STALE_ROUNDS = 3
// Share of the deepest contact removed per round; a full push throws the chain far enough that FABRIK often cannot settle.
const PUSH_FRACTION = 0.5

export type ArmFailure = FabrikFailure | 'collision' | 'port-too-small'

export type ArmSolution =
  | { ok: true; chain: ArmChain; tipErrorMm: number; axisErrorDeg: number; iterations: number }
  | { ok: false; reason: ArmFailure; chain: ArmChain | null; iterations: number }

// Active link counts to try: the count that spans the wrist distance, the one below it (the straight part makes up the
// difference, so a wrist a hair past a whole number of links is a straight reach, where the longer chain would have to be
// folded into a shorter span) and two above it. A longer chain has slack to buckle around an obstacle, which a chain
// stretched straight does not.
export function linkLadder(port: Port, goal: WristGoal, arm: ArmParams): number[] {
  const distance = length(sub(goal.wrist, port.position))
  const spanning = Math.min(Math.max(Math.ceil(distance / arm.linkLengthMm), 1), arm.links)
  return [spanning - 1, spanning, spanning + 1, spanning + 2].filter((n) => n >= 1 && n <= arm.links)
}

const ESCAPE_STEPS = 8
const ESCAPE_PROBE_RADII = 3
// Share of the direction away from the surface that must lie across the link for the contact to count as side on.
const SIDE_ON = 0.5

// Where to push a contacted link, always across the link, never along it: sliding a link back along itself only
// lets the solver pull it forward again. A surface met from the side is pushed straight away from; one met head on
// (a wall across the path) has no sideways direction of its own, so the direction with the most room is taken, found by
// probing a few radii out. Without the probe a link that meets a wall squarely is pushed back and never goes around.
function escapeDirection(contact: Contact, along: Vec3, near: Proximity, radiusMm: number): Vec3 {
  const away = normalize(sub(contact.sample, contact.surface))
  const reach = ESCAPE_PROBE_RADII * radiusMm
  const room = (direction: Vec3): number => near(add(contact.sample, scale(direction, reach)), reach)?.distanceMm ?? reach

  const candidates: Vec3[] = []
  const sideways = sub(away, scale(along, dot(away, along)))
  if (length(sideways) >= SIDE_ON) candidates.push(normalize(sideways))
  const u = normalize(cross(along, Math.abs(along[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]))
  const v = cross(along, u)
  for (let i = 0; i < ESCAPE_STEPS; i++) {
    const angle = (2 * Math.PI * i) / ESCAPE_STEPS
    candidates.push(add(scale(u, Math.cos(angle)), scale(v, Math.sin(angle))))
  }

  let best = candidates[0]!
  let bestRoom = room(best)
  for (const candidate of candidates.slice(1)) {
    if (bestRoom >= reach) break
    const r = room(candidate)
    if (r > bestRoom) {
      best = candidate
      bestRoom = r
    }
  }
  return best
}

// Moves the joints of every contacted link away from the part. Never joints[0]; joints[1] only along the port axis.
function pushOut(chain: ArmChain, contacts: Contact[], axis: Vec3, near: Proximity, radiusMm: number): ArmChain {
  const deepest = new Map<number, Contact>()
  for (const contact of contacts) {
    const held = deepest.get(contact.link)
    if (!held || contact.depthMm > held.depthMm) deepest.set(contact.link, contact)
  }

  const { joints } = chain
  const sums = joints.map((): Vec3 => [0, 0, 0])
  const counts = joints.map(() => 0)
  for (const [link, contact] of deepest) {
    const along = normalize(sub(joints[link + 1]!, joints[link]!))
    const direction = escapeDirection(contact, length(along) > 0 ? along : axis, near, radiusMm)
    const move = scale(direction, PUSH_FRACTION * contact.depthMm + 1)
    for (const k of [link, link + 1]) {
      sums[k] = add(sums[k]!, move)
      counts[k]!++
    }
  }

  const out: Vec3[] = joints.map((joint, k) => {
    if (k === 0 || counts[k] === 0) return joint
    const mean = scale(sums[k]!, 1 / counts[k]!)
    return add(joint, k === 1 ? scale(axis, dot(mean, axis)) : mean)
  })
  return { joints: out }
}

// Wrist target solved with FABRIK, then pushed clear of the part: up to PUSH_ITERATIONS rounds of FABRIK from the
// current chain and a push of every link in contact, for each active link count of the ladder. The first rung is the
// start chain's own link count when a start is given, so a warm start from the neighbouring station is tried first.
export function solveArm(port: Port, goal: WristGoal, arm: ArmParams, near: Proximity, start?: ArmChain): ArmSolution {
  if (arm.diameterMm > port.diameterMm) return { ok: false, reason: 'port-too-small', chain: null, iterations: 0 }

  const radius = capsuleRadius(arm)
  // The wrist is the last joint of every chain, so a wrist inside the capsule radius is a contact no push can remove.
  const wristHit = near(goal.wrist, radius)
  if (wristHit && wristHit.distanceMm < radius) return { ok: false, reason: 'collision', chain: null, iterations: 0 }

  const axis = normalize(port.direction)
  const startLinks = start ? start.joints.length - 2 : -1
  const ladder = linkLadder(port, goal, arm)
  // The warm rung goes first and does not use up its link count: if the refinement of the start fails, the same count is
  // tried again from cold starts, which often succeed where the neighbouring station's shape is a poor start.
  const warmRung = startLinks >= 1 && startLinks <= arm.links ? [{ links: startLinks, warm: true }] : []
  const rungs = [...warmRung, ...ladder.map((links) => ({ links, warm: false }))]

  let iterations = 0
  let last: ArmSolution = { ok: false, reason: 'no-convergence', chain: null, iterations: 0 }
  for (const { links, warm } of rungs) {
    let chain = warm ? start : undefined
    let bestDepth = Infinity
    let stale = 0
    for (let round = 0; round < PUSH_ITERATIONS; round++) {
      iterations++
      const solved = fabrik(port, goal, arm, links, chain)
      const current = solved.chain
      if (current === null) return { ok: false, reason: solved.ok ? 'no-convergence' : solved.reason, chain: null, iterations }

      // A miss of more than a link is the bend limit, not the part: pushing joints away from the surface cannot fix it.
      if (!solved.ok && solved.tipErrorMm > arm.linkLengthMm) {
        last = { ok: false, reason: 'no-convergence', chain: current, iterations }
        break
      }
      const contacts = armContacts(current, arm, near, radius)
      if (contacts.length === 0) {
        if (solved.ok) return { ok: true, chain: current, tipErrorMm: solved.tipErrorMm, axisErrorDeg: solved.axisErrorDeg, iterations }
        last = { ok: false, reason: 'no-convergence', chain: current, iterations }
        break
      }
      last = { ok: false, reason: 'collision', chain: current, iterations }
      const deepest = Math.max(...contacts.map((c) => c.depthMm))
      if (deepest < bestDepth - 0.5) {
        bestDepth = deepest
        stale = 0
      } else if (++stale >= PUSH_STALE_ROUNDS) break
      chain = pushOut(current, contacts, axis, near, radius)
    }
  }
  return { ...last, iterations }
}
