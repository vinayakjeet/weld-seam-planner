import type { StateCreator } from 'zustand'
import type { Explained, Plan } from '../core/job/plan'
import { procedureOverridesSchema, procedureSchema, type Procedure, type ProcedureOverrides } from '../core/job/schema'
import type { PlateThickness } from '../core/process/filletRules'
import { WPS_PRESETS } from '../core/process/wps'
import { clearHistory } from './history'
import type { AppState } from './store'

export interface PlanSlice {
  // The WPS library. Starts as the presets and survives loading another part.
  procedures: Procedure[]
  // The maps below are keyed by seam id, always replaced and never mutated: undo history holds references to old maps.
  procedureById: Record<string, string>
  // Only the keys that differ from the seam's procedure, nested like a procedure.
  overridesById: Record<string, ProcedureOverrides>
  legById: Record<string, number>
  thicknessById: Record<string, PlateThickness>
  // Every action returns null when it worked, or what went wrong. Each one is a single undo step.
  addProcedure: (procedure: Procedure) => Explained | null
  // The id may change; the seams that use the procedure follow it in the same step.
  updateProcedure: (id: string, procedure: Procedure) => Explained | null
  deleteProcedure: (id: string) => Explained | null
  assignProcedure: (seamIds: string[], procedureId: string | null) => Explained | null
  // A value equal to the procedure's own removes that key.
  setOverride: (seamIds: string[], patch: ProcedureOverrides) => Explained | null
  clearOverrides: (seamIds: string[]) => Explained | null
  setLeg: (seamIds: string[], legMm: number | null) => Explained | null
  setThickness: (seamId: string, thicknessMm: PlateThickness | null) => Explained | null
  // Replaces the plan with an imported one, restores its seams as manual seams, and empties the undo history.
  applyImportedPlan: (plan: Plan) => void
}

type Plain = Record<string, unknown>

const isPlain = (v: unknown): v is Plain => typeof v === 'object' && v !== null && !Array.isArray(v)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const round = (value: number, perMm: number) => Math.round(value * perMm) / perMm

function invalid(subject: string, path: string, message: string): Explained {
  return {
    what: `${subject} was not saved because ${path} is not valid.`,
    why: `The check reported "${message}" for ${path}, and a value like that would give wrong heat input, travel speed or torch poses.`,
    next: `Enter a valid value for ${path}, then save again.`,
  }
}

function procedureProblem(procedure: Procedure): Explained | null {
  const parsed = procedureSchema.safeParse(procedure)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!
    return invalid('The procedure', issue.path.join('.') || 'the procedure', issue.message)
  }
  if (procedure.name.trim() === '') return invalid('The procedure', 'name', 'The name is empty.')
  return null
}

const unknownProcedure = (id: string): Explained => ({
  what: `There is no procedure "${id}".`,
  why: 'It was deleted or renamed after the list was last drawn.',
  next: 'Pick a procedure from the list and try again.',
})

const idTaken = (id: string): Explained => ({
  what: `The id ${id} is already used by another procedure.`,
  why: 'Seams refer to a procedure by its id, so two procedures with the same id would be ambiguous.',
  next: 'Choose an id that no other procedure uses.',
})

// Sets the patch values on the target, removing a key when the value is undefined or equals the base procedure's value.
function applyPatch(target: Plain, patch: Plain, base: Plain | undefined): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete target[key]
    } else if (isPlain(value)) {
      const child: Plain = isPlain(target[key]) ? target[key] : {}
      applyPatch(child, value, isPlain(base?.[key]) ? base[key] : undefined)
      if (Object.keys(child).length === 0) delete target[key]
      else target[key] = child
    } else if (base !== undefined && same(value, base[key])) {
      delete target[key]
    } else {
      target[key] = structuredClone(value)
    }
  }
}

function without<T>(map: Record<string, T>, ids: string[]): Record<string, T> {
  const next = { ...map }
  for (const id of ids) delete next[id]
  return next
}

