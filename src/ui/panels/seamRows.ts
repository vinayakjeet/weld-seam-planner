import type { SeamCandidate } from '../../core/seams/detect'
import type { SeamStatus } from '../../state/seamsSlice'

export interface SeamRow {
  id: string
  n: number
  label: string
  type: string
  length: string
  status: SeamStatus | 'candidate'
}

export function seamRows(seams: SeamCandidate[], statusById: Record<string, SeamStatus>): SeamRow[] {
  return seams.map((seam, i) => ({
    id: seam.id,
    n: i + 1,
    label: seam.label,
    type: seam.jointType.charAt(0).toUpperCase() + seam.jointType.slice(1),
    length: String(Number(seam.lengthMm.toFixed(1))),
    status: statusById[seam.id] ?? 'candidate',
  }))
}
