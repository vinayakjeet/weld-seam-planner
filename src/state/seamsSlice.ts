import type { StateCreator } from 'zustand'
import { DEFAULT_DETECT_SETTINGS, type DetectSettings, type SeamCandidate } from '../core/seams/detect'
import type { AppState } from './store'

export type SeamStatus = 'accepted' | 'rejected'

export interface SeamsSlice {
  seams: SeamCandidate[]
  // An absent id means candidate. Entries are never pruned, so seams hidden by a detection change come back accepted.
  // Always replaced, never mutated: undo history holds references to old maps.
  statusById: Record<string, SeamStatus>
  selectedId: string | null
  hoverId: string | null
  detectSettings: DetectSettings
  detectBusy: boolean
  toggleAccepted: (id: string) => void
  acceptAbove: (minConfidence: number) => void
  select: (id: string | null) => void
  hover: (id: string | null) => void
  setDetectSettings: (settings: DetectSettings) => void
}

export const createSeamsSlice: StateCreator<AppState, [], [], SeamsSlice> = (set) => ({
  seams: [],
  statusById: {},
  selectedId: null,
  hoverId: null,
  detectSettings: DEFAULT_DETECT_SETTINGS,
  detectBusy: false,

  toggleAccepted: (id) =>
    set((state) => {
      if (!state.seams.some((seam) => seam.id === id)) return state
      const statusById = { ...state.statusById }
      if (statusById[id] === 'accepted') delete statusById[id]
      else statusById[id] = 'accepted'
      return { statusById }
    }),

  acceptAbove: (minConfidence) =>
    set((state) => {
      const statusById = { ...state.statusById }
      let changed = false
      for (const seam of state.seams) {
        if (seam.confidence >= minConfidence && statusById[seam.id] !== 'accepted') {
          statusById[seam.id] = 'accepted'
          changed = true
        }
      }
      return changed ? { statusById } : state
    }),

  select: (selectedId) => set((state) => (state.selectedId === selectedId ? state : { selectedId })),
  hover: (hoverId) => set((state) => (state.hoverId === hoverId ? state : { hoverId })),
  setDetectSettings: (detectSettings) => set({ detectSettings }),
})
