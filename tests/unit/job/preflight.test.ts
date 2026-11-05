import { describe, expect, it } from 'vitest'
import { buildJob, exportJob } from '../../../src/core/job/build'
import { resolveSeam, type Plan } from '../../../src/core/job/plan'
import { preflight, toJobIssue, type Issue, type IssueCode } from '../../../src/core/job/preflight'
import { effectiveLegMm, legLimits } from '../../../src/core/process/filletRules'
import { DEFAULT_DETECT_SETTINGS, detectSeams, type SeamCandidate } from '../../../src/core/seams/detect'
import { CREATED_AT, SPRAY_ID, samplePlan, specExamplePlan, type StraightSeam } from '../helpers/jobs'
import { loadSampleModel } from '../helpers/models'
import type { Vec3 } from '../../../src/core/math/vec3'

const codes = (issues: Issue[]) => issues.map((i) => i.code)
const only = (issues: Issue[], code: IssueCode, severity: Issue['severity'], seamId: string | null) => {
  expect(issues.map((i) => [i.code, i.severity, i.seamId])).toEqual([[code, severity, seamId]])
}

// The spray procedure without a wire feed (so no travel speed check) and with a wide thickness range, so that
// only the rule under test can fire.
function lenient(seams?: StraightSeam[], edit?: (plan: Plan) => void): Plan {
  const plan = specExamplePlan(seams)
  const p = plan.procedures.find((x) => x.id === SPRAY_ID)!
  delete p.electrical.wireFeedMpm
  p.baseMaterial.thicknessMm = [1, 100]
  edit?.(plan)
  return plan
}

describe('the spec example plan', () => {
  it('raises nothing', () => {
    expect(preflight(specExamplePlan())).toEqual([])
  })
})

describe('plan level rules', () => {
  it('NO_SEAMS: no accepted seams', () => {
    only(preflight({ ...specExamplePlan(), seams: [] }), 'NO_SEAMS', 'error', null)
  })

  it('DUPLICATE_ID: two seams share an id', () => {
    const plan = specExamplePlan([
      { id: 'a', from: [0, 0, 0], to: [100, 0, 0] },
      { id: 'a', from: [0, 300, 0], to: [100, 300, 0] },
    ])
    only(preflight(plan), 'DUPLICATE_ID', 'error', 'a')
  })

  it('DUPLICATE_ID: two procedures share an id', () => {
    const plan = specExamplePlan()
    plan.procedures.push(structuredClone(plan.procedures[0]!))
    only(preflight(plan), 'DUPLICATE_ID', 'error', null)
  })

  it('UNITS_UNKNOWN: unknown source units or a bad scale', () => {
    const unknown = specExamplePlan()
    unknown.part.sourceUnits = 'unknown'
    only(preflight(unknown), 'UNITS_UNKNOWN', 'error', null)
    for (const scaleToMm of [0, -1, Number.NaN, Infinity]) {
      const plan = specExamplePlan()
      plan.part.scaleToMm = scaleToMm
      only(preflight(plan), 'UNITS_UNKNOWN', 'error', null)
    }
  })
})

