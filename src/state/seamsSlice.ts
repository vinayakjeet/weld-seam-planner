import type { StateCreator } from 'zustand'
import type { JointType } from '../core/seams/classify'
import { DEFAULT_DETECT_SETTINGS, type DetectSettings, type SeamCandidate } from '../core/seams/detect'
import { visibleSeams } from './selectors'
import type { AppState } from './store'

export type SeamStatus = 'accepted' | 'rejected'

export interface SeamsSlice {
  seams: SeamCandidate[]
  // An absent id means candidate. Entries are never pruned, so seams hidden by a detection change come back accepted.
  // Always replaced, never mutated: undo history holds references to old maps.
  statusById: Record<string, SeamStatus>
  // Joint types the user chose over the detected ones. Same rules as statusById: replaced, never mutated.
  typeById: Record<string, JointType>
  // A view setting, so it is not part of undo history.
  showCorners: boolean
  selectedId: string | null
  hoverId: string | null
  detectSettings: DetectSettings
  detectBusy: boolean
  toggleAccepted: (id: string) => void
  acceptAbove: (minConfidence: number) => void
  // null, or the detected type, removes the override.
  setType: (id: string, type: JointType | null) => void
  setShowCorners: (show: boolean) => void
  select: (id: string | null) => void
  hover: (id: string | null) => void
  setDetectSettings: (settings: DetectSettings) => void
}

export const createSeamsSlice: StateCreator<AppState, [], [], SeamsSlice> = (set) => ({
  seams: [],
  statusById: {},
  typeById: {},
  showCorners: false,
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
      for (const seam of visibleSeams(state.seams, state.showCorners)) {
        if (seam.confidence >= minConfidence && statusById[seam.id] !== 'accepted') {
          statusById[seam.id] = 'accepted'
          changed = true
        }
      }
      return changed ? { statusById } : state
    }),

  setType: (id, type) =>
    set((state) => {
      const seam = state.seams.find((s) => s.id === id)
      if (!seam) return state
      const wanted = type === null || type === seam.jointType ? undefined : type
      if (state.typeById[id] === wanted) return state
      const typeById = { ...state.typeById }
      if (wanted === undefined) delete typeById[id]
      else typeById[id] = wanted
      return { typeById }
    }),

  setShowCorners: (showCorners) =>
    set((state) => {
      if (state.showCorners === showCorners) return state
      const hiddenNow = (id: string | null) => !showCorners && state.seams.some((s) => s.id === id && s.hidden)
      return {
        showCorners,
        selectedId: hiddenNow(state.selectedId) ? null : state.selectedId,
        hoverId: hiddenNow(state.hoverId) ? null : state.hoverId,
      }
    }),

  select: (selectedId) => set((state) => (state.selectedId === selectedId ? state : { selectedId })),
  hover: (hoverId) => set((state) => (state.hoverId === hoverId ? state : { hoverId })),
  setDetectSettings: (detectSettings) => set({ detectSettings }),
})
