import { get as idbGet, set as idbSet } from 'idb-keyval'
import type { GeometryClient } from '../worker/client'
import { registerAfterLoad, runDetect } from './flows'
import { clampArm } from '../core/snake/arm'
import { clearHistory } from './history'
import { nextNumberAfter } from './portsSlice'
import { parseSaved, savedKey, snapshotOf, type SavedPlan } from './savedPlan'
import { useStore, type AppState } from './store'

export interface PlanStorage {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
}

export const idbStorage: PlanStorage = { get: (key) => idbGet(key), set: (key, value) => idbSet(key, value) }

export const AUTOSAVE_DELAY_MS = 1000

// The fields a snapshot is made of. A change to any of them is a change worth saving.
const read = (s: AppState) =>
  [s.statusById, s.typeById, s.manualSeams, s.supersededIds, s.nextDrawnId, s.procedures, s.procedureById, s.overridesById, s.legById, s.thicknessById, s.strategy, s.order, s.ports, s.arm, s.gravity, s.detectSettings, s.jobSettings] as const

interface Active {
  storage: PlanStorage
  timer: ReturnType<typeof setTimeout> | undefined
  last: ReturnType<typeof read>
  sha256: string | null
  // Set after the first failed write: the notice is shown once and the plan is not written again.
  off: boolean
}

let active: Active | null = null

const setNotice = (notice: Parameters<AppState['setNotice']>[0]) => useStore.getState().setNotice(notice)

const sameFields = (a: ReturnType<typeof read>, b: ReturnType<typeof read>) => a.every((value, i) => value === b[i])

// Treats the current state as already saved: loading a part or restoring a plan is not a change to write.
function rebase(): void {
  if (!active) return
  const state = useStore.getState()
  clearTimeout(active.timer)
  active.timer = undefined
  active.last = read(state)
  active.sha256 = state.part?.sha256 ?? null
}

async function save(current: Active): Promise<void> {
  const state = useStore.getState()
  // The offer is a question about the stored entry; writing now would answer it for the user.
  if (current.off || state.part === null || state.offer !== null || state.part.sha256 !== current.sha256) return
  try {
    await current.storage.set(savedKey(state.part.sha256), snapshotOf(state, new Date().toISOString()))
  } catch (error) {
    current.off = true
    const detail = error instanceof Error ? error.message : String(error)
    setNotice({
      what: 'Autosave is off: the plan could not be stored in this browser.',
      why: `The browser refused the write (${detail}), so changes will not survive a reload.`,
      next: 'Export the plan as JSON to keep your work. Allow site storage and reload the page to turn autosave back on.',
    })
  }
}

// Saves the plan, debounced, under the hash of the loaded STL. Returns a function that stops it.
export function startAutosave(storage: PlanStorage, delayMs = AUTOSAVE_DELAY_MS): () => void {
  const state = useStore.getState()
  const current: Active = { storage, timer: undefined, last: read(state), sha256: state.part?.sha256 ?? null, off: false }
  active = current
  const unregister = registerAfterLoad(offerRestore)
  const unsubscribe = useStore.subscribe((next) => {
    const sha256 = next.part?.sha256 ?? null
    if (sha256 !== current.sha256) {
      rebase()
      return
    }
    const fields = read(next)
    if (sameFields(fields, current.last)) return
    current.last = fields
    if (next.part === null || next.offer !== null) return
    clearTimeout(current.timer)
    current.timer = setTimeout(() => void save(current), delayMs)
  })
  return () => {
    unsubscribe()
    unregister()
    clearTimeout(current.timer)
    if (active === current) active = null
  }
}

// After a part has loaded: opens the restore offer if this STL has a saved plan. A saved plan that cannot be read gives
// a notice and no offer.
export async function offerRestore(): Promise<void> {
  const current = active
  const part = useStore.getState().part
  if (!current || part === null) return
  let stored: unknown
  try {
    stored = await current.storage.get(savedKey(part.sha256))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    setNotice({
      what: 'The saved plan for this part could not be read.',
      why: `The browser refused to open its storage (${detail}).`,
      next: 'Allow site storage for this page and reload it. You can keep working without the saved plan.',
    })
    return
  }
  if (stored === undefined || stored === null) return
  const parsed = parseSaved(stored)
  if (parsed.status === 'error') {
    setNotice(parsed.error)
    return
  }
  // Another part may have loaded while storage was being read.
  if (useStore.getState().part?.sha256 !== part.sha256 || parsed.saved.sha256 !== part.sha256) return
  useStore.setState({ offer: parsed.saved })
}

function apply(saved: SavedPlan): Partial<AppState> {
  return {
    statusById: saved.statusById,
    typeById: saved.typeById,
    manualSeams: saved.manualSeams,
    supersededIds: saved.supersededIds,
    nextDrawnId: saved.nextDrawnId,
    procedures: saved.procedures,
    procedureById: saved.procedureById,
    overridesById: saved.overridesById,
    legById: saved.legById,
    thicknessById: saved.thicknessById,
    strategy: saved.strategy,
    order: saved.order,
    ports: saved.ports,
    arm: clampArm(saved.arm),
    nextPortNumber: nextNumberAfter(saved.ports),
    selectedPortId: null,
    placingPort: false,
    gravity: saved.gravity,
    detectSettings: saved.detectSettings,
    jobSettings: saved.jobSettings,
    selectedId: null,
    selectedIds: [],
    rangeAnchor: null,
    hoverId: null,
    offer: null,
  }
}

// Detection runs again at the saved crease angle first, because the saved ids belong to the seams found at that angle.
export async function restoreSaved(client: GeometryClient): Promise<void> {
  const { offer } = useStore.getState()
  if (offer === null) return
  if (offer.detectSettings.creaseAngleDeg !== useStore.getState().detectSettings.creaseAngleDeg) {
    useStore.getState().setDetectSettings(offer.detectSettings)
    if (!(await runDetect(offer.detectSettings, client))) return
  }
  // The offer may have been closed, or another part loaded, while detection ran.
  if (useStore.getState().offer !== offer) return
  useStore.setState(apply(offer))
  clearHistory()
  rebase()
}

// Closes the offer. The stored entry stays until the next change overwrites it.
export function startFresh(): void {
  useStore.setState({ offer: null })
  rebase()
}