describe('procedure rules', () => {
  it('NO_PROCEDURE: a seam without a procedure', () => {
    const plan = specExamplePlan()
    plan.seams[0]!.procedureId = null
    only(preflight(plan), 'NO_PROCEDURE', 'error', 's07')
  })

  it('UNKNOWN_PROCEDURE: an id that is not in the library', () => {
    const plan = specExamplePlan()
    plan.seams[0]!.procedureId = 'WPS-NOPE'
    only(preflight(plan), 'UNKNOWN_PROCEDURE', 'error', 's07')
  })

  it('POSITION_NOT_COVERED: the seam position is not in the procedure positions', () => {
    const plan = lenient(undefined, (p) => void (p.seams[0]!.overrides = { positions: ['PA'] }))
    only(preflight(plan), 'POSITION_NOT_COVERED', 'warning', 's07')
  })

  it('POSITION_NOT_COVERED: checks the position a seam is welded in, which a reversed sequence entry turns PF into PG', () => {
    const vertical = [{ id: 'v1', from: [0, 0, 0] as Vec3, to: [0, 0, 200] as Vec3, normals: [[1, 0, 0], [0, 1, 0]] as [Vec3, Vec3] }]
    const plan = lenient(vertical, (p) => void (p.seams[0]!.overrides = { positions: ['PA', 'PB', 'PF'] }))
    expect(buildJob(plan, { createdAt: CREATED_AT }).seams[0]!.position.iso6947).toBe('PF')
    expect(codes(preflight(plan))).not.toContain('POSITION_NOT_COVERED')
    plan.sequence = { strategy: 'manual', order: [{ seamId: 'v1', reversed: true }] }
    expect(buildJob(plan, { createdAt: CREATED_AT }).seams[0]!.position.iso6947).toBe('PG')
    only(preflight(plan), 'POSITION_NOT_COVERED', 'warning', 'v1')
    expect(preflight(plan)[0]!.what).toContain('PG')
  })

  it('THICKNESS_OUTSIDE_WPS: a known thickness is outside the procedure range', () => {
    const plan = lenient([{ id: 's07', from: [1200, 300, 12], to: [2000, 300, 12], thicknessMm: [150, 150] }])
    only(preflight(plan), 'THICKNESS_OUTSIDE_WPS', 'warning', 's07')
  })
})

describe('overlap', () => {
  const pair = (b: StraightSeam) => specExamplePlan([{ id: 'a', from: [0, 0, 0], to: [100, 0, 0] }, b])

  it('OVERLAP: a seam and its copy', () => {
    only(preflight(pair({ id: 'b', from: [0, 0, 0], to: [100, 0, 0] })), 'OVERLAP', 'error', 'b')
  })

  it('OVERLAP: a seam and its reversed copy', () => {
    only(preflight(pair({ id: 'b', from: [100, 0, 0], to: [0, 0, 0], normals: [[0, -1, 0], [0, 0, 1]] })), 'OVERLAP', 'error', 'b')
  })

  it('OVERLAP: a shifted partial overlap of 20 mm', () => {
    only(preflight(pair({ id: 'b', from: [80, 0.5, 0], to: [200, 0.5, 0] })), 'OVERLAP', 'error', 'b')
  })

  it('does not fire for two seams sharing one end point at a right angle', () => {
    expect(preflight(pair({ id: 'b', from: [100, 0, 0], to: [100, 100, 0] }))).toEqual([])
  })

  it('does not fire for two collinear seams that meet at one end point', () => {
    expect(preflight(pair({ id: 'b', from: [100, 0, 0], to: [200, 0, 0] }))).toEqual([])
  })

  it('does not fire for parallel seams 2 mm apart', () => {
    expect(preflight(pair({ id: 'b', from: [0, 2, 0], to: [100, 2, 0] }))).toEqual([])
  })

  it('does not fire for seams that cross at a steep angle', () => {
    expect(preflight(pair({ id: 'b', from: [50, -50, 0], to: [50, 50, 0] }))).toEqual([])
  })
})

