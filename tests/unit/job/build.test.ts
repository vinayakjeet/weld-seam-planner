import { describe, expect, it } from 'vitest'
import { buildJob, exportJob } from '../../../src/core/job/build'
import { toJobIssue } from '../../../src/core/job/preflight'
import { jobSchema, type WeldJob } from '../../../src/core/job/schema'
import { DEFAULT_JOB_SETTINGS, torchParamsFor, type Plan } from '../../../src/core/job/plan'
import { rotate } from '../../../src/core/math/quat'
import { length, sub, type Vec3 } from '../../../src/core/math/vec3'
import { torchPoses } from '../../../src/core/torch/frames'
import { WPS_PRESETS } from '../../../src/core/process/wps'
import { CREATED_AT, samplePlan, specExamplePlan } from '../helpers/jobs'

const opts = { createdAt: CREATED_AT }

function numbersIn(value: unknown, found: number[] = []): number[] {
  if (typeof value === 'number') found.push(value)
  else if (Array.isArray(value)) value.forEach((v) => numbersIn(v, found))
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => numbersIn(v, found))
  return found
}

describe('buildJob on the spec example', () => {
  const job = buildJob(specExamplePlan(), opts)
  const seam = job.seams[0]!

  it('passes the job schema', () => {
    const r = jobSchema.safeParse(JSON.parse(JSON.stringify(job)))
    expect(r.success, r.success ? '' : JSON.stringify(r.error.issues.slice(0, 3))).toBe(true)
  })

  it('has the id, units, frames and the part of the spec', () => {
    expect(job.id).toBe('wj-20261104-aaaa')
    expect(job.format).toBe('weld-job')
    expect(job.version).toBe('1.0.0')
    expect(job.generator).toEqual({ name: 'Weld Seam Planner', version: '1.0.0' })
    expect(job.frames.partToCell).toEqual({ position: [0, 0, 0], quaternion: [0, 0, 0, 1] })
    expect(job.frames.gravity).toEqual([0, 0, -1])
    expect(job.part.boundingBox.max).toEqual([2400, 1600, 900])
    expect(job.settings).toEqual({ creaseAngleDeg: 30, poseSpacingMm: 5, airSpeedMmS: 250, approachMm: 50 })
  })

  it('samples a pose every 5 mm: 161 poses from s 0 to 800', () => {
    expect(seam.poses).toHaveLength(161)
    expect(seam.poses[0]!.s).toBe(0)
    expect(seam.poses[1]!.s).toBe(5)
    expect(seam.poses[160]!.s).toBe(800)
    expect(seam.poses[160]!.position).toEqual([2000, 300, 12])
  })

  it('has the first quaternion of the spec example', () => {
    const q = seam.poses[0]!.quaternion
    const want = [-0.9204, 0.0334, -0.0805, 0.3812]
    q.forEach((v, i) => expect(Math.abs(v - want[i]!)).toBeLessThan(1e-3))
  })

  it('is a PB seam with inclination 0 and 2F', () => {
    expect(seam.position.iso6947).toBe('PB')
    expect(seam.position.aws).toBe('2F')
    expect(seam.position.inclinationDeg).toBe(0)
  })

  it('has leg 6 and throat 4.24', () => {
    expect(seam.legMm).toBe(6)
    expect(seam.throatMm).toBe(4.24)
    expect(seam.geometry.plateThicknessMm).toEqual([12, 12])
  })

  it('has the estimates of the spec', () => {
    expect(seam.estimates.arcTimeS).toBe(88.9)
    expect(seam.estimates.heatInputKJmm).toBeCloseTo(0.672, 3)
    expect(Math.abs(seam.estimates.wireKg - 0.131)).toBeLessThan(0.002)
    expect(seam.estimates.gasL).toBe(22.5)
  })

  it('has cycle time equal to arc plus air plus 1.8 s of arc start and end', () => {
    const { arcTimeS, airTimeS, cycleTimeS } = job.summary
    expect(Math.abs(cycleTimeS - (arcTimeS + airTimeS + 1.8))).toBeLessThan(0.1)
    expect(job.summary.seamCount).toBe(1)
    expect(job.summary.weldLengthMm).toBe(800)
  })

  it('writes defaults for the fields the app does not plan yet', () => {
    expect(seam.passes).toEqual([{ index: 1, lateralOffsetMm: 0, verticalOffsetMm: 0, workAngleOffsetDeg: 0 }])
    expect(seam.boxing).toEqual({ start: false, end: false, lengthMm: 0 })
    expect(seam.intermittent).toBeNull()
    expect(seam.direction).toBe('forward')
    expect(seam.access).toEqual({ clearanceDeg: null, nearClearanceDeg: null, class: null, portId: null, reachCoverage: null, unreachable: [] })
    expect(job.access).toEqual({ ports: [], arm: null })
    expect(seam.approach).toEqual({ distanceMm: 50 })
    expect(seam.retract).toEqual({ distanceMm: 50 })
    expect(seam.sensing.seamTracking).toBe('through-arc')
    expect(seam.sensing.touch).toHaveLength(2)
    expect(seam.sensing.touch.every((t) => t.searchMm === 20)).toBe(true)
    expect(job.sequence.strategy).toBe('table-order')
    expect(job.sequence.order).toEqual([{ seamId: 's07', reversed: false }])
    expect(job.validation).toEqual({ errors: [], warnings: [] })
  })

  it('touch directions point into the plates, minus each normal', () => {
    expect(seam.sensing.touch.map((t) => t.direction)).toEqual([[0, 0, -1], [0, 1, 0]])
  })

  it('writes only the referenced procedures', () => {
    expect(job.procedures.map((p) => p.id)).toEqual(['WPS-GMAW-SPRAY-FW6'])
  })

  it('sets seam tracking to none for GTAW', () => {
    const plan = specExamplePlan()
    plan.seams[0]!.procedureId = 'WPS-GTAW'
    expect(buildJob(plan, opts).seams[0]!.sensing.seamTracking).toBe('none')
  })
})

