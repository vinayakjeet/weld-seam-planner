import { temporal } from 'zundo'
import { create, type StateCreator } from 'zustand'
import { createPartSlice, type PartSlice } from './partSlice'
import { createSeamsSlice, type SeamsSlice } from './seamsSlice'

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
}

export type AppState = UiSlice & PartSlice & SeamsSlice

const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set) => ({
  activeStep: 'import',
  setActiveStep: (activeStep) => set({ activeStep }),
})

export const HISTORY_LIMIT = 100

// Undo covers accepting and rejecting seams and nothing else. Hover, selection, settings and the loaded part are
// not history. Comparing the status map by reference keeps those changes from adding steps.
export const useStore = create<AppState>()(
  temporal(
    (...args) => ({
      ...createUiSlice(...args),
      ...createPartSlice(...args),
      ...createSeamsSlice(...args),
    }),
    {
      partialize: (state) => ({ statusById: state.statusById }),
      equality: (past, current) => past.statusById === current.statusById,
      limit: HISTORY_LIMIT,
    },
  ),
)
