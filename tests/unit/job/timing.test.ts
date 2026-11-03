import { describe, expect, it } from 'vitest'
import { buildJob } from '../../../src/core/job/build'
import { planTiming } from '../../../src/core/job/timing'
import { CREATED_AT, samplePlan, specExamplePlan } from '../helpers/jobs'

const opts = { createdAt: CREATED_AT }

describe.each(['t-joint-merged', 'double-bottom-cell'])('planTiming on %s', (id) => {
  const plan = samplePlan(id)
  const timing = planTiming(plan)
  const job = buildJob(plan, opts)

  it('matches the cycle time of the exported summary within 0.1 s', () => {
    expect(timing.cycleTimeS).toBeGreaterThan(0)
    expect(Math.abs(timing.cycleTimeS - job.summary.cycleTimeS)).toBeLessThanOrEqual(0.1)
    expect(Math.abs(timing.airTimeS - job.summary.airTimeS)).toBeLessThanOrEqual(0.1)
    expect(Math.abs(timing.arcTimeS - job.summary.arcTimeS)).toBeLessThanOrEqual(0.1)
  })

  it('sums the per-seam arc times to the arc time', () => {
    expect(timing.seams).toHaveLength(plan.seams.length)
    expect(timing.seams.reduce((total, s) => total + s.arcTimeS, 0)).toBeCloseTo(timing.arcTimeS, 6)
  })

  it('has seams + 1 moves and the same moves as the export', () => {
    expect(timing.moves).toHaveLength(plan.seams.length + 1)
    timing.moves.forEach((m, i) => {
      const exported = job.sequence.airMoves[i]!
      expect([m.from, m.to]).toEqual([exported.from, exported.to])
      expect(m.lengthMm).toBeCloseTo(exported.lengthMm, 2)
    })
  })

  it('adds arc time, overhead and air time to the cycle time', () => {
    const overhead = timing.seams.reduce((total, s) => total + s.overheadS, 0)
    expect(timing.cycleTimeS).toBeCloseTo(timing.arcTimeS + overhead + timing.airTimeS, 6)
  })
})

describe('planTiming without seams', () => {
  it('gives zeros', () => {
    expect(planTiming({ ...specExamplePlan(), seams: [] })).toEqual({ seams: [], moves: [], arcTimeS: 0, airTimeS: 0, cycleTimeS: 0 })
  })
})
