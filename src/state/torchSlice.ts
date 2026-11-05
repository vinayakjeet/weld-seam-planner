import type { StateCreator } from 'zustand'
import type { SeamCandidate } from '../core/seams/detect'
import type { TorchPose } from '../core/torch/frames'
import { DEFAULT_GRAVITY, gravityProblem, type Gravity, type SeamPosition } from '../core/torch/positions'
import type { UserError } from '../worker/geometry.api'
import type { AppState } from './store'

export interface GravityPreset {
  label: string
  // The way things fall, in the part's frame.
  gravity: Gravity
}

// "Z up" means the part's +Z points to the sky, so gravity runs along minus Z.
export const GRAVITY_PRESETS: readonly GravityPreset[] = [
  { label: 'Z up', gravity: [0, 0, -1] },
  { label: 'Z down', gravity: [0, 0, 1] },
  { label: 'X up', gravity: [-1, 0, 0] },
  { label: 'X down', gravity: [1, 0, 0] },
  { label: 'Y up', gravity: [0, -1, 0] },
  { label: 'Y down', gravity: [0, 1, 0] },
]

const PRESET_TOLERANCE = 1e-9

export function presetFor(gravity: Gravity): GravityPreset | null {
  const n = Math.hypot(...gravity)
  if (!(n > 0) || !Number.isFinite(n)) return null
  return GRAVITY_PRESETS.find((p) => p.gravity.every((v, i) => Math.abs(v - gravity[i]! / n) < PRESET_TOLERANCE)) ?? null
}

export function gravityText(gravity: Gravity): string {
  return presetFor(gravity)?.label ?? `Custom (${gravity.join(', ')})`
}

// What the worker said about one seam, with the seam and gravity it was worked out for. Both are checked when it is
// read, so a seam that was edited or a gravity that was changed since never shows an answer for the old one.
export interface PositionEntry {
  seam: SeamCandidate
  gravity: Gravity
  // True when the position was worked out for the seam travelled against its points, as the sequence welds it.
  reversed: boolean
  position: SeamPosition
}

export interface PoseEntry {
  seam: SeamCandidate
  poses: TorchPose[]
}

export interface TorchSlice {
  gravity: Gravity
  // Millimetres along the selected seam where the torch preview stands.
  scrubS: number
  // Replaced as a whole by each answer from the worker.
  positionsById: Record<string, PositionEntry>
  posesForSelected: PoseEntry | null
  // Returns what is wrong with the vector, or null. A refused vector leaves the gravity as it was.
  setGravity: (gravity: Gravity) => UserError | null
  setScrub: (s: number) => void
  setPositions: (positions: Record<string, PositionEntry>) => void
  setPoses: (entry: PoseEntry | null) => void
}

const sameVector = (a: Gravity, b: Gravity) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]

// The sequence welds an open seam against its points when its entry is reversed; the position depends on that.
export function weldsBackwards(state: Pick<AppState, 'order'>, seam: SeamCandidate): boolean {
  return !seam.closed && state.order.some((entry) => entry.seamId === seam.id && entry.reversed)
}

export function positionFor(state: Pick<AppState, 'positionsById' | 'gravity' | 'order'>, seam: SeamCandidate): SeamPosition | undefined {
  const entry = state.positionsById[seam.id]
  return entry && entry.seam === seam && sameVector(entry.gravity, state.gravity) && entry.reversed === weldsBackwards(state, seam)
    ? entry.position
    : undefined
}

export function posesFor(state: Pick<AppState, 'posesForSelected'>, seam: SeamCandidate): TorchPose[] | null {
  const entry = state.posesForSelected
  return entry && entry.seam === seam ? entry.poses : null
}

export const createTorchSlice: StateCreator<AppState, [], [], TorchSlice> = (set, get) => ({
  gravity: DEFAULT_GRAVITY,
  scrubS: 0,
  positionsById: {},
  posesForSelected: null,

  setGravity: (gravity) => {
    const problem = gravityProblem(gravity)
    if (problem) return problem
    if (!sameVector(get().gravity, gravity)) set({ gravity: [gravity[0], gravity[1], gravity[2]] })
    return null
  },

  setScrub: (s) =>
    set((state) => {
      if (!Number.isFinite(s)) return state
      const next = Math.max(0, s)
      return state.scrubS === next ? state : { scrubS: next }
    }),

  setPositions: (positionsById) => set({ positionsById }),
  setPoses: (posesForSelected) => set({ posesForSelected }),
})
