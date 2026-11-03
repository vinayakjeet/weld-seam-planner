import { dot, length, sub, type Vec3 } from '../math/vec3'
import { MULTI_PASS_LEG_MM } from '../process/filletRules'
import type { SeamCandidate } from '../seams/detect'
import { seamPosition } from '../torch/positions'
import { resolveSeam, type Explained, type Plan } from './plan'
import type { JobIssue } from './schema'

export type IssueCode =
  | 'NO_SEAMS'
  | 'DUPLICATE_ID'
  | 'UNITS_UNKNOWN'
  | 'NO_PROCEDURE'
  | 'UNKNOWN_PROCEDURE'
  | 'OVERLAP'
  | 'LEG_UNDER_MIN'
  | 'LEG_OVER_EDGE'
  | 'ACCESS_BLOCKED'
  | 'TRAVEL_SPEED_RANGE'
  | 'HEAT_INPUT_RANGE'
  | 'SHORT_SEAM'
  | 'MULTI_PASS'
  | 'POSITION_NOT_COVERED'
  | 'THICKNESS_UNKNOWN'
  | 'THICKNESS_OUTSIDE_WPS'
  | 'SNAKE_UNREACHABLE'
  | 'SNAKE_NOT_RUN'

export interface Issue extends Explained {
  code: IssueCode
  // Info never blocks an export and is not counted as a warning.
  severity: 'error' | 'warning' | 'info'
  seamId: string | null
}

export function toJobIssue(issue: Issue): JobIssue {
  return { code: issue.code, seamId: issue.seamId, message: `${issue.what} ${issue.why} ${issue.next}` }
}

const SHORT_SEAM_MM = 10
const TOLERANCE = 1e-9
const OVERLAP_NEAR_MM = 1
const OVERLAP_MIN_MM = 5
const OVERLAP_STEP_MM = 0.5
const OVERLAP_COS = Math.cos((20 * Math.PI) / 180)

const n = (value: number) => String(Math.round(value * 100) / 100)

// The same text the Access panel shows for the unreachable stretches of a seam.
const intervalsText = (intervals: ReadonlyArray<readonly [number, number]>): string =>
  intervals.map(([from, to]) => `${Math.round(from)} to ${Math.round(to)} mm`).join(', ')

interface Segment {
  a: Vec3
  b: Vec3
  dir: Vec3
  len: number
}

interface Outline {
  segments: Segment[]
  min: Vec3
  max: Vec3
}

function outlineOf(seam: SeamCandidate): Outline {
  const pts = seam.points.map((p) => p.p)
  const segments: Segment[] = []
  const count = seam.closed ? pts.length : pts.length - 1
  for (let k = 0; k < count; k++) {
    const a = pts[k]!
    const b = pts[(k + 1) % pts.length]!
    const len = length(sub(b, a))
    if (len > TOLERANCE) segments.push({ a, b, dir: [(b[0] - a[0]) / len, (b[1] - a[1]) / len, (b[2] - a[2]) / len], len })
  }
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const p of pts) for (let c = 0; c < 3; c++) {
    min[c] = Math.min(min[c]!, p[c]!)
    max[c] = Math.max(max[c]!, p[c]!)
  }
  return { segments, min, max }
}

function distanceToSegment(p: Vec3, { a, len, dir }: Segment): number {
  const along = Math.min(len, Math.max(0, dot(sub(p, a), dir)))
  return length(sub(p, [a[0] + dir[0] * along, a[1] + dir[1] * along, a[2] + dir[2] * along]))
}

