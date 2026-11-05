import type { StateCreator } from 'zustand'
import type { JointType } from '../core/seams/classify'
import { DEFAULT_DETECT_SETTINGS, type DetectSettings, type SeamCandidate } from '../core/seams/detect'
import { isManualError, mergeSeams, reverseSeam, splitSeam, trimSeam, type ManualError } from '../core/seams/manual'
import { selectAllSeams, visibleSeams } from './selectors'
import type { AppState } from './store'

export type SeamStatus = 'accepted' | 'rejected'

export type SelectMode = 'replace' | 'toggle' | 'range'

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
  // The primary seam: the one the viewport and the torch preview follow, and the last one clicked.
  selectedId: string | null
  // Every selected seam. selectedId is one of them, or null when none is selected.
  selectedIds: string[]
  // Where a Shift click range starts. Set by a plain or Ctrl click.
  rangeAnchor: string | null
  hoverId: string | null
  detectSettings: DetectSettings
  detectBusy: boolean
  toggleAccepted: (id: string) => void
  acceptAbove: (minConfidence: number) => void
  // The same status for several seams, as one history entry; unknown ids are skipped.
  setStatus: (ids: string[], status: SeamStatus) => void
  // null, or the detected type, removes the override.
  setType: (id: string, type: JointType | null) => void
  // The same type for several seams, as one history entry.
  setTypes: (ids: string[], type: JointType) => void
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
  // Ctrl or Cmd click toggles, Shift click selects the visible range from the anchor.
  select: (id: string | null, mode?: SelectMode) => void
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

