import type { StateCreator } from 'zustand'
import type { JointType } from '../core/seams/classify'
import { DEFAULT_DETECT_SETTINGS, type DetectSettings, type SeamCandidate } from '../core/seams/detect'
import { isManualError, mergeSeams, reverseSeam, splitSeam, trimSeam, type ManualError } from '../core/seams/manual'
import { selectAllSeams, visibleSeams } from './selectors'
import type { AppState } from './store'

export type SeamStatus = 'accepted' | 'rejected'

// Ends of two seams this close count as touching when merging.
export const MERGE_TOLERANCE_MM = 1

export interface SeamsSlice {
  seams: SeamCandidate[]
  // An absent id means candidate. Entries are never pruned, so seams hidden by a detection change come back accepted.
  // Always replaced, never mutated: undo history holds references to old maps.
  statusById: Record<string, SeamStatus>
  // Joint types the user chose over the detected ones. Same rules as statusById: replaced, never mutated.
  typeById: Record<string, JointType>
  // Seams the user drew or made by editing a detected one. Replaced, never mutated. Detection never touches them.
  manualSeams: SeamCandidate[]
  // Detected seams an edit has replaced; they stay hidden even when a later detection finds them again.
  supersededIds: string[]
  // Numbering for drawn seams. Not history, so a number is never reused after an undo.
  nextDrawnId: number
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
  // The edit actions return null when they worked, or what went wrong. Each one is a single undo step.
  splitAt: (id: string, s: number) => ManualError | null
  mergeSeamIds: (a: string, b: string) => ManualError | null
  reverse: (id: string) => ManualError | null
  trim: (id: string, startMm: number, endMm: number) => ManualError | null
  // Adds a snapped drawing as an accepted seam and returns its id.
  addDrawn: (seam: SeamCandidate) => string
  // Only manual seams can be deleted; a detected one is rejected instead.
  remove: (id: string) => ManualError | null
  setShowCorners: (show: boolean) => void
  select: (id: string | null) => void
  hover: (id: string | null) => void
  setDetectSettings: (settings: DetectSettings) => void
}

function unknownSeam(id: string): ManualError {
  return {
    what: `There is no seam "${id}".`,
    why: 'It was removed or replaced by another edit after the list was last drawn.',
    next: 'Pick a seam from the list and try again.',
  }
}

// Manual seams first: a seam reversed twice reuses the id of the detected one it replaced.
function locate(state: AppState, id: string): SeamCandidate | undefined {
  return state.manualSeams.find((s) => s.id === id) ?? selectAllSeams(state).find((s) => s.id === id)
}

// Swaps parents for children in one state change: detected parents become superseded, manual parents disappear, the
// children take over the status (accepted if any parent was, otherwise rejected if any was) and the joint type in force.
function replaceSeams(state: AppState, parents: SeamCandidate[], children: SeamCandidate[]): Partial<AppState> {
  const parentIds = new Set(parents.map((p) => p.id))
  const manualIds = new Set(state.manualSeams.map((m) => m.id))
  const newlySuperseded = parents.filter((p) => !manualIds.has(p.id) && !state.supersededIds.includes(p.id)).map((p) => p.id)
  const statusById = { ...state.statusById }
  const typeById = { ...state.typeById }
  const inherited: SeamStatus | undefined = parents.some((p) => statusById[p.id] === 'accepted')
    ? 'accepted'
    : parents.some((p) => statusById[p.id] === 'rejected')
      ? 'rejected'
      : undefined
  const jointType = typeById[parents[0]!.id] ?? parents[0]!.jointType
  for (const id of parentIds) {
    delete statusById[id]
    delete typeById[id]
  }
  const made = children.map((child) => ({ ...child, jointType }))
  if (inherited) for (const child of made) statusById[child.id] = inherited
  return {
    manualSeams: [...state.manualSeams.filter((m) => !parentIds.has(m.id)), ...made],
    supersededIds: newlySuperseded.length > 0 ? [...state.supersededIds, ...newlySuperseded] : state.supersededIds,
    statusById,
    typeById,
    selectedId: state.selectedId !== null && parentIds.has(state.selectedId) ? made[0]!.id : state.selectedId,
    hoverId: state.hoverId !== null && parentIds.has(state.hoverId) ? null : state.hoverId,
  }
}