describe('poses', () => {
  it('gives the 157 mm pipe loop 33 poses, the last on the first', () => {
    const plan = samplePlan('pipe-on-plate')
    const outer = plan.seams.find((s) => s.seam.closed && Math.abs(s.seam.lengthMm - 157.05) < 0.05)!
    plan.seams = [outer]
    const seam = buildJob(plan, opts).seams[0]!
    expect(seam.closed).toBe(true)
    expect(seam.poses).toHaveLength(33)
    const last = seam.poses[32]!
    expect(last.s).toBe(seam.lengthMm)
    expect(last.s).toBeCloseTo(outer.seam.lengthMm, 3)
    seam.poses[0]!.position.forEach((v, i) => expect(Math.abs(last.position[i]! - v)).toBeLessThan(1e-6))
  })

  it('gives a 3 mm seam poses at 0 and 3', () => {
    const plan = specExamplePlan([{ id: 'tiny', from: [0, 0, 0], to: [3, 0, 0] }])
    const seam = buildJob(plan, opts).seams[0]!
    expect(seam.poses.map((p) => p.s)).toEqual([0, 3])
  })

  it('does not repeat the end when the length is a multiple of the spacing', () => {
    const plan = specExamplePlan([{ id: 'ten', from: [0, 0, 0], to: [10, 0, 0] }])
    expect(buildJob(plan, opts).seams[0]!.poses.map((p) => p.s)).toEqual([0, 5, 10])
  })

  it('follows the job spacing', () => {
    const plan = specExamplePlan([{ id: 'ten', from: [0, 0, 0], to: [10, 0, 0] }])
    plan.settings.poseSpacingMm = 2.5
    expect(buildJob(plan, opts).seams[0]!.poses.map((p) => p.s)).toEqual([0, 2.5, 5, 7.5, 10])
  })
})

describe('numbers in any built job', () => {
  it.each(['t-joint-merged', 'pipe-on-plate', 'double-bottom-cell'])('%s: unit quaternions with w >= 0 and nothing NaN or infinite', (id) => {
    const job = buildJob(samplePlan(id), opts)
    for (const seam of job.seams) {
      for (const pose of seam.poses) {
        expect(Math.abs(Math.hypot(...pose.quaternion) - 1)).toBeLessThan(1e-5)
        expect(pose.quaternion[3]).toBeGreaterThanOrEqual(0)
      }
    }
    for (const n of numbersIn(job)) expect(Number.isFinite(n)).toBe(true)
  })

  it('has no NaN with an unassigned seam and unknown thickness', () => {
    const plan = samplePlan('t-joint-merged', (p) => ({
      ...p,
      seams: p.seams.map((s, i) => ({ ...s, procedureId: i === 0 ? null : s.procedureId, seam: { ...s.seam, thicknessMm: [null, null] as [null, null] } })),
    }))
    const job = buildJob(plan, opts)
    for (const n of numbersIn(job)) expect(Number.isFinite(n)).toBe(true)
    expect(job.seams[0]!.estimates).toEqual({ arcTimeS: 0, heatInputKJmm: 0, wireKg: 0, gasL: 0 })
  })
})

