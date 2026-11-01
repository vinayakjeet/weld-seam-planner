import type { StateCreator } from 'zustand'
import type { Units } from '../core/mesh/units'
import type { DisplayData, PartInfo, UserError } from '../worker/geometry.api'
import type { AppState } from './store'

export type ImportState =
  | { phase: 'idle' }
  | { phase: 'loading'; label: string; fraction: number }
  | { phase: 'needs-units'; fileName: string; maxDimension: number; guess: Units }
  | { phase: 'error'; error: UserError }

export interface PartSlice {
  part: PartInfo | null
  display: DisplayData | null
  importState: ImportState
  // Closes the units dialog or the error banner; a load in progress cannot be dismissed.
  dismissImport: () => void
}

export const createPartSlice: StateCreator<AppState, [], [], PartSlice> = (set) => ({
  part: null,
  display: null,
  importState: { phase: 'idle' },
  dismissImport: () => set((state) => (state.importState.phase === 'loading' ? state : { importState: { phase: 'idle' } })),
})