export const createSeamsSlice: StateCreator<AppState, [], [], SeamsSlice> = (set, get) => ({
  seams: [],
  statusById: {},
  typeById: {},
  manualSeams: [],
  supersededIds: [],
  nextDrawnId: 1,
  showCorners: false,
  selectedId: null,
  hoverId: null,
  detectSettings: DEFAULT_DETECT_SETTINGS,
  detectBusy: false,

  toggleAccepted: (id) =>
    set((state) => {
      if (!selectAllSeams(state).some((seam) => seam.id === id)) return state
      const statusById = { ...state.statusById }
      if (statusById[id] === 'accepted') delete statusById[id]
      else statusById[id] = 'accepted'
      return { statusById }
    }),

  acceptAbove: (minConfidence) =>
    set((state) => {
      const statusById = { ...state.statusById }
      let changed = false
      for (const seam of visibleSeams(selectAllSeams(state), state.showCorners)) {
        if (seam.confidence >= minConfidence && statusById[seam.id] !== 'accepted') {
          statusById[seam.id] = 'accepted'
          changed = true
        }
      }
      return changed ? { statusById } : state
    }),

  setType: (id, type) =>
    set((state) => {
      const seam = selectAllSeams(state).find((s) => s.id === id)
      if (!seam) return state
      const wanted = type === null || type === seam.jointType ? undefined : type
      if (state.typeById[id] === wanted) return state
      const typeById = { ...state.typeById }
      if (wanted === undefined) delete typeById[id]
      else typeById[id] = wanted
      return { typeById }
    }),

  splitAt: (id, at) => {
    const seam = locate(get(), id)
    if (!seam) return unknownSeam(id)
    const result = splitSeam(seam, at)
    if (isManualError(result)) return result
    set((state) => replaceSeams(state, [seam], result))
    return null
  },

  mergeSeamIds: (a, b) => {
    const first = locate(get(), a)
    const second = locate(get(), b)
    if (!first) return unknownSeam(a)
    if (!second) return unknownSeam(b)
    if (first.id === second.id) {
      return { what: `Seam ${first.label} cannot be merged with itself.`, why: 'Both choices are the same seam.', next: 'Choose two different seams that touch.' }
    }
    const result = mergeSeams(first, second, MERGE_TOLERANCE_MM)
    if (isManualError(result)) return result
    set((state) => replaceSeams(state, [first, second], [result]))
    return null
  },

  reverse: (id) => {
    const seam = locate(get(), id)
    if (!seam) return unknownSeam(id)
    set((state) => replaceSeams(state, [seam], [reverseSeam(seam)]))
    return null
  },

  trim: (id, startMm, endMm) => {
    const seam = locate(get(), id)
    if (!seam) return unknownSeam(id)
    const result = trimSeam(seam, startMm, endMm)
    if (isManualError(result)) return result
    set((state) => replaceSeams(state, [seam], [result]))
    return null
  },

  addDrawn: (drawn) => {
    const n = get().nextDrawnId
    const id = `drawn-${n}`
    set((state) => ({
      manualSeams: [...state.manualSeams, { ...drawn, id, label: `D${n}`, source: 'manual' }],
      statusById: { ...state.statusById, [id]: 'accepted' },
      nextDrawnId: n + 1,
      selectedId: id,
    }))
    return id
  },

  remove: (id) => {
    const state = get()
    const target = state.manualSeams.find((m) => m.id === id)
    if (!target) {
      const detected = state.seams.find((s) => s.id === id)
      if (!detected) return unknownSeam(id)
      return {
        what: `Seam ${detected.label} cannot be deleted.`,
        why: 'It was found by detection, so it would come back the next time detection runs.',
        next: 'Reject it instead, or split or trim it to change what gets welded.',
      }
    }
    set((current) => {
      const statusById = { ...current.statusById }
      const typeById = { ...current.typeById }
      delete statusById[id]
      delete typeById[id]
      return {
        manualSeams: current.manualSeams.filter((m) => m.id !== id),
        statusById,
        typeById,
        selectedId: current.selectedId === id ? null : current.selectedId,
        hoverId: current.hoverId === id ? null : current.hoverId,
      }
    })
    return null
  },

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
