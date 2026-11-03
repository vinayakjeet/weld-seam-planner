import { type JobPart, type Plan, type PlannedSeam } from '../core/job/plan'
import { meshWarnings, type MeshWarning } from '../core/mesh/health'
import { reconcileOrder, type OrderEntry } from '../core/sequence/order'
import type { SeamCandidate } from '../core/seams/detect'
import { accessFor } from './accessSlice'
import type { AppState } from './store'

export interface Stats {
  triangles: number
  bodies: number
  accepted: number
  candidates: number
  acceptedLengthMm: number
  hiddenAccepted: number
}

// Detected seams that no edit has replaced, then the manual seams (drawn, split, merged, trimmed or reversed).
export function selectAllSeams(state: Pick<AppState, 'seams' | 'manualSeams' | 'supersededIds'>): SeamCandidate[] {
  if (state.manualSeams.length === 0 && state.supersededIds.length === 0) return state.seams
  const superseded = new Set(state.supersededIds)
  return [...state.seams.filter((seam) => !superseded.has(seam.id)), ...state.manualSeams]
}

// Corner candidates are detected but stay out of the list, the counts and accept all until the user shows them.
export function visibleSeams(seams: SeamCandidate[], showCorners: boolean): SeamCandidate[] {
  return showCorners || !seams.some((seam) => seam.hidden) ? seams : seams.filter((seam) => !seam.hidden)
}

// Counts only the visible seams in the current detection result. Accepted ids that the current settings no longer
// produce are reported separately so the UI can say they will return.
export function selectStats(
  state: Pick<AppState, 'part' | 'seams' | 'statusById' | 'showCorners'> & Partial<Pick<AppState, 'manualSeams' | 'supersededIds'>>,
): Stats {
  let accepted = 0
  let candidates = 0
  let acceptedLengthMm = 0
  const superseded = state.supersededIds ?? []
  const present = new Set<string>(superseded)
  for (const seam of selectAllSeams({ seams: state.seams, manualSeams: state.manualSeams ?? [], supersededIds: superseded })) {
    present.add(seam.id)
    if (seam.hidden && !state.showCorners) continue
    const status = state.statusById[seam.id]
    if (status === 'accepted') {
      accepted++
      acceptedLengthMm += seam.lengthMm
    } else if (status === undefined) {
      candidates++
    }
  }
  let hiddenAccepted = 0
  for (const [id, status] of Object.entries(state.statusById)) {
    if (status === 'accepted' && !present.has(id)) hiddenAccepted++
  }
  return {
    triangles: state.part?.triangles ?? 0,
    bodies: state.part?.bodies ?? 0,
    accepted,
    candidates,
    acceptedLengthMm,
    hiddenAccepted,
  }
}

export function selectPartWarnings(state: Pick<AppState, 'part'>): MeshWarning[] {
  return state.part ? meshWarnings(state.part) : []
}

const NO_PART: JobPart = {
  name: '',
  sha256: '',
  sourceUnits: 'unknown',
  scaleToMm: 0,
  triangles: 0,
  bodies: 0,
  bbox: { min: [0, 0, 0], max: [0, 0, 0] },
}

// The access maps are optional: a caller that only needs the procedure numbers does not have to subscribe to them.
type PlanFields = Pick<AppState, 'typeById' | 'thicknessById' | 'procedureById' | 'overridesById' | 'legById'> &
  Partial<Pick<AppState, 'accessById' | 'accessPointsById'>>

// One seam as the job builder sees it, whether or not it is accepted, so the Inspector can show the same numbers.
export function plannedSeam(state: PlanFields, seam: SeamCandidate): PlannedSeam {
  return {
    seam: { ...seam, jointType: state.typeById[seam.id] ?? seam.jointType, thicknessMm: state.thicknessById[seam.id] ?? seam.thicknessMm },
    procedureId: state.procedureById[seam.id] ?? null,
    overrides: state.overridesById[seam.id] ?? {},
    legMm: state.legById[seam.id] ?? null,
    access: state.accessById && state.accessPointsById ? accessFor({ accessById: state.accessById, accessPointsById: state.accessPointsById }, seam) : null,
  }
}

let cachedPlan: { deps: readonly unknown[]; plan: Plan } | null = null
let cachedOrder: { order: AppState['order']; ids: readonly string[]; result: OrderEntry[] } | null = null

// The ids of the accepted, visible seams in table order.
export function selectTableIds(state: AppState): string[] {
  return selectPlan(state).seams.map((p) => p.seam.id)
}

// The sequence as shown: the stored order kept for the seams that are still accepted, newly accepted seams appended
// forward in table order, rejected ones gone. The same state gives the same array.
export function selectSequenceOrder(state: AppState): OrderEntry[] {
  const plan = selectPlan(state)
  const ids = plan.seams.map((p) => p.seam.id)
  if (cachedOrder && cachedOrder.order === state.order && cachedOrder.ids.length === ids.length && cachedOrder.ids.every((id, i) => id === ids[i])) {
    return cachedOrder.result
  }
  const result = reconcileOrder(state.order, ids, { locked: false })
  cachedOrder = { order: state.order, ids, result }
  return result
}

// Accepted, visible seams in table order, with the user's type and thickness edits applied. The same state gives the
// same object, and hover, selection and view changes do not give a new one.
export function selectPlan(state: AppState): Plan {
  const deps = [
    state.part, state.seams, state.manualSeams, state.supersededIds, state.showCorners, state.statusById, state.typeById,
    state.thicknessById, state.procedures, state.procedureById, state.overridesById, state.legById, state.accessById, state.accessPointsById, state.strategy, state.order, state.gravity,
    state.detectSettings.creaseAngleDeg, state.jobSettings,
  ]
  if (cachedPlan && cachedPlan.deps.every((d, i) => d === deps[i])) return cachedPlan.plan
  const seams = visibleSeams(selectAllSeams(state), state.showCorners)
    .filter((seam) => state.statusById[seam.id] === 'accepted')
    .map((seam) => plannedSeam(state, seam))
  const plan: Plan = {
    part: state.part ?? NO_PART,
    gravity: state.gravity,
    settings: { ...state.jobSettings, creaseAngleDeg: state.detectSettings.creaseAngleDeg },
    procedures: state.procedures,
    seams,
    sequence: null,
  }
  // An untouched sequence leaves the plan in table order; once there is a stored order the plan carries it.
  if (state.order.length > 0) {
    plan.sequence = {
      strategy: state.strategy,
      order: reconcileOrder(state.order, seams.map((p) => p.seam.id), { locked: false }).map(({ seamId, reversed }) => ({ seamId, reversed })),
    }
  }
  cachedPlan = { deps, plan }
  return plan
}
