import type { StateCreator } from 'zustand'
import type { AccessAnalysis, AccessStation } from '../core/access/clearance'
import type { SeamAccess } from '../core/job/schema'
import type { SeamCandidate } from '../core/seams/detect'
import type { SeamPoint } from '../core/seams/frames'
import type { AppState } from './store'

// One analysis and the points it was computed for.
export interface AccessEntry extends AccessAnalysis {
  points: SeamPoint[]
}

// Not history, and not saved: the answers come from the loaded part and are asked for again when it is loaded again.
export interface AccessSlice {
  // The maps below are keyed by seam id and always replaced, never mutated.
  accessById: Record<string, SeamAccess>
  stationsById: Record<string, AccessStation[]>
  // The points array each answer was computed for. An answer is stale when seam.points is not this array.
  accessPointsById: Record<string, SeamPoint[]>
  // The access check is running for some accepted seams.
  accessBusy: boolean
  mergeAccess: (entries: Record<string, AccessEntry>) => void
  clearAccess: () => void
  setAccessBusy: (busy: boolean) => void
}

type AccessFields = Pick<AppState, 'accessById' | 'accessPointsById'>

// The answer for the seam as it is now, or null when there is none or the seam's points changed since.
export function accessFor(state: AccessFields, seam: SeamCandidate): SeamAccess | null {
  return state.accessPointsById[seam.id] === seam.points ? (state.accessById[seam.id] ?? null) : null
}

export function stationsFor(state: Pick<AppState, 'stationsById' | 'accessPointsById'>, seam: SeamCandidate): AccessStation[] | null {
  return state.accessPointsById[seam.id] === seam.points ? (state.stationsById[seam.id] ?? null) : null
}

export const createAccessSlice: StateCreator<AppState, [], [], AccessSlice> = (set) => ({
  accessById: {},
  stationsById: {},
  accessPointsById: {},
  accessBusy: false,

  mergeAccess: (entries) =>
    set((state) => {
      const accessById = { ...state.accessById }
      const stationsById = { ...state.stationsById }
      const accessPointsById = { ...state.accessPointsById }
      for (const [id, entry] of Object.entries(entries)) {
        accessById[id] = entry.access
        stationsById[id] = entry.stations
        accessPointsById[id] = entry.points
      }
      return { accessById, stationsById, accessPointsById }
    }),

  clearAccess: () => set((state) => (Object.keys(state.accessById).length === 0 ? state : { accessById: {}, stationsById: {}, accessPointsById: {} })),

  setAccessBusy: (accessBusy) => set((state) => (state.accessBusy === accessBusy ? state : { accessBusy })),
})
