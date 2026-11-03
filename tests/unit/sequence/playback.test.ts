import { describe, expect, it } from 'vitest'
import { homePoint } from '../../../src/core/job/build'
import { planTiming } from '../../../src/core/job/timing'
import { length, sub, type Vec3 } from '../../../src/core/math/vec3'
import { playbackPathOf, playbackTotalS, poseAtTime, trailAlong, weldedUpTo } from '../../../src/core/sequence/playback'
import { timelineSegments } from '../../../src/core/sequence/timeline'
import { samplePlan, specExamplePlan } from '../helpers/jobs'

const two = () =>
  specExamplePlan([
    { id: 's1', from: [0, 0, 0], to: [100, 0, 0] },
    { id: 's2', from: [0, 200, 0], to: [100, 200, 0] },
  ])

const plan = two()
const path = playbackPathOf(plan)
const timing = planTiming(plan)
const segments = timelineSegments(timing)
const total = playbackTotalS(timing)
const dist = (a: Vec3, b: Vec3) => length(sub(a, b))
const at = (t: number) => poseAtTime(path, timing, t)

describe('playbackPathOf', () => {
  it('lists the seams in order with their poses and the approach and retract points', () => {
    expect(path.seams.map((s) => s.seamId)).toEqual(['s1', 's2'])
    expect(path.home).toEqual(homePoint(plan))
    for (const seam of path.seams) {
      expect(seam.poses.length).toBeGreaterThan(2)
      expect(dist(seam.approach, seam.poses[0]!.position)).toBeCloseTo(plan.settings.approachMm, 2)
      expect(dist(seam.retract, seam.poses[seam.poses.length - 1]!.position)).toBeCloseTo(plan.settings.approachMm, 2)
    }
  })

  it('follows the sequence of the plan, reversed seams included', () => {
    const reversed = playbackPathOf({ ...plan, sequence: { strategy: 'manual', order: [{ seamId: 's2', reversed: true }, { seamId: 's1', reversed: false }] } })
    expect(reversed.seams.map((s) => s.seamId)).toEqual(['s2', 's1'])
    expect(reversed.seams[0]!.poses[0]!.position).toEqual([100, 200, 0])
  })
})

describe('poseAtTime', () => {
  it('is at home when the time is 0, moving toward the first seam', () => {
    const pose = at(0)
    expect(pose.position).toEqual(path.home)
    expect([pose.kind, pose.seamId]).toEqual(['air', 's1'])
  })

  it('is on the first pose of a seam when its arc starts', () => {
    const arc = segments.find((s) => s.kind === 'arc' && s.seamId === 's1')!
    const pose = at(arc.t0)
    expect(pose.kind).toBe('arc')
    expect(pose.s).toBeCloseTo(0, 6)
    expect(pose.position).toEqual(path.seams[0]!.poses[0]!.position)
  })

  it('interpolates along the seam by the elapsed share of the arc time', () => {
    const arc = segments.find((s) => s.kind === 'arc' && s.seamId === 's1')!
    const pose = at((arc.t0 + arc.t1) / 2)
    expect(pose.s).toBeCloseTo(50, 1)
    expect(pose.position[0]).toBeCloseTo(50, 1)
    expect(pose.position[1]).toBeCloseTo(0, 6)
  })

  it('stays on the way from one seam to the next during an air move and arrives where the next arc starts', () => {
    const air = segments.find((s) => s.kind === 'air' && s.seamId === 's2')!
    const a = path.seams[0]!
    const b = path.seams[1]!
    const lastPose = a.poses[a.poses.length - 1]!.position
    const firstPose = b.poses[0]!.position
    expect(dist(at(air.t0).position, lastPose)).toBeLessThan(1e-6)
    expect(dist(at(air.t1 - 1e-9).position, firstPose)).toBeLessThan(1e-3)
    const mid = at((air.t0 + air.t1) / 2)
    expect(mid.kind).toBe('air')
    // The move is lead + gap + lead long and the middle of it is half way along that path.
    const gap = dist(a.retract, b.approach)
    expect(dist(mid.position, a.retract) + dist(mid.position, b.approach)).toBeGreaterThanOrEqual(gap - 1e-6)
    expect(mid.position[1]).toBeGreaterThan(0)
    expect(mid.position[1]).toBeLessThan(200)
  })

  it('ends at home, and clamps a time before 0 or after the end', () => {
    expect(at(total).position).toEqual(path.home)
    expect(at(total + 1000).position).toEqual(path.home)
    expect(at(-5).position).toEqual(path.home)
    expect(at(total + 1000).kind).toBe('air')
  })

  it('keeps the quaternion a unit vector with w >= 0 everywhere', () => {
    for (let i = 0; i <= 300; i++) {
      const q = at((total * i) / 300).quaternion
      expect(Math.hypot(...q)).toBeCloseTo(1, 9)
      expect(q[3]).toBeGreaterThanOrEqual(0)
    }
  })

  it('never jumps: between samples 0.05 s apart the torch moves no further than the air speed allows', () => {
    const step = 0.05
    let previous = at(0).position
    for (let t = step; t <= total + step; t += step) {
      const next = at(t).position
      expect(dist(previous, next)).toBeLessThanOrEqual(plan.settings.airSpeedMmS * step + 0.5)
      previous = next
    }
  })

  it('gives home with no seams', () => {
    const empty = { ...plan, seams: [] }
    const p = playbackPathOf(empty)
    const pose = poseAtTime(p, planTiming(empty), 3)
    expect(pose.position).toEqual(p.home)
    expect(pose.quaternion).toEqual([0, 0, 0, 1])
  })

  it('has a total that equals the end of the timeline', () => {
    expect(total).toBeCloseTo(segments[segments.length - 1]!.t1, 9)
  })
})

