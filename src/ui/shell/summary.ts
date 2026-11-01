import type { PartInfo } from '../../worker/geometry.api'
import type { Stats } from '../../state/selectors'

export interface StatusField {
  label: string
  value: string
}

const oneDecimal = (x: number) => String(Number(x.toFixed(1)))

export function statusFields(stats: Stats, partLoaded: boolean): { fields: StatusField[]; note: string } {
  return {
    fields: [
      { label: 'Triangles', value: stats.triangles.toLocaleString('en-US') },
      { label: 'Bodies', value: stats.bodies.toLocaleString('en-US') },
      { label: 'Seams accepted / candidate', value: `${stats.accepted} / ${stats.candidates}` },
      { label: 'Weld length', value: `${oneDecimal(stats.acceptedLengthMm)} mm` },
    ],
    note: partLoaded ? 'Pre-flight: not run yet' : 'Pre-flight: no part loaded',
  }
}

// The app works in millimetres internally; say so when the file was converted on import.
export function partChip(part: PartInfo | null): { name: string; units: string } {
  if (!part) return { name: 'No part loaded', units: 'units: none' }
  return { name: part.name, units: part.sourceUnits === 'mm' ? 'units: mm' : `units: mm (from ${part.sourceUnits})` }
}