describe('fillet size rules', () => {
  it('LEG_UNDER_MIN: a 4 mm leg on a 12 mm part, in the tone of the plan', () => {
    const plan = lenient(undefined, (p) => void (p.seams[0]!.legMm = 4))
    const issues = preflight(plan)
    only(issues, 'LEG_UNDER_MIN', 'error', 's07')
    expect(issues[0]!.what).toBe('Seam S07 has a 4 mm leg, below the 5 mm minimum.')
    expect(issues[0]!.why).toContain('AWS D1.1')
    expect(issues[0]!.next).toContain('Raise the leg to 5 mm or more')
  })

  it('LEG_UNDER_MIN: a 5 mm leg is fine', () => {
    expect(preflight(lenient(undefined, (p) => void (p.seams[0]!.legMm = 5)))).toEqual([])
  })

  it('LEG_OVER_EDGE: a lap leg above the edge limit of the thinner plate', () => {
    const plan = lenient([{ id: 's07', from: [1200, 300, 12], to: [2000, 300, 12], thicknessMm: [6, 6] }], (p) => {
      p.seams[0]!.seam = { ...p.seams[0]!.seam, jointType: 'lap' }
      p.seams[0]!.legMm = 5
    })
    only(preflight(plan), 'LEG_OVER_EDGE', 'error', 's07')
  })

  it('a T fillet has no edge limit', () => {
    const plan = lenient([{ id: 's07', from: [1200, 300, 12], to: [2000, 300, 12], thicknessMm: [6, 6] }], (p) => void (p.seams[0]!.legMm = 5))
    expect(preflight(plan)).toEqual([])
  })

  it('MULTI_PASS: a leg above 8 mm with one pass', () => {
    const plan = lenient(undefined, (p) => void (p.seams[0]!.legMm = 9))
    only(preflight(plan), 'MULTI_PASS', 'warning', 's07')
  })

  it('SHORT_SEAM: under 10 mm', () => {
    only(preflight(lenient([{ id: 's07', from: [0, 0, 0], to: [8, 0, 0] }])), 'SHORT_SEAM', 'warning', 's07')
    expect(preflight(lenient([{ id: 's07', from: [0, 0, 0], to: [10, 0, 0] }]))).toEqual([])
  })
})

describe('bead rules', () => {
  // v is the heat input in kJ/mm reached by changing the voltage, current 270 A and travel 9 mm/s unchanged
  const withHeatInput = (q: number) => lenient(undefined, (p) => void (p.seams[0]!.overrides = { electrical: { voltageV: (q * 1000 * 540) / (0.8 * 270 * 60) } }))

  it.each([
    [2.49, null],
    [2.51, 'warning'],
    [3.49, 'warning'],
    [3.51, 'error'],
  ] as const)('HEAT_INPUT_RANGE at %f kJ/mm', (q, severity) => {
    const issues = preflight(withHeatInput(q))
    if (severity === null) expect(issues).toEqual([])
    else only(issues, 'HEAT_INPUT_RANGE', severity, 's07')
  })

  it('HEAT_INPUT_RANGE: low heat input on a part of 6 mm or more', () => {
    const plan = lenient(undefined, (p) => void (p.seams[0]!.overrides = { electrical: { currentA: 100 } }))
    only(preflight(plan), 'HEAT_INPUT_RANGE', 'warning', 's07')
  })

  // The default leg follows the travel speed, so a set leg of 6 mm gives a fixed suggestion to measure against.
  const suggested = 9.043978851243342
  const withTravel = (factor: number) => {
    const plan = specExamplePlan()
    plan.seams[0]!.legMm = 6
    plan.seams[0]!.overrides = { travelSpeedMmS: suggested * factor }
    return plan
  }

  it.each([
    [1.24, null],
    [1.26, 'warning'],
    [1.49, 'warning'],
    [1.51, 'error'],
  ] as const)('TRAVEL_SPEED_RANGE at %f times the suggestion', (factor, severity) => {
    const issues = preflight(withTravel(factor))
    if (severity === null) expect(issues).toEqual([])
    else only(issues, 'TRAVEL_SPEED_RANGE', severity, 's07')
  })

  it('TRAVEL_SPEED_RANGE: slower than the suggestion counts the same way', () => {
    const plan = specExamplePlan()
    plan.seams[0]!.legMm = 6
    plan.seams[0]!.overrides = { travelSpeedMmS: suggested * 0.74 }
    expect(codes(preflight(plan))).toContain('TRAVEL_SPEED_RANGE')
  })

  it('skips the travel speed check when the procedure has no wire feed', () => {
    const plan = lenient(undefined, (p) => void (p.seams[0]!.overrides = { travelSpeedMmS: 40 }))
    expect(codes(preflight(plan))).not.toContain('TRAVEL_SPEED_RANGE')
  })
})

