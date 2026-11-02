import { meshWarnings, type MeshWarning } from '../core/mesh/health'
import type { SeamCandidate } from '../core/seams/detect'
import type { AppState } from './store'

export interface Stats {
  triangles: number
  bodies: number
  accepted: number
  candidates: number
  acceptedLengthMm: number
  hiddenAccepted: number
}

// Corner candidates are detected but stay out of the list, the counts and accept all until the user shows them.
export function visibleSeams(seams: SeamCandidate[], showCorners: boolean): SeamCandidate[] {
  return showCorners || !seams.some((seam) => seam.hidden) ? seams : seams.filter((seam) => !seam.hidden)
}

// Counts only the visible seams in the current detection result. Accepted ids that the current settings no longer
// produce are reported separately so the UI can say they will return.
export function selectStats(state: Pick<AppState, 'part' | 'seams' | 'statusById' | 'showCorners'>): Stats {
  let accepted = 0
  let candidates = 0
  let acceptedLengthMm = 0
  const present = new Set<string>()
  for (const seam of state.seams) {
    present.add(seam.id)
    if (seam.hidden && !state.showCorners) continue
    const status = state.statusById[seam.id]
    if (status === 'accepted') {
      accepted++
      acceptedLengthMm += seam.lengthMm
    } else if (status === undefined) {
      candidates++
    }
  }
  let hiddenAccepted = 0
  for (const [id, status] of Object.entries(state.statusById)) {
    if (status === 'accepted' && !present.has(id)) hiddenAccepted++
  }
  return {
    triangles: state.part?.triangles ?? 0,
    bodies: state.part?.bodies ?? 0,
    accepted,
    candidates,
    acceptedLengthMm,
    hiddenAccepted,
  }
}

export function selectPartWarnings(state: Pick<AppState, 'part'>): MeshWarning[] {
  return state.part ? meshWarnings(state.part) : []
}
