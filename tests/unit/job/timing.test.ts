import { describe, expect, it } from 'vitest'
import { buildJob } from '../../../src/core/job/build'
import { planTiming } from '../../../src/core/job/timing'
import { cleaningsFor } from '../../../src/core/job/build'
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
    expect(timing.cycleTimeS).toBeCloseTo(timing.arcTimeS + overhead + timing.airTimeS + timing.cleaningS, 6)
  })
})

describe('planTiming without seams', () => {
  it('gives zeros', () => {
    expect(planTiming({ ...specExamplePlan(), seams: [] })).toEqual({ seams: [], moves: [], arcTimeS: 0, airTimeS: 0, cleanings: 0, cleaningS: 0, cycleTimeS: 0 })
  })
})

describe('cleaningsFor', () => {
  it('is none when the interval is 0, whatever the arc time', () => {
    expect(cleaningsFor(5000, 0)).toBe(0)
    expect(cleaningsFor(5000, -1)).toBe(0)
  })

  it('cleans between full intervals of arc time and never after the last weld', () => {
    expect(cleaningsFor(0, 60)).toBe(0)
    expect(cleaningsFor(59, 60)).toBe(0)
    expect(cleaningsFor(60, 60)).toBe(0)
    expect(cleaningsFor(61, 60)).toBe(1)
    expect(cleaningsFor(120, 60)).toBe(1)
    expect(cleaningsFor(121, 60)).toBe(2)
  })
})

describe('torch cleaning in the cycle time', () => {
  const base = specExamplePlan([
    { id: 'a', from: [0, 0, 0], to: [100, 0, 0] },
    { id: 'b', from: [0, 200, 0], to: [100, 200, 0] },
  ])
  const without = planTiming(base)
  const withCleaning = (cleanEveryS: number, cleanTimeS: number) => ({ ...base, settings: { ...base.settings, cleanEveryS, cleanTimeS } })

  it('is not modelled by default, so a plan without the setting keeps its time', () => {
    expect(without.cleanings).toBe(0)
    expect(without.cleaningS).toBe(0)
    expect(planTiming(withCleaning(0, 30)).cycleTimeS).toBe(without.cycleTimeS)
  })

  it('adds n_clean times t_clean to the cycle time, with n_clean from the arc time', () => {
    const every = without.arcTimeS / 2.5
    const timing = planTiming(withCleaning(every, 30))
    expect(timing.cleanings).toBe(2)
    expect(timing.cleaningS).toBe(60)
    expect(timing.cycleTimeS).toBeCloseTo(without.cycleTimeS + 60, 6)
  })

  it('leaves arc and air time as they were', () => {
    const timing = planTiming(withCleaning(without.arcTimeS / 2.5, 30))
    expect(timing.arcTimeS).toBe(without.arcTimeS)
    expect(timing.airTimeS).toBe(without.airTimeS)
  })

  it('adds nothing when one interval covers all the welding', () => {
    const timing = planTiming(withCleaning(without.arcTimeS * 2, 30))
    expect(timing.cleanings).toBe(0)
    expect(timing.cycleTimeS).toBe(without.cycleTimeS)
  })

  it('is written to the exported settings and summary, and the summary cycle time includes it', () => {
    const every = without.arcTimeS / 2.5
    const job = buildJob(withCleaning(every, 30), opts)
    expect(job.settings).toMatchObject({ cleanEveryS: every, cleanTimeS: 30 })
    expect(job.summary).toMatchObject({ torchCleanings: 2, cleaningTimeS: 60 })
    expect(Math.abs(job.summary.cycleTimeS - (planTiming(withCleaning(every, 30)).cycleTimeS))).toBeLessThanOrEqual(0.1)
    expect(Math.abs(job.summary.cycleTimeS - (buildJob(base, opts).summary.cycleTimeS + 60))).toBeLessThanOrEqual(0.1)
  })

  it('writes zero cleanings and zero time when it is off', () => {
    const job = buildJob(base, opts)
    expect(job.settings).toMatchObject({ cleanEveryS: 0, cleanTimeS: 30 })
    expect(job.summary).toMatchObject({ torchCleanings: 0, cleaningTimeS: 0 })
  })
})
