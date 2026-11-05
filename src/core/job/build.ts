import { add, scale, type Vec3 } from '../math/vec3'
import { seamEstimates } from '../process/estimates'
import { throatMm } from '../process/filletRules'
import { DEFAULT_TORCH, poseAt, torchPoses, type TorchPose } from '../torch/frames'
import { awsFor, seamPosition, upFromGravity } from '../torch/positions'
import { reverseSeam } from '../seams/manual'
import type { SeamCandidate } from '../seams/detect'
import { airMoveMm } from '../sequence/air'
import { reconcileOrder } from '../sequence/order'
import { resolveSeam, torchParamsFor, type Explained, type Plan, type PlannedSeam } from './plan'
import type { PlanTiming } from './timing'
import { preflight, toJobIssue, type Issue } from './preflight'
import { FRAME_CONVENTION, JOB_UNITS, jobSchema, SCHEMA_URL, type JobIssue, type SeamAccess, type WeldJob } from './schema'

export const GENERATOR = { name: 'Weld Seam Planner', version: '1.0.0' }

type JobSeam = WeldJob['seams'][number]

// Adding 0 turns -0 into 0, so a rounded zero never prints as -0.
const round = (value: number, decimals: number) => Math.round(value * 10 ** decimals) / 10 ** decimals + 0
const r1 = (v: number) => round(v, 1)
const r2 = (v: number) => round(v, 2)
const r3 = (v: number) => round(v, 3)
const vec = (v: Vec3, decimals: number): Vec3 => [round(v[0], decimals), round(v[1], decimals), round(v[2], decimals)]

const SENSING_SEARCH_MM = 20
const EPS = 1e-9

// Arc lengths of the poses: 0, spacing, 2 x spacing, and finally the length itself.
function poseArcs(lengthMm: number, spacingMm: number): number[] {
  const arcs: number[] = []
  // A spacing that is not a positive number cannot step along the seam; the schema check names it later.
  const step = spacingMm > 0 && Number.isFinite(spacingMm) ? spacingMm : lengthMm
  for (let k = 0; k * step < lengthMm - EPS; k++) arcs.push(k * step)
  arcs.push(lengthMm)
  return arcs
}

function samplePoses(torch: TorchPose[], closed: boolean, lengthMm: number, spacingMm: number): TorchPose[] {
  const arcs = poseArcs(lengthMm, spacingMm)
  return arcs.map((s, k) => {
    // The end of a loop is its start, so it is copied rather than interpolated across the seam.
    if (closed && k === arcs.length - 1) return { ...torch[0]!, s }
    return { ...poseAt(torch, s, closed), s }
  })
}

function quaternionOut(q: [number, number, number, number]): [number, number, number, number] {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1
  const sign = q[3] < 0 ? -1 : 1
  const out = q.map((v) => round((sign * v) / n, 6))
  return [out[0]!, out[1]!, out[2]!, out[3]!]
}

export interface BuiltSeam {
  seam: JobSeam
  reversed: boolean
  firstApproach: Vec3
  lastRetract: Vec3
  arcTimeS: number
  wireKg: number
  gasL: number
  startS: number
}

// The Reverse tool gives the seam a new id and marks it manual; travelling a seam the other way needs neither.
export const travelledBackwards = (seam: SeamCandidate): SeamCandidate => ({ ...reverseSeam(seam), id: seam.id, source: seam.source })

const NO_ACCESS: SeamAccess = { clearanceDeg: null, nearClearanceDeg: null, class: null, portId: null, reachCoverage: null, unreachable: [] }

// The unreachable intervals are measured along the stored seam, while poses and s run along the travel direction, so a
// seam travelled backwards gets each [a, b] as [L - b, L - a], in ascending order.
function accessOut(access: SeamAccess | null, lengthMm: number, backwards: boolean): SeamAccess {
  if (access === null) return NO_ACCESS
  if (!backwards) return access
  const unreachable = access.unreachable.map(([a, b]): [number, number] => [r3(lengthMm - b), r3(lengthMm - a)]).sort((x, y) => x[0] - y[0])
  return { ...access, unreachable }
}

