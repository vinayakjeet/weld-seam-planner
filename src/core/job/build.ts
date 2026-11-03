import { add, length, scale, sub, type Vec3 } from '../math/vec3'
import { seamEstimates } from '../process/estimates'
import { throatMm } from '../process/filletRules'
import { DEFAULT_TORCH, poseAt, torchPoses, type TorchPose } from '../torch/frames'
import { awsFor, seamPosition, upFromGravity } from '../torch/positions'
import { resolveSeam, torchParamsFor, type Explained, type Plan, type PlannedSeam } from './plan'
import { preflight, toJobIssue, type Issue } from './preflight'
import { FRAME_CONVENTION, JOB_UNITS, jobSchema, SCHEMA_URL, type JobIssue, type WeldJob } from './schema'

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
  firstApproach: Vec3
  lastRetract: Vec3
  arcTimeS: number
  wireKg: number
  gasL: number
  startS: number
}

function buildSeam(plan: Plan, planned: PlannedSeam, issues: JobIssue[]): BuiltSeam {
  const { seam } = planned
  const { settings, gravity } = plan
  const resolved = resolveSeam(plan, planned)
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
    direction: 'forward',
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
    access: planned.access ?? { clearanceDeg: null, nearClearanceDeg: null, class: null, portId: null, reachCoverage: null, unreachable: [] },
    estimates: {
      arcTimeS: r1(est.arcTimeS),
      heatInputKJmm: r3(resolved.heatInputKJmm ?? 0),
      wireKg: r3(est.wireKg),
      gasL: r1(est.gasL),
    },
    warnings: issues.filter((issue) => issue.seamId === seam.id),
    points: seam.points.map((p) => ({ s: p.s, p: p.p, t: p.t, n1: p.n1, n2: p.n2 })),
  }

  return {
    seam: job,
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

function airMoves(plan: Plan, built: BuiltSeam[]): JobSeamMove[] {
  if (built.length === 0) return []
  const home = homePoint(plan)
  const lead = plan.settings.approachMm
  const moves: JobSeamMove[] = [{ from: 'home', to: built[0]!.seam.id, lengthMm: length(sub(built[0]!.firstApproach, home)) + lead }]
  for (let i = 1; i < built.length; i++) {
    const a = built[i - 1]!
    const b = built[i]!
    moves.push({ from: a.seam.id, to: b.seam.id, lengthMm: lead + length(sub(b.firstApproach, a.lastRetract)) + lead })
  }
  const end = built[built.length - 1]!
  moves.push({ from: end.seam.id, to: 'home', lengthMm: lead + length(sub(home, end.lastRetract)) })
  return moves
}

interface JobSeamMove {
  from: string
  to: string
  lengthMm: number
}

export function buildSeams(plan: Plan, issues: JobIssue[] = []): BuiltSeam[] {
  return plan.seams.map((planned) => buildSeam(plan, planned, issues))
}

export function buildJob(plan: Plan, options: { createdAt: string }, issues: JobIssue[] = []): WeldJob {
  const { part, settings, gravity } = plan
  const built = buildSeams(plan, issues)
  const moves = airMoves(plan, built)

  const referenced = new Set(plan.seams.map((s) => s.procedureId))
  const sum = (pick: (b: BuiltSeam) => number) => built.reduce((total, b) => total + pick(b), 0)
  const airTimeS = moves.reduce((total, m) => total + m.lengthMm, 0) / settings.airSpeedMmS
  const arcTimeS = sum((b) => b.arcTimeS)

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
    },
    procedures: plan.procedures.filter((p) => referenced.has(p.id)),
    seams: built.map((b) => b.seam),
    sequence: {
      strategy: 'table-order',
      order: built.map((b) => ({ seamId: b.seam.id, reversed: false })),
      airMoves: moves.map((m) => ({ ...m, lengthMm: r3(m.lengthMm) })),
    },
    access: { ports: [], arm: null },
    summary: {
      seamCount: built.length,
      weldLengthMm: r3(sum((b) => b.seam.lengthMm)),
      arcTimeS: r1(arcTimeS),
      airTimeS: r1(airTimeS),
      cycleTimeS: r1(r1(arcTimeS) + r1(airTimeS) + sum((b) => b.startS)),
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
