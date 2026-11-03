import { temporal } from 'zundo'
import { create, type StateCreator } from 'zustand'
import type { ManualError } from '../core/seams/manual'
import { initialTool, type ToolState } from '../ui/tools/toolMachine'
import { registerHistoryClear } from './history'
import type { SavedPlan } from './savedPlan'
import { createAccessSlice, type AccessSlice } from './accessSlice'
import { createPartSlice, type PartSlice } from './partSlice'
import { createPlanSlice, type PlanSlice } from './planSlice'
import { createSeamsSlice, type SeamsSlice } from './seamsSlice'
import { createSequenceSlice, type SequenceSlice } from './sequenceSlice'
import { createTorchSlice, type TorchSlice } from './torchSlice'
import { createViewSlice, type ViewSlice } from './viewSlice'

export const STEPS = [
  { id: 'import', label: 'Import' },
  { id: 'seams', label: 'Seams' },
  { id: 'procedures', label: 'Procedures' },
  { id: 'sequence', label: 'Sequence' },
  { id: 'export', label: 'Validate and Export' },
] as const

export type StepId = (typeof STEPS)[number]['id']

interface UiSlice {
  activeStep: StepId
  setActiveStep: (step: StepId) => void
  // The armed manual tool and its progress. Not undo history.
  tool: ToolState
  setTool: (tool: ToolState) => void
  // The last refused manual action, shown over the viewport until dismissed or the next action starts.
  notice: ManualError | null
  setNotice: (notice: ManualError | null) => void
  // A plain confirmation (a plan restored, a file exported) shown over the viewport until dismissed.
  info: string | null
  setInfo: (info: string | null) => void
  // The saved plan of the loaded part, while the question "restore or start fresh" is open. Not history.
  offer: SavedPlan | null
}

export type AppState = UiSlice & PartSlice & SeamsSlice & PlanSlice & TorchSlice & AccessSlice & ViewSlice & SequenceSlice

const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set) => ({
  activeStep: 'import',
  setActiveStep: (activeStep) => set({ activeStep }),
  tool: initialTool,
  setTool: (tool) => set({ tool }),
  notice: null,
  setNotice: (notice) => set({ notice }),
  info: null,
  setInfo: (info) => set({ info }),
  offer: null,
})

export const HISTORY_LIMIT = 100

// Undo covers accepting and rejecting seams, choosing their joint type, editing seams (drawing, splitting, merging,
// trimming, reversing, deleting), the plan (the procedure library, assignments, overrides, legs, thickness edits) and
// the sequence (its strategy, order and locks),
// nothing else. Hover, selection, settings and the loaded part are not history.
// Comparing the eleven values by reference keeps those changes from adding steps.
export const useStore = create<AppState>()(
  temporal(
    (...args) => ({
      ...createUiSlice(...args),
      ...createPartSlice(...args),
      ...createSeamsSlice(...args),
      ...createPlanSlice(...args),
      ...createTorchSlice(...args),
      ...createAccessSlice(...args),
      ...createViewSlice(...args),
      ...createSequenceSlice(...args),
    }),
    {
      partialize: (state) => ({
        statusById: state.statusById,
        typeById: state.typeById,
        manualSeams: state.manualSeams,
        supersededIds: state.supersededIds,
        procedures: state.procedures,
        procedureById: state.procedureById,
        overridesById: state.overridesById,
        legById: state.legById,
        thicknessById: state.thicknessById,
        strategy: state.strategy,
        order: state.order,
      }),
      equality: (past, current) =>
        past.statusById === current.statusById &&
        past.typeById === current.typeById &&
        past.manualSeams === current.manualSeams &&
        past.supersededIds === current.supersededIds &&
        past.procedures === current.procedures &&
        past.procedureById === current.procedureById &&
        past.overridesById === current.overridesById &&
        past.legById === current.legById &&
        past.thicknessById === current.thicknessById &&
        past.strategy === current.strategy &&
        past.order === current.order,
      limit: HISTORY_LIMIT,
    },
  ),
)

registerHistoryClear(() => useStore.temporal.getState().clear())