describe('weldedUpTo', () => {
  it('is monotonic for every seam and reaches the length at the end', () => {
    let previous: Record<string, number> = {}
    for (let i = 0; i <= 200; i++) {
      const welded = weldedUpTo(path, timing, (total * i) / 200)
      for (const [id, value] of Object.entries(welded)) expect(value).toBeGreaterThanOrEqual(previous[id] ?? 0)
      previous = welded
    }
    expect(previous['s1']).toBeCloseTo(100, 3)
    expect(previous['s2']).toBeCloseTo(100, 3)
  })

  it('has welded nothing before the arc starts, and part of the first seam half way through its arc', () => {
    const arc = segments.find((s) => s.kind === 'arc' && s.seamId === 's1')!
    expect(weldedUpTo(path, timing, arc.t0 - 0.001)['s1']).toBe(0)
    expect(weldedUpTo(path, timing, (arc.t0 + arc.t1) / 2)['s1']).toBeCloseTo(50, 1)
    expect(weldedUpTo(path, timing, (arc.t0 + arc.t1) / 2)['s2']).toBe(0)
  })

  it('works on a real part', () => {
    const real = samplePlan('t-joint-merged')
    const p = playbackPathOf(real)
    const t = planTiming(real)
    const welded = weldedUpTo(p, t, playbackTotalS(t))
    for (const seam of real.seams) expect(welded[seam.seam.id]).toBeCloseTo(seam.seam.lengthMm, 0)
  })
})

describe('trailAlong', () => {
  const points = [0, 100, 200].map((x, i) => ({ s: i * 100, p: [x, 0, 0] as Vec3 }))

  it('runs from the start to the welded length, ending part way along a segment', () => {
    expect(trailAlong(points, false, false, 150)).toEqual([[0, 0, 0], [100, 0, 0], [150, 0, 0]])
    expect(trailAlong(points, false, false, 0)).toEqual([[0, 0, 0]])
  })

  it('starts from the far end when the seam is welded the other way', () => {
    expect(trailAlong(points, false, true, 50)).toEqual([[200, 0, 0], [150, 0, 0]])
  })

  it('does not run past the end', () => {
    expect(trailAlong(points, false, false, 999)).toEqual([[0, 0, 0], [100, 0, 0], [200, 0, 0]])
  })

  it('goes round the closing segment of a loop', () => {
    const loop = [{ s: 0, p: [0, 0, 0] as Vec3 }, { s: 10, p: [10, 0, 0] as Vec3 }, { s: 20, p: [10, 10, 0] as Vec3 }]
    const trail = trailAlong(loop, true, false, 25)
    expect(trail).toHaveLength(4)
    const last = trail[3]!
    expect(last[0]).toBeCloseTo(10 - 5 / Math.SQRT2, 6)
    expect(last[1]).toBeCloseTo(10 - 5 / Math.SQRT2, 6)
  })
})
