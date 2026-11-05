import type { StateCreator } from 'zustand'
import type { Theme } from '../ui/shell/theme'
import type { AppState } from './store'

export type ColourBy = 'status' | 'access'

// How the viewport colours the seams. Not history and not saved.
export interface ViewSlice {
  colourBy: ColourBy
  setColourBy: (colourBy: ColourBy) => void
  // The part drawn see-through, with the seams drawn on top of it.
  xray: boolean
  toggleXray: () => void
  // The keyboard shortcut sheet.
  helpOpen: boolean
  setHelpOpen: (open: boolean) => void
  // Which token set the page and the viewport read. The attribute and the stored choice are set by chooseTheme.
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const createViewSlice: StateCreator<AppState, [], [], ViewSlice> = (set) => ({
  colourBy: 'status',
  setColourBy: (colourBy) => set((state) => (state.colourBy === colourBy ? state : { colourBy })),
  xray: false,
  toggleXray: () => set((state) => ({ xray: !state.xray })),
  helpOpen: false,
  theme: 'dark',
  setTheme: (theme) => set((state) => (state.theme === theme ? state : { theme })),
  setHelpOpen: (helpOpen) => set((state) => (state.helpOpen === helpOpen ? state : { helpOpen })),
})
