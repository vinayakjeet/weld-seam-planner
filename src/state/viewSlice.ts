import type { StateCreator } from 'zustand'
import type { AppState } from './store'

export type ColourBy = 'status' | 'access'

// How the viewport colours the seams. Not history and not saved.
export interface ViewSlice {
  colourBy: ColourBy
  setColourBy: (colourBy: ColourBy) => void
}

export const createViewSlice: StateCreator<AppState, [], [], ViewSlice> = (set) => ({
  colourBy: 'status',
  setColourBy: (colourBy) => set((state) => (state.colourBy === colourBy ? state : { colourBy })),
})
