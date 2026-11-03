import type { StateCreator } from 'zustand'
import type { SeamCandidate } from '../core/seams/detect'
import type { SeamPoint } from '../core/seams/frames'
import type { InsertionFrame } from '../core/snake/ftl'
import { reachKey, type SeamReach } from '../core/snake/reach'
import type { AppState } from './store'

// One answer, the points it was computed for and the ports and arm it was computed with.
export interface ReachEntry extends SeamReach {
  points: SeamPoint[]
  key: string
}

export interface InsertionState {
  seamId: string
  frames: InsertionFrame[]
  frame: number
  playing: boolean
}

// Not history, and not saved, like the access answers: the arm is solved against the loaded part.
export interface ReachSlice {
  // The maps are keyed by seam id and always replaced, never mutated.
  reachById: Record<string, SeamReach>
  reachPointsById: Record<string, SeamPoint[]>
  reachKeyById: Record<string, string>
  reachBusy: boolean
  // Seams measured so far of those the running reach was asked for, while it runs.
  reachProgress: { done: number; total: number } | null
  insertionState: InsertionState | null
  mergeReach: (entries: Record<string, ReachEntry>) => void
  clearReach: () => void
  setReachBusy: (busy: boolean) => void
  setReachProgress: (progress: { done: number; total: number } | null) => void
  setInsertion: (insertion: InsertionState | null) => void
  setInsertionFrame: (frame: number) => void
  setInsertionPlaying: (playing: boolean) => void
}

// The answer for the seam as it is now, with the ports and arm as they are now, or null.
export function reachFor(state: Pick<AppState, 'reachById' | 'reachPointsById' | 'reachKeyById' | 'ports' | 'arm'>, seam: SeamCandidate): SeamReach | null {
  const reach = state.reachById[seam.id]
  if (!reach || state.reachPointsById[seam.id] !== seam.points) return null
  return state.reachKeyById[seam.id] === reachKey(state.ports, state.arm) ? reach : null
}

export const stationAt = (reach: SeamReach, s: number) =>
  reach.stations.reduce<SeamReach['stations'][number] | null>((best, station) => (best === null || Math.abs(station.s - s) < Math.abs(best.s - s) ? station : best), null)

export const createReachSlice: StateCreator<AppState, [], [], ReachSlice> = (set) => ({
  reachById: {},
  reachPointsById: {},
  reachKeyById: {},
  reachBusy: false,
  reachProgress: null,
  insertionState: null,

  mergeReach: (entries) =>
    set((state) => {
      const reachById = { ...state.reachById }
      const reachPointsById = { ...state.reachPointsById }
      const reachKeyById = { ...state.reachKeyById }
      for (const [id, { points, key, ...reach }] of Object.entries(entries)) {
        reachById[id] = reach
        reachPointsById[id] = points
        reachKeyById[id] = key
      }
      return { reachById, reachPointsById, reachKeyById }
    }),

  clearReach: () =>
    set((state) =>
      Object.keys(state.reachById).length === 0 && state.insertionState === null
        ? state
        : { reachById: {}, reachPointsById: {}, reachKeyById: {}, insertionState: null },
    ),

  setReachBusy: (reachBusy) => set((state) => (state.reachBusy === reachBusy ? state : { reachBusy })),

  setReachProgress: (reachProgress) => set({ reachProgress }),

  setInsertion: (insertionState) => set({ insertionState }),

  setInsertionFrame: (frame) =>
    set((state) => {
      const current = state.insertionState
      if (!current || !Number.isFinite(frame)) return state
      const next = Math.min(current.frames.length - 1, Math.max(0, Math.round(frame)))
      return next === current.frame ? state : { insertionState: { ...current, frame: next } }
    }),

  // Play at the last frame starts over from the first.
  setInsertionPlaying: (playing) =>
    set((state) => {
      const current = state.insertionState
      if (!current || current.playing === playing) return state
      const restart = playing && current.frame >= current.frames.length - 1
      return { insertionState: { ...current, playing, frame: restart ? 0 : current.frame } }
    }),
})
