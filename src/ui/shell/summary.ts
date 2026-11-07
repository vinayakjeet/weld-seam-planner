import type { Plan } from '../../core/job/plan'
import type { PlanTiming } from '../../core/job/timing'
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

// Cycle time as m:ss, or h:mm:ss from one hour; 0:00 when there is no time yet.
export function formatCycle(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const two = (x: number) => String(x).padStart(2, '0')
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`
}

// The torch cleaning stops inside the cycle time, for the Sequence panel; null when there are none or the answer is from
// before cleaning was modelled.
export function cleaningField(timing: PlanTiming | null): string | null {
  if (!timing || !(timing.cleanings > 0)) return null
  return `${timing.cleanings} ${timing.cleanings === 1 ? 'stop' : 'stops'}, ${formatCycle(timing.cleaningS)}`
}

// The status bar's cycle time: the answer for the current plan, or the previous answer marked stale while a new one is
// on its way. Before any answer it reads 0:00.
export function cycleField(timing: PlanTiming | null, current: boolean): { value: string; stale: boolean } {
  return { value: formatCycle(timing?.cycleTimeS ?? 0), stale: timing !== null && !current }
}

export const ARC_NEEDS_PROCEDURE = 'Arc time needs a procedure. Assign one in step 3.'

// A seam without a procedure (or with one deleted from the library) has no travel speed, so it adds no arc time. When
// that leaves the arc time at 0:00, the zero is explained instead of looking like a fault.
export function arcTimeHint(plan: Plan, timing: PlanTiming | null): string | null {
  if (plan.seams.length === 0 || formatCycle(timing?.arcTimeS ?? 0) !== '0:00') return null
  const known = new Set(plan.procedures.map((p) => p.id))
  return plan.seams.some((s) => s.procedureId === null || !known.has(s.procedureId)) ? ARC_NEEDS_PROCEDURE : null
}
