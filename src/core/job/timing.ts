import { buildOrdered, timingOf } from './build'
import type { Plan } from './plan'

export interface PlanTiming {
  seams: { seamId: string; arcTimeS: number; overheadS: number }[]
  moves: { from: string; to: string; lengthMm: number; timeS: number }[]
  arcTimeS: number
  airTimeS: number
  cycleTimeS: number
}

// What the status bar shows and what the exported summary is made of, for the plan as it stands, in its sequence order.
export function planTiming(plan: Plan): PlanTiming {
  return timingOf(plan, buildOrdered(plan))
}
