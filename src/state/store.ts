import { create } from 'zustand'

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

export type AppState = UiSlice

export const useStore = create<AppState>()((set) => ({
  activeStep: 'import',
  setActiveStep: (activeStep) => set({ activeStep }),
}))