// A seam is built along its travel direction: poses, start and end follow it, while points stay as stored so that an
// imported file restores the seam itself and the order says which way it was welded.
function buildSeam(plan: Plan, planned: PlannedSeam, issues: JobIssue[], reversed = false): BuiltSeam {
  const stored = planned.seam
  const backwards = reversed && !stored.closed
  const seam = backwards ? travelledBackwards(stored) : stored
  const { settings, gravity } = plan
  const resolved = resolveSeam(plan, { ...planned, seam })
  const { procedure } = resolved

  const lengthMm = r3(seam.lengthMm)
  const params = procedure ? torchParamsFor(procedure, settings) : { ...DEFAULT_TORCH, approachMm: settings.approachMm }
  const poses = samplePoses(torchPoses(seam.points, seam.closed, params), seam.closed, lengthMm, settings.poseSpacingMm)

  const legMm = r2(resolved.leg.legMm)
  const position = seamPosition(seam.points, gravity)
  const mid = seam.points[seam.points.length >> 1]!
  const first = seam.points[0]!
  const last = seam.points[seam.points.length - 1]!

  const est = procedure
    ? seamEstimates({
        lengthMm,
        passes: 1,
        travelSpeedMmS: procedure.travelSpeedMmS,
        wireDiameterMm: procedure.wire.diameterMm,
        wireFeedMpm: procedure.electrical.wireFeedMpm,
        gasFlowLpm: procedure.gas?.flowLpm,
        preflowS: procedure.arcStart.preflowS,
        postflowS: procedure.arcEnd.postflowS,
      })
    : { arcTimeS: 0, wireKg: 0, gasL: 0 }

  const job: JobSeam = {
    id: seam.id,
    label: seam.label,
    source: seam.source,
    confidence: r3(seam.confidence),
    jointType: seam.jointType as JobSeam['jointType'],
    // An unassigned seam gets an empty id so the job still builds for its summary; pre-flight blocks the export.
    procedureId: planned.procedureId ?? '',
    overrides: planned.overrides,
    legMm,
    throatMm: r2(throatMm(legMm)),
    passes: [{ index: 1, lateralOffsetMm: 0, verticalOffsetMm: 0, workAngleOffsetDeg: 0 }],
    intermittent: null,
    boxing: { start: false, end: false, lengthMm: 0 },
    closed: seam.closed,
    lengthMm,
    direction: backwards ? 'reverse' : 'forward',
    geometry: {
      openingAngleDeg: r2(seam.openingAngleDeg),
      plateNormals: [vec(mid.n1, 6), vec(mid.n2, 6)],
      plateThicknessMm: [resolved.thickness[0] === null ? null : r2(resolved.thickness[0]), resolved.thickness[1] === null ? null : r2(resolved.thickness[1])],
      start: vec(first.p, 3),
      end: vec(seam.closed ? first.p : last.p, 3),
    },
    position: {
      aws: awsFor(position.code),
      iso6947: position.code.replace(/\+$/, ''),
      inclinationDeg: r2(position.inclinationDeg),
      rotationDeg: r2(position.rotationDeg),
    },
    poses: poses.map((pose) => ({ s: r3(pose.s), position: vec(pose.p, 3), quaternion: quaternionOut(pose.q) })),
    approach: { distanceMm: settings.approachMm },
    retract: { distanceMm: settings.approachMm },
    sensing: {
      touch: [scale(mid.n1, -1), scale(mid.n2, -1)].map((direction) => ({ direction: vec(direction, 6), searchMm: SENSING_SEARCH_MM })),
      seamTracking: procedure?.process === 'GTAW' ? 'none' : 'through-arc',
    },
    access: accessOut(planned.access, lengthMm, backwards),
    estimates: {
      arcTimeS: r1(est.arcTimeS),
      heatInputKJmm: r3(resolved.heatInputKJmm ?? 0),
      wireKg: r3(est.wireKg),
      gasL: r1(est.gasL),
    },
    warnings: issues.filter((issue) => issue.seamId === seam.id),
    points: stored.points.map((p) => ({ s: p.s, p: p.p, t: p.t, n1: p.n1, n2: p.n2 })),
  }

  return {
    seam: job,
    reversed: backwards,
    firstApproach: poses[0]!.approach,
    lastRetract: poses[poses.length - 1]!.retract,
    arcTimeS: est.arcTimeS,
    wireKg: est.wireKg,
    gasL: est.gasL,
    startS: procedure ? procedure.arcStart.preflowS + procedure.arcEnd.craterFillS + procedure.arcEnd.postflowS : 0,
  }
}