describe('access', () => {
  const access = (cls: NonNullable<Plan['seams'][number]['access']>['class'], unreachable: Array<[number, number]> = []) => ({
    clearanceDeg: 40,
    nearClearanceDeg: 40,
    class: cls,
    portId: null,
    reachCoverage: null,
    unreachable,
  })

  it('ACCESS_BLOCKED: a blocked class is a warning, and the message says the seam can still be welded by hand', () => {
    const plan = specExamplePlan()
    plan.seams[0]!.access = access('blocked')
    const issues = preflight(plan)
    only(issues, 'ACCESS_BLOCKED', 'warning', 's07')
    expect(`${issues[0]!.what} ${issues[0]!.why} ${issues[0]!.next}`).toMatch(/by hand/)
  })

  it('ACCESS_BLOCKED: a non empty unreachable list is a warning', () => {
    const plan = specExamplePlan()
    plan.seams[0]!.access = access('standard', [[10, 20]])
    only(preflight(plan), 'ACCESS_BLOCKED', 'warning', 's07')
  })

  it.each(['standard', 'slim'] as const)('raises nothing for a %s seam', (cls) => {
    const plan = specExamplePlan()
    plan.seams[0]!.access = access(cls)
    expect(preflight(plan)).toEqual([])
  })

  it('does not block the export: exportJob is ok and the warning is written to the file', () => {
    const plan = specExamplePlan()
    plan.seams[0]!.access = access('blocked')
    const result = exportJob(plan, { createdAt: CREATED_AT })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.job.validation.warnings.map((w) => w.code)).toEqual(['ACCESS_BLOCKED'])
    expect(result.job.validation.errors).toEqual([])
  })

  it('is silent until access exists', () => {
    expect(preflight(specExamplePlan())).toEqual([])
  })

  it('ACCESS_BLOCKED: a slim seam with unreachable intervals keeps the warning', () => {
    const plan = specExamplePlan()
    plan.seams[0]!.access = access('slim', [[0, 40]])
    only(preflight(plan), 'ACCESS_BLOCKED', 'warning', 's07')
  })
})

describe('snake reach', () => {
  const snake = (reachCoverage: number | null, unreachable: Array<[number, number]> = [], portId: string | null = 'P1') => ({
    clearanceDeg: 0,
    nearClearanceDeg: 45,
    class: 'snake' as const,
    portId,
    reachCoverage,
    unreachable,
  })
  const planWith = (coverages: Array<ReturnType<typeof snake>>): Plan => {
    const plan = specExamplePlan(coverages.map((_, i) => ({ id: `s${i}`, from: [0, i * 300, 0] as [number, number, number], to: [100, i * 300, 0] as [number, number, number] })))
    plan.seams.forEach((planned, i) => (planned.access = coverages[i]!))
    return plan
  }
  const text = (issue: Issue) => `${issue.what} ${issue.why} ${issue.next}`

  it('SNAKE_UNREACHABLE: coverage 0.6 warns with the percentage and the stretches, and ACCESS_BLOCKED stays quiet', () => {
    const issues = preflight(planWith([snake(0.6, [[10, 30], [60, 70]])]))
    only(issues, 'SNAKE_UNREACHABLE', 'warning', 's0')
    expect(issues[0]!.what).toBe('The snake arm reaches 60 % of seam S0.')
    expect(issues[0]!.why).toBe('2 stretches of it (10 to 30 mm, 60 to 70 mm) are out of reach from port P1 with the current arm.')
    expect(issues[0]!.next).toContain('The rest can be welded by hand.')
  })

  it('SNAKE_UNREACHABLE: one stretch agrees in number, and a seam with no port says every port', () => {
    const issues = preflight(planWith([snake(0, [[0, 100]], null)]))
    expect(issues[0]!.why).toBe('1 stretch of it (0 to 100 mm) is out of reach from every port with the current arm.')
    expect(issues[0]!.what).toBe('The snake arm reaches 0 % of seam S0.')
  })

  it('gives nothing for a fully reached snake seam', () => {
    expect(preflight(planWith([snake(1)]))).toEqual([])
  })

  it('SNAKE_NOT_RUN: three snake seams with no result give one info for the plan, with the count', () => {
    const issues = preflight(planWith([snake(null), snake(null), snake(null)]))
    only(issues, 'SNAKE_NOT_RUN', 'info', null)
    expect(issues[0]!.what).toBe('3 snake seams have no reach result.')
    expect(issues[0]!.next).toContain('The file can be exported without it.')
  })

  it('SNAKE_NOT_RUN: one seam agrees in number', () => {
    expect(preflight(planWith([snake(null)]))[0]!.what).toBe('1 snake seam has no reach result.')
  })

  it('counts only the seams without a result when others have one', () => {
    const issues = preflight(planWith([snake(null), snake(1), snake(0.5, [[0, 50]])]))
    expect(issues.map((i) => [i.code, i.severity])).toEqual([['SNAKE_UNREACHABLE', 'warning'], ['SNAKE_NOT_RUN', 'info']])
    expect(issues[1]!.what).toBe('1 snake seam has no reach result.')
  })

  it('gives nothing when no seam is snake', () => {
    const plan = specExamplePlan()
    plan.seams[0]!.access = { clearanceDeg: 40, nearClearanceDeg: 40, class: 'standard', portId: null, reachCoverage: null, unreachable: [] }
    expect(preflight(plan)).toEqual([])
  })

  it('lists errors, then warnings, then info', () => {
    const plan = planWith([snake(null), snake(0.5, [[0, 50]])])
    plan.seams[0]!.procedureId = null
    expect(preflight(plan).map((i) => i.severity)).toEqual(['error', 'warning', 'info'])
  })

  it('exports with only warnings and info, writing the info to validation.warnings', () => {
    const result = exportJob(planWith([snake(null), snake(0.5, [[0, 50]])]), { createdAt: CREATED_AT })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.job.validation.warnings.map((w) => w.code)).toEqual(['SNAKE_UNREACHABLE', 'SNAKE_NOT_RUN'])
    expect(result.job.validation.errors).toEqual([])
  })

  it('writes no en or em dash in any message', () => {
    const issues = preflight(planWith([snake(null), snake(0.5, [[0, 50]]), snake(0, [[0, 100]], null)]))
    for (const issue of issues) expect(text(issue)).not.toMatch(new RegExp('[\\u2013\\u2014]'))
  })
})

