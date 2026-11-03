import type { KnownUnits } from '../core/mesh/units'
import type { GeometryApi, LoadOutcome, UserError } from './geometry.api'

type GeometryClient = GeometryApi

interface HeldFile {
  buffer: ArrayBuffer
  name: string
  units: KnownUnits | null
}

const noProgress = () => {}

// Keeps the app's part alive across worker replacement. The worker owns the only copy of a file it was sent, so a
// copy of the last loaded one stays on the main thread; when a replacement worker is spawned, the next detect first
// sends that copy (and the unit choice) to it. `spawn` must call `onDead` when its worker stops answering.
export function createRecoveringClient(spawn: (onDead: () => void) => GeometryClient): GeometryClient {
  let worker: GeometryClient | null = null
  // The part the app is showing. A failed load does not replace it, matching what the worker keeps.
  let held: HeldFile | null = null
  // A file the worker has read and is waiting for a unit answer on.
  let waiting: Omit<HeldFile, 'units'> | null = null
  // The worker that has `held` loaded; a replacement worker differs from it until restored.
  let holder: GeometryClient | null = null
  let restoring: Promise<LoadOutcome> | null = null

  function current(): GeometryClient {
    if (!worker) {
      const created: GeometryClient = spawn(() => {
        if (worker === created) worker = null
      })
      worker = created
    }
    return worker
  }

  async function rebuild(target: GeometryClient, file: HeldFile): Promise<LoadOutcome> {
    let outcome = await target.loadStl(file.buffer.slice(0), file.name, noProgress)
    if (outcome.status === 'needs-units' && file.units) outcome = await target.setUnits(file.units, noProgress)
    if (outcome.status === 'ready') holder = target
    return outcome
  }

  // Shared by overlapping callers so the file is sent once.
  function restore(target: GeometryClient): Promise<LoadOutcome> | null {
    if (!held || holder === target) return null
    restoring ??= rebuild(target, held).finally(() => {
      restoring = null
    })
    return restoring
  }

  // An error outcome when the part could not be put back into a replacement worker, otherwise null.
  async function restoreFailure(target: GeometryClient): Promise<{ status: 'error'; error: UserError } | null> {
    const restored = await restore(target)
    if (!restored || restored.status === 'ready') return null
    if (restored.status === 'error') return restored
    return {
      status: 'error',
      error: {
        what: 'The part could not be restored in the new background worker.',
        why: 'The worker that was replaced had the file open, and the copy sent to its replacement asked for a unit choice again.',
        next: 'Load the file again.',
      },
    }
  }

  return {
    async loadStl(buffer, name, onProgress) {
      // The transfer to the worker empties `buffer`, so the copy has to be taken first.
      const copy = buffer.slice(0)
      waiting = null
      const target = current()
      const outcome = await target.loadStl(buffer, name, onProgress)
      if (outcome.status === 'ready') {
        held = { buffer: copy, name, units: null }
        holder = target
      } else if (outcome.status === 'needs-units') {
        waiting = { buffer: copy, name }
      }
      return outcome
    },

    async setUnits(units, onProgress) {
      const file = waiting
      waiting = null
      const target = current()
      const outcome = await target.setUnits(units, onProgress)
      if (outcome.status === 'ready' && file) {
        held = { ...file, units }
        holder = target
      }
      return outcome
    },

    async detect(settings, onProgress) {
      const target = current()
      const lost = await restoreFailure(target)
      return lost ?? target.detect(settings, onProgress)
    },

    async snapDraw(clicks, snapRadiusMm) {
      const target = current()
      const lost = await restoreFailure(target)
      return lost ?? target.snapDraw(clicks, snapRadiusMm)
    },

    // These read only the seams they are given, so a replacement worker does not need the part back first.
    torchPositions: (seams, gravity) => current().torchPositions(seams, gravity),

    torchPoses: (seam, params) => current().torchPoses(seam, params),

    async access(seams, onProgress) {
      const target = current()
      const lost = await restoreFailure(target)
      return lost ?? target.access(seams, onProgress)
    },

    preflight: (plan) => current().preflight(plan),

    exportJob: (plan, createdAt) => current().exportJob(plan, createdAt),

    planTiming: (plan) => current().planTiming(plan),

    optimiseSequence: (plan, strategy, locked, order) => current().optimiseSequence(plan, strategy, locked, order),
  }
}