// Length of `mine` that lies within 1 mm of `other` and runs the same way, in either direction.
function overlapMm(mine: Outline, other: Outline): number {
  for (let c = 0; c < 3; c++) {
    if (mine.min[c]! > other.max[c]! + OVERLAP_NEAR_MM || other.min[c]! > mine.max[c]! + OVERLAP_NEAR_MM) return 0
  }
  let total = 0
  for (const seg of mine.segments) {
    const steps = Math.max(1, Math.ceil(seg.len / OVERLAP_STEP_MM))
    const step = seg.len / steps
    for (let m = 0; m < steps; m++) {
      const t = (m + 0.5) * step
      const p: Vec3 = [seg.a[0] + seg.dir[0] * t, seg.a[1] + seg.dir[1] * t, seg.a[2] + seg.dir[2] * t]
      const near = other.segments.some((o) => Math.abs(dot(seg.dir, o.dir)) >= OVERLAP_COS && distanceToSegment(p, o) <= OVERLAP_NEAR_MM + TOLERANCE)
      if (near) total += step
    }
  }
  return total
}

export function preflight(plan: Plan): Issue[] {
  const planLevel: Issue[] = []
  const seamLevel: Issue[] = []
  const add = (list: Issue[], code: IssueCode, severity: Issue['severity'], seamId: string | null, text: Explained) =>
    list.push({ code, severity, seamId, ...text })

  if (plan.seams.length === 0) {
    add(planLevel, 'NO_SEAMS', 'error', null, {
      what: 'There are no accepted seams to export.',
      why: 'A weld job needs at least one seam, and none has been accepted.',
      next: 'Accept the seams you want welded, then export again.',
    })
  }

  const countOf = (ids: string[]) => ids.reduce((m, id) => m.set(id, (m.get(id) ?? 0) + 1), new Map<string, number>())
  for (const [id, count] of countOf(plan.seams.map((s) => s.seam.id))) {
    if (count > 1) {
      add(planLevel, 'DUPLICATE_ID', 'error', id, {
        what: `${count} seams share the id ${id}.`,
        why: 'Seams are found by id in the file, so a shared id would point to the wrong seam.',
        next: 'Delete the extra seams or detect them again, so that each one has its own id.',
      })
    }
  }
  for (const [id, count] of countOf(plan.procedures.map((p) => p.id))) {
    if (count > 1) {
      add(planLevel, 'DUPLICATE_ID', 'error', null, {
        what: `${count} procedures share the id ${id}.`,
        why: 'Seams refer to a procedure by id, so a shared id would give them the wrong settings.',
        next: 'Change the id of one of them in the procedure library.',
      })
    }
  }

  const { sourceUnits, scaleToMm } = plan.part
  if (sourceUnits === 'unknown' || !(Number.isFinite(scaleToMm) && scaleToMm > 0)) {
    add(planLevel, 'UNITS_UNKNOWN', 'error', null, {
      what: 'The units of the part are not known.',
      why:
        sourceUnits === 'unknown'
          ? 'The STL file does not say whether it is in millimetres, inches or metres, and every length in the plan depends on it.'
          : `The scale to millimetres is ${scaleToMm}, which is not a positive number.`,
      next: 'Load the STL again and choose its units when asked.',
    })
  }

  const outlines = plan.seams.map((s) => outlineOf(s.seam))
  plan.seams.forEach((planned, index) => {
    const { seam } = planned
    const id = seam.id
    const label = seam.label
    const resolved = resolveSeam(plan, planned)
    const { procedure, leg, limits, thickness } = resolved
    const out = (code: IssueCode, severity: Issue['severity'], text: Explained) => add(seamLevel, code, severity, id, text)

    if (planned.procedureId === null) {
      out('NO_PROCEDURE', 'error', {
        what: `Seam ${label} has no procedure.`,
        why: 'A seam needs a procedure for its settings, heat input and times.',
        next: 'Select the seam and choose a procedure in the Procedure section.',
      })
    } else if (!procedure) {
      out('UNKNOWN_PROCEDURE', 'error', {
        what: `Seam ${label} uses procedure ${planned.procedureId}, which is not in the library.`,
        why: 'The procedure was deleted or renamed after it was assigned.',
        next: 'Choose another procedure for the seam, or add one with that id to the library.',
      })
    }

    for (let other = 0; other < index; other++) {
      const mm = overlapMm(outlines[index]!, outlines[other]!)
      if (mm >= OVERLAP_MIN_MM) {
        out('OVERLAP', 'error', {
          what: `Seam ${label} overlaps seam ${plan.seams[other]!.seam.label}.`,
          why: `${n(mm)} mm of it runs within 1 mm of the other seam in the same direction, so that stretch would be welded twice.`,
          next: 'Delete or trim one of the two seams, or merge them into one.',
        })
      }
    }

    const known = thickness.filter((t): t is number => t !== null)
    const thin = known.length > 0 ? Math.min(...known) : null
    const thick = known.length > 0 ? Math.max(...known) : null
    if (limits.minMm !== null && leg.legMm < limits.minMm - TOLERANCE) {
      out('LEG_UNDER_MIN', 'error', {
        what: `Seam ${label} has a ${n(leg.legMm)} mm leg, below the ${n(limits.minMm)} mm minimum.`,
        why: `AWS D1.1 sets ${n(limits.minMm)} mm as the smallest fillet for a ${n(thick!)} mm part, because a smaller weld cools too fast and can crack.`,
        next: `Raise the leg to ${n(limits.minMm)} mm or more in the Procedure section, or correct the plate thickness.`,
      })
    }
    if (limits.maxMm !== null && leg.legMm > limits.maxMm + TOLERANCE) {
      out('LEG_OVER_EDGE', 'error', {
        what: `Seam ${label} has a ${n(leg.legMm)} mm leg, above the ${n(limits.maxMm)} mm limit along a plate edge.`,
        why: `AWS D1.1 keeps the leg ${thin! < 6 ? 'no larger than' : '1.6 mm below'} the thickness of a ${n(thin!)} mm plate, because a larger weld melts the plate edge away.`,
        next: `Lower the leg to ${n(limits.maxMm)} mm or less in the Procedure section, or correct the plate thickness.`,
      })
    }

    const access = planned.access
    // A snake seam with a reach result is described by SNAKE_UNREACHABLE instead, so it is never warned twice.
    if (access && (access.class === 'blocked' || (access.class !== 'snake' && access.unreachable.length > 0))) {
      out('ACCESS_BLOCKED', 'warning', {
        what: `No torch can reach all of seam ${label}.`,
        why:
          access.class === 'blocked'
            ? 'The access check found the cone in front of the torch blocked by the part, so neither a standard, a slim nor a snake arm fits.'
            : `${access.unreachable.length} stretch${access.unreachable.length === 1 ? '' : 'es'} of it lie outside the reach of the arm.`,
        next: 'The seam can still be welded by hand. To weld it with a robot, turn the part, add or widen an access port, or leave the seam out.',
      })
    }

    if (access?.class === 'snake' && access.reachCoverage !== null && access.reachCoverage < 1) {
      const stretches = access.unreachable.length
      out('SNAKE_UNREACHABLE', 'warning', {
        what: `The snake arm reaches ${Math.round(access.reachCoverage * 100)} % of seam ${label}.`,
        why: `${stretches} stretch${stretches === 1 ? '' : 'es'} of it (${intervalsText(access.unreachable)}) ${stretches === 1 ? 'is' : 'are'} out of reach from ${access.portId === null ? 'every port' : `port ${access.portId}`} with the current arm.`,
        next: 'Move or add a port, lengthen the arm or raise its bend limit in Access, then run reach again. The rest can be welded by hand.',
      })
    }

    if (procedure) {
      if (resolved.travelCheck.level !== 'ok') {
        out('TRAVEL_SPEED_RANGE', resolved.travelCheck.level === 'red' ? 'error' : 'warning', {
          what: `Seam ${label} has a travel speed that does not fit its wire feed.`,
          why: resolved.travelCheck.reason,
          next: `Set a travel speed near ${n(resolved.suggestedTravelMmS!)} mm/s in the Procedure section, or change the leg or the wire feed.`,
        })
      }
      if (resolved.heatCheck.level !== 'ok') {
        out('HEAT_INPUT_RANGE', resolved.heatCheck.level === 'red' ? 'error' : 'warning', {
          what: `Seam ${label} has a heat input of ${resolved.heatInputKJmm === null ? 'an unknown value' : `${n(resolved.heatInputKJmm)} kJ/mm`}.`,
          why: resolved.heatCheck.reason,
          next: 'Change the current, voltage or travel speed in the Procedure section.',
        })
      }
    }

    if (seam.lengthMm < SHORT_SEAM_MM) {
      out('SHORT_SEAM', 'warning', {
        what: `Seam ${label} is only ${n(seam.lengthMm)} mm long.`,
        why: 'A seam under 10 mm is shorter than an arc start and crater fill need, and is often a leftover of detection.',
        next: 'Delete the seam, or merge it with the seam next to it.',
      })
    }
    if (leg.legMm > MULTI_PASS_LEG_MM) {
      out('MULTI_PASS', 'warning', {
        what: `Seam ${label} has a ${n(leg.legMm)} mm leg with one pass.`,
        why: 'Legs above 8 mm usually need more than one pass, and one pass this large can sag or lack fusion.',
        next: 'Plan a second pass for it in the robot program, or lower the leg to 8 mm or less.',
      })
    }

    if (procedure && seam.points.length > 0) {
      const iso = seamPosition(seam.points, plan.gravity).code.replace(/\+$/, '')
      if (!(procedure.positions as string[]).includes(iso)) {
        out('POSITION_NOT_COVERED', 'warning', {
          what: `Seam ${label} is welded in position ${iso}, which ${procedure.id} does not cover.`,
          why: `The procedure is only valid for ${procedure.positions.join(', ')}.`,
          next: `Choose a procedure that covers ${iso}, or turn the part so that the seam is welded in one of those positions.`,
        })
      }
    }

    if (thickness.some((t) => t === null)) {
      out('THICKNESS_UNKNOWN', 'warning', {
        what: `The plate thickness of seam ${label} is not fully known.`,
        why: `No thickness was measured behind ${known.length === 0 ? 'either plate' : 'one plate'}, so a fillet size rule was skipped${known.length === 0 ? ' and the 6 mm fallback leg may be used' : ''}.`,
        next: 'Enter the plate thickness in the Geometry section.',
      })
    }
    if (procedure) {
      const [lo, hi] = procedure.baseMaterial.thicknessMm
      const outside = known.find((t) => t < lo - TOLERANCE || t > hi + TOLERANCE)
      if (outside !== undefined) {
        out('THICKNESS_OUTSIDE_WPS', 'warning', {
          what: `Seam ${label} has a ${n(outside)} mm plate, outside the ${n(lo)} to ${n(hi)} mm range of ${procedure.id}.`,
          why: 'The procedure covers only that thickness range.',
          next: 'Choose a procedure for this thickness, or correct the plate thickness.',
        })
      }
    }
  })

  const notRun = plan.seams.filter((p) => p.access?.class === 'snake' && p.access.reachCoverage === null).length
  if (notRun > 0) {
    add(planLevel, 'SNAKE_NOT_RUN', 'info', null, {
      what: `${notRun} snake seam${notRun === 1 ? ' has' : 's have'} no reach result.`,
      why: 'Their torch cone is too narrow for a standard or slim torch, and the snake arm reach has not been run for them since they last changed.',
      next: 'Open Access, place a port over an opening and run reach. The file can be exported without it.',
    })
  }

  const all = [...planLevel, ...seamLevel]
  return (['error', 'warning', 'info'] as const).flatMap((severity) => all.filter((i) => i.severity === severity))
}
