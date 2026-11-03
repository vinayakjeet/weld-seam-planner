import { describe, expect, it } from 'vitest'
import { DEFAULT_JOB_SETTINGS, resolveSeam, torchParamsFor } from '../../../src/core/job/plan'
import { WPS_PRESETS } from '../../../src/core/process/wps'
import { specExamplePlan } from '../helpers/jobs'

const byId = (id: string) => WPS_PRESETS.find((p) => p.id === id)!

describe('torchParamsFor', () => {
  it('takes the work angle and the approach distance, and pushes with a positive travel angle', () => {
    const p = torchParamsFor(byId('WPS-GMAW-SPRAY-FW6'), DEFAULT_JOB_SETTINGS)
    expect(p.workAngleDeg).toBe(0)
    expect(p.travelAngleDeg).toBe(10)
    expect(p.approachMm).toBe(50)
  })

  it('drags with a negative travel angle', () => {
    expect(torchParamsFor(byId('WPS-FCAW-G'), DEFAULT_JOB_SETTINGS).travelAngleDeg).toBe(-8)
  })

  it('follows the job settings for the approach distance', () => {
    expect(torchParamsFor(byId('WPS-GTAW'), { ...DEFAULT_JOB_SETTINGS, approachMm: 30 }).approachMm).toBe(30)
  })
})

describe('DEFAULT_JOB_SETTINGS', () => {
  it('has the spec defaults', () => {
    expect(DEFAULT_JOB_SETTINGS).toMatchObject({ poseSpacingMm: 5, airSpeedMmS: 250, approachMm: 50, creaseAngleDeg: 30 })
  })
})

describe('resolveSeam', () => {
  it('resolves the spec example: spray leg 6, heat input 0.67, suggested travel 9.0 mm/s, both checks ok', () => {
    const plan = specExamplePlan()
    const r = resolveSeam(plan, plan.seams[0]!)
    expect(r.procedure?.id).toBe('WPS-GMAW-SPRAY-FW6')
    expect(r.leg).toEqual({ legMm: 6, source: 'procedure' })
    expect(r.limits).toEqual({ minMm: 5, maxMm: null })
    expect(r.heatInputKJmm).toBeCloseTo(0.672, 3)
    expect(r.suggestedTravelMmS).toBeCloseTo(9.04, 2)
    expect(r.heatCheck.level).toBe('ok')
    expect(r.travelCheck.level).toBe('ok')
  })

  it('applies the overrides of the seam to the procedure', () => {
    const plan = specExamplePlan()
    plan.seams[0]!.overrides = { electrical: { currentA: 300 }, travelSpeedMmS: 4 }
    // the default leg follows the travel speed, so the check only bites against a set leg
    plan.seams[0]!.legMm = 6
    const r = resolveSeam(plan, plan.seams[0]!)
    expect(r.procedure?.electrical.currentA).toBe(300)
    expect(r.procedure?.electrical.voltageV).toBe(28)
    expect(r.heatInputKJmm).toBeCloseTo((0.8 * 28 * 300 * 60) / (1000 * 240), 6)
    expect(r.travelCheck.level).toBe('red')
  })

  it('uses a set leg for the suggested travel speed', () => {
    const plan = specExamplePlan()
    plan.seams[0]!.legMm = 8
    const r = resolveSeam(plan, plan.seams[0]!)
    expect(r.leg).toEqual({ legMm: 8, source: 'set' })
    expect(r.suggestedTravelMmS).toBeCloseTo(9.04 * 36 / 64, 2)
  })

  it('has no procedure for an unassigned seam or an unknown id, and nothing is NaN', () => {
    const plan = specExamplePlan()
    for (const procedureId of [null, 'WPS-NOPE']) {
      plan.seams[0]!.procedureId = procedureId
      const r = resolveSeam(plan, plan.seams[0]!)
      expect(r.procedure).toBeNull()
      expect(r.heatInputKJmm).toBeNull()
      expect(r.suggestedTravelMmS).toBeNull()
      expect(r.leg.source).toBe('minimum')
      expect(r.heatCheck.level).toBe('ok')
      expect(r.travelCheck.level).toBe('ok')
    }
  })

  it('has no suggested travel speed for a procedure without wire feed', () => {
    const plan = specExamplePlan()
    plan.seams[0]!.procedureId = 'WPS-GTAW'
    const r = resolveSeam(plan, plan.seams[0]!)
    expect(r.suggestedTravelMmS).toBeNull()
    expect(r.travelCheck.level).toBe('ok')
    expect(r.heatInputKJmm).toBeCloseTo(0.6 * 11 * 115 * 60 / (1000 * 180), 6)
  })
})
