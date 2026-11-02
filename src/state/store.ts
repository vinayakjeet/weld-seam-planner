import { temporal } from 'zundo'
import { create, type StateCreator } from 'zustand'
import type { ManualError } from '../core/seams/manual'
import { initialTool, type ToolState } from '../ui/tools/toolMachine'
import { createPartSlice, type PartSlice } from './partSlice'
import { createSeamsSlice, type SeamsSlice } from './seamsSlice'
import { createTorchSlice, type TorchSlice } from './torchSlice'

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
}

export type AppState = UiSlice & PartSlice & SeamsSlice & TorchSlice

const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set) => ({
  activeStep: 'import',
  setActiveStep: (activeStep) => set({ activeStep }),
  tool: initialTool,
  setTool: (tool) => set({ tool }),
  notice: null,
  setNotice: (notice) => set({ notice }),
})

export const HISTORY_LIMIT = 100

// Undo covers accepting and rejecting seams, choosing their joint type and editing seams (drawing, splitting, merging,
// trimming, reversing, deleting), nothing else. Hover, selection, settings and the loaded part are not history.
// Comparing the four values by reference keeps those changes from adding steps.
export const useStore = create<AppState>()(
  temporal(
    (...args) => ({
      ...createUiSlice(...args),
      ...createPartSlice(...args),
      ...createSeamsSlice(...args),
      ...createTorchSlice(...args),
    }),
    {
      partialize: (state) => ({
        statusById: state.statusById,
        typeById: state.typeById,
        manualSeams: state.manualSeams,
        supersededIds: state.supersededIds,
      }),
      equality: (past, current) =>
        past.statusById === current.statusById &&
        past.typeById === current.typeById &&
        past.manualSeams === current.manualSeams &&
        past.supersededIds === current.supersededIds,
      limit: HISTORY_LIMIT,
    },
  ),
)
