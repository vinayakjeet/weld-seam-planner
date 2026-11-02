import { isManualError, mergeSeams } from '../../core/seams/manual'
import type { SeamCandidate } from '../../core/seams/detect'

// Ids of the seams the merge itself would accept, so what is highlighted and what works can never disagree.
export function mergeTargets(from: SeamCandidate, seams: readonly SeamCandidate[], toleranceMm: number): string[] {
  return seams.filter((seam) => seam.id !== from.id && !isManualError(mergeSeams(from, seam, toleranceMm))).map((seam) => seam.id)
}