describe('rounding in the file', () => {
  it('writes positions and lengths with 3 decimals, angles with 2, quaternions with 6', () => {
    const job = buildJob(samplePlan('pipe-on-plate'), opts)
    const decimals = (n: number) => (String(n).split('.')[1] ?? '').length
    for (const seam of job.seams) {
      expect(decimals(seam.lengthMm)).toBeLessThanOrEqual(3)
      expect(decimals(seam.geometry.openingAngleDeg)).toBeLessThanOrEqual(2)
      expect(decimals(seam.position.inclinationDeg)).toBeLessThanOrEqual(2)
      for (const pose of seam.poses) {
        expect(decimals(pose.s)).toBeLessThanOrEqual(3)
        pose.position.forEach((v) => expect(decimals(v)).toBeLessThanOrEqual(3))
        pose.quaternion.forEach((v) => expect(decimals(v)).toBeLessThanOrEqual(6))
      }
    }
  })
})

describe('air moves', () => {
  const plan = specExamplePlan([
    { id: 'a', from: [0, 0, 0], to: [100, 0, 0] },
    { id: 'b', from: [0, 200, 0], to: [100, 200, 0] },
  ])
  const job = buildJob(plan, opts)

  it('has seams + 1 moves, the first from home and the last to home', () => {
    const moves = job.sequence.airMoves
    expect(moves).toHaveLength(3)
    expect(moves.map((m) => [m.from, m.to])).toEqual([['home', 'a'], ['a', 'b'], ['b', 'home']])
  })

  it('measures them per decision 9', () => {
    const spray = WPS_PRESETS.find((p) => p.id === 'WPS-GMAW-SPRAY-FW6')!
    const poseSets = plan.seams.map((s) => torchPoses(s.seam.points, false, torchParamsFor(spray, plan.settings)))
    const approachOf = (k: number) => poseSets[k]![0]!.approach
    const retractOf = (k: number) => poseSets[k]![poseSets[k]!.length - 1]!.retract
    // Z up, bbox 2400 x 1600 x 900: home is above the centre by half the height plus the approach distance
    const home: Vec3 = [1200, 800, 450 + 450 + 50]
    const len = (a: Vec3, b: Vec3) => length(sub(a, b))
    const want = [
      len(approachOf(0), home) + 50,
      50 + len(approachOf(1), retractOf(0)) + 50,
      50 + len(home, retractOf(1)),
    ]
    job.sequence.airMoves.forEach((m, i) => expect(m.lengthMm).toBeCloseTo(want[i]!, 2))
    const air = want.reduce((a, b) => a + b, 0) / 250
    expect(job.summary.airTimeS).toBeCloseTo(air, 1)
  })

  it('counts the approach and retract distance once: a to b by hand is 50 + sqrt(100^2 + 200^2) + 50', () => {
    // Both seams run along +x with the same torch, so the torch points differ by exactly the seams' end to start gap.
    const gap = Math.hypot(100, 200)
    expect(job.sequence.airMoves[1]!.lengthMm).toBeCloseTo(50 + gap + 50, 2)
  })

  it('sums to the hand-computed tour length, with the home legs taken from the exported poses', () => {
    const [a, b] = job.seams
    const axis = (pose: { quaternion: [number, number, number, number] }): Vec3 => rotate(pose.quaternion, [0, 0, 1])
    const back = (p: Vec3, z: Vec3): Vec3 => [p[0] - 50 * z[0], p[1] - 50 * z[1], p[2] - 50 * z[2]]
    const home: Vec3 = [1200, 800, 950]
    const toHome = length(sub(back(a!.poses[0]!.position, axis(a!.poses[0]!)), home)) + 50
    const fromHome = 50 + length(sub(home, back(b!.poses[b!.poses.length - 1]!.position, axis(b!.poses[b!.poses.length - 1]!))))
    const total = toHome + (50 + Math.hypot(100, 200) + 50) + fromHome
    expect(job.sequence.airMoves.reduce((sum, m) => sum + m.lengthMm, 0)).toBeCloseTo(total, 2)
    expect(job.summary.airTimeS).toBeCloseTo(total / 250, 1)
  })

  it('has no air moves without seams', () => {
    expect(buildJob({ ...plan, seams: [] }, opts).sequence.airMoves).toEqual([])
  })
})