// Home is above the part centre, clear of the top by the approach distance, along the way up.
export function homePoint(plan: Plan): Vec3 {
  const { min, max } = plan.part.bbox
  const up = upFromGravity(plan.gravity)
  const centre: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  const halfAlongUp = (Math.abs(up[0]) * (max[0] - min[0]) + Math.abs(up[1]) * (max[1] - min[1]) + Math.abs(up[2]) * (max[2] - min[2])) / 2
  return add(centre, scale(up, halfAlongUp + plan.settings.approachMm))
}

interface Move {
  from: string
  to: string
  lengthMm: number
}

// Home to the first seam, between the seams, and the last seam back to home. The one air move measure, airMoveMm, is
// shared with the sequence optimiser, so the plan is costed the way it is exported.
function airMoves(plan: Plan, built: BuiltSeam[]): Move[] {
  if (built.length === 0) return []
  const home = homePoint(plan)
  const lead = plan.settings.approachMm
  const ids = ['home', ...built.map((b) => b.seam.id), 'home']
  const leaves = [null, ...built.map((b) => b.lastRetract)]
  const enters = [...built.map((b) => b.firstApproach), null]
  return enters.map((enter, i) => ({ from: ids[i]!, to: ids[i + 1]!, lengthMm: airMoveMm(leaves[i]!, enter, home, lead) }))
}

// How many times the torch is cleaned: once each time a full interval of arc time has passed with welding still to do,
// so never after the last weld. An interval of 0 means no cleaning. The stops are not part of the playback, which runs
// on arc and air time, as the strike and stop times of the seams are not.
export function cleaningsFor(arcTimeS: number, everyS: number): number {
  if (!(everyS > 0) || !(arcTimeS > 0)) return 0
  return Math.max(0, Math.ceil(arcTimeS / everyS) - 1)
}

// Cycle time is arc time, the strike and stop time of every seam, the air moves at air speed and the torch cleaning
// stops (the n_clean t_clean term of the spec). The summary of the exported job and the live figure of the status bar
// both come from this.
export function timingOf(plan: Plan, built: BuiltSeam[]): PlanTiming {
  const moves = airMoves(plan, built).map((m) => ({ ...m, timeS: m.lengthMm / plan.settings.airSpeedMmS }))
  const seams = built.map((b) => ({ seamId: b.seam.id, arcTimeS: b.arcTimeS, overheadS: b.startS }))
  const arcTimeS = seams.reduce((total, s) => total + s.arcTimeS, 0)
  const airTimeS = moves.reduce((total, m) => total + m.timeS, 0)
  const overheadS = seams.reduce((total, s) => total + s.overheadS, 0)
  const cleanings = cleaningsFor(arcTimeS, plan.settings.cleanEveryS)
  const cleaningS = cleanings * plan.settings.cleanTimeS
  return { seams, moves, arcTimeS, airTimeS, cleanings, cleaningS, cycleTimeS: arcTimeS + airTimeS + overheadS + cleaningS }
}

// Seams in table order, every one forward.
export function buildSeams(plan: Plan, issues: JobIssue[] = []): BuiltSeam[] {
  return plan.seams.map((planned) => buildSeam(plan, planned, issues))
}

// Seams in the order of the plan's sequence, each travelled in its chosen direction. Without a sequence this is table order.
export function buildOrdered(plan: Plan, issues: JobIssue[] = []): BuiltSeam[] {
  if (plan.sequence === null) return buildSeams(plan, issues)
  const byId = new Map(plan.seams.map((planned) => [planned.seam.id, planned]))
  return reconcileOrder(plan.sequence.order, plan.seams.map((p) => p.seam.id)).map((entry) => buildSeam(plan, byId.get(entry.seamId)!, issues, entry.reversed))
}

// The arm is written only when at least one port exists, so files for parts without ports stay as they were.
function accessSection(plan: Plan): WeldJob['access'] {
  const { ports, arm } = plan.access
  if (ports.length === 0) return { ports: [], arm: null }
  return {
    ports: ports.map((port) => ({ id: port.id, position: port.position, direction: port.direction, diameterMm: port.diameterMm })),
    arm: {
      links: arm.links,
      linkLengthMm: arm.linkLengthMm,
      diameterMm: arm.diameterMm,
      maxBendDeg: arm.maxBendDeg,
      torchLengthMm: arm.torchLengthMm,
      insertionMm: arm.insertionMm,
      clearanceMm: arm.clearanceMm,
    },
  }
}

