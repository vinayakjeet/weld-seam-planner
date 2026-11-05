import { accessStations, badIntervals, seamLength } from '../access/clearance'
import type { SeamAccess } from '../job/schema'
import { rotate } from '../math/quat'
import type { SeamPoint } from '../seams/frames'
import { DEFAULT_TORCH, poseAt, torchPoses } from '../torch/frames'
import type { ArmChain, ArmParams, Port } from './arm'
import { solveArm, type Proximity } from './collision'
import { approachGoal } from './ftl'

export interface ReachStation {
  s: number
  ok: boolean
  chain: ArmChain | null
}

export interface SeamReach {
  portId: string | null
  // Share of the seam length the arm reaches from portId, 0 to 1.
  coverage: number
  unreachable: Array<[number, number]>
  stations: ReachStation[]
}

const EPS = 1e-9

// The torch angle is the neutral one (like the access check) and the arm is solved for the approach point, not the weld
// point itself. Yields the share of the stations done after each one.
function* walk(seam: { points: SeamPoint[]; closed: boolean }, lengthMm: number, port: Port, arm: ArmParams, near: Proximity): Generator<number, SeamReach> {
  const poses = torchPoses(seam.points, seam.closed, DEFAULT_TORCH)
  const grid = accessStations(lengthMm, seam.closed)
  let warm: ArmChain | undefined
  const stations: ReachStation[] = []
  for (const { at } of grid) {
    const pose = poseAt(poses, at, seam.closed)
    const goal = approachGoal(pose.p, rotate(pose.q, [0, 0, 1]), arm, DEFAULT_TORCH.approachMm)
    const solved = solveArm(port, goal, arm, near, warm)
    warm = solved.ok ? solved.chain : undefined
    stations.push({ s: at, ok: solved.ok, chain: solved.ok ? solved.chain : null })
    yield stations.length / grid.length
  }
  const unreachable = badIntervals(grid, stations.map((station) => !station.ok), lengthMm)
  const lost = unreachable.reduce((total, [a, b]) => total + (b - a), 0)
  return { portId: port.id, coverage: Math.min(1, Math.max(0, 1 - lost / lengthMm)), unreachable, stations }
}

// Each port is walked station by station, warm starting from the last station that was reached and cold after a miss.
// The seam takes the port with the highest coverage, the first one on a tie. Yields the share of the work done after
// each station, so a caller can report progress and stop between stations.
export function* seamReachSteps(seam: { points: SeamPoint[]; closed: boolean }, ports: Port[], arm: ArmParams, near: Proximity): Generator<number, SeamReach> {
  if (seam.points.length === 0) return { portId: null, coverage: 0, unreachable: [], stations: [] }
  const lengthMm = seamLength(seam.points, seam.closed)
  let best: SeamReach | null = null
  for (let k = 0; k < ports.length; k++) {
    const steps = walk(seam, lengthMm, ports[k]!, arm, near)
    let next = steps.next()
    for (; !next.done; next = steps.next()) yield (k + next.value) / ports.length
    const reach = next.value
    if (best === null || reach.coverage > best.coverage + EPS) best = reach
    if (best.coverage >= 1) break
  }
  return best ?? { portId: null, coverage: 0, unreachable: [[0, lengthMm]], stations: [] }
}

export function seamReach(seam: { points: SeamPoint[]; closed: boolean }, ports: Port[], arm: ArmParams, near: Proximity): SeamReach {
  const steps = seamReachSteps(seam, ports, arm, near)
  let next = steps.next()
  while (!next.done) next = steps.next()
  return next.value
}

// Only a snake seam is reached by the arm; the other classes keep their access untouched.
export function withReach(access: SeamAccess, reach: SeamReach): SeamAccess {
  if (access.class !== 'snake') return access
  return { ...access, portId: reach.portId, reachCoverage: Math.round(reach.coverage * 1000) / 1000, unreachable: reach.unreachable }
}

export function reachKey(ports: Port[], arm: ArmParams): string {
  const portText = ports.map((p) => [p.id, ...p.position, ...p.direction, p.diameterMm].join(','))
  const armText = [arm.links, arm.linkLengthMm, arm.diameterMm, arm.maxBendDeg, arm.torchLengthMm, arm.insertionMm, arm.clearanceMm]
  return `${portText.join(';')}|${armText.join(',')}`
}