describe('thickness', () => {
  it('THICKNESS_UNKNOWN: both plates unknown', () => {
    const plan = lenient([{ id: 's07', from: [1200, 300, 12], to: [2000, 300, 12], thicknessMm: [null, null] }])
    only(preflight(plan), 'THICKNESS_UNKNOWN', 'warning', 's07')
  })

  it('a drawn seam with approximate normals and null thickness: THICKNESS_UNKNOWN, leg 6, finite heat input', () => {
    const plan = specExamplePlan([{ id: 's07', from: [1200, 300, 12], to: [2000, 300, 12], thicknessMm: [null, null] }])
    plan.seams[0]!.seam = { ...plan.seams[0]!.seam, approximateNormals: true, source: 'manual' }
    only(preflight(plan), 'THICKNESS_UNKNOWN', 'warning', 's07')
    const r = resolveSeam(plan, plan.seams[0]!)
    expect(r.leg.legMm).toBe(6)
    expect(Number.isFinite(r.heatInputKJmm)).toBe(true)
    const job = buildJob(plan, { createdAt: CREATED_AT })
    expect(JSON.stringify(job)).not.toMatch(/NaN|Infinity/)
  })

  it('THICKNESS_UNKNOWN: one plate unknown', () => {
    const plan = lenient([{ id: 's07', from: [1200, 300, 12], to: [2000, 300, 12], thicknessMm: [12, null] }])
    only(preflight(plan), 'THICKNESS_UNKNOWN', 'warning', 's07')
  })
})