describe('issues', () => {
  it('fills validation.warnings and the warnings of the seam they name', () => {
    const issues = [
      { code: 'SHORT_SEAM', seamId: 's07', message: 'a' },
      { code: 'NO_SEAMS', seamId: null, message: 'b' },
    ]
    const job: WeldJob = buildJob(specExamplePlan(), opts, issues)
    expect(job.validation.warnings).toEqual(issues)
    expect(job.seams[0]!.warnings).toEqual([issues[0]])
    expect(job.validation.errors).toEqual([])
  })
})

describe('determinism', () => {
  it('builds the same text twice', () => {
    const plan = samplePlan('t-joint-merged')
    expect(JSON.stringify(buildJob(plan, opts))).toBe(JSON.stringify(buildJob(plan, opts)))
    expect(DEFAULT_JOB_SETTINGS.poseSpacingMm).toBe(5)
  })
})

describe('exportJob', () => {
  it('blocks on any error, with the summary and no job', () => {
    const plan = specExamplePlan()
    plan.seams[0]!.procedureId = null
    const r = exportJob(plan, opts)
    expect(r.status).toBe('blocked')
    if (r.status !== 'blocked') return
    expect(r.issues.map((i) => i.code)).toEqual(['NO_PROCEDURE'])
    expect(r.summary.seamCount).toBe(1)
    expect(r.summary.weldLengthMm).toBe(800)
    expect('job' in r).toBe(false)
  })

  it('blocks a plan with no seams without throwing', () => {
    const r = exportJob({ ...specExamplePlan(), seams: [] }, opts)
    expect(r.status).toBe('blocked')
    if (r.status === 'blocked') expect(r.summary.seamCount).toBe(0)
  })

  it('exports with warnings only, carrying them into the job', () => {
    const plan = specExamplePlan([{ id: 's07', from: [0, 0, 0], to: [8, 0, 0] }])
    const r = exportJob(plan, opts)
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.issues.map((i) => i.code)).toEqual(['SHORT_SEAM'])
    const want = r.issues.map(toJobIssue)
    expect(r.job.validation.warnings).toEqual(want)
    expect(r.job.seams[0]!.warnings).toEqual(want)
    expect(r.job.validation.errors).toEqual([])
    expect(jobSchema.safeParse(JSON.parse(JSON.stringify(r.job))).success).toBe(true)
  })

  it('exports a clean plan', () => {
    const r = exportJob(specExamplePlan(), opts)
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.issues).toEqual([])
  })

  it('reports a file that fails its own schema as an error naming the first path', () => {
    const plan = specExamplePlan()
    plan.settings = { ...plan.settings, poseSpacingMm: -5 }
    const r = exportJob(plan, opts)
    expect(r.status).toBe('error')
    if (r.status !== 'error') return
    expect(r.error.why).toContain('settings.poseSpacingMm')
    for (const part of [r.error.what, r.error.why, r.error.next]) expect(part.trim().length).toBeGreaterThan(0)
  })
})

