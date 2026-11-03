import type { PlanTiming } from '../job/timing'

export interface TimelineSegment {
  kind: 'air' | 'arc'
  // The seam the arc welds, or the place an air move goes to: a seam id, or home for the move back.
  seamId: string
  t0: number
  t1: number
}

// The plan laid out in time: the air move to a seam, then its arc, for each seam in order, and the air move home.
// The strike and stop time of each seam is not drawn, so the last segment ends at the cycle time less that overhead.
// timing is already in the order of the plan.
export function timelineSegments(timing: PlanTiming): TimelineSegment[] {
  const segments: TimelineSegment[] = []
  let t = 0
  const add = (kind: TimelineSegment['kind'], seamId: string, seconds: number) => {
    segments.push({ kind, seamId, t0: t, t1: t + seconds })
    t += seconds
  }
  timing.seams.forEach((seam, i) => {
    add('air', timing.moves[i]!.to, timing.moves[i]!.timeS)
    add('arc', seam.seamId, seam.arcTimeS)
  })
  const home = timing.moves[timing.seams.length]
  if (home) add('air', home.to, home.timeS)
  return segments
}
