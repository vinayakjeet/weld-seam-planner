import type { OrderEntry } from '../../core/sequence/order'
import type { SeamCandidate } from '../../core/seams/detect'

export interface SequenceRow {
  id: string
  // The place in the sequence, from 1.
  n: number
  label: string
  length: string
  reversed: boolean
  // Which way the torch travels along the seam.
  direction: 'Start to end' | 'End to start' | 'Loop'
  locked: boolean
}

// The rows of the sequence list, in sequence order. An id that no seam has is skipped.
export function sequenceRows(order: readonly OrderEntry[], seamsById: ReadonlyMap<string, SeamCandidate>): SequenceRow[] {
  const rows: SequenceRow[] = []
  for (const entry of order) {
    const seam = seamsById.get(entry.seamId)
    if (!seam) continue
    const reversed = entry.reversed && !seam.closed
    rows.push({
      id: seam.id,
      n: rows.length + 1,
      label: seam.label,
      length: String(Number(seam.lengthMm.toFixed(1))),
      reversed,
      direction: seam.closed ? 'Loop' : reversed ? 'End to start' : 'Start to end',
      locked: entry.locked,
    })
  }
  return rows
}