describe('a plan with a sequence', () => {
  const base = specExamplePlan([
    { id: 's1', from: [0, 0, 0], to: [100, 0, 0] },
    { id: 's2', from: [0, 200, 0], to: [100, 200, 0] },
  ])
  const withSequence = (strategy: NonNullable<Plan['sequence']>['strategy'], order: NonNullable<Plan['sequence']>['order']): Plan => ({
    ...base,
    sequence: { strategy, order },
  })
  const plan = withSequence('min-air-move', [{ seamId: 's2', reversed: true }, { seamId: 's1', reversed: false }])
  const job = buildJob(plan, opts)

  it('exports the order and the strategy of the plan', () => {
    expect(job.sequence.order).toEqual([{ seamId: 's2', reversed: true }, { seamId: 's1', reversed: false }])
    expect(job.sequence.strategy).toBe('min-air-move')
    expect(job.seams.map((s) => s.id)).toEqual(['s2', 's1'])
  })

  it('starts and ends the air moves at home and follows the order', () => {
    expect(job.sequence.airMoves.map((m) => [m.from, m.to])).toEqual([['home', 's2'], ['s2', 's1'], ['s1', 'home']])
  })

  it('puts the first pose of a reversed seam where its stored last point was, and keeps the stored points', () => {
    const s2 = job.seams[0]!
    expect(s2.direction).toBe('reverse')
    expect(s2.poses[0]!.position).toEqual([100, 200, 0])
    expect(s2.poses[s2.poses.length - 1]!.position).toEqual([0, 200, 0])
    expect(s2.geometry.start).toEqual([100, 200, 0])
    expect(s2.points![0]!.p).toEqual([0, 200, 0])
    expect(job.seams[1]!.direction).toBe('forward')
  })

  it('lists every seam once', () => {
    expect([...job.seams.map((s) => s.id)].sort()).toEqual(['s1', 's2'])
    expect(job.summary.seamCount).toBe(2)
  })

  it('measures the reversed order, not the table order', () => {
    const table = buildJob(base, opts)
    expect(job.sequence.airMoves.reduce((sum, m) => sum + m.lengthMm, 0)).not.toBeCloseTo(table.sequence.airMoves.reduce((sum, m) => sum + m.lengthMm, 0), 1)
  })

  it('validates for balanced-heat', () => {
    const balanced = JSON.parse(JSON.stringify(buildJob(withSequence('balanced-heat', plan.sequence!.order), opts)))
    const r = jobSchema.safeParse(balanced)
    expect(r.success, r.success ? '' : JSON.stringify(r.error.issues.slice(0, 3))).toBe(true)
    expect(balanced.sequence.strategy).toBe('balanced-heat')
  })

  it('falls back to table order for an order that names no accepted seam, and appends seams it misses', () => {
    const partial = buildJob(withSequence('manual', [{ seamId: 's2', reversed: false }]), opts)
    expect(partial.sequence.order.map((o) => o.seamId)).toEqual(['s2', 's1'])
    const stale = buildJob(withSequence('manual', [{ seamId: 'gone', reversed: true }]), opts)
    expect(stale.sequence.order).toEqual([{ seamId: 's1', reversed: false }, { seamId: 's2', reversed: false }])
  })

  it('never reverses a closed loop', () => {
    const loop = samplePlan('pipe-on-plate')
    const closed = loop.seams.find((p) => p.seam.closed)!
    const reversed = buildJob({ ...loop, sequence: { strategy: 'manual', order: loop.seams.map((p) => ({ seamId: p.seam.id, reversed: p.seam.id === closed.seam.id })) } }, opts)
    const entry = reversed.sequence.order.find((o) => o.seamId === closed.seam.id)!
    expect(entry.reversed).toBe(false)
    expect(reversed.seams.find((s) => s.id === closed.seam.id)!.direction).toBe('forward')
  })
})

describe('access in the job', () => {
  const found = { clearanceDeg: 22, nearClearanceDeg: 31, class: 'slim' as const, portId: null, reachCoverage: null, unreachable: [] as Array<[number, number]> }

  it('writes the access of the plan into seam.access', () => {
    const plan = specExamplePlan()
    plan.seams[0]!.access = found
    const seam = buildJob(plan, opts).seams[0]!
    expect(seam.access).toEqual(found)
  })

  it('writes null fields for a seam without access', () => {
    const seam = buildJob(specExamplePlan(), opts).seams[0]!
    expect(seam.access).toEqual({ clearanceDeg: null, nearClearanceDeg: null, class: null, portId: null, reachCoverage: null, unreachable: [] })
  })

  it('passes the schema with a class and a near clearance', () => {
    const plan = specExamplePlan()
    plan.seams[0]!.access = found
    const r = jobSchema.safeParse(JSON.parse(JSON.stringify(buildJob(plan, opts))))
    expect(r.success).toBe(true)
  })
})
