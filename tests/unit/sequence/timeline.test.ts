import { describe, expect, it } from 'vitest'
import { planTiming } from '../../../src/core/job/timing'
import { timelineSegments } from '../../../src/core/sequence/timeline'
import { samplePlan, specExamplePlan } from '../helpers/jobs'

const two = () =>
  specExamplePlan([
    { id: 's1', from: [0, 0, 0], to: [100, 0, 0] },
    { id: 's2', from: [0, 200, 0], to: [100, 200, 0] },
  ])

describe('timelineSegments', () => {
  const timing = planTiming(two())
  const segments = timelineSegments(timing)

  it('alternates an air move and an arc, ending with the air move home', () => {
    expect(segments.map((s) => [s.kind, s.seamId])).toEqual([['air', 's1'], ['arc', 's1'], ['air', 's2'], ['arc', 's2'], ['air', 'home']])
  })

  it('runs without gaps from zero', () => {
    expect(segments[0]!.t0).toBe(0)
    segments.slice(1).forEach((s, i) => expect(s.t0).toBeCloseTo(segments[i]!.t1, 9))
  })

  it('has widths that are the times of the moves and the arcs', () => {
    expect(segments[0]!.t1 - segments[0]!.t0).toBeCloseTo(timing.moves[0]!.timeS, 9)
    expect(segments[1]!.t1 - segments[1]!.t0).toBeCloseTo(timing.seams[0]!.arcTimeS, 9)
    expect(segments[4]!.t1 - segments[4]!.t0).toBeCloseTo(timing.moves[2]!.timeS, 9)
  })

  it('ends at the cycle time less the strike and stop overhead that planTiming adds per seam', () => {
    const overhead = timing.seams.reduce((total, s) => total + s.overheadS, 0)
    expect(overhead).toBeGreaterThan(0)
    expect(segments[segments.length - 1]!.t1).toBeCloseTo(timing.cycleTimeS - overhead, 6)
  })

  it('gives nothing for an empty plan', () => {
    expect(timelineSegments(planTiming({ ...two(), seams: [] }))).toEqual([])
  })

  it('has 2 x seams + 1 segments on a real part', () => {
    const plan = samplePlan('double-bottom-cell')
    expect(timelineSegments(planTiming(plan))).toHaveLength(2 * plan.seams.length + 1)
  })
})
