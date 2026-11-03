import { buildSeams } from '../job/build'
import type { Plan } from '../job/plan'
import { reverseSeam } from '../seams/manual'
import type { SeamCandidate } from '../seams/detect'
import type { SequenceNode } from './types'

// The Reverse tool gives the seam a new id and marks it manual; the order of a plan needs neither.
const travelledBackwards = (seam: SeamCandidate): SeamCandidate => ({ ...reverseSeam(seam), id: seam.id, source: seam.source })

// Nodes in table order. Each seam is built both ways with the export's own pose maths, so the approach and retract
// points the optimiser costs are the ones the exported air moves use. A closed loop starts and stops at s = 0 either
// way, so its two directions share one set of points.
export function nodesFromPlan(plan: Plan, locked: ReadonlySet<string>): SequenceNode[] {
  const forward = buildSeams(plan)
  const backward = buildSeams({ ...plan, seams: plan.seams.map((p) => ({ ...p, seam: travelledBackwards(p.seam) })) })

  return plan.seams.map((planned, i): SequenceNode => {
    const f = forward[i]!
    const b = backward[i]!
    const { closed, points, id } = planned.seam
    const poses = (built: typeof f) => built.seam.poses
    const first = (built: typeof f) => poses(built)[0]!.position
    const last = (built: typeof f) => poses(built)[poses(built).length - 1]!.position
    const pick = <T>(onForward: T, onBackward: T) => ({ forward: onForward, reverse: closed ? onForward : onBackward })
    return {
      id,
      closed,
      locked: locked.has(id),
      mid: points[points.length >> 1]!.p,
      enter: pick(f.firstApproach, b.firstApproach),
      leave: pick(f.lastRetract, b.lastRetract),
      arcStart: pick(first(f), first(b)),
      arcEnd: pick(last(f), last(b)),
    }
  })
}
