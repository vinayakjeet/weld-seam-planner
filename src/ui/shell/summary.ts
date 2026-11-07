import type { Plan } from '../../core/job/plan'
import type { Issue } from '../../core/job/preflight'
import type { PlanTiming } from '../../core/job/timing'
import type { PartInfo } from '../../worker/geometry.api'
import type { Stats } from '../../state/selectors'

export interface StatusField {
  label: string
  value: string
}

const oneDecimal = (x: number) => String(Number(x.toFixed(1)))

export function statusFields(stats: Stats): { fields: StatusField[] } {
  return {
    fields: [
      { label: 'Triangles', value: stats.triangles.toLocaleString('en-US') },
      { label: 'Bodies', value: stats.bodies.toLocaleString('en-US') },
      { label: 'Seams accepted / candidate', value: `${stats.accepted} / ${stats.candidates}` },
      { label: 'Weld length', value: `${oneDecimal(stats.acceptedLengthMm)} mm` },
    ],
  }
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// The status bar's pre-flight line. The check runs in the background after every change, so the line gives its latest
// counts, or says it is checking while the answer is for an older plan.
export function preflightNote(partLoaded: boolean, issues: readonly Issue[], current: boolean): string {
  if (!partLoaded) return 'Pre-flight: no part loaded'
  if (!current) return 'Pre-flight: checking'
  const errors = issues.filter((i) => i.severity === 'error').length
  const warnings = issues.filter((i) => i.severity === 'warning').length
  return `Pre-flight: ${count(errors, 'error')}, ${count(warnings, 'warning')}`
}

// The top bar names the part without its .stl ending, which every part has, so more of the name fits; the tooltip keeps
// the file name. The app works in millimetres internally; the units chip says so, and when the file was converted.
export function partChip(part: PartInfo | null): { name: string; file: string; units: string | null; unitsTitle: string } {
  if (!part) return { name: 'No part loaded', file: '', units: null, unitsTitle: '' }
  const name = part.name.replace(/\.stl$/i, '')
  if (part.sourceUnits === 'mm') return { name, file: part.name, units: 'mm', unitsTitle: 'Units: millimetres' }
  return { name, file: part.name, units: `mm, from ${part.sourceUnits}`, unitsTitle: `Converted from ${part.sourceUnits} to millimetres on import` }
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