export const createPlanSlice: StateCreator<AppState, [], [], PlanSlice> = (set, get) => ({
  procedures: structuredClone([...WPS_PRESETS]),
  procedureById: {},
  overridesById: {},
  legById: {},
  thicknessById: {},

  addProcedure: (procedure) => {
    const problem = procedureProblem(procedure)
    if (problem) return problem
    if (get().procedures.some((p) => p.id === procedure.id)) return idTaken(procedure.id)
    set((state) => ({ procedures: [...state.procedures, structuredClone(procedure)] }))
    return null
  },

  updateProcedure: (id, procedure) => {
    const current = get().procedures.find((p) => p.id === id)
    if (!current) return unknownProcedure(id)
    const problem = procedureProblem(procedure)
    if (problem) return problem
    if (procedure.id !== id && get().procedures.some((p) => p.id === procedure.id)) return idTaken(procedure.id)
    if (same(current, procedure)) return null
    set((state) => {
      const procedures = state.procedures.map((p) => (p.id === id ? structuredClone(procedure) : p))
      if (procedure.id === id) return { procedures }
      const procedureById = Object.fromEntries(Object.entries(state.procedureById).map(([seamId, used]) => [seamId, used === id ? procedure.id : used]))
      return { procedures, procedureById }
    })
    return null
  },

  deleteProcedure: (id) => {
    const state = get()
    if (!state.procedures.some((p) => p.id === id)) return unknownProcedure(id)
    const users = Object.values(state.procedureById).filter((used) => used === id).length
    if (users > 0) {
      return {
        what: `${id} is used by ${users} ${users === 1 ? 'seam' : 'seams'}.`,
        why: 'Deleting it would leave those seams without a procedure, and a plan with such seams cannot be exported.',
        next: 'Assign another procedure to those seams, then delete this one.',
      }
    }
    set((current) => ({ procedures: current.procedures.filter((p) => p.id !== id) }))
    return null
  },

  assignProcedure: (seamIds, procedureId) => {
    if (procedureId !== null && !get().procedures.some((p) => p.id === procedureId)) return unknownProcedure(procedureId)
    set((state) => {
      const next = { ...state.procedureById }
      let changed = false
      for (const id of seamIds) {
        if (procedureId === null) {
          if (id in next) {
            delete next[id]
            changed = true
          }
        } else if (next[id] !== procedureId) {
          next[id] = procedureId
          changed = true
        }
      }
      return changed ? { procedureById: next } : state
    })
    return null
  },

  setOverride: (seamIds, patch) => {
    const parsed = procedureOverridesSchema.safeParse(patch)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!
      return invalid('The override', issue.path.join('.') || 'the override', issue.message)
    }
    set((state) => {
      const next = { ...state.overridesById }
      let changed = false
      for (const id of seamIds) {
        const base = state.procedures.find((p) => p.id === state.procedureById[id])
        const before = next[id] ?? {}
        const after = structuredClone(before) as Plain
        applyPatch(after, patch as Plain, base as Plain | undefined)
        if (same(before, after)) continue
        changed = true
        if (Object.keys(after).length === 0) delete next[id]
        else next[id] = after as ProcedureOverrides
      }
      return changed ? { overridesById: next } : state
    })
    return null
  },

  clearOverrides: (seamIds) => {
    set((state) => (seamIds.some((id) => id in state.overridesById) ? { overridesById: without(state.overridesById, seamIds) } : state))
    return null
  },

  setLeg: (seamIds, legMm) => {
    const rounded = legMm === null ? null : round(legMm, 10)
    if (rounded !== null && !(Number.isFinite(rounded) && rounded > 0)) {
      return {
        what: 'The leg size was not changed.',
        why: `${legMm} mm is not a usable leg: a fillet leg is a positive length, and it is kept to 0.1 mm.`,
        next: 'Enter a leg of 0.1 mm or more, or clear the field to use the default leg.',
      }
    }
    set((state) => {
      const next = { ...state.legById }
      let changed = false
      for (const id of seamIds) {
        if (rounded === null) {
          if (id in next) {
            delete next[id]
            changed = true
          }
        } else if (next[id] !== rounded) {
          next[id] = rounded
          changed = true
        }
      }
      return changed ? { legById: next } : state
    })
    return null
  },

  setThickness: (seamId, thicknessMm) => {
    let value: PlateThickness | null = null
    if (thicknessMm !== null) {
      const rounded = thicknessMm.map((t) => (t === null ? null : round(t, 100))) as PlateThickness
      if (rounded.some((t) => t !== null && !(Number.isFinite(t) && t > 0))) {
        return {
          what: 'The plate thickness was not changed.',
          why: `${thicknessMm.map((t) => (t === null ? 'unknown' : t)).join(' and ')} is not a usable thickness: a plate is a positive length, and it is kept to 0.01 mm.`,
          next: 'Enter a thickness above 0, or clear the field to go back to the measured value.',
        }
      }
      value = rounded.every((t) => t === null) ? null : rounded
    }
    set((state) => {
      if (value === null) return seamId in state.thicknessById ? { thicknessById: without(state.thicknessById, [seamId]) } : state
      if (same(state.thicknessById[seamId], value)) return state
      return { thicknessById: { ...state.thicknessById, [seamId]: value } }
    })
    return null
  },

  applyImportedPlan: (plan) => {
    set((state) => {
      const libraryIds = new Set(plan.procedures.map((p) => p.id))
      const procedures = [...state.procedures.filter((p) => !libraryIds.has(p.id)), ...structuredClone(plan.procedures)]
      const procedureById: Record<string, string> = {}
      const overridesById: Record<string, ProcedureOverrides> = {}
      const legById: Record<string, number> = {}
      const statusById: AppState['statusById'] = {}
      let nextDrawnId = 1
      for (const planned of plan.seams) {
        const id = planned.seam.id
        statusById[id] = 'accepted'
        if (planned.procedureId !== null) procedureById[id] = planned.procedureId
        if (Object.keys(planned.overrides).length > 0) overridesById[id] = planned.overrides
        if (planned.legMm !== null) legById[id] = planned.legMm
        const drawn = /^drawn-(\d+)$/.exec(id)
        if (drawn) nextDrawnId = Math.max(nextDrawnId, Number(drawn[1]) + 1)
      }
      const restored = plan.seams.map((p) => p.seam)
      const restoredIds = new Set(restored.map((s) => s.id))
      return {
        procedures,
        procedureById,
        overridesById,
        legById,
        thicknessById: {},
        statusById,
        typeById: {},
        manualSeams: restored,
        supersededIds: state.seams.filter((s) => restoredIds.has(s.id)).map((s) => s.id),
        nextDrawnId,
        gravity: plan.gravity,
        detectSettings: { ...state.detectSettings, creaseAngleDeg: plan.settings.creaseAngleDeg },
        selectedId: null,
        selectedIds: [],
        rangeAnchor: null,
        hoverId: null,
      }
    })
    clearHistory()
  },
})