export function buildJob(plan: Plan, options: { createdAt: string }, issues: JobIssue[] = []): WeldJob {
  const { part, settings, gravity } = plan
  const built = buildOrdered(plan, issues)
  const timing = timingOf(plan, built)

  const referenced = new Set(plan.seams.map((s) => s.procedureId))
  const sum = (pick: (b: BuiltSeam) => number) => built.reduce((total, b) => total + pick(b), 0)

  return {
    $schema: SCHEMA_URL,
    format: 'weld-job',
    version: '1.0.0',
    id: `wj-${options.createdAt.slice(0, 10).replaceAll('-', '')}-${part.sha256.slice(0, 4)}`,
    createdAt: options.createdAt,
    generator: { ...GENERATOR },
    units: { ...JOB_UNITS },
    frames: {
      convention: FRAME_CONVENTION,
      gravity: vec(gravity, 6),
      partToCell: { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
    },
    part: {
      name: part.name,
      sha256: part.sha256,
      // Pre-flight refuses an unknown unit before a file is exported; the schema check is the second guard.
      sourceUnits: part.sourceUnits as 'mm',
      scaleToMm: part.scaleToMm,
      triangles: part.triangles,
      bodies: part.bodies,
      boundingBox: { min: vec(part.bbox.min, 3), max: vec(part.bbox.max, 3) },
    },
    settings: {
      creaseAngleDeg: settings.creaseAngleDeg,
      poseSpacingMm: settings.poseSpacingMm,
      airSpeedMmS: settings.airSpeedMmS,
      approachMm: settings.approachMm,
      cleanEveryS: settings.cleanEveryS,
      cleanTimeS: settings.cleanTimeS,
    },
    procedures: plan.procedures.filter((p) => referenced.has(p.id)),
    seams: built.map((b) => b.seam),
    sequence: {
      strategy: plan.sequence?.strategy ?? 'table-order',
      order: built.map((b) => ({ seamId: b.seam.id, reversed: b.reversed })),
      airMoves: timing.moves.map((m) => ({ from: m.from, to: m.to, lengthMm: r3(m.lengthMm) })),
    },
    access: accessSection(plan),
    summary: {
      seamCount: built.length,
      weldLengthMm: r3(sum((b) => b.seam.lengthMm)),
      arcTimeS: r1(timing.arcTimeS),
      airTimeS: r1(timing.airTimeS),
      cycleTimeS: r1(r1(timing.arcTimeS) + r1(timing.airTimeS) + timing.seams.reduce((total, s) => total + s.overheadS, 0) + timing.cleaningS),
      torchCleanings: timing.cleanings,
      cleaningTimeS: r1(timing.cleaningS),
      wireKg: r3(sum((b) => b.wireKg)),
      gasL: r1(sum((b) => b.gasL)),
    },
    validation: { errors: [], warnings: issues },
  }
}

export type ExportResult =
  | { status: 'ok'; job: WeldJob; issues: Issue[] }
  | { status: 'blocked'; issues: Issue[]; summary: WeldJob['summary'] }
  | { status: 'error'; error: Explained }

// Builds the job, refuses it while pre-flight has errors, and checks the finished file against its own schema.
export function exportJob(plan: Plan, options: { createdAt: string }): ExportResult {
  try {
    const issues = preflight(plan)
    const blocked = issues.some((i) => i.severity === 'error')
    const job = buildJob(plan, options, blocked ? [] : issues.map(toJobIssue))
    if (blocked) return { status: 'blocked', issues, summary: job.summary }

    // Parsed from the text that would be written, so NaN and Infinity show up as the nulls they become in JSON.
    const parsed = jobSchema.safeParse(JSON.parse(JSON.stringify(job)))
    if (!parsed.success) {
      const first = parsed.error.issues[0]!
      return {
        status: 'error',
        error: {
          what: 'The plan could not be exported.',
          why: `The finished file failed its own schema check at ${first.path.join('.') || 'the top level'}: ${first.message}`,
          next: 'Correct that setting and export again, or report it with the plan if it looks right.',
        },
      }
    }
    return { status: 'ok', job, issues }
  } catch (error) {
    return {
      status: 'error',
      error: {
        what: 'The plan could not be exported.',
        why: `Building the file failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        next: 'Check the gravity direction and the seams, then export again.',
      },
    }
  }
}