describe('corner thickness that measured plate extent', () => {
  // A ray through the end face of a plate edge reads the plate extent: [10, 200] on a 10 mm plate. Detection no longer
  // offers plate edges as corners, but a seam set to corner by hand, or one in an older saved plan, can carry such a pair.
  const seams = detectSeams(loadSampleModel('t-joint-merged'), DEFAULT_DETECT_SETTINGS)
  const corner: SeamCandidate = { ...seams.find((s) => !s.hidden)!, jointType: 'corner', hidden: true, thicknessMm: [10, 200] }

  it('is no longer offered by detection on the edges of the t-joint-merged plates', () => {
    expect(seams.filter((s) => s.hidden)).toEqual([])
  })

  it('treats the larger entry as unknown, so the known plate sets the minimum leg and a warning is raised', () => {
    const plan = samplePlan('t-joint-merged', (p) => ({
      ...p,
      seams: [{ ...p.seams[0]!, seam: corner, procedureId: null, legMm: null }],
    }))
    plan.seams[0]!.procedureId = null
    const known = Math.min(...(corner.thicknessMm as number[]))
    const r = resolveSeam(plan, plan.seams[0]!)
    expect(r.thickness.filter((t) => t === null)).toHaveLength(1)
    expect(r.thickness).toContain(known)
    expect(r.limits.minMm).toBe(legLimits('fillet', [known, null]).minMm)
    expect(r.limits.minMm).toBeLessThan(8)
    expect(r.leg).toEqual(effectiveLegMm({ legMm: null, procedure: null, jointType: 'corner', thickness: r.thickness }))
    const issues = preflight(plan)
    expect(codes(issues)).toContain('THICKNESS_UNKNOWN')
    expect(issues.find((i) => i.code === 'THICKNESS_UNKNOWN')!.severity).toBe('warning')
    expect(codes(issues)).not.toContain('LEG_UNDER_MIN')
  })

  it('leaves a fillet with the same thickness pair untouched', () => {
    const plan = samplePlan('t-joint-merged', (p) => ({
      ...p,
      seams: [{ ...p.seams[0]!, seam: { ...corner, jointType: 'fillet' }, legMm: null }],
    }))
    expect(resolveSeam(plan, plan.seams[0]!).thickness).toEqual(corner.thicknessMm)
  })
})

describe('double-bottom-cell', () => {
  it('has no errors, and every warning is POSITION_NOT_COVERED', () => {
    const issues = preflight(samplePlan('double-bottom-cell'))
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(new Set(codes(issues))).toEqual(new Set(['POSITION_NOT_COVERED']))
  })
})

describe('issue text and order', () => {
  const noisy = lenient(
    [
      { id: 'a', from: [0, 0, 0], to: [8, 0, 0], thicknessMm: [null, 150] },
      { id: 'a', from: [0, 0, 0], to: [8, 0, 0] },
      { id: 'c', from: [0, 300, 0], to: [100, 300, 0] },
    ],
    (p) => {
      p.part.sourceUnits = 'unknown'
      p.seams[1]!.procedureId = null
      p.seams[2]!.legMm = 4
      p.seams[2]!.overrides = { positions: ['PA'] }
    },
  )
  const issues = preflight(noisy)

  it('gives every issue a what, why and next without long dashes', () => {
    expect(issues.length).toBeGreaterThan(5)
    for (const i of issues) {
      for (const part of [i.what, i.why, i.next]) {
        expect(part.trim().length, i.code).toBeGreaterThan(0)
        expect(part, i.code).not.toMatch(new RegExp('[\\u2013\\u2014]'))
      }
    }
  })

  it('lists errors first, plan level before seam level, seams in plan order', () => {
    const severities = issues.map((i) => i.severity)
    expect(severities).toEqual([...severities].sort((a, b) => (a === b ? 0 : a === 'error' ? -1 : 1)))
    const errors = issues.filter((i) => i.severity === 'error')
    const firstSeamLevel = errors.findIndex((i) => i.code === 'NO_PROCEDURE' || i.code === 'LEG_UNDER_MIN')
    const lastPlanLevel = Math.max(...errors.map((i, k) => (i.code === 'UNITS_UNKNOWN' || i.code === 'DUPLICATE_ID' ? k : -1)))
    expect(lastPlanLevel).toBeLessThan(firstSeamLevel)
    const order = errors.filter((i) => i.seamId !== null).map((i) => i.seamId)
    expect(order.indexOf('c')).toBeGreaterThanOrEqual(0)
  })

  it('turns an issue into a job issue with the three parts joined by spaces', () => {
    const i = issues[0]!
    expect(toJobIssue(i)).toEqual({ code: i.code, seamId: i.seamId, message: `${i.what} ${i.why} ${i.next}` })
  })
})