// The children go where the first manual parent was; with only detected parents they go last (their slot orders them).
function insertAtParent(manual: SeamCandidate[], parentIds: Set<string>, made: SeamCandidate[]): SeamCandidate[] {
  const at = manual.findIndex((m) => parentIds.has(m.id))
  const kept = manual.filter((m) => !parentIds.has(m.id))
  if (at === -1) return [...kept, ...made]
  const before = manual.slice(0, at).filter((m) => !parentIds.has(m.id)).length
  return [...kept.slice(0, before), ...made, ...kept.slice(before)]
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
  const first = parents[0]!.id
  const jointType = typeById[first] ?? parents[0]!.jointType
  const procedureById = { ...state.procedureById }
  const overridesById = { ...state.overridesById }
  const legById = { ...state.legById }
  const thicknessById = { ...state.thicknessById }
  const inheritedPlan = {
    procedure: procedureById[first],
    overrides: overridesById[first],
    leg: legById[first],
    thickness: thicknessById[first],
  }
  for (const id of parentIds) {
    delete statusById[id]
    delete typeById[id]
    delete procedureById[id]
    delete overridesById[id]
    delete legById[id]
    delete thicknessById[id]
  }
  // The children take the row of the first parent: a manual parent passes its own slot on, a detected one is the slot.
  const slot = manualIds.has(first) ? parents[0]!.slot : first
  const made = children.map((child) => {
    const placed: SeamCandidate = { ...child, jointType }
    if (slot === undefined) delete placed.slot
    else placed.slot = slot
    return placed
  })
  if (inherited) for (const child of made) statusById[child.id] = inherited
  for (const child of made) {
    if (inheritedPlan.procedure !== undefined) procedureById[child.id] = inheritedPlan.procedure
    if (inheritedPlan.overrides !== undefined) overridesById[child.id] = structuredClone(inheritedPlan.overrides)
    if (inheritedPlan.leg !== undefined) legById[child.id] = inheritedPlan.leg
    if (inheritedPlan.thickness !== undefined) thicknessById[child.id] = [...inheritedPlan.thickness]
  }
  const selectedWasParent = state.selectedId !== null && parentIds.has(state.selectedId)
  const remaining = state.selectedIds.filter((id) => !parentIds.has(id))
  const touched = remaining.length !== state.selectedIds.length
  return {
    manualSeams: insertAtParent(state.manualSeams, parentIds, made),
    supersededIds: newlySuperseded.length > 0 ? [...state.supersededIds, ...newlySuperseded] : state.supersededIds,
    statusById,
    typeById,
    procedureById,
    overridesById,
    legById,
    thicknessById,
    selectedId: selectedWasParent ? made[0]!.id : state.selectedId,
    selectedIds: touched ? [...remaining, made[0]!.id] : state.selectedIds,
    rangeAnchor: state.rangeAnchor !== null && parentIds.has(state.rangeAnchor) ? made[0]!.id : state.rangeAnchor,
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
  selectedIds: [],
  rangeAnchor: null,
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

  setStatus: (ids, status) =>
    set((state) => {
      const known = new Set(selectAllSeams(state).map((s) => s.id))
      const statusById = { ...state.statusById }
      let changed = false
      for (const id of ids) {
        if (!known.has(id) || statusById[id] === status) continue
        statusById[id] = status
        changed = true
      }
      return changed ? { statusById } : state
    }),

  setTypes: (ids, type) =>
    set((state) => {
      const known = new Map(selectAllSeams(state).map((s) => [s.id, s]))
      const typeById = { ...state.typeById }
      let changed = false
      for (const id of ids) {
        const seam = known.get(id)
        if (!seam) continue
        if (type === seam.jointType) {
          if (id in typeById) {
            delete typeById[id]
            changed = true
          }
        } else if (typeById[id] !== type) {
          typeById[id] = type
          changed = true
        }
      }
      return changed ? { typeById } : state
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
      selectedIds: [id],
      rangeAnchor: id,
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
      const procedureById = { ...current.procedureById }
      const overridesById = { ...current.overridesById }
      const legById = { ...current.legById }
      const thicknessById = { ...current.thicknessById }
      for (const map of [statusById, typeById, procedureById, overridesById, legById, thicknessById]) delete map[id]
      return {
        manualSeams: current.manualSeams.filter((m) => m.id !== id),
        statusById,
        typeById,
        procedureById,
        overridesById,
        legById,
        thicknessById,
        selectedId: current.selectedId === id ? null : current.selectedId,
        selectedIds: current.selectedIds.filter((s) => s !== id),
        rangeAnchor: current.rangeAnchor === id ? null : current.rangeAnchor,
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
        selectedIds: state.selectedIds.filter((id) => !hiddenNow(id)),
        rangeAnchor: hiddenNow(state.rangeAnchor) ? null : state.rangeAnchor,
        hoverId: hiddenNow(state.hoverId) ? null : state.hoverId,
      }
    }),

  select: (id, mode = 'replace') =>
    set((state) => {
      const only = (selectedId: string | null) =>
        state.selectedId === selectedId && state.selectedIds.length === (selectedId === null ? 0 : 1) && state.rangeAnchor === selectedId
          ? state
          : { selectedId, selectedIds: selectedId === null ? [] : [selectedId], rangeAnchor: selectedId }
      if (id === null || mode === 'replace') return only(id)
      if (mode === 'toggle') {
        if (!state.selectedIds.includes(id)) return { selectedId: id, selectedIds: [...state.selectedIds, id], rangeAnchor: id }
        const selectedIds = state.selectedIds.filter((s) => s !== id)
        const selectedId = state.selectedId === id ? (selectedIds[selectedIds.length - 1] ?? null) : state.selectedId
        return { selectedId, selectedIds, rangeAnchor: selectedId }
      }
      const order = visibleSeams(selectAllSeams(state), state.showCorners).map((seam) => seam.id)
      const from = state.rangeAnchor === null ? -1 : order.indexOf(state.rangeAnchor)
      const to = order.indexOf(id)
      if (from < 0 || to < 0) return only(id)
      return { selectedId: id, selectedIds: order.slice(Math.min(from, to), Math.max(from, to) + 1) }
    }),
  hover: (hoverId) => set((state) => (state.hoverId === hoverId ? state : { hoverId })),
  setDetectSettings: (detectSettings) => set({ detectSettings }),
})
