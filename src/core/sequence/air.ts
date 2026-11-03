import { length, sub, type Vec3 } from '../math/vec3'

// The one place where an air move is measured, for the optimiser's cost and for the export. A seam's torch points sit
// leadMm back along the tool axis from where the arc strikes and stops, so the move from one seam to the next is the
// retract leg, the gap between the two torch points, and the approach leg. leave and enter are those torch points;
// null stands for home on that side.
export function airMoveMm(leave: Vec3 | null, enter: Vec3 | null, home: Vec3, leadMm: number): number {
  if (leave === null && enter === null) return 0
  if (leave === null) return length(sub(enter!, home)) + leadMm
  if (enter === null) return leadMm + length(sub(home, leave))
  return leadMm + length(sub(enter, leave)) + leadMm
}
